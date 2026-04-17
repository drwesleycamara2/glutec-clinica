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
  const cmds = [
    'ls -t /root/glutec_import/r2_ond_*.log 2>/dev/null | head -1 | xargs tail -25',
    'pgrep -af upload_binaries || echo NO_PROCESS',
    `docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -N -B -e "SELECT sourceSystem, COUNT(*) FROM patient_documents WHERE fileKey IS NOT NULL AND fileKey<>'' AND (fileUrl IS NULL OR fileUrl='') GROUP BY sourceSystem;" 2>&1 | grep -v "Using a password"`,
    `docker exec glutec-mysql mysql -uroot -p${process.env.MYSQL_ROOT_PASSWORD} glutec -N -B -e "SELECT sourceSystem, COUNT(*) FROM patient_documents WHERE fileUrl LIKE '%legacy/%' GROUP BY sourceSystem;" 2>&1 | grep -v "Using a password"`,
  ];
  for (const c of cmds) {
    console.log('$ ' + c);
    console.log((await exec(c)).trim());
    console.log('---');
  }
  conn.end();
})();
