import "dotenv/config";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const RAW_STOCK_LIST = `
Fios Cirúrgicos
Fio absorvível Poligrecaprona(PGCL25)Bioline 5-0
Fio absorvível Poligrecaprona (PGCL25) Bioline 4-0
Fio absorvível Poligrecaprona (PGCL25) Bioline 3-0
Fio absorvível Poligrecaprona (PGC25) Atramat 4-0
Fio absorvível catgut simples Shalon 4-0
Fio absorvível Polidioxanona (PDS) 3-0
Fio absorvível Poliglactina (PGN) Mitsu 3-0
Fio nylon Medix 5-0
Fio nylon Medix 4-0
Fio nylon Medix 3-0
Microcânulas
Microcânula 27G x 50 mm
Microcânula 25G x 50 mm
Microcânula 22G x 50 mm
Microcânula 22G x 70 mm
Microcânula 18G x 100 mm
Microcânula 18G x 70 mm
Microcânula 15G x 100 mm
Curativos e Bandagens
Bandagem elástica autoaderente 10 cm
Bandagem elástica autoaderente 5 cm
Micropore 5 cm
Micropore 2,5 cm
Blood Stop (curativo adesivo pós-punção)
Algodão
Gaze
Compressas para esterilização
Agulhas
Agulha 18G rosa
Agulha 16G branca
Agulha 22G preta
Agulha 26G marrom
Agulha 30G amarela
Dispositivos Intravenosos
Fixador para dispositivo intravenoso
Cateter intravenoso (Jelco/Abocath) 22G
Cateter intravenoso (Jelco/Abocath) 20G
Cateter intravenoso (Jelco/Abocath) 18G
Extensor duas vias (Polyfix)
Torneira descartável 3 vias
Equipo macrogotas
Equipo microgotas
Seringas
Seringa 5 mL
Seringa 10 mL
Seringa 20 mL
Seringa 60 mL
Seringa BD para lipo/enxerto 20 mL
Seringa BD para lipo/enxerto 50 mL
Seringa descartável para insulina 1 mL (100 UI) com agulha
Seringa descartável para insulina 0,5 mL (50 UI) com agulha
Medicamentos Injetáveis
Lidocaína 2% sem vasoconstritor — frasco 20 mL
Lidocaína 2% com vasoconstritor/epinefrina — frasco 20 mL
Lidocaína 2% com vasoconstritor — carpule 1,8 mL
Dipirona monoidratada 500 mg/mL — ampola 2 mL
Cefazolina sódica 1 g – ampola pó injetável
Ceftriaxona 1 g – ampola pó injetável
Epinefrina 1 mg/mL – ampola 1 ml
Ácido tranexâmico (Transamin) 50 mg/mL – Ampola 5 ml
Bicarbonato de sódio 8,4% — flaconete 10 mL
Triancinolona 20 mg/mL — ampola
Betametasona — ampola intramuscular
Hialuronidase — ampola pó injetável
Citoneurin 5000 — ampola I+II
Medicamentos Orais e Sublinguais
Loratadina 10 mg — VO
Polaramine® (Dexclorfeniramina) 6 mg — VO
Domperidona 10 mg — VO
Dramin B6® 50 mg — VO
Dexametasona 4 mg — VO
Dipirona 1 g — VO
Paracetamol 750 mg — VO
Ciclobenzaprina 10 mg — VO
Ondansetrona 8 mg — sublingual
Cetorolaco trometamol 10 mg — sublingual
Levofloxacino 750 mg – VO
Midazolam 15 mg – VO
Midazolam 7,5 mg – VO
Alprazolam 1 mg – VO
Alprazolam 2 mg – VO
Trazodona 50 mg - VO
Pomadas, Cremes e Tópicos
Lidocaína 2% gel – Bisnaga
Lidocaína 23% + Tetracaína 7% gel – Bisnaga manipulada
Traumel® pomada — bisnaga/unidade
Cicaplast Baume B5+® — crème - bisnaga
Hidrocortisona 10 mg/g — crème - bisnaga
Dexametasona 1 mg/g — crème - bisnaga
Neomicina + Bacitracina — pomada tópica/bisnaga
Ressorcinina 10 mg/mL — spray
Antissépticos e Limpeza
Clorexidina alcoólica 0,5% - frasco 1 litro
Clorexidina aquosa 2% - - frasco 1 litro
Clorexidina degermante 2% - - frasco 1 litro
Clorexidina degermante 2% - frasco 100 ml
Álcool 70% - - frasco 1 litro
Álcool 70% - - galão 5 litros
Água destilada — galão 5 litros
Detergente para lavagem de materiais e uso geral – frasco 1 litro
Detergente enzimático – frasco 1 litro
Detergente para uso geral Proneutro® — galão 5 litros
Controle de Esterilização
Indicador químico para autoclave
Indicador biológico para autoclave
SMS 50 g para autoclave — 1 m x 1 m
Fita indicadora para autoclave
Papel grau cirúrgico
Soluções e Soros
Soro fisiológico 0,9% — frasco 100 mL
Soro fisiológico 0,9% — frasco 250 mL
Soro fisiológico 0,9% — frasco 500 mL
Soro fisiológico 0,9% — frasco 1000 mL
Soro fisiológico 0,9% — flush 10 mL
Ringer simples — frasco 500 mL
Água para injeção — frasco 250 mL
EPIs e Vestimentas
Touca descartável
Máscara descartável
Luva de procedimento P
Luva de procedimento M
Luva cirúrgica estéril tamanho 7,5 — caixa
Luva cirúrgica estéril tamanho 7 — caixa
Luva cirúrgica estéril tamanho 6,5 — caixa
Luva de látex tamanho P — caixa
Luva de látex tamanho M — caixa
Avental para procedimento 40G preto
Avental para procedimento 30G
Avental de paciente sem manga
Propé
Bioestimuladores e Preenchedores
PMMA Biossimetric 30% — Caixa 30 ml
PMMA Biossimetric 15% — Caixa 30 ml
Harmonize Gold (Hidroxiapatita de cálcio 30%) — Caixa 1 ml
Singderm ácido hialurônico 2 mL — caixa
Singderm ácido hialurônico 10 mL — caixa
Lâminas e Instrumentais
Lâmina para bisturi nº 10
Lâmina para bisturi nº 11
Lâmina para bisturi nº 12
Cortador de fibras para endolaser/autoclave
Cateteres Uretrais
Cateter uretral nº 16
Cateter uretral nº 14
Campos Cirúrgicos
Campo estéril plástico
Campo estéril SMS fenestrado
Campo estéril SMS liso 40-60 cm
Posicionamento e Conforto
Cobertor
Manta térmica aluminizada
Almofada para seios
Almofada para glúteos
Almofada para pescoço grande
Almofada para pescoço pequena
Almofada elevada para pescoço
Pós-operatório
Placa semirrígida para abdômen — P, M, G
Placa semirrígida para cintura — P, M, G
Placa semirrígida para costas — P, M, G
Placa flexível para pubis
Placa semirrígida sacral
Placa semirrígida culote
Placa semirrígida axilar
Placa semirrígida papada
Malha/Cinta para papada
Malha/Cinta para braços — P, M, G
Malha/Cinta colombiana PP
Malha/Cinta colombiana P
Malha/Cinta colombiana M
Malha/Cinta colombiana G
Malha/Cinta colombiana GG
Malha/Cinta colombiana EGG
Malha/Cinta sem seios P
Malha/Cinta sem seios M
Malha/Cinta sem seios G
Malha/Cinta sem seios GG
Bermuda compressiva P
Bermuda compressive M
Bermuda compressive G
Outros
Teste rápido de gravidez (Beta-HCG urinário)
Filtros para lipoaspirador
Esponja com clorexidina 2%
Esponja seca com clorexidina 2%
Gases Medicinais
Cilindro de oxigênio medicinal
Cilindro de óxido nitroso
Regulador para oxigênio medicinal
Regulador para óxido nitroso
`;

const SECTIONS = new Set([
  "Fios Cirúrgicos",
  "Microcânulas",
  "Curativos e Bandagens",
  "Agulhas",
  "Dispositivos Intravenosos",
  "Seringas",
  "Medicamentos Injetáveis",
  "Medicamentos Orais e Sublinguais",
  "Pomadas, Cremes e Tópicos",
  "Antissépticos e Limpeza",
  "Controle de Esterilização",
  "Soluções e Soros",
  "EPIs e Vestimentas",
  "Bioestimuladores e Preenchedores",
  "Lâminas e Instrumentais",
  "Cateteres Uretrais",
  "Campos Cirúrgicos",
  "Posicionamento e Conforto",
  "Pós-operatório",
  "Outros",
  "Gases Medicinais",
]);

const SECTION_DEFAULTS = {
  "Fios Cirúrgicos": { category: "Curativos", subcategory: "Fios/sutura", controlsLot: true, controlsExpiration: true },
  "Microcânulas": { category: "Produtos para procedimento", subcategory: "Microcânulas" },
  "Curativos e Bandagens": { category: "Curativos", subcategory: "Curativos e bandagens" },
  Agulhas: { category: "Materiais descartáveis", subcategory: "Agulhas" },
  "Dispositivos Intravenosos": { category: "Materiais descartáveis", subcategory: "Dispositivos intravenosos" },
  Seringas: { category: "Materiais descartáveis", subcategory: "Seringas" },
  "Medicamentos Injetáveis": { category: "Medicamentos", subcategory: "Injetáveis", itemType: "medicamento", controlsLot: true, controlsExpiration: true },
  "Medicamentos Orais e Sublinguais": { category: "Medicamentos", subcategory: "Orais e sublinguais", itemType: "medicamento", controlsLot: true, controlsExpiration: true },
  "Pomadas, Cremes e Tópicos": { category: "Medicamentos", subcategory: "Pomadas, cremes e tópicos", itemType: "medicamento", controlsLot: true, controlsExpiration: true },
  "Antissépticos e Limpeza": { category: "Saneantes e limpeza", subcategory: "Antissépticos", controlsLot: true, controlsExpiration: true },
  "Controle de Esterilização": { category: "Materiais estéreis", subcategory: "Controle de esterilização", controlsLot: true, controlsExpiration: true },
  "Soluções e Soros": { category: "Medicamentos", subcategory: "Soluções e soros", itemType: "medicamento", controlsLot: true, controlsExpiration: true, criticalCare: true },
  "EPIs e Vestimentas": { category: "EPIs", subcategory: "Vestimentas" },
  "Bioestimuladores e Preenchedores": { category: "Produtos para procedimento", subcategory: "Bioestimuladores e preenchedores", controlsLot: true, controlsExpiration: true, highCost: true },
  "Lâminas e Instrumentais": { category: "Materiais estéreis", subcategory: "Lâminas e instrumentais", controlsLot: true, controlsExpiration: true },
  "Cateteres Uretrais": { category: "Materiais descartáveis", subcategory: "Cateteres uretrais" },
  "Campos Cirúrgicos": { category: "Materiais estéreis", subcategory: "Campos cirúrgicos", controlsLot: true, controlsExpiration: true },
  "Posicionamento e Conforto": { category: "Equipamentos e eletrônicos", subcategory: "Posicionamento e conforto", itemType: "equipamento" },
  "Pós-operatório": { category: "Produtos para procedimento", subcategory: "Pós-operatório" },
  Outros: { category: "Outros", subcategory: "Outros" },
  "Gases Medicinais": { category: "Gases medicinais", subcategory: "Cilindros e acessórios", itemType: "gas_medicinal", controlsLot: true },
};

function normalizeSku(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 42);
}

function stableSku(name) {
  const hash = crypto.createHash("sha1").update(name, "utf8").digest("hex").slice(0, 8).toUpperCase();
  const slug = normalizeSku(name).slice(0, 24);
  return `GLU-${hash}-${slug}`;
}

function inferUnit(name) {
  const text = name.toLowerCase();
  if (text.includes("caixa")) return "caixa";
  if (text.includes("galão")) return "galão";
  if (text.includes("frasco")) return "frasco";
  if (text.includes("ampola")) return "ampola";
  if (text.includes("bisnaga")) return "bisnaga";
  if (text.includes("cilindro")) return "cilindro";
  if (text.includes("seringa")) return "unidade";
  return "unidade";
}

function refineSubcategory(product, defaults) {
  const text = product.toLowerCase();
  if (defaults.category === "Curativos") {
    if (text.includes("micropore")) return "Micropore";
    if (text.includes("algodão")) return "Algodão";
    if (text.includes("gaze")) return "Gaze";
    if (text.includes("compressa")) return "Compressa";
    if (text.includes("bandagem")) return "Tape";
  }
  if (defaults.category === "Gases medicinais") {
    if (text.includes("oxigênio")) return "Oxigênio medicinal";
    if (text.includes("óxido nitroso")) return "Óxido nitroso";
    return "Reguladores e acessórios";
  }
  return defaults.subcategory ?? null;
}

function parseItems() {
  const lines = RAW_STOCK_LIST.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  let section = "";
  for (const line of lines) {
    if (SECTIONS.has(line)) {
      section = line;
      continue;
    }
    const defaults = SECTION_DEFAULTS[section] ?? { category: section || "Outros", subcategory: section || null };
    const lower = line.toLowerCase();
    const isControlled = ["midazolam", "alprazolam", "trazodona"].some((term) => lower.includes(term));
    const isEmergency = ["epinefrina", "hialuronidase", "bicarbonato de sódio"].some((term) => lower.includes(term));
    items.push({
      name: line,
      section,
      sku: stableSku(line),
      category: defaults.category,
      subcategory: refineSubcategory(line, defaults),
      itemType: defaults.itemType ?? "consumivel",
      unit: inferUnit(line),
      controlsLot: Boolean(defaults.controlsLot),
      controlsExpiration: Boolean(defaults.controlsExpiration),
      controlledMedication: isControlled,
      highCost: Boolean(defaults.highCost),
      criticalCare: Boolean(defaults.criticalCare || isEmergency),
      emergencyCartItem: isEmergency,
      gasType: lower.includes("oxigênio") ? "oxigenio_medicinal" : lower.includes("óxido nitroso") ? "oxido_nitroso" : null,
      notes: `Cadastro base importado de Lista_Estoque_Clinica_Glutee.docx. Preencher quantidade, lote, validade, fornecedor e demais dados conforme conferência física.`,
    });
  }
  return items;
}

async function getColumns(connection, table) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map((row) => row.Field));
}

async function addColumnIfMissing(connection, table, columns, name, ddl) {
  if (columns.has(name)) return;
  await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  columns.add(name);
}

async function ensureInventoryTables(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      createdBy INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_inventory_categories_name (name),
      KEY idx_inventory_categories_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS inventory_products (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(256) NOT NULL,
      sku VARCHAR(64) NULL,
      category VARCHAR(128) NULL,
      description TEXT NULL,
      unit VARCHAR(32) DEFAULT 'un',
      currentStock INT NOT NULL DEFAULT 0,
      minimumStock INT NULL DEFAULT NULL,
      costPriceInCents INT NULL,
      supplierName VARCHAR(256) NULL,
      supplierContact VARCHAR(128) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      createdBy INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_inventory_products_sku (sku),
      KEY idx_inventory_products_active (active),
      KEY idx_inventory_products_stock (currentStock, minimumStock)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const categoryColumns = await getColumns(connection, "inventory_categories");
  await addColumnIfMissing(connection, "inventory_categories", categoryColumns, "parentCategoryId", "`parentCategoryId` INT NULL");
  await addColumnIfMissing(connection, "inventory_categories", categoryColumns, "sortOrder", "`sortOrder` INT NOT NULL DEFAULT 0");
  await addColumnIfMissing(connection, "inventory_categories", categoryColumns, "updatedBy", "`updatedBy` INT NULL");

  const productColumns = await getColumns(connection, "inventory_products");
  const productColumnDdls = [
    ["technicalName", "`technicalName` VARCHAR(256) NULL"],
    ["brand", "`brand` VARCHAR(128) NULL"],
    ["manufacturer", "`manufacturer` VARCHAR(160) NULL"],
    ["size", "`size` VARCHAR(96) NULL"],
    ["barcode", "`barcode` VARCHAR(96) NULL"],
    ["presentation", "`presentation` VARCHAR(160) NULL"],
    ["subcategory", "`subcategory` VARCHAR(128) NULL"],
    ["itemType", "`itemType` VARCHAR(64) NOT NULL DEFAULT 'consumivel'"],
    ["unitPurchase", "`unitPurchase` VARCHAR(48) NULL"],
    ["conversionFactor", "`conversionFactor` DECIMAL(12,3) NOT NULL DEFAULT 1"],
    ["supplierId", "`supplierId` INT NULL"],
    ["allowsProcedureUse", "`allowsProcedureUse` TINYINT(1) NOT NULL DEFAULT 1"],
    ["controlsLot", "`controlsLot` TINYINT(1) NOT NULL DEFAULT 0"],
    ["controlsExpiration", "`controlsExpiration` TINYINT(1) NOT NULL DEFAULT 0"],
    ["requiresTemperatureControl", "`requiresTemperatureControl` TINYINT(1) NOT NULL DEFAULT 0"],
    ["temperatureMin", "`temperatureMin` DECIMAL(6,2) NULL"],
    ["temperatureMax", "`temperatureMax` DECIMAL(6,2) NULL"],
    ["controlledMedication", "`controlledMedication` TINYINT(1) NOT NULL DEFAULT 0"],
    ["highCost", "`highCost` TINYINT(1) NOT NULL DEFAULT 0"],
    ["criticalCare", "`criticalCare` TINYINT(1) NOT NULL DEFAULT 0"],
    ["emergencyCartItem", "`emergencyCartItem` TINYINT(1) NOT NULL DEFAULT 0"],
    ["emergencyCartMinimumStock", "`emergencyCartMinimumStock` DECIMAL(12,3) NULL"],
    ["gasType", "`gasType` VARCHAR(64) NULL"],
    ["cylinderIdentifier", "`cylinderIdentifier` VARCHAR(128) NULL"],
    ["patrimonyTag", "`patrimonyTag` VARCHAR(128) NULL"],
    ["serialNumber", "`serialNumber` VARCHAR(128) NULL"],
    ["maintenanceDueDate", "`maintenanceDueDate` DATE NULL"],
    ["calibrationDueDate", "`calibrationDueDate` DATE NULL"],
    ["anvisaRegistry", "`anvisaRegistry` VARCHAR(96) NULL"],
    ["reorderPoint", "`reorderPoint` INT NULL"],
    ["maximumStock", "`maximumStock` INT NULL"],
    ["defaultLocationId", "`defaultLocationId` INT NULL"],
    ["expirationDate", "`expirationDate` DATE NULL"],
    ["notes", "`notes` TEXT NULL"],
    ["updatedBy", "`updatedBy` INT NULL"],
  ];
  for (const [name, ddl] of productColumnDdls) {
    await addColumnIfMissing(connection, "inventory_products", productColumns, name, ddl);
  }
}

async function ensureCategory(connection, name, parentName = null) {
  let parentId = null;
  if (parentName) parentId = await ensureCategory(connection, parentName);
  await connection.execute(
    `INSERT INTO inventory_categories (name, parentCategoryId, active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE parentCategoryId = VALUES(parentCategoryId), active = 1, updatedAt = NOW()`,
    [name, parentId],
  );
  const [rows] = await connection.execute("SELECT id FROM inventory_categories WHERE name = ? LIMIT 1", [name]);
  return rows[0]?.id ?? null;
}

async function upsertProduct(connection, item) {
  const [existingByName] = await connection.execute(
    "SELECT id FROM inventory_products WHERE name = ? LIMIT 1",
    [item.name],
  );

  const values = [
    item.name,
    item.sku,
    item.category,
    item.subcategory,
    item.itemType,
    item.unit,
    0,
    null,
    item.controlsLot ? 1 : 0,
    item.controlsExpiration ? 1 : 0,
    item.controlledMedication ? 1 : 0,
    item.highCost ? 1 : 0,
    item.criticalCare ? 1 : 0,
    item.emergencyCartItem ? 1 : 0,
    item.gasType,
    item.notes,
  ];

  if (existingByName.length > 0) {
    await connection.execute(
      `UPDATE inventory_products
       SET sku = COALESCE(sku, ?),
           category = ?,
           subcategory = ?,
           itemType = ?,
           unit = COALESCE(unit, ?),
           controlsLot = GREATEST(controlsLot, ?),
           controlsExpiration = GREATEST(controlsExpiration, ?),
           controlledMedication = GREATEST(controlledMedication, ?),
           highCost = GREATEST(highCost, ?),
           criticalCare = GREATEST(criticalCare, ?),
           emergencyCartItem = GREATEST(emergencyCartItem, ?),
           gasType = COALESCE(gasType, ?),
           notes = COALESCE(NULLIF(notes, ''), ?),
           active = 1,
           updatedAt = NOW()
       WHERE id = ?`,
      [
        item.sku,
        item.category,
        item.subcategory,
        item.itemType,
        item.unit,
        item.controlsLot ? 1 : 0,
        item.controlsExpiration ? 1 : 0,
        item.controlledMedication ? 1 : 0,
        item.highCost ? 1 : 0,
        item.criticalCare ? 1 : 0,
        item.emergencyCartItem ? 1 : 0,
        item.gasType,
        item.notes,
        existingByName[0].id,
      ],
    );
    return "updated";
  }

  await connection.execute(
    `INSERT INTO inventory_products
      (name, sku, category, subcategory, itemType, unit, currentStock, minimumStock,
       controlsLot, controlsExpiration, controlledMedication, highCost, criticalCare,
       emergencyCartItem, gasType, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE active = 1, updatedAt = NOW()`,
    values,
  );
  return "inserted";
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  const items = parseItems();
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  let inserted = 0;
  let updated = 0;

  try {
    await ensureInventoryTables(connection);

    for (const item of items) {
      await ensureCategory(connection, item.category);
      if (item.subcategory) await ensureCategory(connection, item.subcategory, item.category);
      const result = await upsertProduct(connection, item);
      if (result === "inserted") inserted += 1;
      else updated += 1;
    }
    await connection.execute(
      `UPDATE inventory_products
       SET minimumStock = NULL
       WHERE currentStock = 0
         AND minimumStock = 0
         AND notes LIKE ?`,
      ["%Lista_Estoque_Clinica_Glutee.docx%"],
    );
  } finally {
    await connection.end();
  }

  console.log(`Importação de estoque concluída. Inseridos: ${inserted}. Atualizados/confirmados: ${updated}. Total: ${items.length}.`);
}

main().catch((error) => {
  console.error("Falha ao importar lista base de estoque:", error);
  process.exit(1);
});
