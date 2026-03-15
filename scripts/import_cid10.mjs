import fs from "fs";
import { createConnection } from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connection = await createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "manus",
  });

  console.log("Starting CID-10 import...");

  const csvPath = "/home/ubuntu/cid10_subcategorias.csv";
  const content = fs.readFileSync(csvPath, "latin1");
  const lines = content.split("\n").slice(1);

  const batchSize = 100;
  let batch = [];
  let count = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(";");
    if (parts.length < 6) continue;

    const subcat = parts[0];
    const description = parts[4];
    const descriptionAbbrev = parts[5];

    let code = subcat;
    if (subcat.length > 3) {
      code = subcat.substring(0, 3) + "." + subcat.substring(3);
    }

    batch.push([code, description, descriptionAbbrev]);

    if (batch.length >= batchSize) {
      const query = `INSERT INTO icd10_codes (code, description, descriptionAbbrev) VALUES ? ON DUPLICATE KEY UPDATE description = VALUES(description)`;
      await connection.query(query, [batch]);
      count += batch.length;
      console.log(`Imported ${count} codes...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    const query = `INSERT INTO icd10_codes (code, description, descriptionAbbrev) VALUES ? ON DUPLICATE KEY UPDATE description = VALUES(description)`;
    await connection.query(query, [batch]);
    count += batch.length;
  }

  console.log(`Finished importing ${count} CID-10 codes.`);
  await connection.end();
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
