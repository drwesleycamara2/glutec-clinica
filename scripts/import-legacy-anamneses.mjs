import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === "1";
const DOCTOR_ID = Number(process.env.DOCTOR_ID || "1");
const ROOT = process.cwd();

const LEGACY_QUESTION_TEXT = {
  "73693": "Tem alergia a algum medicamento, alimento ou substância?",
  "73694": "Faz uso de algum medicamento contínuo?",
  "79783": "Selecione os problemas de saúde que tem atualmente",
  "79784": "Teve gestações? Se sim, quando foi o último parto?",
  "80248": "Profissão",
  "80249": "Estado civil",
  "80250": "Cidade e estado em que mora",
  "80251": "Consome bebida alcoólica?",
  "80252": "Usa método anticoncepcional? Qual?",
  "80253": "Toma vitamina D? Qual a dose e em que frequência?",
  "80254": "Está gestante ou lactante?",
  "80255": "Já teve problemas de cicatrização, como queloides?",
  "80256": "Já teve alguma reação ruim com anestesia?",
  "80257": "Já teve trombose, embolia ou AVC?",
  "80258": "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)",
  "80259": "Realiza atividade física regular?",
  "80260": "Você é muito sensível à dor?",
  "80261": "Já realizou alguma cirurgia?",
  "80262": "Usa alguma droga ilícita?",
  "80263": "Usa algum tipo de hormônio?",
  "80264": "Faz uso de medicamentos regularmente?",
  "81028": "Há algo que gostaria de informar ao médico?",
  "82417": "Tem alergia a algum medicamento, alimento ou substância?",
  "82868": "Peso atual aproximado em kg",
  "82869": "Sua estatura aproximada (em metros)",
  "82871": "Tem alergia a algum medicamento, alimento ou substância?",
  "82872": "Faz uso de anticoagulante? (ou AAS?)",
  "82873": "Selecione os problemas de saúde que tem atualmente",
  "82875": "Profissão",
  "82876": "Estado civil",
  "82877": "Cidade e estado em que mora",
  "82878": "Consome bebida alcoólica?",
  "82880": "Toma vitamina D? Qual a dose e em que frequência?",
  "82882": "Já teve problemas de cicatrização, como queloides?",
  "82883": "Já teve alguma reação ruim com anestesia?",
  "82884": "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)",
  "82885": "Já teve trombose, embolia ou AVC?",
  "82886": "Realiza atividade física regular?",
  "82887": "Você é muito sensível à dor?",
  "82888": "Já realizou alguma cirurgia?",
  "82889": "Usa alguma droga ilícita?",
  "82890": "Usa algum tipo de hormônio?",
  "82891": "Faz uso de medicamentos regularmente?",
  "82892": "Tem ou já teve pedras nos rins?",
  "82893": "Peso atual aproximado em kg",
  "82894": "Sua estatura aproximada (em metros)",
  "90360": "É fumante?",
  "90361": "Faz uso de anticoagulante? (ou AAS?)",
  "91018": "Tem ou já teve pedras nos rins?",
  "92953": "Há algo que gostaria de informar ao médico?",
};

const LEGACY_QUESTION_ORDER = Object.keys(LEGACY_QUESTION_TEXT);

function candidateDirs() {
  return [
    process.env.ONDOCTOR_DIR,
    process.env.VERDE_DIR,
    path.join(ROOT, "Backup On Doctor Março 2026 - WESLEY SERVICOS MEDICOS LTDA"),
    path.join(ROOT, "Backup Prontuário Verde Março 2026"),
    path.join(ROOT, "csvs"),
    "/root/glutec_import/csvs",
    "/root/glutec_import/onedoctor",
    "/root/glutec_import/ondoctor",
    "/root/glutec_import/prontuario_verde",
  ].filter(Boolean);
}

function readText(filePath, encoding = "utf-8") {
  const buffer = fs.readFileSync(filePath);
  return new TextDecoder(encoding).decode(buffer);
}

function parseCsvSemicolon(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
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

function loadCsv(filePath, encoding = "utf-8") {
  const all = parseCsvSemicolon(readText(filePath, encoding));
  if (!all.length) return [];
  const header = all[0].map((value) => String(value ?? "").trim());
  return all
    .slice(1)
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""])));
}

function walkFiles(root, matcher, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > 4) return null;
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

function findCsv(fileName) {
  for (const root of candidateDirs()) {
    const found = walkFiles(root, (file) => path.basename(file).toLowerCase() === fileName.toLowerCase());
    if (found) return found;
  }
  return null;
}

function findCsvByPrefix(prefix) {
  for (const root of candidateDirs()) {
    const found = walkFiles(root, (file) => path.basename(file).toLowerCase().startsWith(prefix.toLowerCase()) && file.toLowerCase().endsWith(".csv"));
    if (found) return found;
  }
  return null;
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeCpf(value) {
  const digits = onlyDigits(value);
  return digits.length === 11 ? digits : "";
}

function dateOnly(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function dateTime(value, fallbackDate) {
  const raw = String(value ?? "").trim();
  if (raw) {
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4].padStart(2, "0")}:${match[5]}:${match[6] || "00"}`;
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::|\.)(\d{2})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]} ${match[4].padStart(2, "0")}:${match[5]}:${match[6]}`;
  }
  const date = dateOnly(fallbackDate);
  return date ? `${date} 00:00:00` : new Date();
}

function isTrue(value) {
  return ["true", "1", "sim", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function questionText(id) {
  return LEGACY_QUESTION_TEXT[id] || `Pergunta importada #${id}`;
}

function inferQuestionType(options, answer) {
  if (String(answer ?? "").includes("|")) return "checkbox";
  if (Array.isArray(options) && options.length > 0) return options.length > 2 ? "select" : "radio";
  return "text";
}

function mergeAnswer(response, extra) {
  const main = String(response ?? "").trim();
  const detail = String(extra ?? "").trim();
  if (!detail) return main;
  if (!main) return detail;
  if (main.toLowerCase().includes(detail.toLowerCase())) return main;
  return `${main} - ${detail}`;
}

async function getColumns(conn, tableName) {
  const [rows] = await conn.query(`show columns from \`${tableName}\``);
  return new Set(rows.map((row) => String(row.Field)));
}

async function insertDynamic(conn, table, payload, columns) {
  const entries = Object.entries(payload).filter(([column]) => columns.has(column));
  if (!entries.length) throw new Error(`Nenhuma coluna compatível para ${table}`);
  const sql = `insert into \`${table}\` (${entries.map(([column]) => `\`${column}\``).join(", ")}) values (${entries.map(() => "?").join(", ")})`;
  if (DRY_RUN) return { insertId: 0 };
  const [result] = await conn.query(sql, entries.map(([, value]) => value));
  return result;
}

async function ensureImportMap(conn, sourceSystem, sourceTable, sourceId, targetTable, targetId) {
  if (DRY_RUN || !targetId) return;
  await conn.query(
    "insert ignore into import_id_map (sourceSystem, sourceTable, sourceId, targetTable, targetId) values (?, ?, ?, ?, ?)",
    [sourceSystem, sourceTable, String(sourceId), targetTable, Number(targetId)],
  );
}

async function buildPatientIndex(conn, peopleRows) {
  const index = {
    byLegacyId: new Map(),
    byCpf: new Map(),
    byNameBirth: new Map(),
    peopleById: new Map(),
  };

  for (const person of peopleRows) {
    index.peopleById.set(String(person.id), person);
  }

  const [patients] = await conn.query("select id, fullName, cpf, birthDate, sourceSystem, sourceId from patients");
  for (const patient of patients) {
    const patientId = Number(patient.id);
    const sourceKey = `${String(patient.sourceSystem ?? "").toLowerCase()}:patient:${patient.sourceId ?? ""}`;
    if (patient.sourceSystem && patient.sourceId) index.byLegacyId.set(sourceKey, patientId);
    const cpf = normalizeCpf(patient.cpf);
    if (cpf) index.byCpf.set(cpf, patientId);
    const birth = dateOnly(patient.birthDate);
    if (patient.fullName && birth) index.byNameBirth.set(`${normalizeName(patient.fullName)}|${birth}`, patientId);
  }

  try {
    const [maps] = await conn.query(
      "select sourceSystem, sourceTable, sourceId, targetId from import_id_map where targetTable = 'patients'",
    );
    for (const map of maps) {
      index.byLegacyId.set(
        `${String(map.sourceSystem ?? "").toLowerCase()}:${String(map.sourceTable ?? "").toLowerCase()}:${map.sourceId}`,
        Number(map.targetId),
      );
    }
  } catch {
    // Ambientes antigos podem nao ter import_id_map; CPF/nome continuam funcionando.
  }

  return index;
}

function resolvePatientId(index, legacyClientId) {
  const clientId = String(legacyClientId ?? "").trim();
  if (!clientId) return null;

  for (const key of [
    `onedoctor:patient:${clientId}`,
    `ondoctor:patient:${clientId}`,
    `onedoctor:pessoa:${clientId}`,
    `ondoctor:pessoa:${clientId}`,
    `onedoctor:pessoa.csv:${clientId}`,
  ]) {
    const mapped = index.byLegacyId.get(key);
    if (mapped) return mapped;
  }

  const person = index.peopleById.get(clientId);
  if (!person) return null;

  const cpf = normalizeCpf(person.cnpj_cpf);
  if (cpf && index.byCpf.has(cpf)) return index.byCpf.get(cpf);

  const birth = dateOnly(person.nascimento);
  if (person.nome && birth) {
    const byNameBirth = index.byNameBirth.get(`${normalizeName(person.nome)}|${birth}`);
    if (byNameBirth) return byNameBirth;
  }

  return null;
}

async function importOnDoctorAnamneses(conn) {
  const pessoaFile = findCsv("PESSOA.csv");
  const formFile = findCsv("FORMULARIO.csv");
  const formClientFile = findCsv("FORMULARIO_CLIENTE.csv");
  const questionOptionFile = findCsv("FORMULARIO_PERGUNTA.csv");
  const answerFile = findCsv("FORMULARIO_RESPOSTA.csv");

  if (!pessoaFile || !formFile || !formClientFile || !questionOptionFile || !answerFile) {
    return {
      source: "OnDoctor",
      found: false,
      message: "Arquivos FORMULARIO/PESSOA do OnDoctor não foram localizados.",
      scanned: 0,
      inserted: 0,
      skippedExisting: 0,
      skippedNoPatient: 0,
    };
  }

  const people = loadCsv(pessoaFile);
  const forms = new Map(loadCsv(formFile).map((row) => [String(row.id), row]));
  const formClients = loadCsv(formClientFile);
  const optionRows = loadCsv(questionOptionFile);
  const answers = loadCsv(answerFile);
  const linkColumns = await getColumns(conn, "anamnesis_share_links");
  const patientIndex = await buildPatientIndex(conn, people);

  const optionsByQuestion = new Map();
  for (const option of optionRows) {
    const id = String(option.id_formulario_pergunta ?? "").trim();
    if (!id) continue;
    if (!optionsByQuestion.has(id)) optionsByQuestion.set(id, []);
    const label = String(option.nome ?? "").trim();
    if (label) optionsByQuestion.get(id).push(label);
  }

  const answersByFormClient = new Map();
  for (const answer of answers) {
    const formClientId = String(answer.id_formulario_cliente ?? "").trim();
    const questionId = String(answer.id_formulario_pergunta ?? "").trim();
    if (!formClientId || !questionId) continue;
    const value = mergeAnswer(answer.resposta, answer.outro);
    if (!value) continue;
    if (!answersByFormClient.has(formClientId)) answersByFormClient.set(formClientId, []);
    answersByFormClient.get(formClientId).push({ questionId, value });
  }

  const summary = {
    source: "OnDoctor",
    found: true,
    scanned: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedNoPatient: 0,
    skippedEmpty: 0,
    skippedNotAnamnesis: 0,
    dryRun: DRY_RUN,
    files: { pessoaFile, formFile, formClientFile, questionOptionFile, answerFile },
  };

  for (const formClient of formClients) {
    const formClientId = String(formClient.id ?? "").trim();
    const form = forms.get(String(formClient.id_formulario ?? "").trim());
    const type = String(form?.tipo ?? "").trim().toUpperCase();
    const description = String(formClient.descricao ?? form?.nome ?? "").trim();
    const isAnamnesis = type === "ANAMNESE" || /anamn/i.test(description);
    if (!isAnamnesis) {
      summary.skippedNotAnamnesis += 1;
      continue;
    }

    const groupedAnswers = answersByFormClient.get(formClientId) ?? [];
    if (groupedAnswers.length === 0) {
      summary.skippedEmpty += 1;
      continue;
    }
    summary.scanned += 1;

    const patientId = resolvePatientId(patientIndex, formClient.id_cliente);
    if (!patientId) {
      summary.skippedNoPatient += 1;
      continue;
    }

    const uniqueAnswers = new Map();
    for (const item of groupedAnswers) {
      uniqueAnswers.set(item.questionId, item.value);
    }
    const questionIds = Array.from(uniqueAnswers.keys()).sort((left, right) => {
      const leftOrder = LEGACY_QUESTION_ORDER.indexOf(left);
      const rightOrder = LEGACY_QUESTION_ORDER.indexOf(right);
      if (leftOrder !== -1 || rightOrder !== -1) {
        return (leftOrder === -1 ? 9999 : leftOrder) - (rightOrder === -1 ? 9999 : rightOrder);
      }
      return Number(left) - Number(right);
    });

    const questions = questionIds.map((id) => {
      const answer = uniqueAnswers.get(id) ?? "";
      const options = Array.from(new Set(optionsByQuestion.get(id) ?? []));
      return {
        id: `legacy-${id}`,
        text: `${questionText(id)} (#${id})`,
        type: inferQuestionType(options, answer),
        options,
        required: false,
      };
    });
    const submittedAnswers = Object.fromEntries(
      questionIds.map((id) => [`legacy-${id}`, uniqueAnswers.get(id) ?? ""]),
    );
    const submittedAt = dateTime(formClient.data_hora_inclusao, formClient.data);
    const evidence = {
      method: "importacao_legado_ondoctor",
      sourceSystem: "onedoctor",
      sourceTable: "FORMULARIO_CLIENTE",
      sourceId: formClientId,
      sourcePatientId: String(formClient.id_cliente ?? ""),
      originalFile: formClient.arquivo || null,
      signedByPatient: isTrue(formClient.assinado_paciente),
      importedAt: new Date().toISOString(),
      answerKeys: Object.keys(submittedAnswers).sort(),
    };
    const signatureHash = hashJson({ evidence, submittedAnswers });

    if (linkColumns.has("signatureHash")) {
      const [existingRows] = await conn.query(
        "select id from anamnesis_share_links where patientId = ? and signatureHash = ? limit 1",
        [patientId, signatureHash],
      );
      if (existingRows.length > 0) {
        summary.skippedExisting += 1;
        continue;
      }
    } else {
      const [existingRows] = await conn.query(
        "select id from anamnesis_share_links where patientId = ? and tokenHash = ? limit 1",
        [patientId, crypto.createHash("sha256").update(`legacy_onedoctor:${formClientId}`).digest("hex")],
      );
      if (existingRows.length > 0) {
        summary.skippedExisting += 1;
        continue;
      }
    }

    const payload = {
      patientId,
      tokenHash: crypto.createHash("sha256").update(`legacy_onedoctor:${formClientId}`).digest("hex"),
      title: description || "Anamnese importada do OnDoctor",
      templateName: form?.nome || "OnDoctor",
      anamnesisDate: dateOnly(formClient.data) || submittedAt,
      questionsJson: JSON.stringify(questions),
      submittedAnswers: JSON.stringify(submittedAnswers),
      respondentName: formClient.assinado_paciente ? "Paciente (OnDoctor)" : null,
      isActive: 1,
      expiresAt: "2037-12-31 23:59:59",
      submittedAt,
      createdBy: DOCTOR_ID,
      source: "legacy_onedoctor",
      profilePhotoUrl: null,
      profilePhotoMimeType: null,
      profilePhotoDeclarationAccepted: 0,
      signatureEvidenceJson: JSON.stringify(evidence),
      signatureHash,
      signatureMethod: "importacao_legado_ondoctor",
      signedAt: isTrue(formClient.assinado_paciente) ? submittedAt : null,
      createdAt: submittedAt,
      updatedAt: new Date(),
    };

    const result = await insertDynamic(conn, "anamnesis_share_links", payload, linkColumns);
    summary.inserted += 1;
    await ensureImportMap(conn, "onedoctor", "formulario_cliente_anamnese", formClientId, "anamnesis_share_links", result.insertId);
  }

  return summary;
}

async function inspectProntuarioVerdeAnamneses() {
  const explicit = findCsvByPrefix("exp_paciente_anamnese") || findCsvByPrefix("exp_anamnese");
  if (explicit) {
    return {
      source: "Prontuário Verde",
      found: true,
      imported: 0,
      message: `Arquivo de anamnese encontrado (${explicit}), mas este formato ainda precisa de mapeamento específico.`,
    };
  }

  return {
    source: "Prontuário Verde",
    found: false,
    imported: 0,
    message: "Nenhum CSV explícito de anamnese foi encontrado no backup do Prontuário Verde; o backup local contém pacientes, evoluções, prescrições, anexos, agenda e contratos.",
  };
}

async function main() {
  if (!DB_URL) {
    throw new Error("Defina DATABASE_URL para importar as anamneses legadas.");
  }

  const conn = await mysql.createConnection(DB_URL);
  try {
    const ondoctor = await importOnDoctorAnamneses(conn);
    const verde = await inspectProntuarioVerdeAnamneses();

    console.log(JSON.stringify({ dryRun: DRY_RUN, ondoctor, verde }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
