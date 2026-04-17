require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
#!/usr/bin/env node
/**
 * Importador de dados legados — Prontuário Verde + On Doctor → Glutec Clínica
 *
 * Uso:
 *   DRY_RUN=1 node import_legacy.js         # simula, nao escreve nada
 *   node import_legacy.js                   # importa de verdade
 *
 * ENV obrigatorias:
 *   DATABASE_URL  (ex: mysql://user:pass@localhost:3306/glutec)
 *   VERDE_DIR     (pasta com CSVs extraidos do zip Verde)
 *   ONDOCTOR_DIR  (pasta com CSVs OnDoctor)
 *   DOCTOR_ID     (user_id no Glutec p/ atribuir registros - default 1)
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// ---------------------- CONFIG ----------------------
const DRY_RUN = process.env.DRY_RUN === "1";
const DB_URL = process.env.DATABASE_URL;
const VERDE_DIR = process.env.VERDE_DIR;
const ONDOCTOR_DIR = process.env.ONDOCTOR_DIR;
const DOCTOR_ID = Number(process.env.DOCTOR_ID || "1");

if (!DB_URL) { console.error("ERRO: defina DATABASE_URL"); process.exit(1); }
if (!VERDE_DIR || !fs.existsSync(VERDE_DIR)) { console.error("ERRO: VERDE_DIR invalido:", VERDE_DIR); process.exit(1); }
if (!ONDOCTOR_DIR || !fs.existsSync(ONDOCTOR_DIR)) { console.error("ERRO: ONDOCTOR_DIR invalido:", ONDOCTOR_DIR); process.exit(1); }

console.log("================================================");
console.log(" Importador de dados legados — Glutec Clinica");
console.log("================================================");
console.log(" DRY_RUN   :", DRY_RUN ? "SIM (nada sera escrito)" : "NAO (grava no DB)");
console.log(" VERDE_DIR :", VERDE_DIR);
console.log(" OND_DIR   :", ONDOCTOR_DIR);
console.log(" DOCTOR_ID :", DOCTOR_ID);
console.log("================================================");

// ---------------------- CSV PARSER ----------------------
function readText(filePath, encoding = "utf-8") {
  const buf = fs.readFileSync(filePath);
  return new TextDecoder(encoding).decode(buf);
}

function parseCsvSemicolon(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQ = false; } }
      else { field += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ";") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
      else if (c === "\r") {}
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadCsv(filePath, encoding = "utf-8") {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const text = readText(filePath, encoding);
  const all = parseCsvSemicolon(text);
  if (!all.length) return { header: [], rows: [] };
  const header = all[0];
  const rows = all.slice(1).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  return { header, rows };
}

function rowToObj(header, row) {
  const o = {};
  for (let i = 0; i < header.length; i++) o[header[i]] = row[i] ?? "";
  return o;
}

// ---------------------- HELPERS ----------------------
function normCpf(v) {
  if (!v) return null;
  const d = String(v).replace(/\D+/g, "");
  return d.length === 11 ? d : null;
}
function fmtCpf(d) {
  if (!d || d.length !== 11) return null;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function normName(v) {
  if (!v) return "";
  return String(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim();
}
function toIsoDate(v) {
  if (!v) return null;
  v = String(v).trim();
  // DD/MM/YYYY
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // DD/MM/YY
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) { const y = Number(m[3]); const full = y > 50 ? 1900+y : 2000+y; return `${full}-${m[2]}-${m[1]}`; }
  // YYYY-MM-DD
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function toIsoDateTime(v) {
  if (!v) return null;
  v = String(v).trim();
  // DD/MM/YYYY HH:MM(:SS)? or DD/MM/YYYY HH:MM.SS
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?:[:.](\d{2}))?/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4].padStart(2,"0")}:${m[5]}:${m[6]||"00"}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} 00:00:00`;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]||"00"}`;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
  return null;
}
function stripHtml(html) {
  if (!html) return "";
  return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
}
function digitsPhone(v) {
  if (!v) return null;
  const d = String(v).replace(/\D+/g, "");
  if (!d) return null;
  return d.length > 20 ? d.slice(-20) : d;
}

// ---------------------- STATS ----------------------
const stats = {
  patientsCreated: 0, patientsMatched: 0, patientsFlaggedNoCpf: 0,
  ondMedRec: 0, verdeEvolutions: 0, verdePrescriptions: 0,
  verdeContracts: 0, verdeAppointments: 0, ondAppointments: 0,
  verdeBudgets: 0, verdeAnexos: 0, ondAnexos: 0, ondAnamneses: 0,
  ondExames: 0, errors: [],
};
const idMap = { ondPatient: new Map(), verdePatient: new Map() };
const ondAnamnesesBuffer = new Map();  // id_formulario_cliente -> {patientId, date, answers[]}

// ---------------------- DB ----------------------
let conn;
async function connectDb() {
  conn = await mysql.createConnection(DB_URL);
  console.log("[db] connected");
}
async function q(sql, params) {
  if (DRY_RUN && /^\s*(insert|update|delete)/i.test(sql)) {
    return [{ insertId: 0, affectedRows: 1 }];
  }
  return conn.execute(sql, params);
}

async function setIdMap(sourceSystem, sourceTable, sourceId, targetTable, targetId) {
  await q(
    "INSERT IGNORE INTO import_id_map (sourceSystem, sourceTable, sourceId, targetTable, targetId) VALUES (?,?,?,?,?)",
    [sourceSystem, sourceTable, String(sourceId), targetTable, targetId]
  );
}
async function getMappedId(sourceSystem, sourceTable, sourceId) {
  const [rows] = await conn.execute(
    "SELECT targetId FROM import_id_map WHERE sourceSystem=? AND sourceTable=? AND sourceId=? LIMIT 1",
    [sourceSystem, sourceTable, String(sourceId)]
  );
  return rows && rows[0] ? rows[0].targetId : null;
}

// ---------------------- EXISTING PATIENTS INDEX ----------------------
const existingByCpf = new Map();
const existingByNameBirth = new Map();

async function indexExistingPatients() {
  const [rows] = await conn.execute("SELECT id, fullName, cpf, birthDate, sourceSystem, sourceId FROM patients");
  for (const r of rows) {
    if (r.cpf) {
      const d = normCpf(r.cpf);
      if (d) existingByCpf.set(d, r.id);
    }
    if (r.fullName && r.birthDate) {
      const key = normName(r.fullName) + "|" + String(r.birthDate).slice(0, 10);
      existingByNameBirth.set(key, r.id);
    }
  }
  console.log(`[patients] existing: ${rows.length} (com CPF: ${existingByCpf.size})`);
}

async function upsertPatient({ sourceSystem, sourceId, fullName, cpf, birthDate, gender, phone, phone2, email, address, rg, observations, sourceData }) {
  const cpfDigits = normCpf(cpf);
  const cpfFmt = cpfDigits ? fmtCpf(cpfDigits) : null;
  const bd = toIsoDate(birthDate);
  const nameKey = normName(fullName) + "|" + (bd || "");

  // already processed via idMap?
  const mapped = await getMappedId(sourceSystem, "patient", sourceId);
  if (mapped) { stats.patientsMatched++; return mapped; }

  // CPF match
  let matchedId = cpfDigits ? existingByCpf.get(cpfDigits) : null;
  // fallback name+birth
  if (!matchedId && bd) matchedId = existingByNameBirth.get(nameKey);

  if (matchedId) {
    stats.patientsMatched++;
    // OnDoctor prevails: se source=onedoctor, atualiza campos vazios
    if (sourceSystem === "onedoctor") {
      await q(
        `UPDATE patients SET
          fullName = COALESCE(NULLIF(TRIM(?),''), fullName),
          birthDate = COALESCE(birthDate, ?),
          gender = COALESCE(NULLIF(?,'nao_informado'), gender),
          phone = COALESCE(NULLIF(phone,''), NULLIF(TRIM(?),'')),
          email = COALESCE(NULLIF(email,''), NULLIF(TRIM(?),'')),
          rg = COALESCE(NULLIF(rg,''), NULLIF(TRIM(?),'')),
          address = COALESCE(address, ?),
          cpf = COALESCE(cpf, ?)
         WHERE id = ?`,
        [fullName, bd, gender || "nao_informado", phone || "", email || "", rg || "", address || null, cpfFmt, matchedId]
      );
    }
    await setIdMap(sourceSystem, "patient", sourceId, "patients", matchedId);
    return matchedId;
  }

  // create new patient
  let displayName = fullName || "(sem nome)";
  if (!cpfDigits) {
    displayName = `⚠️ SEM CPF - CONFIRMAR - ${displayName}`;
    stats.patientsFlaggedNoCpf++;
  }

  const [res] = await q(
    `INSERT INTO patients (fullName, cpf, rg, birthDate, gender, phone, phone2, email, address, observations, sourceSystem, sourceId, active, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
    [displayName, cpfFmt, rg || null, bd, gender || "nao_informado", phone || null, phone2 || null, email || null, address || null, observations || null, sourceSystem, String(sourceId)]
  );
  const newId = DRY_RUN ? (9000000 + stats.patientsCreated) : res.insertId;
  stats.patientsCreated++;
  if (cpfDigits) existingByCpf.set(cpfDigits, newId);
  if (bd) existingByNameBirth.set(nameKey, newId);
  await setIdMap(sourceSystem, "patient", sourceId, "patients", newId);
  return newId;
}

// ---------------------- ONDOCTOR IMPORTS ----------------------
async function importOnDoctorPatients() {
  console.log("\n[OND] importando pacientes...");
  const { header, rows } = loadCsv(path.join(ONDOCTOR_DIR, "PESSOA.csv"));
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  let total = 0;
  for (const r of rows) {
    if (String(r[idx.cliente]||"").toLowerCase() !== "true") continue;
    total++;
    try {
      const sex = String(r[idx.sexo]||"").toUpperCase();
      const genderEnum = sex === "M" ? "masculino" : sex === "F" ? "feminino" : "nao_informado";
      const address = {
        zip: r[idx.CEP]||"", street: r[idx.endereco]||"", number: r[idx.numero]||"",
        complement: r[idx.complemento]||"", neighborhood: r[idx.bairro]||"",
      };
      const hasAddr = Object.values(address).some((v)=>v && String(v).trim());
      await upsertPatient({
        sourceSystem: "onedoctor",
        sourceId: r[idx.id],
        fullName: r[idx.nome] || "",
        cpf: r[idx.cnpj_cpf] || null,
        birthDate: r[idx.nascimento] || null,
        gender: genderEnum,
        phone: digitsPhone(r[idx.celular]) || digitsPhone(r[idx.telefone]),
        phone2: digitsPhone(r[idx.telefone]),
        email: r[idx.email] || null,
        rg: r[idx.ie_rg] || null,
        address: hasAddr ? JSON.stringify(address) : null,
        observations: r[idx.observacao] || null,
      });
    } catch (e) { stats.errors.push(`OND patient ${r[idx.id]}: ${e.message}`); }
  }
  console.log(`[OND] pacientes processados: ${total}`);
}

async function importVerdePatients() {
  console.log("\n[VER] importando pacientes...");
  const pacFile = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_paciente_8152_"));
  if (!pacFile) { console.log("  (arquivo nao encontrado)"); return; }
  const { header, rows } = loadCsv(path.join(VERDE_DIR, pacFile), "windows-1252");
  let total = 0;
  for (const r of rows) {
    if (!r[2]) continue;
    total++;
    try {
      const obj = rowToObj(header, r);
      const sex = String(obj["Sexo"]||"").toUpperCase();
      const genderEnum = sex === "M" ? "masculino" : sex === "F" ? "feminino" : "nao_informado";
      const address = {
        street: obj["Logradouro"]||"", number: obj["Número Logradouro"]||"",
        complement: obj["Complemento Logradouro"]||"", neighborhood: obj["Bairro"]||"",
        city: obj["Cidade"]||"", state: obj["UF"]||"", zip: obj["CEP"]||"",
      };
      const hasAddr = Object.values(address).some((v)=>v && String(v).trim());
      await upsertPatient({
        sourceSystem: "prontuario_verde",
        sourceId: obj["PAC_ID"],
        fullName: obj["Nome"] || "",
        cpf: obj["CPF"] || null,
        birthDate: obj["Nascimento"] || null,
        gender: genderEnum,
        phone: digitsPhone(obj["Telefone1"]) || digitsPhone(obj["Telefone2"]),
        phone2: digitsPhone(obj["Telefone2"]) || digitsPhone(obj["Telefone3"]),
        email: obj["E-mail"] || null,
        rg: obj["RG"] || null,
        address: hasAddr ? JSON.stringify(address) : null,
        observations: obj["Observações"] || null,
      });
    } catch (e) { stats.errors.push(`VER patient ${r[2]}: ${e.message}`); }
  }
  console.log(`[VER] pacientes processados: ${total}`);
}

// PRONTUARIO (OnDoctor) → medical_records (evolucao + anamnese text)
async function importOnDoctorMedicalRecords() {
  console.log("\n[OND] importando PRONTUARIO (atendimentos)...");
  const { header, rows } = loadCsv(path.join(ONDOCTOR_DIR, "PRONTUARIO.csv"));
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  for (const r of rows) {
    try {
      const sourceId = r[idx.id];
      const ondPatientId = r[idx.id_cliente];
      const patientId = await getMappedId("onedoctor", "patient", ondPatientId);
      if (!patientId) continue;
      const dateOnly = toIsoDate(r[idx.data]);
      const htmlDesc = r[idx.descricao] || "";
      const plainText = stripHtml(htmlDesc);
      const status = String(r[idx.finalizado]||"").toLowerCase() === "true" ? "finalizado" : "rascunho";

      // evita duplicata se reexecutar
      const existing = await getMappedId("onedoctor", "prontuario", sourceId);
      if (existing) continue;

      const [res] = await q(
        `INSERT INTO medical_records (patientId, doctorId, date, anamnesis, evolution, notes, status, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, dateOnly || null, plainText, htmlDesc, `Importado de OnDoctor — id=${sourceId}`, status, "onedoctor", String(sourceId)]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("onedoctor", "prontuario", sourceId, "medical_records", newId);
      stats.ondMedRec++;
    } catch (e) { stats.errors.push(`OND prontuario ${r[0]}: ${e.message}`); }
  }
  console.log(`[OND] prontuarios importados: ${stats.ondMedRec}`);
}

// FORMULARIO_RESPOSTA (OnDoctor) agrupado por id_formulario_cliente → medical_records (anamnesis)
async function importOnDoctorAnamneses() {
  console.log("\n[OND] importando FORMULARIO_RESPOSTA (anamneses)...");
  const { header: pHeader, rows: pRows } = loadCsv(path.join(ONDOCTOR_DIR, "FORMULARIO_PERGUNTA.csv"));
  const pIdx = Object.fromEntries(pHeader.map((h,i)=>[h,i]));
  const pergMap = new Map();
  for (const r of pRows) pergMap.set(r[pIdx.id], r[pIdx.pergunta] || r[pIdx.label] || `#${r[pIdx.id]}`);

  const { header: cHeader, rows: cRows } = loadCsv(path.join(ONDOCTOR_DIR, "FORMULARIO_CLIENTE.csv"));
  const cIdx = Object.fromEntries(cHeader.map((h,i)=>[h,i]));
  const formClienteMap = new Map();  // id_formulario_cliente -> {id_cliente, data, id_formulario}
  for (const r of cRows) {
    formClienteMap.set(r[cIdx.id], {
      clientId: r[cIdx.id_cliente], date: r[cIdx.data] || r[cIdx.data_hora_inclusao],
      formId: r[cIdx.id_formulario], prontuarioId: r[cIdx.id_prontuario]
    });
  }

  const { header, rows } = loadCsv(path.join(ONDOCTOR_DIR, "FORMULARIO_RESPOSTA.csv"));
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  const grouped = new Map();  // formularioClienteId -> answers[]
  for (const r of rows) {
    const fcId = r[idx.id_formulario_cliente];
    if (!fcId) continue;
    if (!grouped.has(fcId)) grouped.set(fcId, []);
    const answer = r[idx.resposta] || "";
    const extra = r[idx.outro] || "";
    const question = pergMap.get(r[idx.id_formulario_pergunta]) || `#${r[idx.id_formulario_pergunta]}`;
    grouped.get(fcId).push({ question, answer, extra });
  }

  for (const [fcId, answers] of grouped) {
    try {
      const fc = formClienteMap.get(fcId);
      if (!fc) continue;
      const patientId = await getMappedId("onedoctor", "patient", fc.clientId);
      if (!patientId) continue;
      const dateOnly = toIsoDate(fc.date);

      const existing = await getMappedId("onedoctor", "formulario_cliente", fcId);
      if (existing) continue;

      const lines = answers.map((a) => `${a.question}: ${a.answer}${a.extra ? " ("+a.extra+")" : ""}`);
      const anamnesisText = `[ANAMNESE IMPORTADA DO ONDOCTOR]\n\n` + lines.join("\n");

      const [res] = await q(
        `INSERT INTO medical_records (patientId, doctorId, date, anamnesis, notes, status, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, dateOnly || null, anamnesisText, `Anamnese OnDoctor — formulario_cliente=${fcId}`, "finalizado", "onedoctor", `form_${fcId}`]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("onedoctor", "formulario_cliente", fcId, "medical_records", newId);
      stats.ondAnamneses++;
    } catch (e) { stats.errors.push(`OND anamnese fc=${fcId}: ${e.message}`); }
  }
  console.log(`[OND] anamneses importadas: ${stats.ondAnamneses}`);
}

// exp_paciente_evolucao (Verde) → medical_records
async function importVerdeEvolutions() {
  console.log("\n[VER] importando evolucoes...");
  const file = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_paciente_evolucao_"));
  if (!file) return;
  const { header, rows } = loadCsv(path.join(VERDE_DIR, file), "windows-1252");
  for (const r of rows) {
    try {
      const obj = rowToObj(header, r);
      const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
      if (!patientId) continue;
      const date = toIsoDate(obj["Data"]);
      const html = obj["Evolução HTML"] || "";
      const plain = stripHtml(html);
      const docRef = obj["DOCUMENTO"] || null;
      const sourceId = `evol_${obj["PAC_ID"]}_${obj["Data Registro"]}`.replace(/\s+/g,"_");

      if (await getMappedId("prontuario_verde", "evolucao", sourceId)) continue;

      const [res] = await q(
        `INSERT INTO medical_records (patientId, doctorId, date, anamnesis, evolution, notes, status, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, date || null, plain, html, `Importado do Prontuario Verde — doc=${docRef || ""}`, "finalizado", "prontuario_verde", sourceId]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("prontuario_verde", "evolucao", sourceId, "medical_records", newId);
      stats.verdeEvolutions++;
    } catch (e) { stats.errors.push(`VER evolucao ${r[1]}: ${e.message}`); }
  }
  console.log(`[VER] evolucoes importadas: ${stats.verdeEvolutions}`);
}

// exp_paciente_prescricao (Verde) → prescriptions
async function importVerdePrescriptions() {
  console.log("\n[VER] importando prescricoes...");
  const file = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_paciente_prescricao_"));
  if (!file) return;
  const { header, rows } = loadCsv(path.join(VERDE_DIR, file), "windows-1252");
  for (const r of rows) {
    try {
      const obj = rowToObj(header, r);
      const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
      if (!patientId) continue;
      const date = toIsoDate(obj["Data"]);
      const html = obj["Prescrição"] || "";
      const sourceId = `presc_${obj["PAC_ID"]}_${obj["Data Registro"]}`.replace(/\s+/g,"_");

      if (await getMappedId("prontuario_verde", "prescricao", sourceId)) continue;

      const [res] = await q(
        `INSERT INTO prescriptions (patientId, doctorId, date, content, status, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, date || null, html, "finalizado", "prontuario_verde", sourceId]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("prontuario_verde", "prescricao", sourceId, "prescriptions", newId);
      stats.verdePrescriptions++;
    } catch (e) { stats.errors.push(`VER presc: ${e.message}`); }
  }
  console.log(`[VER] prescricoes importadas: ${stats.verdePrescriptions}`);
}

// exp_contrato_termo (Verde) → patient_documents (type='contrato' | 'termo')
async function importVerdeContracts() {
  console.log("\n[VER] importando contratos/termos...");
  const file = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_contrato_termo_"));
  if (!file) return;
  const { header, rows } = loadCsv(path.join(VERDE_DIR, file), "windows-1252");
  for (const r of rows) {
    try {
      const obj = rowToObj(header, r);
      const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
      if (!patientId) continue;
      const tipo = (obj["Tipo"] || "Contrato").toLowerCase().includes("term") ? "termo" : "contrato";
      const doc = obj["Documento"] || "";
      const assinadoEm = obj["Assinado em"] || "";
      const emitido = obj["Emitido"] || "";
      const sourceId = `ct_${obj["PAC_ID"]}_${emitido}_${doc.slice(-40)}`.replace(/\s+/g,"_");

      if (await getMappedId("prontuario_verde", "contrato", sourceId)) continue;

      const name = `${obj["Tipo"] || "Contrato"} - ${emitido || "sem data"}${assinadoEm ? " (assinado em "+assinadoEm+")" : ""}`;
      const description = `Importado do Prontuario Verde. Arquivo original: ${doc}${assinadoEm ? `. Assinado em ${assinadoEm} por ${obj["Assinado por"] || obj["Lançado por"]}.` : ""}`;

      const [res] = await q(
        `INSERT INTO patient_documents (patientId, doctorId, type, name, description, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, tipo, name, description, "prontuario_verde", sourceId]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("prontuario_verde", "contrato", sourceId, "patient_documents", newId);
      stats.verdeContracts++;
    } catch (e) { stats.errors.push(`VER contrato: ${e.message}`); }
  }
  console.log(`[VER] contratos/termos importados: ${stats.verdeContracts}`);
}

// exp_agenda (Verde) → appointments
async function importVerdeAppointments() {
  console.log("\n[VER] importando agenda...");
  const file = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_agenda_"));
  if (!file) return;
  const { header, rows } = loadCsv(path.join(VERDE_DIR, file), "windows-1252");
  for (const r of rows) {
    try {
      const obj = rowToObj(header, r);
      const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
      if (!patientId) continue;
      const scheduledAt = toIsoDateTime(obj["Data"]);
      if (!scheduledAt) continue;
      const durMatch = Number(obj["Duração"] || 30) || 30;
      const sit = (obj["Situação"] || "").toLowerCase();
      let status = "agendada";
      if (sit.includes("cancel")) status = "cancelada";
      else if (sit.includes("falt")) status = "falta";
      else if (sit.includes("atend") || sit.includes("conclu") || sit.includes("finaliz")) status = "concluida";
      else if (sit.includes("confirm")) status = "confirmada";
      // Passado → concluida
      if (status === "agendada" && new Date(scheduledAt.replace(" ","T")) < new Date()) status = "concluida";

      const tipo = (obj["Tipo"] || "consulta").toLowerCase();
      const sourceId = `ag_${obj["PAC_ID"]}_${scheduledAt}`.replace(/\s+/g,"_");
      if (await getMappedId("prontuario_verde", "agenda", sourceId)) continue;

      const [res] = await q(
        `INSERT INTO appointments (patientId, doctorId, scheduledAt, duration, type, status, notes, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, scheduledAt, durMatch, tipo, status, obj["Observações"] || null, "prontuario_verde", sourceId]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("prontuario_verde", "agenda", sourceId, "appointments", newId);
      stats.verdeAppointments++;
    } catch (e) { stats.errors.push(`VER agenda: ${e.message}`); }
  }
  console.log(`[VER] agendas importadas: ${stats.verdeAppointments}`);
}

// AGENDA (OnDoctor) → appointments
async function importOnDoctorAppointments() {
  console.log("\n[OND] importando AGENDA...");
  const { header, rows } = loadCsv(path.join(ONDOCTOR_DIR, "AGENDA.csv"));
  const idx = Object.fromEntries(header.map((h,i)=>[h,i]));
  for (const r of rows) {
    try {
      const sourceId = r[idx.id];
      const patientId = await getMappedId("onedoctor", "patient", r[idx.id_cliente]);
      if (!patientId) continue;
      const scheduledAt = toIsoDateTime(r[idx.data] + " " + (r[idx.horario_ini]||"00:00:00"));
      if (!scheduledAt) continue;
      if (await getMappedId("onedoctor", "agenda", sourceId)) continue;

      const duration = 30; // fallback
      const status = String(r[idx.finalizado]||"").toLowerCase() === "true" ? "concluida" : "agendada";
      const [res] = await q(
        `INSERT INTO appointments (patientId, doctorId, scheduledAt, duration, type, status, notes, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, scheduledAt, duration, "consulta", status, r[idx.observacao] || null, "onedoctor", String(sourceId)]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("onedoctor", "agenda", sourceId, "appointments", newId);
      stats.ondAppointments++;
    } catch (e) { stats.errors.push(`OND agenda: ${e.message}`); }
  }
  console.log(`[OND] agendas importadas: ${stats.ondAppointments}`);
}

// exp_paciente_orcamento → budgets
async function importVerdeBudgets() {
  console.log("\n[VER] importando orcamentos...");
  const file = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_paciente_orcamento_8152_"));
  if (!file) return;
  const { header, rows } = loadCsv(path.join(VERDE_DIR, file), "windows-1252");
  for (const r of rows) {
    try {
      const obj = rowToObj(header, r);
      const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
      if (!patientId) continue;
      const date = toIsoDate(obj["Data"]);
      const numero = obj["Número Orçamento"];
      const sourceId = `orc_${obj["PAC_ID"]}_${numero}`;
      if (await getMappedId("prontuario_verde", "orcamento", sourceId)) continue;
      const valTotal = Number(String(obj["Valor Total"]||"0").replace(/\./g,"").replace(",",".")) || 0;
      const valApro = Number(String(obj["Valor Aprovado"]||"0").replace(/\./g,"").replace(",",".")) || 0;
      const valDesc = Number(String(obj["Valor Desconto"]||"0").replace(/\./g,"").replace(",",".")) || 0;
      const sit = (obj["Situação"] || "").toLowerCase();
      let status = "rascunho";
      if (sit.includes("aprov")) status = "aprovado";
      else if (sit.includes("recus") || sit.includes("cancel")) status = "cancelado";

      const [res] = await q(
        `INSERT INTO budgets (patientId, doctorId, date, title, items, subtotal, discount, total, status, notes, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, date || null, obj["Descrição"] || `Orçamento #${numero}`, "[]", valTotal, valDesc, valApro || valTotal, status, obj["Observações"] || null, "prontuario_verde", sourceId]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("prontuario_verde", "orcamento", sourceId, "budgets", newId);
      stats.verdeBudgets++;
    } catch (e) { stats.errors.push(`VER orcamento: ${e.message}`); }
  }
  console.log(`[VER] orcamentos importados: ${stats.verdeBudgets}`);
}

// exp_paciente_anexo + ANEXO → patient_documents
async function importAnexosMeta() {
  console.log("\n[ANEXOS] importando metadados (arquivos binarios vem depois)...");
  // Verde
  const fileV = fs.readdirSync(VERDE_DIR).find(f => f.startsWith("exp_paciente_anexo_"));
  if (fileV) {
    const { header, rows } = loadCsv(path.join(VERDE_DIR, fileV), "windows-1252");
    for (const r of rows) {
      try {
        const obj = rowToObj(header, r);
        const patientId = await getMappedId("prontuario_verde", "patient", obj["PAC_ID"]);
        if (!patientId) continue;
        const sourceId = `anexo_${obj["PAC_ID"]}_${obj["Documento"]}`;
        if (await getMappedId("prontuario_verde", "anexo", sourceId)) continue;
        const tipo = (obj["Tipo"] || "").toLowerCase().includes("foto") ? "foto" : "outro";
        const [res] = await q(
          `INSERT INTO patient_documents (patientId, doctorId, type, name, description, fileKey, sourceSystem, sourceId, createdAt, updatedAt)
           VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())`,
          [patientId, DOCTOR_ID, tipo, obj["Tipo"] || "Anexo", `Verde — ${obj["Usuário"] || ""} — ${obj["Data"] || ""}`, obj["Documento"], "prontuario_verde", sourceId]
        );
        const newId = DRY_RUN ? 0 : res.insertId;
        if (newId) await setIdMap("prontuario_verde", "anexo", sourceId, "patient_documents", newId);
        stats.verdeAnexos++;
      } catch (e) { stats.errors.push(`VER anexo: ${e.message}`); }
    }
  }
  // OnDoctor
  const { header: hO, rows: rO } = loadCsv(path.join(ONDOCTOR_DIR, "ANEXO.csv"));
  const idx = Object.fromEntries(hO.map((h,i)=>[h,i]));
  for (const r of rO) {
    try {
      const sourceId = r[idx.id];
      const patientId = await getMappedId("onedoctor", "patient", r[idx.id_cliente]);
      if (!patientId) continue;
      if (await getMappedId("onedoctor", "anexo", sourceId)) continue;
      const fileName = r[idx.nome] || "";
      const isAnamneseForm = /anamnese/i.test(fileName);
      const tipo = isAnamneseForm ? "anamnese_pdf" : /\.png|\.jpg|\.jpeg/i.test(fileName) ? "foto" : "outro";
      const [res] = await q(
        `INSERT INTO patient_documents (patientId, doctorId, type, name, description, fileKey, sourceSystem, sourceId, createdAt, updatedAt)
         VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())`,
        [patientId, DOCTOR_ID, tipo, r[idx.descricao] || fileName, `OnDoctor — ${r[idx.data] || ""}`, fileName, "onedoctor", String(sourceId)]
      );
      const newId = DRY_RUN ? 0 : res.insertId;
      if (newId) await setIdMap("onedoctor", "anexo", sourceId, "patient_documents", newId);
      stats.ondAnexos++;
    } catch (e) { stats.errors.push(`OND anexo: ${e.message}`); }
  }
  console.log(`[ANEXOS] Verde=${stats.verdeAnexos} OnDoctor=${stats.ondAnexos}`);
}

// ---------------------- MAIN ----------------------
(async () => {
  try {
    await connectDb();
    await indexExistingPatients();

    // 1) pacientes — OnDoctor primeiro (prevalece)
    await importOnDoctorPatients();
    await importVerdePatients();

    // 2) atendimentos / anamneses (dados maiores, ambas as fontes)
    await importOnDoctorMedicalRecords();
    await importOnDoctorAnamneses();
    await importVerdeEvolutions();

    // 3) prescricoes, contratos, agenda, orcamentos
    await importVerdePrescriptions();
    await importVerdeContracts();
    await importVerdeAppointments();
    await importOnDoctorAppointments();
    await importVerdeBudgets();

    // 4) anexos (apenas metadados por enquanto)
    await importAnexosMeta();

    // resumo
    console.log("\n================================================");
    console.log(" RESUMO");
    console.log("================================================");
    console.log(JSON.stringify(stats, null, 2));
    if (stats.errors.length) {
      console.log(`\n(${stats.errors.length} erros — mostrando 20)`);
      stats.errors.slice(0, 20).forEach((e)=>console.log(" -", e));
    }
    console.log(DRY_RUN ? "\n[DRY_RUN] Nada foi escrito no banco." : "\nImportacao concluida.");
  } catch (e) {
    console.error("FATAL:", e);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
})();
