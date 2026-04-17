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
    'ls /root/glutec_import/bin/verde/prontuarioverde-anexos | wc -l',
    'ls /root/glutec_import/bin/verde/prontuarioverde-anexos | grep "^8152$" || echo NO_8152',
    'ls /root/glutec_import/bin/verde/prontuarioverde-anexos | head -10',
    'find /root/glutec_import/bin/verde/prontuarioverde-anexos -name "878595.jpg" 2>/dev/null | head -3',
    'find /root/glutec_import/bin/verde/prontuarioverde-anexos -name "773638.jpg" 2>/dev/null | head -3',
    'docker exec glutec-backend ls /app/r2upload/verde 2>&1 | head -5',
    'docker exec glutec-backend ls /app/r2upload/verde/prontuarioverde-anexos 2>&1 | head -5',
  ];
  for (const c of cmds) {
    const o = await exec(c);
    console.log('$ ' + c);
    console.log(o.trim());
    console.log('---');
  }
  conn.end();
})();
