import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Starting CID-10 import via API...");

  const csvPath = "/home/ubuntu/cid10_subcategorias.csv";
  const content = fs.readFileSync(csvPath, "latin1");
  const lines = content.split("\n").slice(1);

  const codes = [];

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

    codes.push({
      code,
      description,
      descriptionAbbrev,
    });
  }

  console.log(`Total codes to import: ${codes.length}`);

  // Save to JSON file for import
  const outputPath = path.join(__dirname, "../cid10_data.json");
  fs.writeFileSync(outputPath, JSON.stringify(codes, null, 2));
  console.log(`Saved ${codes.length} codes to ${outputPath}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
