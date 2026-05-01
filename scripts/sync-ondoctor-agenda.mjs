#!/usr/bin/env node
import "dotenv/config";
import mysql from "mysql2/promise";

const DRY_RUN = process.env.DRY_RUN !== "0";
const API = process.env.ONDOCTOR_API_BASE || "https://api.ondoctor.app/v1";
const ONDOCTOR_EMAIL = process.env.ONDOCTOR_EMAIL;
const ONDOCTOR_PASSWORD = process.env.ONDOCTOR_PASSWORD;
const FROM = process.env.ONDOCTOR_SYNC_FROM || "2026-04-01";
const TO = process.env.ONDOCTOR_SYNC_TO || "2027-12-31";
const DOCTOR_ID = Number(process.env.DOCTOR_ID || "1");

const stats = {
  fetched: 0,
  detailed: 0,
  inserted: 0,
  updated: 0,
  patientsCreated: 0,
  patientsMatched: 0,
  staleMarked: 0,
  duplicateDeleted: 0,
  errors: [],
};

if (!process.env.DATABASE_URL) {
  console.error("ERRO: defina DATABASE_URL.");
  process.exit(1);
}

if (!ONDOCTOR_EMAIL || !ONDOCTOR_PASSWORD) {
  console.error("ERRO: defina ONDOCTOR_EMAIL e ONDOCTOR_PASSWORD.");
  process.exit(1);
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normName(value) {
  return cleanText(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function phoneKey(value) {
  const d = digits(value);
  return d.length >= 8 ? d.slice(-8) : d;
}

function sqlDateTime(date, time) {
  return `${date} ${String(time || "00:00:00").slice(0, 8)}`;
}

function minutesBetween(date, start, end) {
  const a = new Date(`${date}T${String(start || "00:00:00").slice(0, 8)}`);
  const b = new Date(`${date}T${String(end || start || "00:30:00").slice(0, 8)}`);
  const minutes = Math.round((b.getTime() - a.getTime()) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
}

function mapStatus(value) {
  const status = normName(value).toLowerCase();
  if (status.includes("cancel")) return "cancelada";
  if (status.includes("falta")) return "falta";
  if (status.includes("atendid") || status.includes("finaliz") || status.includes("conclu")) return "concluida";
  if (status.includes("confirmad")) return "confirmada";
  if (status.includes("em atendimento")) return "em_atendimento";
  if (status.includes("chegou")) return "em_atendimento";
  return "agendada";
}

function mapType(value) {
  const type = normName(value).toLowerCase();
  if (type.includes("proced")) return "procedimento";
  if (type.includes("retorno")) return "retorno";
  return "consulta";
}

function extractLabel(html, label) {
  const text = String(html ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const match = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, "i"));
  return cleanText(match?.[1] ?? "");
}

function truncate(value, max) {
  const text = cleanText(value);
  return text.length > max ? text.slice(0, max) : text;
}

function biologicalSex(value) {
  const sex = String(value ?? "").trim().toUpperCase();
  if (sex === "M") return "masculino";
  if (sex === "F") return "feminino";
  return "nao_informado";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function ondoctorLogin() {
  return fetchJson(`${API}/login/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ONDOCTOR_EMAIL, senha: ONDOCTOR_PASSWORD }),
  });
}

async function fetchOnDoctorAgenda() {
  const login = await ondoctorLogin();
  const auth = { Authorization: `Bearer ${login.token}`, Accept: "application/json" };
  const listUrl = `${API}/agenda/empresa/${login.idEmpresa}/tipo/todos/sala/0/situacao/todas/convenio/0/dtIni/${FROM}/dtFim/${TO}/visualizacao/lista?profissionais=${login.id}`;
  const list = await fetchJson(listUrl, { headers: auth });
  const agenda = list.filter((item) => item.tipo === "agenda");
  stats.fetched = agenda.length;

  const details = [];
  for (const item of agenda) {
    try {
      const detail = await fetchJson(`${API}/agenda/${item.id}`, { headers: auth });
      details.push({ ...item, ...detail });
      stats.detailed += 1;
    } catch (error) {
      stats.errors.push(`agenda ${item.id}: ${error.message}`);
    }
  }

  const clientCache = new Map();
  async function getClient(idCliente) {
    if (!idCliente) return null;
    const key = String(idCliente);
    if (clientCache.has(key)) return clientCache.get(key);

    try {
      const client = await fetchJson(`${API}/cliente/${idCliente}`, { headers: auth });
      clientCache.set(key, client);
      return client;
    } catch {
      clientCache.set(key, null);
      return null;
    }
  }

  return { details, getClient };
}

async function viaCep(cep) {
  const d = digits(cep);
  if (d.length !== 8) return null;

  try {
    const data = await fetchJson(`https://viacep.com.br/ws/${d}/json/`);
    return data?.erro ? null : data;
  } catch {
    return null;
  }
}

async function tableColumns(conn, table) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM ${table}`);
  return new Set(cols.map((column) => column.Field));
}

async function nextRecordNumber(conn) {
  const [[row]] = await conn.query("select coalesce(max(recordNumber), 0) + 1 as nextRecordNumber from patients");
  return Number(row?.nextRecordNumber || 1);
}

async function loadPatients(conn) {
  const [rows] = await conn.query(
    "select id, fullName, phone, phone2, email, sourceSystem, sourceId from patients where coalesce(active,1)=1",
  );
  const source = new Map();
  const namePhone = new Map();

  for (const patient of rows) {
    if (patient.sourceSystem === "onedoctor" && patient.sourceId) source.set(String(patient.sourceId), patient);
    const nk = normName(patient.fullName);
    for (const phone of [patient.phone, patient.phone2]) {
      const pk = phoneKey(phone);
      if (nk && pk) namePhone.set(`${nk}|${pk}`, patient);
    }
  }

  return { rows, source, namePhone };
}

async function ensurePatient(conn, patientIndex, patientCols, detail, client) {
  const sourceId = String(detail.idCliente || client?.id || "");
  if (sourceId && patientIndex.source.has(sourceId)) {
    stats.patientsMatched += 1;
    return patientIndex.source.get(sourceId).id;
  }

  const name = cleanText(client?.nome || detail.clienteNome || detail.titulo?.split(" - ")[0]);
  const phone = cleanText(client?.celular || detail.clienteCelular || detail.clienteTelefone || "");
  const byNamePhone = patientIndex.namePhone.get(`${normName(name)}|${phoneKey(phone)}`);

  if (byNamePhone) {
    if (!DRY_RUN && sourceId && patientCols.has("sourceSystem") && patientCols.has("sourceId")) {
      await conn.query(
        "update patients set sourceSystem='onedoctor', sourceId=?, updatedAt=now() where id=? and (sourceId is null or sourceId='')",
        [sourceId, byNamePhone.id],
      );
      byNamePhone.sourceSystem = "onedoctor";
      byNamePhone.sourceId = sourceId;
      patientIndex.source.set(sourceId, byNamePhone);
    }
    stats.patientsMatched += 1;
    return byNamePhone.id;
  }

  const cepInfo = await viaCep(client?.cep);
  const city = cleanText(client?.cidade || cepInfo?.localidade || "");
  const state = cleanText(client?.pessoaUf || cepInfo?.uf || "");
  const addressObj = {
    street: cleanText(client?.endereco || cepInfo?.logradouro || ""),
    number: cleanText(client?.numero || ""),
    neighborhood: cleanText(client?.bairro || cepInfo?.bairro || ""),
    city,
    state,
    zip: cleanText(client?.cep || ""),
  };

  const row = {
    recordNumber: await nextRecordNumber(conn),
    fullName: name || `Paciente OnDoctor ${sourceId}`,
    cpf: client?.cpf || null,
    birthDate: client?.nascimento || null,
    gender: biologicalSex(client?.sexo),
    biologicalSex: biologicalSex(client?.sexo),
    phone,
    email: client?.email || null,
    address: JSON.stringify(addressObj),
    healthInsurance: "Particular",
    sourceSystem: "onedoctor",
    sourceId,
    active: 1,
    createdBy: DOCTOR_ID,
    city: city || null,
    state: state || null,
    zipCode: addressObj.zip || null,
  };

  const entries = Object.entries(row).filter(([key]) => patientCols.has(key));
  stats.patientsCreated += 1;

  if (DRY_RUN) return -1;

  const insertSql = `insert into patients (${entries.map(([key]) => `\`${key}\``).join(",")}, createdAt, updatedAt) values (${entries.map(() => "?").join(",")}, now(), now())`;
  const [res] = await conn.query(insertSql, entries.map(([, value]) => value));
  const patient = { id: res.insertId, fullName: row.fullName, phone, sourceSystem: "onedoctor", sourceId };
  patientIndex.rows.push(patient);
  if (sourceId) patientIndex.source.set(sourceId, patient);
  if (normName(row.fullName) && phoneKey(phone)) patientIndex.namePhone.set(`${normName(row.fullName)}|${phoneKey(phone)}`, patient);
  return res.insertId;
}

async function normalizeLegacySource(conn) {
  if (DRY_RUN) return;
  await conn.query("update appointments set sourceSystem='onedoctor' where sourceSystem='ondoctor'");
  await conn.query("update patients set sourceSystem='onedoctor' where sourceSystem='ondoctor'");
}

async function deleteDuplicateOrStaleOnDoctorAppointments(conn, currentIds) {
  const [rows] = await conn.query(
    `select a.id, a.sourceId, a.status, a.updatedAt, a.notes, a.scheduledAt, p.fullName
     from appointments a
     left join patients p on p.id = a.patientId
     where a.sourceSystem='onedoctor'
       and a.scheduledAt >= ?
       and coalesce(a.sourceId,'') <> ''
     order by a.scheduledAt asc, a.id asc`,
    [`${FROM} 00:00:00`],
  );

  const deleteIds = new Set();
  const groupsBySource = new Map();

  for (const row of rows) {
    if (!currentIds.has(String(row.sourceId))) {
      deleteIds.add(row.id);
      continue;
    }

    const key = String(row.sourceId);
    const arr = groupsBySource.get(key) || [];
    arr.push(row);
    groupsBySource.set(key, arr);
  }

  function score(row) {
    const synced = String(row.notes || "").includes("Sincronizado do OnDoctor") ? 1_000_000_000_000_000 : 0;
    const updated = new Date(row.updatedAt || row.scheduledAt || 0).getTime() || 0;
    return synced + updated + Number(row.id || 0);
  }

  for (const arr of groupsBySource.values()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => score(b) - score(a));
    for (const row of arr.slice(1)) deleteIds.add(row.id);
  }

  const byDisplay = new Map();
  for (const row of rows.filter((item) => currentIds.has(String(item.sourceId)) && !deleteIds.has(item.id))) {
    const key = `${normName(row.fullName)}|${new Date(row.scheduledAt).toISOString()}`;
    const arr = byDisplay.get(key) || [];
    arr.push(row);
    byDisplay.set(key, arr);
  }

  for (const arr of byDisplay.values()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => score(b) - score(a));
    for (const row of arr.slice(1)) deleteIds.add(row.id);
  }

  const ids = Array.from(deleteIds).map(Number).filter(Boolean);
  stats.duplicateDeleted = ids.length;

  if (DRY_RUN || !ids.length) return;

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await conn.query(`delete from appointments where id in (${chunk.map(() => "?").join(",")})`, chunk);
  }
}

async function run() {
  console.log(`DRY_RUN=${DRY_RUN ? "1" : "0"} FROM=${FROM} TO=${TO}`);
  const { details, getClient } = await fetchOnDoctorAgenda();
  const currentIds = new Set(details.map((item) => String(item.id)));
  const statusCounts = details.reduce((acc, item) => {
    acc[item.situacao || ""] = (acc[item.situacao || ""] || 0) + 1;
    return acc;
  }, {});
  console.log("ONDOCTOR_STATUS_COUNTS", JSON.stringify(statusCounts));

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const appointmentCols = await tableColumns(conn, "appointments");
  const patientCols = await tableColumns(conn, "patients");
  const patientIndex = await loadPatients(conn);

  if (!DRY_RUN) await conn.beginTransaction();
  try {
    await normalizeLegacySource(conn);

    for (const detail of details) {
      try {
        const client = await getClient(detail.idCliente);
        const patientId = await ensurePatient(conn, patientIndex, patientCols, detail, client);
        const procedure = extractLabel(detail.descricao, "Proc");
        const localPhone = extractLabel(detail.descricao, "Fone");
        const notes = [
          cleanText(detail.observacao),
          procedure ? `Procedimento OnDoctor: ${procedure}` : "",
          `Sincronizado do OnDoctor. ID original: ${detail.id}. Situacao: ${detail.situacao || "sem situacao"}. Telefone: ${cleanText(detail.clienteCelular || localPhone || "")}`,
        ]
          .filter(Boolean)
          .join("\n");

        const payload = {
          patientId,
          doctorId: DOCTOR_ID,
          scheduledAt: sqlDateTime(detail.data, detail.horarioIni),
          duration: minutesBetween(detail.data, detail.horarioIni, detail.horarioFim),
          type: mapType(detail.agendaTipo),
          status: mapStatus(detail.situacao),
          notes,
          room: truncate(extractLabel(detail.descricao, "Local") || (detail.idSala ? `Sala ${detail.idSala}` : "Sem sala"), 32),
          price: Number(detail.valor || 0),
          healthInsurance: "Particular",
          sourceSystem: "onedoctor",
          sourceId: String(detail.id),
          createdBy: DOCTOR_ID,
        };

        const [[existing]] = await conn.query(
          "select id from appointments where sourceSystem='onedoctor' and sourceId=? limit 1",
          [String(detail.id)],
        );

        if (existing) {
          stats.updated += 1;
          if (!DRY_RUN) {
            const entries = Object.entries(payload).filter(([key]) => appointmentCols.has(key));
            const setSql = entries.map(([key]) => `\`${key}\`=?`).join(", ");
            await conn.query(`update appointments set ${setSql}, updatedAt=now() where id=?`, [
              ...entries.map(([, value]) => value),
              existing.id,
            ]);
          }
        } else {
          stats.inserted += 1;
          if (!DRY_RUN) {
            const entries = Object.entries(payload).filter(([key]) => appointmentCols.has(key));
            const insertSql = `insert into appointments (${entries.map(([key]) => `\`${key}\``).join(",")}, createdAt, updatedAt) values (${entries.map(() => "?").join(",")}, now(), now())`;
            await conn.query(insertSql, entries.map(([, value]) => value));
          }
        }
      } catch (error) {
        stats.errors.push(`sync agenda ${detail.id}: ${error.message}`);
      }
    }

    await deleteDuplicateOrStaleOnDoctorAppointments(conn, currentIds);

    if (!DRY_RUN) await conn.commit();
  } catch (error) {
    if (!DRY_RUN) await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  console.log("SYNC_STATS", JSON.stringify(stats, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

