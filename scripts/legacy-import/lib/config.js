// Carrega variaveis de ambiente do .env (na raiz de scripts/legacy-import)
const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch {}

function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`[config] variavel de ambiente faltando: ${name}. Copie .env.example para .env`); process.exit(1); }
  return v;
}

module.exports = {
  ssh: {
    host: required("SSH_HOST"),
    port: Number(process.env.SSH_PORT || 22),
    username: required("SSH_USER"),
    password: required("SSH_PASSWORD"),
    readyTimeout: 30000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 120,
  },
  mysql: {
    rootPassword: required("MYSQL_ROOT_PASSWORD"),
    database: process.env.MYSQL_DATABASE || "glutec",
  },
  r2: {
    endpoint: process.env.AWS_S3_ENDPOINT,
    bucket: process.env.AWS_S3_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "auto",
  },
  paths: {
    verdeZip: process.env.VERDE_ZIP,
    ondDir: process.env.OND_DIR,
  },
};
