import mysql from "mysql2/promise";

const codesToFind = ["M79", "M62.5", "M21", "E88.1", "R23.4", "M62.8", "Z76.0"];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida");
    process.exit(1);
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  console.log("Buscando IDs para os CIDs:", codesToFind);

  const results = [];

  for (const code of codesToFind) {
    const [rows] = await connection.query(
      "SELECT id, code, description FROM icd10_codes WHERE code = ? OR code = ?",
      [code, code.replace(".", "")]
    );
    if (rows.length > 0) {
      console.log(`Encontrado: ID=${rows[0].id}, Code=${rows[0].code}, Desc=${rows[0].description}`);
      results.push(rows[0]);
    } else {
      console.log(`Não encontrado: ${code}`);
    }
  }

  await connection.end();
  console.log("\nJSON para o próximo passo:");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
