require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require('ssh2');
const conn = new Client();
function exec(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let out = ''; s.on('data', d => out += d); s.stderr.on('data', d => out += d);
    s.on('close', () => res(out));
  }));
}
(async () => {
  await new Promise((r, j) => { conn.on('ready', r); conn.on('error', j); conn.connect({host:'129.121.52.61',port:22022,username:'root',password:process.env.SSH_PASSWORD,readyTimeout:30000}); });
  // Null fileUrl for stale /imports/... entries so uploader picks them up
  const sql1 = `UPDATE patient_documents SET fileUrl=NULL WHERE sourceSystem='prontuario_verde' AND fileUrl LIKE '/imports/%';`;
  console.log((await exec(`docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -e "${sql1}" 2>&1 | grep -v "Using a password"`)).trim());
  // Confirm count
  const sql2 = `SELECT COUNT(*) FROM patient_documents WHERE sourceSystem='prontuario_verde' AND fileKey IS NOT NULL AND fileKey<>'' AND (fileUrl IS NULL OR fileUrl='');`;
  console.log((await exec(`docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -e "${sql2}" 2>&1 | grep -v "Using a password"`)).trim());
  // Kick off uploader in background
  const ts = Date.now();
  const log = `/root/glutec_import/r2_verde2_${ts}.log`;
  const runCmd = `setsid nohup bash -c "docker exec -e VERDE_BIN_DIR=/app/r2upload/verde -e OND_BIN_DIR=/nonexistent glutec-backend node /app/r2upload/upload_binaries_to_r2.cjs > ${log} 2>&1" </dev/null >/dev/null 2>&1 & sleep 5 && echo LOG=${log} && tail -15 ${log}`;
  console.log('\n[run]');
  console.log((await exec(runCmd)).trim());
  conn.end();
})();
