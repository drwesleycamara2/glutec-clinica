import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { SignatureBackfillSummary } from "./legacy-signature-backfill";

type CsvInput = string | Iterable<string | Buffer> | AsyncIterable<string | Buffer>;

type ContractRow = {
  documentPath: string;
  signedAtRaw: string;
  signedBy: string;
  patientId?: string;
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

function findColumn(header: string[], matcher: (normalized: string, raw: string) => boolean): number {
  return header.findIndex((raw) => matcher(normalizeHeader(raw), raw));
}

function safeLegacyDate(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    const hour = br[4] ? Number(br[4]) : 0;
    const minute = br[5] ? Number(br[5]) : 0;
    const second = br[6] ? Number(br[6]) : 0;
    const date = new Date(year, month, day, hour, minute, second);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const iso = new Date(raw.replace(" ", "T"));
  return Number.isFinite(iso.getTime()) ? iso : null;
}

function basenameFromDocumentPath(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split(/[?#]/)[0] ?? raw;
  const parts = withoutQuery.split(/[\\/]/).filter(Boolean);
  return String(parts[parts.length - 1] ?? withoutQuery).trim();
}

function datesEqual(left: unknown, right: Date): boolean {
  if (!left) return false;
  const leftDate = left instanceof Date ? left : new Date(String(left).replace(" ", "T"));
  if (!Number.isFinite(leftDate.getTime())) return false;
  return Math.abs(leftDate.getTime() - right.getTime()) < 1000;
}

function trimToLength(value: string, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function parseRows(csvText: string, summary: SignatureBackfillSummary): ContractRow[] {
  const lines = String(csvText ?? "").split(/\r?\n/);
  if (lines.length < 2) {
    summary.errors.push("CSV vazio ou sem linhas de dados.");
    return [];
  }

  const header = parseCsvRowSemicolon(lines[0]);
  const cols = {
    documentPath: findColumn(header, (normalized) => normalized === "documento"),
    signedAt: findColumn(header, (normalized) => normalized.includes("assinado") && normalized.includes("em")),
    signedBy: findColumn(header, (normalized) => normalized.includes("assinado") && normalized.includes("por")),
    patientId: findColumn(header, (normalized) => normalized === "pac id" || normalized === "pacid"),
  };

  if (cols.documentPath < 0) summary.errors.push("Coluna obrigatoria ausente no CSV: Documento.");
  if (cols.signedAt < 0) summary.errors.push("Coluna obrigatoria ausente no CSV: Assinado em.");
  if (summary.errors.length > 0) return [];

  const rows: ContractRow[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (!rawLine || !rawLine.trim()) continue;
    summary.totalRows += 1;

    const row = parseCsvRowSemicolon(rawLine);
    rows.push({
      documentPath: String(row[cols.documentPath] ?? "").trim(),
      signedAtRaw: String(row[cols.signedAt] ?? "").trim(),
      signedBy: cols.signedBy >= 0 ? String(row[cols.signedBy] ?? "").trim() : "",
      patientId: cols.patientId >= 0 ? String(row[cols.patientId] ?? "").trim() : undefined,
    });
  }

  return rows;
}

export async function runVerdeContractSignatureBackfill(
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
    if (!row.signedAtRaw) continue;
    summary.rowsMarkedSigned += 1;

    const signedAt = safeLegacyDate(row.signedAtRaw);
    if (!signedAt) {
      summary.errors.push(`Assinado em invalido para Documento=${row.documentPath || "sem documento"}: ${row.signedAtRaw}`);
      continue;
    }

    const basename = basenameFromDocumentPath(row.documentPath);
    if (!basename) {
      summary.errors.push(`Documento sem nome de arquivo para PAC_ID=${row.patientId ?? ""}`);
      continue;
    }

    let matches: Array<{ id: number; signedAt: string | Date | null; signedBy: string | null }> = [];
    try {
      matches = unwrapRows(await db.execute(sql`
        select id, signedAt, signedBy
        from patient_documents
        where sourceSystem = 'prontuario_verde'
          and type in ('contrato', 'termo')
          and (
            sourceId like ${`%${basename}%`}
            or fileUrl like ${`%${basename}%`}
            or fileKey like ${`%${basename}%`}
          )
        limit 20
      `));
    } catch (error) {
      summary.errors.push(`select patient_documents arquivo=${basename}: ${(error as Error).message}`);
      continue;
    }

    if (matches.length === 0) {
      if (unmatched.length < 50) unmatched.push(row.documentPath || basename);
      continue;
    }

    summary.matchedInGlutec += 1;
    if (summary.sampleMatched.length < 5) {
      summary.sampleMatched.push({
        sourceId: basename,
        targetId: matches[0].id,
        arquivo: row.documentPath,
        signedAt: signedAt.toISOString(),
      });
    }

    for (const match of matches) {
      const nextSignedBy = trimToLength(row.signedBy, 255) || null;
      const alreadyEqual = datesEqual(match.signedAt, signedAt) && String(match.signedBy ?? "") === String(nextSignedBy ?? "");
      if (alreadyEqual) continue;

      if (dryRun) {
        summary.updated += 1;
        continue;
      }

      try {
        await db.execute(sql`
          update patient_documents
          set
            signedAt = ${signedAt},
            signedBy = ${nextSignedBy},
            signatureSourceUrl = ${row.documentPath || null},
            signatureNote = ${`Importado do Prontuario Verde. Documento original: ${row.documentPath}`},
            signatureProvider = 'ProntuarioVerde',
            signatureMethod = 'legacy_eletronica',
            updatedAt = now()
          where id = ${match.id}
        `);
        summary.updated += 1;
      } catch (error) {
        summary.errors.push(`update patient_documents id=${match.id}: ${(error as Error).message}`);
      }
    }
  }

  summary.unmatchedSourceIds = unmatched;
  return summary;
}