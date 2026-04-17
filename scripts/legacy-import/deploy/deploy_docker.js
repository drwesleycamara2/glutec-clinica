require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
#!/usr/bin/env node
/**
 * deploy_docker.js — deploy para a stack dockerizada real (em /app)
 *
 *   /app/docker-compose.yml
 *   /app/glutec-clinica-repo/   (onde esta o repo)
 */
const { Client } = require('ssh2');
const conn = new Client();

const commands = [
  'cd /app/glutec-clinica-repo && git pull origin main 2>&1 | tail -10',
  'cd /app/glutec-clinica-repo && git log -1 --oneline',
  'cd /app && docker compose build glutec-frontend glutec-backend 2>&1 | tail -20',
  'cd /app && docker compose up -d glutec-frontend glutec-backend 2>&1 | tail -10',
  'sleep 5 && docker ps --format "{{.Names}}\\t{{.Status}}" | grep glutec',
];

function runCmd(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('close', (code) => resolve({ code, out }));
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
    });
  });
}

conn.on('ready', async () => {
  console.log('SSH conectado');
  for (const cmd of commands) {
    console.log('\n$ ' + cmd);
    try {
      const { code, out } = await runCmd(conn, cmd);
      console.log(out.trim());
      console.log('[exit=' + code + ']');
    } catch (e) {
      console.log('ERR: ' + e.message);
    }
  }
  conn.end();
}).connect({
  host: '129.121.52.61',
  port: 22022,
  username: 'root',
  password: process.env.SSH_PASSWORD,
  readyTimeout: 30000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 60,
});
