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
    // top 5 patients by total imported documents
    `SELECT p.id, p.fullName, p.cpf, COUNT(d.id) as docs FROM patients p JOIN patient_documents d ON d.patientId=p.id WHERE d.sourceSystem IN ('prontuario_verde','onedoctor') GROUP BY p.id ORDER BY docs DESC LIMIT 5;`,
    `SELECT 'patients' as tbl, COUNT(*) as n FROM patients WHERE sourceSystem IN ('prontuario_verde','onedoctor') UNION ALL SELECT 'documents', COUNT(*) FROM patient_documents WHERE sourceSystem IN ('prontuario_verde','onedoctor') UNION ALL SELECT 'docs_with_r2_url', COUNT(*) FROM patient_documents WHERE sourceSystem IN ('prontuario_verde','onedoctor') AND fileUrl LIKE '%legacy/%' UNION ALL SELECT 'clinical_evolutions', COUNT(*) FROM clinical_evolutions WHERE sourceSystem IN ('prontuario_verde','onedoctor') UNION ALL SELECT 'budgets', COUNT(*) FROM budgets WHERE sourceSystem IN ('prontuario_verde','onedoctor') UNION ALL SELECT 'prescriptions', COUNT(*) FROM prescriptions WHERE sourceSystem IN ('prontuario_verde','onedoctor');`,
    `SELECT id, fileKey, SUBSTRING(fileUrl,1,90) FROM patient_documents WHERE sourceSystem='prontuario_verde' AND fileUrl LIKE '%legacy/%' ORDER BY id DESC LIMIT 3;`,
    `SELECT id, fileKey, SUBSTRING(fileUrl,1,90) FROM patient_documents WHERE sourceSystem='onedoctor' AND fileUrl LIKE '%legacy/%' ORDER BY id DESC LIMIT 3;`,
    // doc type breakdown
    `SELECT type, COUNT(*) FROM patient_documents WHERE sourceSystem IN ('prontuario_verde','onedoctor') GROUP BY type ORDER BY 2 DESC;`,
  ];
  for (const q of queries) {
    console.log((await exec(Q(q))).trim());
    console.log('---');
  }
  conn.end();
})();
