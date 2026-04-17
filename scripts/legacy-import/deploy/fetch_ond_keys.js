require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require('ssh2');
const fs = require('fs');
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
  const sql = `SELECT fileKey FROM patient_documents WHERE sourceSystem='onedoctor' AND fileKey IS NOT NULL AND fileKey<>'' AND (fileUrl IS NULL OR fileUrl='');`;
  const cmd = `docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -N -B -e "${sql}" 2>&1 | grep -v "Using a password"`;
  const out = await exec(cmd);
  const keys = out.trim().split('\n').filter(k => k && !k.includes('Warning'));
  fs.writeFileSync('C:/Users/wesle/OneDrive/Documentos/New project/deploy_tool/ond_keys.txt', keys.join('\n'));
  console.log('Total keys:', keys.length);
  console.log('Sample:', keys.slice(0, 5));
  conn.end();
})();
