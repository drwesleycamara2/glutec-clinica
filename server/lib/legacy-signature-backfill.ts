/**
 * Backfill de metadados de assinatura digital nas anamneses importadas do
 * OnDoctor (tabela `FORMULARIO_CLIENTE.csv` no backup).
 *
 * O importer gravou o conteúdo das anamneses em `medical_records`, mas não
 * copiou os campos de assinatura. Aqui o admin envia o CSV original e nós
 * sobrescrevemos `signedAt`, `signatureHash`, `signedPdfUrl`,
 * `d4signDocumentKey` e marcamos `status = 'assinado'` para todas as linhas
 * onde `assinado_paciente = 'True'` no backup, casando por
 * `medical_records.sourceSystem in ('ondoctor','onedoctor') AND sourceId = id`.
 *
 * Sempre execute primeiro com `dryRun: true` para conferir as contagens.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type SignatureBackfillSummary = {
  dryRun: boolean;
  totalRows: number;
  rowsMarkedSigned: number;
  matchedInGlutec: number;
  updated: number;
  unmatchedSourceIds: string[];
  errors: string[];
  sampleMatched: Array<{
    sourceId: string;
    targetId: number;
    arquivo: string;
    signedAt: string;
  }>;
};

function parseCsvRowSemicolon(line: string): string[] {
  // Os exports do OnDoctor não usam aspas — separador `;` puro. Fazemos um
  // split simples mas suportamos linhas em branco / sobras.
  return line.split(";");
}

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function safeDate(value: string): Date | null {
  const v = String(value || "").trim();
  if (!v) return null;
  // Aceita "YYYY-MM-DD HH:MM:SS" ou ISO.
  const date = new Date(v.replace(" ", "T"));
  return Number.isFinite(date.getTime()) ? date : null;
}

function trimToLength(value: string, max: number): string {
  return String(value ?? "").slice(0, max);
}

export async function runOnDoctorSignatureBackfill(
  csvText: string,
  options: { dryRun?: boolean } = {},
): Promise<SignatureBackfillSummary> {
  const dryRun = options.dryRun !== false;
  const summary: SignatureBackfillSummary = {
    dryRun,
    totalRows: 0,
    rowsMarkedSigned: 0,
    matchedInGlutec: 0,
    updated: 0,
    unmatchedSourceIds: [],
    errors: [],
    sampleMatched: [],
  };

  const db = await getDb();
  if (!db) {
    summary.errors.push("Banco indisponível.");
    return summary;
  }

  const lines = String(csvText ?? "").split(/\r?\n/);
  if (lines.length < 2) {
    summary.errors.push("CSV vazio ou sem linhas de dados.");
    return summary;
  }

  const header = parseCsvRowSemicolon(lines[0]).map((value) => value.trim());
  const indexOfHeader = (name: string) => header.findIndex((value) => value.toLowerCase() === name.toLowerCase());
  const cols = {
    id: indexOfHeader("id"),
    dataHoraInclusao: indexOfHeader("data_hora_inclusao"),
    link: indexOfHeader("link_assinatura_paciente"),
    docId: indexOfHeader("id_documento_assinatura"),
    assinado: indexOfHeader("assinado_paciente"),
    arquivo: indexOfHeader("arquivo"),
  };

  const requiredColumns = ["id", "assinado_paciente"] as const;
  for (const required of requiredColumns) {
    if (indexOfHeader(required) < 0) {
      summary.errors.push(`Coluna obrigatória ausente no CSV: ${required}`);
      return summary;
    }
  }

  const unmatched: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (!rawLine || !rawLine.trim()) continue;
    summary.totalRows += 1;

    const row = parseCsvRowSemicolon(rawLine);
    const isSigned = String(row[cols.assinado] ?? "").trim().toLowerCase() === "true";
    if (!isSigned) continue;
    summary.rowsMarkedSigned += 1;

    const sourceId = String(row[cols.id] ?? "").trim();
    if (!sourceId) continue;

    const docHash = trimToLength(String(row[cols.docId] ?? "").trim(), 256);
    const link = trimToLength(String(row[cols.link] ?? "").trim(), 128);
    const arquivo = trimToLength(String(row[cols.arquivo] ?? "").trim(), 512);
    const signedAt = safeDate(String(row[cols.dataHoraInclusao] ?? ""));

    let matchRow: { id: number } | null = null;
    try {
      const found = unwrapRows<{ id: number }>(
        await db.execute(sql`
          select id
          from medical_records
          where sourceSystem in ('ondoctor', 'onedoctor')
            and sourceId = ${sourceId}
          limit 1
        `),
      );
      matchRow = found[0] ?? null;
    } catch (error) {
      summary.errors.push(`select medical_records sourceId=${sourceId}: ${(error as Error).message}`);
      continue;
    }

    if (!matchRow) {
      if (unmatched.length < 50) unmatched.push(sourceId);
      continue;
    }
    summary.matchedInGlutec += 1;
    if (summary.sampleMatched.length < 5) {
      summary.sampleMatched.push({
        sourceId,
        targetId: matchRow.id,
        arquivo,
        signedAt: signedAt ? signedAt.toISOString() : "",
      });
    }

    if (!dryRun) {
      try {
        await db.execute(sql`
          update medical_records
          set
            signatureHash = ${docHash || null},
            signedAt = ${signedAt},
            signedPdfUrl = ${arquivo ? `/imports/ondoctor/${arquivo}` : null},
            d4signDocumentKey = ${link || null},
            d4signStatus = ${link ? "assinado" : null},
            status = 'assinado'
          where id = ${matchRow.id}
        `);
        summary.updated += 1;
      } catch (error) {
        summary.errors.push(`update medical_records id=${matchRow.id}: ${(error as Error).message}`);
      }
    } else {
      summary.updated += 1;
    }
  }

  summary.unmatchedSourceIds = unmatched;
  return summary;
}
