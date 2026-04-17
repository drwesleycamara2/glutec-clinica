const { Client } = require("ssh2");
const { ssh: SSH_CFG } = require("./config");

function connect() {
  const conn = new Client();
  return new Promise((res, rej) => {
    conn.on("ready", () => res(conn));
    conn.on("error", rej);
    conn.connect(SSH_CFG);
  });
}

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

function sftp(conn) {
  return new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
}

function sftpPut(sftpClient, local, remote, onProg) {
  return new Promise((res, rej) => {
    let last = Date.now();
    sftpClient.fastPut(local, remote, {
      step: (t, _c, tot) => {
        const now = Date.now();
        if (now - last > 3000) { last = now; onProg && onProg(t, tot); }
      },
    }, (e) => (e ? rej(e) : res()));
  });
}

// Helper para rodar MySQL dentro do container glutec-mysql
function mysqlCmd(sql, { database = "glutec" } = {}) {
  const { mysql: M } = require("./config");
  const db = database || M.database;
  return `docker exec glutec-mysql mysql -uroot -p${M.rootPassword} ${db} -e "${sql.replace(/"/g, '\\"')}" 2>&1 | grep -v "Using a password"`;
}

module.exports = { connect, exec, sftp, sftpPut, mysqlCmd };
