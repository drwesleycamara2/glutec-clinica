import "dotenv/config";
import mysql from "mysql2/promise";

const LEGACY_QUESTION_TEXT = {
  73693: "Tem alergia a algum medicamento, alimento ou substância?",
  73694: "Faz uso de algum medicamento contínuo?",
  79783: "Selecione os problemas de saúde que tem atualmente",
  79784: "Teve gestações? Se sim, quando foi o último parto?",
  80248: "Profissão",
  80249: "Estado civil",
  80250: "Cidade e estado em que mora",
  80251: "Consome bebida alcoólica?",
  80252: "Usa método anticoncepcional? Qual?",
  80253: "Toma vitamina D? Qual a dose e em que frequência?",
  80254: "Está gestante ou lactante?",
  80255: "Já teve problemas de cicatrização, como queloides?",
  80256: "Já teve alguma reação ruim com anestesia?",
  80257: "Já teve trombose, embolia ou AVC?",
  80258: "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)",
  80259: "Realiza atividade física regular?",
  80260: "Você é muito sensível à dor?",
  80261: "Já realizou alguma cirurgia?",
  80262: "Usa alguma droga ilícita?",
  80263: "Usa algum tipo de hormônio?",
  80264: "Faz uso de medicamentos regularmente?",
  81028: "Há algo que gostaria de informar ao médico?",
  82417: "Tem alergia a algum medicamento, alimento ou substância?",
  82868: "Peso atual aproximado em kg",
  82869: "Sua estatura aproximada (em metros)",
  82871: "Tem alergia a algum medicamento, alimento ou substância?",
  82872: "Faz uso de anticoagulante? (ou AAS?)",
  82873: "Selecione os problemas de saúde que tem atualmente",
  82875: "Profissão",
  82876: "Estado civil",
  82877: "Cidade e estado em que mora",
  82878: "Consome bebida alcoólica?",
  82880: "Toma vitamina D? Qual a dose e em que frequência?",
  82882: "Já teve problemas de cicatrização, como queloides?",
  82883: "Já teve alguma reação ruim com anestesia?",
  82884: "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)",
  82885: "Já teve trombose, embolia ou AVC?",
  82886: "Realiza atividade física regular?",
  82887: "Você é muito sensível à dor?",
  82888: "Já realizou alguma cirurgia?",
  82889: "Usa alguma droga ilícita?",
  82890: "Usa algum tipo de hormônio?",
  82891: "Faz uso de medicamentos regularmente?",
  82892: "Tem ou já teve pedras nos rins?",
  82893: "Peso atual aproximado em kg",
  82894: "Sua estatura aproximada (em metros)",
  90360: "É fumante?",
  90361: "Faz uso de anticoagulante? (ou AAS?)",
  91018: "Tem ou já teve pedras nos rins?",
  92953: "Há algo que gostaria de informar ao médico?",
};

const QUESTION_REF_REGEX = /(^|[\s>])#(\d{2,8}):/g;
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

function applyMappingToText(value, unmapped) {
  const text = String(value ?? "");
  if (!text.includes("#")) return null;

  let touched = false;
  const next = text.replace(QUESTION_REF_REGEX, (match, prefix, id) => {
    const question = LEGACY_QUESTION_TEXT[id];
    if (!question) {
      unmapped.add(id);
      return match;
    }
    touched = true;
    return `${prefix}${question} (#${id}):`;
  });

  return touched ? next : null;
}

function qid(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

async function updateTable(conn, table, fields, summaryKey, unmapped, limit = 10000) {
  const where = fields.map((field) => `${qid(field)} regexp '#[0-9]{2,8}:'`).join(" or ");
  const [rows] = await conn.query(
    `select id, ${fields.map(qid).join(", ")} from ${qid(table)} where ${where} limit ${limit}`,
  );

  const summary = { scanned: rows.length, updated: 0 };
  for (const row of rows) {
    const updates = [];
    const params = [];

    for (const field of fields) {
      const next = applyMappingToText(row[field], unmapped);
      if (next === null) continue;
      updates.push(`${qid(field)} = ?`);
      params.push(next);
    }

    if (updates.length === 0) continue;
    summary.updated += 1;
    if (!dryRun) {
      params.push(row.id);
      await conn.execute(`update ${qid(table)} set ${updates.join(", ")} where id = ?`, params);
    }
  }

  return [summaryKey, summary];
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada.");
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const unmapped = new Set();

try {
  const entries = await Promise.all([
    updateTable(conn, "clinical_evolution", ["clinicalNotes", "anamnesis"], "clinicalEvolution", unmapped, 10000),
    updateTable(conn, "medical_records", ["chiefComplaint", "anamnesis", "physicalExam", "diagnosis", "plan", "evolution", "notes"], "medicalRecords", unmapped, 10000),
    updateTable(conn, "anamnesis_share_links", ["questionsJson", "submittedAnswers"], "anamnesisShareLinks", unmapped, 10000),
  ]);

  console.log(JSON.stringify({
    dryRun,
    ...Object.fromEntries(entries),
    unmappedIds: Array.from(unmapped).sort((a, b) => Number(a) - Number(b)),
  }, null, 2));
} finally {
  await conn.end();
}
