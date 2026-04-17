require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require('ssh2');
const conn = new Client();
function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
    });
  });
}
(async () => {
  await new Promise((r, j) => { conn.on('ready', r); conn.on('error', j); conn.connect({host:'129.121.52.61',port:22022,username:'root',password:process.env.SSH_PASSWORD,readyTimeout:30000}); });
  const P = `-p${process.env.MYSQL_ROOT_PASSWORD}`;
  const Q = (sql) => `docker exec glutec-mysql mysql -uroot ${P} glutec -e "${sql}" 2>&1 | grep -v "Using a password"`;
  const queries = [
    `SELECT id, sourceSystem, type, fileKey FROM patient_documents WHERE sourceSystem IN ('prontuario_verde','onedoctor') AND fileKey IS NOT NULL AND fileKey <> '' AND (fileUrl IS NULL OR fileUrl='') ORDER BY id LIMIT 20;`,
  ];
  for (const q of queries) {
    const { out } = await exec(conn, Q(q));
    console.log(out.trim());
  }
  // Check files in extracted dir
  const r2 = await exec(conn, 'ls /root/glutec_import/bin/verde/prontuarioverde-anexos 2>&1 | head -5 && echo --- && ls /root/glutec_import/bin/verde/prontuarioverde-documentos 2>&1 | head -5 && echo --- && find /root/glutec_import/bin/verde/prontuarioverde-documentos -type f 2>/dev/null | head -5');
  console.log(r2.out);
  conn.end();
})();
