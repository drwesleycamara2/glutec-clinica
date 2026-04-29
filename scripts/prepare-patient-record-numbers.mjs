import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "")}\``;
}

async function getColumns(connection, tableName) {
  const [rows] = await connection.execute(
    `
      select column_name as columnName, column_type as columnType
      from information_schema.columns
      where table_schema = database()
        and table_name = ?
    `,
    [tableName],
  );
  return new Map(rows.map((row) => [String(row.columnName), String(row.columnType || "")]));
}

async function hasUniqueIndex(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `
      select index_name as indexName
      from information_schema.statistics
      where table_schema = database()
        and table_name = ?
        and column_name = ?
        and non_unique = 0
      limit 1
    `,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function ensureSchema(connection) {
  let patientColumns = await getColumns(connection, "patients");

  const genderType = patientColumns.get("gender") || "";
  if (genderType.startsWith("enum(") && !genderType.includes("'nao_binario'")) {
    await connection.query(`
      alter table patients
      modify gender enum('masculino','feminino','outro','nao_informado','nao_binario','intersexo')
      null default 'nao_informado'
    `);
  }

  if (!patientColumns.has("biologicalSex")) {
    await connection.query(`
      alter table patients
      add column biologicalSex enum('masculino','feminino','intersexo','nao_informado')
      null default 'nao_informado' after gender
    `);
  } else {
    const biologicalSexType = patientColumns.get("biologicalSex") || "";
    if (biologicalSexType.startsWith("enum(") && !biologicalSexType.includes("'intersexo'")) {
      await connection.query(`
        alter table patients
        modify biologicalSex enum('masculino','feminino','intersexo','nao_informado')
        null default 'nao_informado'
      `);
    }
  }

  if (!patientColumns.has("recordNumber")) {
    await connection.query("alter table patients add column recordNumber int null after id");
  }

  const photoColumns = await getColumns(connection, "patient_photos");
  const categoryType = photoColumns.get("category") || "";
  if (categoryType.startsWith("enum(") && !categoryType.includes("'perfil'")) {
    await connection.query(`
      alter table patient_photos
      modify category enum('antes','depois','evolucao','exame','documento','outro','perfil')
      not null default 'outro'
    `);
  }

  patientColumns = await getColumns(connection, "patients");
  if (patientColumns.has("biologicalSex")) {
    await connection.query(`
      update patients
      set biologicalSex = case
        when gender in ('masculino', 'feminino') then gender
        else 'nao_informado'
      end
      where biologicalSex is null or biologicalSex = '' or biologicalSex = 'nao_informado'
    `);
  }
}

function normalizePatientPayload(patient, columns, { insert }) {
  const addressJson = patient.address && typeof patient.address === "object" ? JSON.stringify(patient.address) : patient.address;
  const basePayload = {
    ...patient,
    address: addressJson,
    updatedAt: new Date(),
  };
  delete basePayload.legacyCode;

  if (patient.legacyCode) {
    basePayload.sourceSystem = basePayload.sourceSystem || "manual_legacy_import";
    basePayload.sourceId = basePayload.sourceId || String(patient.legacyCode);
  }
  if (insert) {
    basePayload.createdBy = basePayload.createdBy || 1;
    basePayload.createdAt = basePayload.createdAt || new Date();
    basePayload.active = basePayload.active ?? 1;
  } else {
    delete basePayload.createdAt;
    delete basePayload.recordNumber;
  }

  return Object.fromEntries(Object.entries(basePayload).filter(([column]) => columns.has(column)));
}

function loadPatientsPayload() {
  const filePath = process.argv[2] || process.env.PATIENT_IMPORT_JSON;
  if (!filePath) return [];
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(payload)) throw new Error("Patient import payload must be an array.");
  return payload;
}

async function upsertPatients(connection, patients) {
  if (!patients.length) return [];
  const columns = await getColumns(connection, "patients");
  const results = [];

  for (const patient of patients) {
    const cpf = String(patient.cpf || "").replace(/\D/g, "");
    if (!cpf) throw new Error(`Patient ${patient.fullName || "without name"} has no CPF.`);

    const [existingRows] = await connection.execute("select id from patients where cpf = ? limit 1", [cpf]);
    const normalizedPatient = { ...patient, cpf };

    if (existingRows.length > 0) {
      const payload = normalizePatientPayload(normalizedPatient, columns, { insert: false });
      const entries = Object.entries(payload).filter(([column]) => column !== "cpf");
      if (entries.length > 0) {
        await connection.execute(
          `update patients set ${entries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(", ")} where id = ?`,
          [...entries.map(([, value]) => value), existingRows[0].id],
        );
      }
      results.push({ action: "updated", id: existingRows[0].id, fullName: patient.fullName });
      continue;
    }

    const payload = normalizePatientPayload(normalizedPatient, columns, { insert: true });
    const entries = Object.entries(payload);
    await connection.execute(
      `insert into patients (${entries.map(([column]) => quoteIdentifier(column)).join(", ")}) values (${entries.map(() => "?").join(", ")})`,
      entries.map(([, value]) => value),
    );
    results.push({ action: "inserted", fullName: patient.fullName });
  }

  return results;
}

async function backfillRecordNumbers(connection) {
  const columns = await getColumns(connection, "patients");
  if (!columns.has("recordNumber")) return;

  const hasUnique = await hasUniqueIndex(connection, "patients", "recordNumber");
  if (hasUnique) {
    await connection.query("update patients set recordNumber = -id where recordNumber is not null");
  }

  await connection.query("set @glutec_record_number := 0");
  await connection.query(`
    update patients p
    join (
      select id, (@glutec_record_number := @glutec_record_number + 1) as nextRecordNumber
      from patients
      order by coalesce(createdAt, '1970-01-01') asc, id asc
    ) numbered on numbered.id = p.id
    set p.recordNumber = numbered.nextRecordNumber
  `);

  if (!hasUnique) {
    await connection.query("alter table patients add unique key patients_recordNumber_unique (recordNumber)");
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao configurado.");

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await ensureSchema(connection);
    const patients = await upsertPatients(connection, loadPatientsPayload());
    await backfillRecordNumbers(connection);
    console.log(JSON.stringify({ success: true, importedPatients: patients }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
