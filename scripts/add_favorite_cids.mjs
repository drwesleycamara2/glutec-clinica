import mysql from "mysql2/promise";

const codesToFind = ["M79", "M62.5", "M21", "E88.1", "R23.4", "M62.8", "Z76.0"];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida");
    process.exit(1);
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  console.log("Buscando IDs para os CIDs:", codesToFind);

  const icdIds = [];

  for (const code of codesToFind) {
    const [rows] = await connection.query(
      "SELECT id, code, description FROM icd10_codes WHERE code = ? OR code = ?",
      [code, code.replace(".", "")]
    );
    if (rows.length > 0) {
      console.log(`Encontrado: ID=${rows[0].id}, Code=${rows[0].code}, Desc=${rows[0].description}`);
      icdIds.push(rows[0].id);
    } else {
      console.log(`Não encontrado: ${code}`);
    }
  }

  if (icdIds.length === 0) {
    console.log("Nenhum CID encontrado. Abortando.");
    await connection.end();
    return;
  }

  // Buscar todos os usuários
  const [users] = await connection.query("SELECT id, name FROM users");
  console.log(`Encontrados ${users.length} usuários.`);

  for (const user of users) {
    console.log(`Adicionando favoritos para o usuário: ${user.name} (ID: ${user.id})`);
    for (const icdId of icdIds) {
      await connection.query(
        "INSERT IGNORE INTO user_favorite_icds (userId, icd10CodeId) VALUES (?, ?)",
        [user.id, icdId]
      );
    }
  }

  await connection.end();
  console.log("Processo concluído com sucesso.");
}

main().catch(console.error);
