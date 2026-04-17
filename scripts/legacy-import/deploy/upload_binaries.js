require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
#!/usr/bin/env node
/**
 * upload_binaries.js — Etapa 1/2 do upload dos binarios legados para R2.
 *
 * 1) SFTP sobe:
 *    - Verde ZIP (146 MB) → /root/glutec_import/bin/verde.zip
 *    - OnDoctor arquivos (1.6 GB) como TAR (evita 1000+ handshakes SFTP)
 * 2) Extrai os dois no VPS em /root/glutec_import/bin/verde/ e /ond/
 * 3) Copia o script uploader para dentro do container glutec-backend
 * 4) Disparao uploader em background via setsid+nohup (roda horas)
 *
 * Flags:
 *   SKIP_VERDE=1      nao sobe nem extrai Verde
 *   SKIP_OND=1        nao sobe nem extrai OnDoctor
 *   SKIP_UPLOAD=1     nao faz SFTP (assume ja esta la)
 *   SKIP_EXTRACT=1    nao extrai (assume ja extraido)
 *   SKIP_RUN=1        nao dispara o uploader R2
 *   DRY_RUN_R2=1      dispara o uploader em DRY_RUN
 *   LIMIT_R2=N        limita N arquivos no uploader (teste)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Client } = require("ssh2");

const SSH_CFG = {
  host: "129.121.52.61", port: 22022, username: "root", password: process.env.SSH_PASSWORD,
  readyTimeout: 30000, keepaliveInterval: 10000, keepaliveCountMax: 120,
};

const LOCAL_BASE = "C:/Users/wesle/OneDrive/Documentos/New project";
const VERDE_ZIP = `${LOCAL_BASE}/Backup Prontuário Verde Março 2026/8152-anexos-2026-03-12.zip`;
const OND_DIR = `${LOCAL_BASE}/Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA/arquivos`;
const OND_TAR_LOCAL = `${LOCAL_BASE}/import_tool/_ond_arquivos.tar`;
const LOCAL_R2_SCRIPT = `${LOCAL_BASE}/import_tool/upload_binaries_to_r2.js`;

const REMOTE_BIN = "/root/glutec_import/bin";
const REMOTE_VERDE_ZIP = `${REMOTE_BIN}/verde.zip`;
const REMOTE_OND_TAR = `${REMOTE_BIN}/ond.tar`;
const REMOTE_VERDE_DIR = `${REMOTE_BIN}/verde`;
const REMOTE_OND_DIR = `${REMOTE_BIN}/ond`;
const REMOTE_R2_SCRIPT = `${REMOTE_BIN}/upload_binaries_to_r2.cjs`;

const CT = "glutec-backend";
const CT_DIR = "/app/r2upload";

function exec(conn, cmd, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("close", (code) => resolve({ code, out }));
      stream.on("data", (d) => { const s = d.toString(); out += s; if (!silent) process.stdout.write(s); });
      stream.stderr.on("data", (d) => { const s = d.toString(); out += s; if (!silent) process.stderr.write(s); });
    });
  });
}
function sftpConnect(conn) { return new Promise((r, j) => conn.sftp((e, s) => e ? j(e) : r(s))); }
function sftpPut(sftp, lp, rp, onProg) {
  return new Promise((res, rej) => {
    const st = fs.statSync(lp);
    let last = Date.now();
    sftp.fastPut(lp, rp, {
      step: (transferred, _chunk, total) => {
        const now = Date.now();
        if (now - last > 3000) {
          last = now;
          const pct = ((transferred / total) * 100).toFixed(1);
          if (onProg) onProg(transferred, total, pct);
        }
      },
    }, (err) => err ? rej(err) : res(st.size));
  });
}

async function run() {
  const SKIP_VERDE = process.env.SKIP_VERDE === "1";
  const SKIP_OND = process.env.SKIP_OND === "1";
  const SKIP_UPLOAD = process.env.SKIP_UPLOAD === "1";
  const SKIP_EXTRACT = process.env.SKIP_EXTRACT === "1";
  const SKIP_RUN = process.env.SKIP_RUN === "1";
  const DRY_RUN_R2 = process.env.DRY_RUN_R2 === "1";
  const LIMIT_R2 = process.env.LIMIT_R2 || "";

  // Gera o tar do OnDoctor localmente (se necessario)
  if (!SKIP_OND && !SKIP_UPLOAD && !fs.existsSync(OND_TAR_LOCAL)) {
    console.log("[local] gerando tar do OnDoctor arquivos...");
    // usar tar do Git Bash (disponivel no Windows com Git for Windows)
    execSync(`tar -C "${LOCAL_BASE}/Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA" -cf "${OND_TAR_LOCAL}" arquivos`, { stdio: "inherit" });
    const sz = fs.statSync(OND_TAR_LOCAL).size;
    console.log(`  tar criado: ${(sz/1024/1024).toFixed(1)} MB`);
  }

  const conn = new Client();
  await new Promise((r, j) => { conn.on("ready", r); conn.on("error", j); conn.connect(SSH_CFG); });
  console.log("[SSH] conectado");

  try {
    await exec(conn, `mkdir -p ${REMOTE_BIN} ${REMOTE_VERDE_DIR} ${REMOTE_OND_DIR}`);

    if (!SKIP_UPLOAD) {
      const sftp = await sftpConnect(conn);
      if (!SKIP_VERDE) {
        console.log(`\n[SFTP] subindo Verde ZIP (${(fs.statSync(VERDE_ZIP).size/1024/1024).toFixed(1)} MB)...`);
        await sftpPut(sftp, VERDE_ZIP, REMOTE_VERDE_ZIP, (t, tot, p) => console.log(`  ${p}% (${(t/1024/1024).toFixed(1)}/${(tot/1024/1024).toFixed(1)} MB)`));
        console.log("  OK");
      }
      if (!SKIP_OND) {
        console.log(`\n[SFTP] subindo OnDoctor TAR (${(fs.statSync(OND_TAR_LOCAL).size/1024/1024).toFixed(1)} MB)...`);
        await sftpPut(sftp, OND_TAR_LOCAL, REMOTE_OND_TAR, (t, tot, p) => console.log(`  ${p}% (${(t/1024/1024).toFixed(1)}/${(tot/1024/1024).toFixed(1)} MB)`));
        console.log("  OK");
      }
      console.log("\n[SFTP] subindo script uploader...");
      await sftpPut(sftp, LOCAL_R2_SCRIPT, REMOTE_R2_SCRIPT);
      sftp.end();
    }

    if (!SKIP_EXTRACT) {
      if (!SKIP_VERDE) {
        console.log("\n[extract] Verde zip...");
        const { code } = await exec(conn, `apt-get install -y unzip >/dev/null 2>&1; cd ${REMOTE_VERDE_DIR} && unzip -oq ${REMOTE_VERDE_ZIP} && ls -la | head -5`);
        if (code !== 0) throw new Error("unzip falhou");
      }
      if (!SKIP_OND) {
        console.log("\n[extract] OnDoctor tar...");
        const { code } = await exec(conn, `cd ${REMOTE_OND_DIR} && tar -xf ${REMOTE_OND_TAR} && ls -la arquivos/ | head -5 || true`);
        if (code !== 0) throw new Error("tar -x falhou");
      }
      await exec(conn, `du -sh ${REMOTE_VERDE_DIR} ${REMOTE_OND_DIR} 2>&1 || true`);
    }

    if (!SKIP_RUN) {
      console.log("\n[container] copiando uploader e anexos...");
      const cpCmds = [
        `docker exec ${CT} mkdir -p ${CT_DIR}/verde ${CT_DIR}/ond`,
        `docker cp ${REMOTE_R2_SCRIPT} ${CT}:${CT_DIR}/upload_binaries_to_r2.cjs`,
        `docker cp ${REMOTE_VERDE_DIR}/. ${CT}:${CT_DIR}/verde/`,
        `docker cp ${REMOTE_OND_DIR}/arquivos/. ${CT}:${CT_DIR}/ond/`,
        `docker exec ${CT} sh -c "ls ${CT_DIR} && ls ${CT_DIR}/ond | head -3"`,
      ];
      for (const c of cpCmds) {
        const { code } = await exec(conn, c, { silent: true });
        if (code !== 0) { console.warn("aviso:", c); }
      }

      console.log("\n[run] instalando @aws-sdk/client-s3 no container (se necessario)...");
      await exec(conn, `docker exec ${CT} sh -c "cd /app && ls node_modules/@aws-sdk/client-s3/package.json 2>/dev/null || npm install --silent --no-audit --no-fund @aws-sdk/client-s3" 2>&1 | tail -3`);

      const ts = Date.now();
      const logRemote = `/root/glutec_import/r2_upload_${ts}.log`;
      const envArgs = [
        DRY_RUN_R2 ? "-e DRY_RUN=1" : "",
        LIMIT_R2 ? `-e LIMIT=${LIMIT_R2}` : "",
        `-e VERDE_BIN_DIR=${CT_DIR}/verde`,
        `-e OND_BIN_DIR=${CT_DIR}/ond`,
      ].filter(Boolean).join(" ");
      const runCmd =
        `setsid nohup bash -c "docker exec ${envArgs} ${CT} node ${CT_DIR}/upload_binaries_to_r2.cjs > ${logRemote} 2>&1" </dev/null >/dev/null 2>&1 & ` +
        `sleep 2 && echo STARTED && tail -20 ${logRemote} 2>/dev/null || true`;
      console.log(`\n[run] disparando uploader (log: ${logRemote})...`);
      const { out } = await exec(conn, runCmd);
      console.log(out);
    }
  } finally {
    conn.end();
  }
}
run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
