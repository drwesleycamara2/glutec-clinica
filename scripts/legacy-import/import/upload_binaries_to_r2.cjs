require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
#!/usr/bin/env node
/**
 * upload_binaries_to_r2.js — Roda DENTRO do container glutec-backend.
 *
 * Le a lista de fileKeys do banco (patient_documents onde sourceSystem IN (...))
 * e faz upload dos arquivos binarios do disco para o bucket R2, atualizando
 * fileKey (com prefixo 'legacy/<sourceSystem>/...') e fileUrl (URL publica R2).
 *
 * ENV obrigatorias (ja vem do .env do container):
 *   DATABASE_URL
 *   AWS_S3_ENDPOINT
 *   AWS_S3_BUCKET
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION
 *
 * ENV custom:
 *   VERDE_BIN_DIR   — diretorio contendo 'prontuarioverde-anexos' e 'prontuarioverde-documentos'
 *   OND_BIN_DIR     — diretorio com os arquivos OnDoctor (sem subdirs)
 *   DRY_RUN=1       — nao faz upload, so simula
 *   LIMIT=N         — processa apenas N arquivos (teste)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const DRY_RUN = process.env.DRY_RUN === "1";
const LIMIT = Number(process.env.LIMIT || "0");
const VERDE_BIN_DIR = process.env.VERDE_BIN_DIR;
const OND_BIN_DIR = process.env.OND_BIN_DIR;

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL faltando"); process.exit(1); }
if (!process.env.AWS_S3_BUCKET) { console.error("AWS_S3_BUCKET faltando"); process.exit(1); }

console.log("===========================================");
console.log(" R2 uploader — anexos legados");
console.log("===========================================");
console.log(" DRY_RUN      :", DRY_RUN);
console.log(" LIMIT        :", LIMIT || "(sem limite)");
console.log(" VERDE_BIN_DIR:", VERDE_BIN_DIR || "(nao definido)");
console.log(" OND_BIN_DIR  :", OND_BIN_DIR || "(nao definido)");
console.log(" R2 bucket    :", process.env.AWS_S3_BUCKET);
console.log(" R2 endpoint  :", process.env.AWS_S3_ENDPOINT);

const s3 = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: process.env.AWS_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
const BUCKET = process.env.AWS_S3_BUCKET;

function mimeFromExt(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const map = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webp: "image/webp",
    heic: "image/heic", bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain", zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

function buildPublicUrl(key) {
  // R2 public URL padrao (bucket precisa estar public ou usar CDN)
  // Usamos o endpoint + bucket, que eh o padrao para signed/public acess.
  const endpoint = process.env.AWS_S3_ENDPOINT.replace(/\/$/, "");
  return `${endpoint}/${BUCKET}/${key}`;
}

// Procura o arquivo local em Verde (pode estar em anexos/ ou documentos/)
// fileKey vem como "prontuarioverde-anexos/8152/968599/878595.jpg"
// mas o disco tem "prontuarioverde-anexos/968599/878595.jpg" (sem o 8152 clinic id)
function findVerdeFile(fileKey) {
  if (!VERDE_BIN_DIR) return null;
  // remove segmento de clinic id (ex: /8152/) que aparece no DB mas nao no disco
  const stripped = fileKey.replace(/^(prontuarioverde-(?:anexos|documentos))\/\d+\//, "$1/");
  const tries = [
    path.join(VERDE_BIN_DIR, fileKey),
    path.join(VERDE_BIN_DIR, stripped),
    path.join(VERDE_BIN_DIR, "prontuarioverde-anexos", fileKey),
    path.join(VERDE_BIN_DIR, "prontuarioverde-documentos", fileKey),
  ];
  for (const p of tries) if (fs.existsSync(p)) return p;
  return null;
}
function findOnDoctorFile(fileKey) {
  if (!OND_BIN_DIR) return null;
  const p = path.join(OND_BIN_DIR, fileKey);
  return fs.existsSync(p) ? p : null;
}

async function head(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function uploadOne(localPath, key) {
  const body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: mimeFromExt(localPath),
  }));
  return body.length;
}

(async () => {
  // conecta MySQL usando a mesma conn string do app
  const url = new URL(process.env.DATABASE_URL);
  const db = await mysql.createConnection({
    host: url.hostname, port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    multipleStatements: false,
  });
  console.log("[db] conectado");

  const [rows] = await db.execute(
    `SELECT id, patientId, sourceSystem, fileKey, name, type
     FROM patient_documents
     WHERE sourceSystem IN ('prontuario_verde','onedoctor')
       AND fileKey IS NOT NULL AND fileKey <> ''
       AND (fileUrl IS NULL OR fileUrl = '')
     ORDER BY id
     ${LIMIT ? "LIMIT " + LIMIT : ""}`
  );
  console.log(`[db] pendentes: ${rows.length}`);

  const stats = { uploaded: 0, skipped: 0, notFound: 0, alreadyOnR2: 0, errors: 0, bytes: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const local = r.sourceSystem === "prontuario_verde"
        ? findVerdeFile(r.fileKey)
        : findOnDoctorFile(r.fileKey);

      if (!local) { stats.notFound++; continue; }

      // normaliza a nova key: legacy/verde/<path> ou legacy/ond/<file>
      const prefix = r.sourceSystem === "prontuario_verde" ? "legacy/verde" : "legacy/ond";
      const newKey = `${prefix}/${r.fileKey.replace(/^\/+/, "")}`;
      const publicUrl = buildPublicUrl(newKey);

      if (DRY_RUN) {
        stats.uploaded++;
        if ((i + 1) % 50 === 0) console.log(`  [DRY] ${i+1}/${rows.length} — ${newKey}`);
        continue;
      }

      if (await head(newKey)) {
        stats.alreadyOnR2++;
      } else {
        const bytes = await uploadOne(local, newKey);
        stats.uploaded++;
        stats.bytes += bytes;
      }

      await db.execute(
        `UPDATE patient_documents SET fileKey = ?, fileUrl = ?, updatedAt = NOW() WHERE id = ?`,
        [newKey, publicUrl, r.id]
      );

      if ((i + 1) % 50 === 0) {
        console.log(`  ${i+1}/${rows.length} — ok=${stats.uploaded} skip=${stats.alreadyOnR2} nf=${stats.notFound} bytes=${(stats.bytes/1024/1024).toFixed(1)}MB`);
      }
    } catch (e) {
      stats.errors++;
      console.error(`ERR id=${r.id}:`, e.message);
    }
  }

  console.log("\n=== RESUMO ===");
  console.log(JSON.stringify(stats, null, 2));
  await db.end();
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
