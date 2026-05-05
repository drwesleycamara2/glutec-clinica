/**
 * Backfill de perguntas em anamneses importadas legadas.
 *
 * As importações antigas (Prontuário Verde / OnDoctor) só preservaram as
 * RESPOSTAS dos pacientes — o texto das perguntas ficou só como o ID
 * interno (ex.: "#73693: Não"). Este módulo recebe um mapeamento
 * { questionId: questionText } (extraído da fonte antiga pelo administrador)
 * e reescreve, in-place, o texto exibido nas evoluções clínicas e nas
 * anamneses, trocando "#73693:" por "Você tem alergias?:" (ou similar).
 *
 * Diferenças deste backfill:
 *  - É idempotente: a regex ".#NNN:" só casa enquanto sobrar o marcador
 *    legado, então rodar de novo sem mapear novos IDs é um no-op.
 *  - Aceita modo `dryRun` para o admin pré-visualizar.
 *  - Atualiza tanto `clinical_evolution.clinicalNotes` quanto, se houver,
 *    `clinical_evolution.anamnesis` e `anamnesis_share_links.questionsJson` /
 *    `submittedAnswers`.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type QuestionMap = Record<string, string>;

export type BackfillSummary = {
  dryRun: boolean;
  evolutionsScanned: number;
  evolutionsUpdated: number;
  anamnesesScanned: number;
  anamnesesUpdated: number;
  unmappedIds: string[];
  sampleBefore?: string;
  sampleAfter?: string;
};

const QUESTION_REF_REGEX = /(^|[\s>])#(\d{2,8}):/g;

function normalizeMap(input: unknown): QuestionMap {
  const map: QuestionMap = {};
  if (!input || typeof input !== "object") return map;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = String(k).replace(/^#/, "").trim();
    const value = String(v ?? "").trim();
    if (/^\d{2,8}$/.test(key) && value) map[key] = value;
  }
  return map;
}

/**
 * Aplica o mapeamento em um pedaço de texto. Retorna `null` se nada mudou.
 */
function applyMappingToText(text: string, map: QuestionMap, unmapped: Set<string>): string | null {
  if (!text || !text.includes("#")) return null;
  let touched = false;
  const result = text.replace(QUESTION_REF_REGEX, (match, prefix: string, id: string) => {
    const replacement = map[id];
    if (!replacement) {
      unmapped.add(id);
      return match;
    }
    touched = true;
    return `${prefix}${replacement} (#${id}):`;
  });
  return touched ? result : null;
}

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function runLegacyAnamneseBackfill(
  mapping: QuestionMap,
  options: { dryRun?: boolean } = {},
): Promise<BackfillSummary> {
  const dryRun = options.dryRun !== false; // default: dryRun=true
  const map = normalizeMap(mapping);
  const summary: BackfillSummary = {
    dryRun,
    evolutionsScanned: 0,
    evolutionsUpdated: 0,
    anamnesesScanned: 0,
    anamnesesUpdated: 0,
    unmappedIds: [],
  };
  const unmapped = new Set<string>();

  const db = await getDb();
  if (!db || Object.keys(map).length === 0) {
    return summary;
  }

  // ─── clinical_evolution ────────────────────────────────────────────────────
  const evolRows = unwrapRows<any>(
    await db.execute(sql`
      select id, clinicalNotes, anamnesis
      from clinical_evolution
      where (clinicalNotes regexp '#[0-9]{2,8}:' or anamnesis regexp '#[0-9]{2,8}:')
      limit 5000
    `),
  );
  summary.evolutionsScanned = evolRows.length;

  for (const row of evolRows) {
    const newClinical = applyMappingToText(String(row.clinicalNotes ?? ""), map, unmapped);
    const newAnamnese = applyMappingToText(String(row.anamnesis ?? ""), map, unmapped);
    if (newClinical === null && newAnamnese === null) continue;
    if (!summary.sampleBefore && (row.clinicalNotes || row.anamnesis)) {
      summary.sampleBefore = String(row.clinicalNotes ?? row.anamnesis ?? "").slice(0, 240);
      summary.sampleAfter = String(newClinical ?? newAnamnese ?? "").slice(0, 240);
    }
    summary.evolutionsUpdated += 1;
    if (!dryRun) {
      const updates: any[] = [];
      if (newClinical !== null) updates.push(sql`clinicalNotes = ${newClinical}`);
      if (newAnamnese !== null) updates.push(sql`anamnesis = ${newAnamnese}`);
      if (updates.length === 0) continue;
      const setExpr = sql.join(updates, sql`, `);
      await db.execute(sql`update clinical_evolution set ${setExpr} where id = ${row.id}`);
    }
  }

  // ─── anamnesis_share_links ─────────────────────────────────────────────────
  const anamneseRows = unwrapRows<any>(
    await db.execute(sql`
      select id, questionsJson, submittedAnswers
      from anamnesis_share_links
      where questionsJson regexp '#[0-9]{2,8}:'
         or submittedAnswers regexp '#[0-9]{2,8}:'
      limit 5000
    `),
  );
  summary.anamnesesScanned = anamneseRows.length;

  for (const row of anamneseRows) {
    const newQuestions = applyMappingToText(String(row.questionsJson ?? ""), map, unmapped);
    const newAnswers = applyMappingToText(String(row.submittedAnswers ?? ""), map, unmapped);
    if (newQuestions === null && newAnswers === null) continue;
    summary.anamnesesUpdated += 1;
    if (!dryRun) {
      const updates: any[] = [];
      if (newQuestions !== null) updates.push(sql`questionsJson = ${newQuestions}`);
      if (newAnswers !== null) updates.push(sql`submittedAnswers = ${newAnswers}`);
      if (updates.length === 0) continue;
      const setExpr = sql.join(updates, sql`, `);
      await db.execute(sql`update anamnesis_share_links set ${setExpr} where id = ${row.id}`);
    }
  }

  summary.unmappedIds = Array.from(unmapped).sort((a, b) => Number(a) - Number(b)).slice(0, 50);
  return summary;
}

/**
 * Parser leve de CSV "questionId,questionText" sem dependências externas.
 * Aceita aspas duplas e vírgulas dentro do texto desde que escapado com "".
 */
export function parseQuestionMappingCsv(input: string): QuestionMap {
  const map: QuestionMap = {};
  const lines = String(input ?? "").split(/\r?\n/);
  for (const rawLine of lines) {
    if (!rawLine || !rawLine.trim()) continue;
    const tokens = parseCsvRow(rawLine);
    if (tokens.length < 2) continue;
    const id = tokens[0].replace(/^#/, "").trim();
    const text = tokens[1].trim();
    if (!/^\d{2,8}$/.test(id)) continue; // pula header / linhas inválidas
    if (!text) continue;
    map[id] = text;
  }
  return map;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}
