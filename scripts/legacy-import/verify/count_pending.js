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
  const Q = (sql) => `docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -e "${sql}" 2>&1 | grep -v "Using a password"`;
  const queries = [
    `SELECT sourceSystem, COUNT(*) FROM patient_documents WHERE fileKey IS NOT NULL AND fileKey<>'' AND (fileUrl IS NULL OR fileUrl='') GROUP BY sourceSystem;`,
    `SELECT sourceSystem, COUNT(*) FROM patient_documents WHERE sourceSystem IN ('prontuario_verde','onedoctor') GROUP BY sourceSystem;`,
    `SELECT COUNT(*) FROM patient_documents WHERE sourceSystem='prontuario_verde' AND fileUrl IS NOT NULL AND fileUrl<>'';`,
  ];
  for (const q of queries) {
    const o = await exec(Q(q));
    console.log(o.trim());
    console.log('---');
  }
  conn.end();
})();
