import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
const ROOT = process.cwd();
const MAX_SAMPLE = Number(process.env.AUDIT_MAX_SAMPLE || "80");

const ONDOCTOR_SYSTEMS = new Set(["onedoctor", "ondoctor"]);
const VERDE_SYSTEMS = new Set(["prontuario_verde", "prontuarioverde", "verde"]);

function candidateDirs() {
  return [
    process.env.ONDOCTOR_DIR,
    process.env.VERDE_DIR,
    path.join(ROOT, "Backup On Doctor Marco 2026 - WESLEY SERVICOS MEDICOS LTDA"),
    path.join(ROOT, "Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA"),
    path.join(ROOT, "Backup Prontuario Verde Marco 2026"),
    path.join(ROOT, "Backup Prontuário Verde Março 2026"),
    "/root/glutec_import/ondoctor_db",
    "/root/glutec_import/onedoctor",
    "/root/glutec_import/ondoctor",
    "/root/glutec_import/verde_db",
    "/root/glutec_import/prontuario_verde",
  ].filter(Boolean);
}

function walkFiles(root, matcher, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > 5) return null;
  const stat = fs.statSync(root);
  if (stat.isFile()) return matcher(root) ? root : null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".claude") continue;
    const resolved = path.join(root, entry.name);
    if (entry.isFile() && matcher(resolved)) return resolved;
    if (entry.isDirectory()) {
      const found = walkFiles(resolved, matcher, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function collectFiles(root, matcher, depth = 0, results = []) {
  if (!root || !fs.existsSync(root) || depth > 5) return results;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (matcher(root)) results.push(root);
    return results;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".claude") continue;
    const resolved = path.join(root, entry.name);
    if (entry.isFile() && matcher(resolved)) results.push(resolved);
    else if (entry.isDirectory()) collectFiles(resolved, matcher, depth + 1, results);
  }
  return results;
}

function findFile(fileName) {
  for (const root of candidateDirs()) {
    const found = walkFiles(root, (file) => path.basename(file).toLowerCase() === fileName.toLowerCase());
    if (found) return found;
  }
  return null;
}

function findFileByPrefix(prefix) {
  const normalized = prefix.toLowerCase();
  for (const root of candidateDirs()) {
    const found = walkFiles(
      root,
      (file) => path.basename(file).toLowerCase().startsWith(normalized) && file.toLowerCase().endsWith(".csv"),
    );
    if (found) return found;
  }
  return null;
}

function findZipWithEntry(prefix) {
  for (const root of candidateDirs()) {
    const zipPaths = collectFiles(root, (file) => file.toLowerCase().endsWith(".zip"));
    for (const zipPath of zipPaths) {
      const entry = readZipEntry(zipPath, prefix, { probeOnly: true });
      if (entry) return { zipPath, entryName: entry.name };
    }
  }
  return null;
}

function readText(filePath, encoding = "utf-8") {
  return new TextDecoder(encoding).decode(fs.readFileSync(filePath));
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65558); offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntry(zipPath, entryPrefix, options = {}) {
  const buffer = fs.readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return null;
  const entries = readUInt16(buffer, eocd + 10);
  let offset = readUInt32(buffer, eocd + 16);
  const prefix = entryPrefix.toLowerCase();

  for (let index = 0; index < entries; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) break;
    const compression = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const fileNameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localOffset = readUInt32(buffer, offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (name.toLowerCase().startsWith(prefix) && name.toLowerCase().endsWith(".csv")) {
      if (options.probeOnly) return { name };
      if (readUInt32(buffer, localOffset) !== 0x04034b50) return null;
      const localNameLength = readUInt16(buffer, localOffset + 26);
      const localExtraLength = readUInt16(buffer, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataOffset, dataOffset + compressedSize);
      const data = compression === 0 ? compressed : zlib.inflateRawSync(compressed);
      return { name, text: new TextDecoder(options.encoding || "windows-1252").decode(data) };
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function parseCsvSemicolon(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function rowsFromCsv(text) {
  const parsed = parseCsvSemicolon(text);
  if (!parsed.length) return [];
  const header = parsed[0].map((value) => String(value ?? "").trim());
  return parsed
    .slice(1)
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) => {
      const record = {};
      header.forEach((column, index) => {
        record[column] = row[index] ?? "";
      });
      record.__normalized = Object.fromEntries(header.map((column, index) => [normalizeHeader(column), row[index] ?? ""]));
      return record;
    });
}

function loadDirectCsv(fileName, encoding = "utf-8") {
  const file = findFile(fileName);
  if (!file) return { rows: [], source: null };
  return { rows: rowsFromCsv(readText(file, encoding)), source: file };
}

function loadDirectCsvByPrefix(prefix, encoding = "utf-8") {
  const file = findFileByPrefix(prefix);
  if (!file) return { rows: [], source: null };
  return { rows: rowsFromCsv(readText(file, encoding)), source: file };
}

function loadZipCsv(prefix) {
  const found = findZipWithEntry(prefix);
  if (!found) return { rows: [], source: null };
  const entry = readZipEntry(found.zipPath, prefix, { encoding: "windows-1252" });
  return { rows: rowsFromCsv(entry.text), source: `${found.zipPath}::${entry.name}` };
}

function get(row, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    const normalized = normalizeHeader(key);
    if (Object.prototype.hasOwnProperty.call(row.__normalized ?? {}, normalized)) return row.__normalized[normalized];
  }
  return "";
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeCpf(value) {
  const digits = onlyDigits(value);
  return digits.length === 11 ? digits : "";
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^SEM CPF CONFIRMAR /, "")
    .trim();
}

function dateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function nameScore(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  return intersection / Math.max(aTokens.size, bTokens.size);
}

function patientIdentity(legacy, patient) {
  const legacyCpf = normalizeCpf(legacy?.cpf);
  const patientCpf = normalizeCpf(patient?.cpf);
  const score = nameScore(legacy?.name, patient?.fullName);
  const legacyBirth = dateOnly(legacy?.birthDate);
  const patientBirth = dateOnly(patient?.birthDate);

  if (legacyCpf && patientCpf) {
    if (legacyCpf !== patientCpf) return { ok: false, severity: "critical", reason: "cpf_mismatch", score };
    return { ok: true, reason: "cpf_match", score };
  }

  if (score >= 0.95 && (!legacyBirth || !patientBirth || legacyBirth === patientBirth)) {
    return { ok: true, reason: "name_birth_match", score };
  }

  if (score >= 0.75 && legacyBirth && patientBirth && legacyBirth === patientBirth) {
    return { ok: true, reason: "probable_name_birth_match", score };
  }

  return { ok: false, severity: "warning", reason: "weak_identity_match", score };
}

function normalizeSystem(value) {
  return String(value ?? "").trim().toLowerCase();
}

function legacySystemKind(value) {
  const system = normalizeSystem(value);
  if (ONDOCTOR_SYSTEMS.has(system)) return "ondoctor";
  if (VERDE_SYSTEMS.has(system)) return "verde";
  return "";
}

function sourceIdPrefix(value) {
  return String(value ?? "").split(":")[0].trim();
}

function addIssue(issues, issue) {
  issues.push(issue);
}

function isCriticalIssue(issue) {
  const severity = String(issue?.match?.severity || issue?.severity || "").toLowerCase();
  if (severity === "critical") return true;
  return ["imported_record_patient_mismatch", "source_column_patient_mismatch", "anamnesis_patient_mismatch"].includes(issue.type);
}

function buildLegacyData() {
  const ondoctor = {
    files: {},
    people: new Map(),
    records: new Map(),
  };

  for (const [name, file] of [
    ["PESSOA", "PESSOA.csv"],
    ["AGENDA", "AGENDA.csv"],
    ["PRONTUARIO", "PRONTUARIO.csv"],
    ["PRESCRICAO", "PRESCRICAO.csv"],
    ["ORCAMENTO", "ORCAMENTO.csv"],
    ["RECEBER", "RECEBER.csv"],
    ["ANEXO", "ANEXO.csv"],
    ["PESSOA_DOCUMENTO", "PESSOA_DOCUMENTO.csv"],
    ["FORMULARIO_CLIENTE", "FORMULARIO_CLIENTE.csv"],
  ]) {
    const loaded = loadDirectCsv(file);
    ondoctor.files[name] = loaded.source;
    ondoctor.records.set(name, loaded.rows);
  }

  for (const row of ondoctor.records.get("PESSOA") ?? []) {
    const id = String(get(row, "id")).trim();
    if (!id) continue;
    ondoctor.people.set(id, {
      sourceSystem: "onedoctor",
      sourceId: id,
      name: get(row, "nome"),
      cpf: get(row, "cnpj_cpf"),
      birthDate: get(row, "nascimento"),
    });
  }

  const ondoctorRecordToPerson = new Map();
  for (const [table, rows] of ondoctor.records.entries()) {
    if (table === "PESSOA") continue;
    for (const row of rows) {
      const id = String(get(row, "id")).trim();
      const patientSourceId = String(get(row, "id_cliente", "id_origem")).trim();
      if (id && patientSourceId) ondoctorRecordToPerson.set(`${table}:${id}`, patientSourceId);
    }
  }

  const verde = {
    files: {},
    people: new Map(),
  };
  let verdePatients = loadDirectCsvByPrefix("exp_paciente_");
  if (!verdePatients.rows.length) verdePatients = loadZipCsv("exp_paciente_");
  verde.files.PACIENTE = verdePatients.source;
  for (const row of verdePatients.rows) {
    const id = String(get(row, "PAC_ID")).trim();
    if (!id) continue;
    verde.people.set(id, {
      sourceSystem: "prontuario_verde",
      sourceId: id,
      name: get(row, "Nome"),
      cpf: get(row, "CPF"),
      birthDate: get(row, "Nascimento"),
    });
  }

  return { ondoctor, ondoctorRecordToPerson, verde };
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query("show tables like ?", [tableName]);
  return rows.length > 0;
}

async function getColumns(conn, tableName) {
  if (!(await tableExists(conn, tableName))) return new Set();
  const [rows] = await conn.query(`show columns from \`${tableName}\``);
  return new Set(rows.map((row) => String(row.Field)));
}

async function fetchTargetPatientId(conn, tableName, targetId) {
  const columns = await getColumns(conn, tableName);
  if (!columns.has("id")) return null;
  if (tableName === "patients") return Number(targetId);
  if (!columns.has("patientId")) return null;
  const [rows] = await conn.query(`select patientId from \`${tableName}\` where id = ? limit 1`, [targetId]);
  return rows[0]?.patientId ? Number(rows[0].patientId) : null;
}

function expectedPatientFromSource(kind, sourceTable, sourceId, legacy) {
  const table = String(sourceTable ?? "").toUpperCase();
  const id = String(sourceId ?? "").trim();
  if (!id) return null;

  if (kind === "ondoctor") {
    if (["PESSOA", "PATIENT", "PESSOA.CSV", "PESSOA_CSV"].includes(table)) return id;
    const mapped = legacy.ondoctorRecordToPerson.get(`${table}:${id}`);
    if (mapped) return mapped;
    if (table.includes("FORMULARIO")) return legacy.ondoctorRecordToPerson.get(`FORMULARIO_CLIENTE:${id}`) ?? null;
    if (table.includes("ANEXO")) return legacy.ondoctorRecordToPerson.get(`ANEXO:${id}`) ?? null;
    if (table.includes("DOCUMENT")) return legacy.ondoctorRecordToPerson.get(`PESSOA_DOCUMENTO:${id}`) ?? null;
  }

  if (kind === "verde") {
    if (["PACIENTE", "PATIENT", "PAC_ID", "PACID"].includes(table)) return id;
    return sourceIdPrefix(id);
  }

  return null;
}

function legacyPersonByKind(kind, personSourceId, legacy) {
  if (kind === "ondoctor") return legacy.ondoctor.people.get(String(personSourceId));
  if (kind === "verde") return legacy.verde.people.get(String(personSourceId));
  return null;
}

function patientMatchesLegacyReference(patient, kind, legacyPatientId, legacy) {
  if (!patient || !kind || !legacyPatientId) return false;
  if (legacySystemKind(patient.sourceSystem) === kind && String(patient.sourceId ?? "").trim() === String(legacyPatientId).trim()) {
    return true;
  }
  const legacyPerson = legacyPersonByKind(kind, legacyPatientId, legacy);
  return Boolean(legacyPerson && patientIdentity(legacyPerson, patient).ok);
}

async function auditPatientMappings(conn, legacy, patientById, issues) {
  const [maps] = await conn.query(
    "select sourceSystem, sourceTable, sourceId, targetTable, targetId from import_id_map where targetTable = 'patients'",
  );
  const seen = new Set();
  const patientsByLegacyRef = new Map();

  for (const map of maps) {
    const kind = legacySystemKind(map.sourceSystem);
    if (!kind) continue;
    const patient = patientById.get(Number(map.targetId));
    const legacyPerson = legacyPersonByKind(kind, map.sourceId, legacy);
    if (!patient || !legacyPerson) {
      addIssue(issues, { type: "patient_map_missing_side", map });
      continue;
    }
    seen.add(`${kind}:${map.sourceId}:${patient.id}`);
    const ref = `${kind}:${String(map.sourceId).trim()}`;
    patientsByLegacyRef.set(ref, [...(patientsByLegacyRef.get(ref) ?? []), patient]);
    const match = patientIdentity(legacyPerson, patient);
    if (!match.ok) {
      addIssue(issues, { type: "patient_identity_mismatch", match, legacyPerson, patient });
    }
  }

  for (const patient of patientById.values()) {
    const kind = legacySystemKind(patient.sourceSystem);
    if (!kind || !patient.sourceId) continue;
    const key = `${kind}:${patient.sourceId}:${patient.id}`;
    if (seen.has(key)) continue;
    const legacyPerson = legacyPersonByKind(kind, patient.sourceId, legacy);
    if (!legacyPerson) continue;
    const ref = `${kind}:${String(patient.sourceId).trim()}`;
    if (!patientsByLegacyRef.has(ref)) patientsByLegacyRef.set(ref, []);
    if (!patientsByLegacyRef.get(ref).some((item) => Number(item.id) === Number(patient.id))) {
      patientsByLegacyRef.get(ref).push(patient);
    }
    const match = patientIdentity(legacyPerson, patient);
    if (!match.ok) {
      addIssue(issues, { type: "patient_source_identity_mismatch", match, legacyPerson, patient });
    }
  }

  for (const [legacyRef, patients] of patientsByLegacyRef.entries()) {
    const uniquePatients = [...new Map(patients.map((patient) => [Number(patient.id), patient])).values()];
    if (uniquePatients.length > 1) {
      addIssue(issues, {
        type: "duplicate_patient_source_mapping",
        severity: "warning",
        legacyRef,
        patients: uniquePatients.map((patient) => ({
          id: patient.id,
          recordNumber: patient.recordNumber,
          fullName: patient.fullName,
          cpf: patient.cpf,
          birthDate: patient.birthDate,
        })),
      });
    }
  }
}

async function auditImportIdMapRecords(conn, legacy, patientById, sourcePatientToGlutec, issues) {
  const [maps] = await conn.query(
    "select sourceSystem, sourceTable, sourceId, targetTable, targetId from import_id_map where targetTable <> 'patients'",
  );

  for (const map of maps) {
    const kind = legacySystemKind(map.sourceSystem);
    if (!kind) continue;
    const expectedLegacyPatientId = expectedPatientFromSource(kind, map.sourceTable, map.sourceId, legacy);
    if (!expectedLegacyPatientId) continue;
    const expectedGlutecPatientId = sourcePatientToGlutec.get(`${kind}:${expectedLegacyPatientId}`);
    const actualPatientId = await fetchTargetPatientId(conn, map.targetTable, map.targetId);
    if (!actualPatientId || !expectedGlutecPatientId) continue;
    const actualPatient = patientById.get(Number(actualPatientId));
    if (
      Number(actualPatientId) !== Number(expectedGlutecPatientId) &&
      !patientMatchesLegacyReference(actualPatient, kind, expectedLegacyPatientId, legacy)
    ) {
      addIssue(issues, {
        type: "imported_record_patient_mismatch",
        map,
        expectedLegacyPatientId,
        expectedGlutecPatientId,
        actualPatientId,
        actualPatient,
        expectedPatient: patientById.get(Number(expectedGlutecPatientId)),
      });
    }
  }
}

async function auditSourceColumns(conn, legacy, patientById, sourcePatientToGlutec, issues) {
  const tableSpecs = [
    ["appointments", "AGENDA"],
    ["medical_records", "PRONTUARIO"],
    ["prescriptions", "PRESCRICAO"],
    ["budgets", "ORCAMENTO"],
    ["patient_documents", ""],
    ["patient_photos", "ANEXO"],
  ];

  for (const [tableName, defaultSourceTable] of tableSpecs) {
    const columns = await getColumns(conn, tableName);
    if (!columns.has("sourceSystem") || !columns.has("sourceId") || !columns.has("patientId")) continue;
    const [rows] = await conn.query(
      `select id, patientId, sourceSystem, sourceId from \`${tableName}\` where coalesce(sourceSystem, '') <> '' and coalesce(sourceId, '') <> ''`,
    );
    for (const row of rows) {
      const kind = legacySystemKind(row.sourceSystem);
      if (!kind) continue;
      let sourceTable = defaultSourceTable;
      if (!sourceTable && kind === "ondoctor") {
        sourceTable = legacy.ondoctorRecordToPerson.has(`ANEXO:${row.sourceId}`) ? "ANEXO" : "PESSOA_DOCUMENTO";
      }
      const expectedLegacyPatientId = expectedPatientFromSource(kind, sourceTable, row.sourceId, legacy);
      if (!expectedLegacyPatientId) continue;
      const expectedGlutecPatientId = sourcePatientToGlutec.get(`${kind}:${expectedLegacyPatientId}`);
      if (!expectedGlutecPatientId) continue;
      const actualPatient = patientById.get(Number(row.patientId));
      if (
        Number(row.patientId) !== Number(expectedGlutecPatientId) &&
        !patientMatchesLegacyReference(actualPatient, kind, expectedLegacyPatientId, legacy)
      ) {
        addIssue(issues, {
          type: "source_column_patient_mismatch",
          tableName,
          row,
          expectedLegacyPatientId,
          expectedGlutecPatientId,
          actualPatient,
          expectedPatient: patientById.get(Number(expectedGlutecPatientId)),
        });
      }
    }
  }
}

async function auditAnamnesisLinks(conn, legacy, patientById, sourcePatientToGlutec, issues) {
  const columns = await getColumns(conn, "anamnesis_share_links");
  if (!columns.has("signatureEvidenceJson") || !columns.has("patientId")) return;
  const [rows] = await conn.query(
    "select id, patientId, source, signatureEvidenceJson from anamnesis_share_links where source = 'legacy_onedoctor' or signatureEvidenceJson like '%sourcePatientId%'",
  );
  for (const row of rows) {
    let evidence = null;
    try {
      evidence = JSON.parse(String(row.signatureEvidenceJson || "{}"));
    } catch {
      evidence = null;
    }
    const sourcePatientId = String(evidence?.sourcePatientId ?? "").trim();
    if (!sourcePatientId) continue;
    const expectedGlutecPatientId = sourcePatientToGlutec.get(`ondoctor:${sourcePatientId}`);
    const actualPatient = patientById.get(Number(row.patientId));
    if (
      expectedGlutecPatientId &&
      Number(row.patientId) !== Number(expectedGlutecPatientId) &&
      !patientMatchesLegacyReference(actualPatient, "ondoctor", sourcePatientId, legacy)
    ) {
      addIssue(issues, {
        type: "anamnesis_patient_mismatch",
        rowId: row.id,
        sourcePatientId,
        expectedGlutecPatientId,
        actualPatient,
        expectedPatient: patientById.get(Number(expectedGlutecPatientId)),
      });
    }
  }
}

async function main() {
  if (!DB_URL) throw new Error("DATABASE_URL precisa estar definido.");

  const legacy = buildLegacyData();
  const conn = await mysql.createConnection(DB_URL);
  const issues = [];

  try {
    const [patients] = await conn.query("select id, recordNumber, fullName, cpf, birthDate, sourceSystem, sourceId from patients");
    const patientById = new Map(patients.map((patient) => [Number(patient.id), patient]));
    const sourcePatientToGlutec = new Map();

    for (const patient of patients) {
      const kind = legacySystemKind(patient.sourceSystem);
      if (kind && patient.sourceId) sourcePatientToGlutec.set(`${kind}:${patient.sourceId}`, Number(patient.id));
    }

    const [patientMaps] = await conn.query(
      "select sourceSystem, sourceTable, sourceId, targetId from import_id_map where targetTable = 'patients'",
    );
    for (const map of patientMaps) {
      const kind = legacySystemKind(map.sourceSystem);
      if (kind) sourcePatientToGlutec.set(`${kind}:${map.sourceId}`, Number(map.targetId));
    }

    await auditPatientMappings(conn, legacy, patientById, issues);
    await auditImportIdMapRecords(conn, legacy, patientById, sourcePatientToGlutec, issues);
    await auditSourceColumns(conn, legacy, patientById, sourcePatientToGlutec, issues);
    await auditAnamnesisLinks(conn, legacy, patientById, sourcePatientToGlutec, issues);

    const critical = issues.filter(isCriticalIssue);
    const summary = {
      checkedAt: new Date().toISOString(),
      legacyFiles: {
        ondoctor: legacy.ondoctor.files,
        prontuarioVerde: legacy.verde.files,
      },
      patientsInDb: patients.length,
      ondoctorPatientsInBackup: legacy.ondoctor.people.size,
      prontuarioVerdePatientsInBackup: legacy.verde.people.size,
      issueCount: issues.length,
      criticalOrMismatchCount: critical.length,
      unverifiedCount: issues.length - critical.length,
      sampleSize: Math.min(issues.length, MAX_SAMPLE),
      issues: issues.slice(0, MAX_SAMPLE),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (critical.length > 0) process.exitCode = 2;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
