import fs from "fs";
import path from "path";
import { randomBytes, scryptSync, createCipheriv, createHash } from "crypto";
import zlib from "zlib";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

type GenerateSystemExportParams = {
  exportPassword: string;
  includeFiles: boolean;
  reason?: string | null;
  requestedBy: {
    id: number;
    name?: string | null;
    email?: string | null;
  };
};

type ExportRegistryItem = {
  token: string;
  filePath: string;
  fileName: string;
  userId: number;
  expiresAt: number;
};

const EXPORT_REGISTRY = new Map<string, ExportRegistryItem>();
const EXPORT_RETENTION_MS = 15 * 60 * 1000;
const EXPORT_DIR = path.resolve(process.cwd(), "private_exports");
const FILE_ROOTS = [
  path.resolve(process.cwd(), "public", "imports"),
  path.resolve(process.cwd(), "public", "uploads"),
];

function ensureExportDir() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function toBase64(value: Buffer) {
  return value.toString("base64");
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".json": "application/json",
  };

  return map[extension] ?? "application/octet-stream";
}

function collectFiles(rootPath: string) {
  if (!fs.existsSync(rootPath)) return [];

  const files: Array<{
    relativePath: string;
    absolutePath: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    contentBase64: string;
  }> = [];

  const walk = (currentPath: string) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const buffer = fs.readFileSync(absolutePath);
      files.push({
        relativePath: path.relative(rootPath, absolutePath).replace(/\\/g, "/"),
        absolutePath,
        sizeBytes: buffer.byteLength,
        mimeType: guessMimeType(absolutePath),
        sha256: sha256(buffer),
        contentBase64: buffer.toString("base64"),
      });
    }
  };

  walk(rootPath);
  return files;
}

function cleanExpiredExports() {
  const now = Date.now();
  for (const [token, item] of EXPORT_REGISTRY.entries()) {
    if (item.expiresAt > now) continue;
    if (fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }
    EXPORT_REGISTRY.delete(token);
  }
}

export function resolveSystemExport(token: string, userId: number) {
  cleanExpiredExports();
  const item = EXPORT_REGISTRY.get(token);
  if (!item) return null;
  if (item.userId !== userId) return null;
  if (item.expiresAt < Date.now()) return null;
  if (!fs.existsSync(item.filePath)) return null;
  return item;
}

export async function generateSecureSystemExport(params: GenerateSystemExportParams) {
  cleanExpiredExports();
  ensureExportDir();

  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const tableRows = unwrapRows<{ tableName: string }>(
    await db.execute(sql`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `),
  );

  const database: Record<string, unknown[]> = {};
  let totalRows = 0;

  for (const { tableName } of tableRows) {
    const rows = unwrapRows<Record<string, unknown>>(
      await db.execute(sql.raw(`SELECT * FROM \`${tableName}\``)),
    );
    database[tableName] = rows;
    totalRows += rows.length;
  }

  const fileBundles = params.includeFiles
    ? FILE_ROOTS.flatMap((rootPath) =>
        collectFiles(rootPath).map((file) => ({
          root: path.basename(rootPath),
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          mimeType: file.mimeType,
          sha256: file.sha256,
          contentBase64: file.contentBase64,
        })),
      )
    : [];

  const payload = {
    format: "glutec-system-export",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    exportedBy: {
      id: params.requestedBy.id,
      name: params.requestedBy.name ?? null,
      email: params.requestedBy.email ?? null,
    },
    reason: params.reason?.trim() || null,
    options: {
      includeFiles: params.includeFiles,
    },
    database,
    files: fileBundles,
    stats: {
      tableCount: tableRows.length,
      rowCount: totalRows,
      fileCount: fileBundles.length,
    },
  };

  const plainBuffer = Buffer.from(JSON.stringify(payload));
  const compressedBuffer = zlib.gzipSync(plainBuffer, { level: 9 });

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(params.exportPassword, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(compressedBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const manifest = {
    format: "glutec-secure-export",
    version: "1.0.0",
    algorithm: "aes-256-gcm",
    compression: "gzip",
    createdAt: new Date().toISOString(),
    exportedBy: payload.exportedBy,
    options: payload.options,
    stats: payload.stats,
    checksumSha256: sha256(compressedBuffer),
    kdf: {
      name: "scrypt",
      salt: toBase64(salt),
      keyLength: 32,
    },
    iv: toBase64(iv),
    authTag: toBase64(authTag),
    ciphertext: toBase64(encrypted),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `glutec_export_${timestamp}.glutec-export`;
  const filePath = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), { encoding: "utf8" });

  const token = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + EXPORT_RETENTION_MS;
  EXPORT_REGISTRY.set(token, {
    token,
    filePath,
    fileName,
    userId: params.requestedBy.id,
    expiresAt,
  });

  return {
    token,
    fileName,
    fileSizeBytes: fs.statSync(filePath).size,
    expiresAt: new Date(expiresAt).toISOString(),
    tableCount: payload.stats.tableCount,
    rowCount: payload.stats.rowCount,
    fileCount: payload.stats.fileCount,
  };
}

