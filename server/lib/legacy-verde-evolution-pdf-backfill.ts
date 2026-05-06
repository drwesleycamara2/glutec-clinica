import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { SignatureBackfillSummary } from "./legacy-signature-backfill";

type CsvInput = string | Iterable<string | Buffer> | AsyncIterable<string | Buffer>;

type EvolutionPdfRow = {
  sourceId: string;
  documentName: string;
  recordDateRaw: string;
};

function parseCsvRowSemicolon(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function readCsvInput(input: CsvInput): Promise<string> {
  if (typeof input === "string") return input;

  const chunks: string[] = [];
  for await (const chunk of input as AsyncIterable<string | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  }
  return chunks.join("");
}

function normalizeHeader(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0080-\u00ff]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumn(header: string[], matcher: (normalized: string) => boolean): number {
  return header.findIndex((raw) => matcher(normalizeHeader(raw)));
}

function normalizeDocumentName(value: string): string {
  const raw = String(value ?? "").trim().replace(/^\/+/, "");
  if (!raw) return "";
  return raw.startsWith("imports/prontuario-verde/") ? raw.replace(/^imports\/prontuario-verde\//, "") : raw;
}

function buildPdfUrl(documentName: string): string {
  return `/imports/prontuario-verde/${normalizeDocumentName(documentName)}`;
}

function parseRows(csvText: string, summary: SignatureBackfillSummary): EvolutionPdfRow[] {
  const lines = String(csvText ?? "").split(/\r?\n/);
  if (lines.length < 2) {
    summary.errors.push("CSV vazio ou sem linhas de dados.");
    return [];
  }

  const header = parseCsvRowSemicolon(lines[0]);
  const cols = {
    sourceId: findColumn(header, (normalized) => normalized === "cli id" || normalized === "cliid"),
    documentName: findColumn(header, (normalized) => normalized === "documento"),
    recordDate: findColumn(header, (normalized) => normalized === "data registro"),
  };

  if (cols.sourceId < 0) summary.errors.push("Coluna obrigatoria ausente no CSV: CLI_ID.");
  if (cols.documentName < 0) summary.errors.push("Coluna obrigatoria ausente no CSV: DOCUMENTO.");
  if (summary.errors.length > 0) return [];

  const rows: EvolutionPdfRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (!rawLine || !rawLine.trim()) continue;
    summary.totalRows += 1;

    const row = parseCsvRowSemicolon(rawLine);
    rows.push({
      sourceId: String(row[cols.sourceId] ?? "").trim(),
      documentName: normalizeDocumentName(String(row[cols.documentName] ?? "")),
      recordDateRaw: cols.recordDate >= 0 ? String(row[cols.recordDate] ?? "").trim() : "",
    });
  }

  return rows;
}

export async function runVerdeEvolutionPdfBackfill(
  csvInput: CsvInput,
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
    summary.errors.push("Banco indisponivel.");
    return summary;
  }

  const csvText = await readCsvInput(csvInput);
  const rows = parseRows(csvText, summary);
  if (summary.errors.length > 0) return summary;

  const unmatched: string[] = [];

  for (const row of rows) {
    if (!row.sourceId || !row.documentName) continue;
    summary.rowsMarkedSigned += 1;
    const nextPdfUrl = buildPdfUrl(row.documentName);

    let matches: Array<{ id: number; signedPdfUrl: string | null }> = [];
    try {
      matches = unwrapRows(await db.execute(sql`
        select id, signedPdfUrl
        from medical_records
        where sourceSystem = 'prontuario_verde'
          and (sourceId = ${row.sourceId} or sourceId like ${`%${row.sourceId}%`})
        limit 20
      `));
    } catch (error) {
      summary.errors.push(`select medical_records CLI_ID=${row.sourceId}: ${(error as Error).message}`);
      continue;
    }

    if (matches.length === 0) {
      if (unmatched.length < 50) unmatched.push(row.sourceId);
      continue;
    }

    summary.matchedInGlutec += 1;
    if (summary.sampleMatched.length < 5) {
      summary.sampleMatched.push({
        sourceId: row.sourceId,
        targetId: matches[0].id,
        arquivo: nextPdfUrl,
        signedAt: row.recordDateRaw,
      });
    }

    for (const match of matches) {
      if (String(match.signedPdfUrl ?? "") === nextPdfUrl) continue;

      if (dryRun) {
        summary.updated += 1;
        continue;
      }

      try {
        await db.execute(sql`
          update medical_records
          set signedPdfUrl = ${nextPdfUrl}
          where id = ${match.id}
        `);
        summary.updated += 1;
      } catch (error) {
        summary.errors.push(`update medical_records id=${match.id}: ${(error as Error).message}`);
      }
    }
  }

  summary.unmatchedSourceIds = unmatched;
  return summary;
}