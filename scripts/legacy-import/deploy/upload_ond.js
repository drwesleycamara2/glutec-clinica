require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
function exec(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let out = ''; s.on('data', d => out += d); s.stderr.on('data', d => out += d);
    s.on('close', (code) => res({code, out}));
  }));
}
function sftpPut(sftp, lp, rp, onProg) {
  return new Promise((res, rej) => {
    let last = Date.now();
    sftp.fastPut(lp, rp, {
      step: (t, _c, tot) => {
        const now = Date.now();
        if (now - last > 5000) { last = now; onProg && onProg(t, tot); }
      },
    }, e => e ? rej(e) : res());
  });
}
(async () => {
  await new Promise((r, j) => { conn.on('ready', r); conn.on('error', j); conn.connect({host:'129.121.52.61',port:22022,username:'root',password:process.env.SSH_PASSWORD,readyTimeout:30000,keepaliveInterval:10000,keepaliveCountMax:120}); });
  console.log('SSH ok');
  const sftp = await new Promise((r, j) => conn.sftp((e, s) => e ? j(e) : r(s)));
  const local = 'C:/Users/wesle/OneDrive/Documentos/New project/deploy_tool/ond_filtered.tar';
  const remote = '/root/glutec_import/bin/ond_filtered.tar';
  const sz = fs.statSync(local).size;
  console.log(`SFTP enviando ${(sz/1024/1024).toFixed(1)} MB...`);
  await sftpPut(sftp, local, remote, (t, tot) => {
    const pct = (t/tot*100).toFixed(1);
    console.log(`  ${pct}% (${(t/1024/1024).toFixed(0)}/${(tot/1024/1024).toFixed(0)} MB)`);
  });
  sftp.end();
  console.log('SFTP ok. Extraindo no VPS...');

  const cmds = [
    'mkdir -p /root/glutec_import/bin/ond_filtered && cd /root/glutec_import/bin/ond_filtered && tar -xf ../ond_filtered.tar && ls | wc -l && du -sh .',
    'docker exec glutec-backend mkdir -p /app/r2upload/ond',
    'docker cp /root/glutec_import/bin/ond_filtered/. glutec-backend:/app/r2upload/ond/',
    'docker exec glutec-backend sh -c "ls /app/r2upload/ond | wc -l"',
  ];
  for (const c of cmds) {
    console.log('\n$ ' + c);
    const {out} = await exec(c);
    console.log(out.trim());
  }

  // Run uploader in background
  const ts = Date.now();
  const log = `/root/glutec_import/r2_ond_${ts}.log`;
  const runCmd = `setsid nohup bash -c "docker exec -e VERDE_BIN_DIR=/nonexistent -e OND_BIN_DIR=/app/r2upload/ond glutec-backend node /app/r2upload/upload_binaries_to_r2.cjs > ${log} 2>&1" </dev/null >/dev/null 2>&1 & sleep 5 && echo LOG=${log} && tail -20 ${log}`;
  console.log('\n[run] disparando uploader OnDoctor...');
  const {out} = await exec(runCmd);
  console.log(out);
  conn.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
