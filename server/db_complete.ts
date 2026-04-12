import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { getDb } from "./db";
import { eq, like, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  emitNfseWithNationalApi,
  fetchMunicipalParameters,
  testNationalApiConnection,
} from "./lib/nfse-nacional";
import { encryptSensitiveValue, maskStoredValue } from "./lib/secure-storage";
import { createWhatsAppService } from "./whatsapp";

function unwrapRows<T = any>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }

  return (result ?? []) as T[];
}
function normalizeMediaUrl(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

type DefaultAnamnesisQuestion = {
  text: string;
  type: "text" | "radio" | "checkbox" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  followUp?: {
    prompt: string;
    triggerValues: string[];
    required?: boolean;
    placeholder?: string;
  };
};

const DEFAULT_ANAMNESIS_QUESTIONS_FEMININA: DefaultAnamnesisQuestion[] = [
  { text: "Estado civil", type: "text", required: true, placeholder: "Informe o estado civil" },
  { text: "Profissão", type: "text", required: true, placeholder: "Informe a profissão" },
  { text: "Cidade e estado em que mora", type: "text", required: true, placeholder: "Ex: Mogi Guaçu - SP" },
  { text: "Peso atual aproximado em kg", type: "text", required: true, placeholder: "Ex: 62" },
  { text: "Sua estatura aproximada (em metros)", type: "text", required: true, placeholder: "Ex: 1,67" },
  { text: "Tem alergia a algum medicamento, alimento ou substância?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Qual alergia é essa?", triggerValues: ["Sim"], required: true, placeholder: "Descreva a alergia" } },
  { text: "É fumante?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Consome bebida alcoólica?", type: "radio", options: ["Sim, muito e com frequência", "Bebo pouco, socialmente", "Não bebo"], required: true },
  { text: "Usa alguma droga ilícita?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Qual droga?", triggerValues: ["Sim"], required: true, placeholder: "Informe qual droga" } },
  { text: "Usa algum tipo de hormônio?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Quais hormônios?", triggerValues: ["Sim"], required: true, placeholder: "Informe quais hormônios" } },
  { text: "Faz uso de anticoagulante? (ou AAS?)", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Toma vitamina D? Qual a dose e em que frequência?", type: "text", required: true, placeholder: "Descreva a dose e frequência" },
  { text: "Faz uso de medicamentos regularmente?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Liste todos os medicamentos de uso regular", triggerValues: ["Sim"], required: true, placeholder: "Informe os medicamentos" } },
  { text: "Selecione os problemas de saúde que tem atualmente", type: "checkbox", options: ["Nenhum problema de saúde", "Diabetes", "Pressão alta", "Problemas no coração ou arritmias", "Problema nos rins ou no fígado", "Tumores", "Alterações psiquiátricas", "Outros problemas de saúde"], required: true, followUp: { prompt: "Se marcou outros problemas de saúde, escreva quais", triggerValues: ["Outros problemas de saúde"], required: true, placeholder: "Descreva os outros problemas" } },
  { text: "Teve gestações? Se sim, quando foi o último parto?", type: "text", required: true, placeholder: "Descreva" },
  { text: "Está grávida ou amamentando?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Usa método anticoncepcional? Qual?", type: "text", required: true, placeholder: "Descreva o método" },
  { text: "Já teve problemas de cicatrização, como queloides?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Já teve alguma reação ruim com anestesia?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Realiza atividade física regular?", type: "radio", options: ["Sim, três ou mais vezes por semana", "Não realizo com frequência"], required: true, followUp: { prompt: "Se sim, diga qual atividade física realiza", triggerValues: ["Sim, três ou mais vezes por semana"], required: true, placeholder: "Descreva a atividade física" } },
  { text: "Você é muito sensível à dor (sente dor com facilidade ou frequentemente)?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Já teve trombose, embolia ou AVC?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Já teve ou trata arritmia cardíaca?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Tem ou já teve pedras nos rins?", type: "radio", options: ["Sim", "Não"], required: true },
  { text: "Já realizou alguma cirurgia?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Quais cirurgias realizou?", triggerValues: ["Sim"], required: true, placeholder: "Descreva as cirurgias" } },
  { text: "Há algo que gostaria de informar ao médico?", type: "text", required: true, placeholder: "Escreva aqui" },
];

function getDefaultAnamnesisDefinition(patient: any) {
  const gender = normalizeSearchText(patient?.biologicalSex || patient?.gender);
  const isMale = gender.includes("mascul");
  const questions = isMale
    ? DEFAULT_ANAMNESIS_QUESTIONS_FEMININA.filter((question) => !["Teve gestações? Se sim, quando foi o último parto?", "Está grávida ou amamentando?", "Usa método anticoncepcional? Qual?"].includes(question.text))
    : DEFAULT_ANAMNESIS_QUESTIONS_FEMININA;

  return {
    name: isMale ? "Anamnese masculina padrão" : "Anamnese feminina padrão",
    questions,
  };
}

function canViewAnamnesisAnswers(role?: string | null) {
  return role === "admin" || role === "medico" || role === "enfermeiro";
}

function buildAnamnesisWhatsappMessage(patientName: string, shareUrl: string) {
  return [
    `Olá, ${patientName}.`,
    "",
    "A Clínica Glutée solicita o preenchimento da sua anamnese antes do atendimento.",
    "Esse preenchimento ajuda a agilizar a consulta e aumentar a segurança clínica.",
    "",
    `Clique aqui para preencher: ${shareUrl}`,
  ].join("\n");
}

function buildAppointmentReminderWhatsappMessage(params: {
  patientName: string;
  scheduledAt: string | Date;
  doctorName?: string | null;
  room?: string | null;
  anamnesisLink?: string | null;
}) {
  const date = new Date(params.scheduledAt);
  const dateLabel = date.toLocaleDateString("pt-BR");
  const timeLabel = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const lines = [
    `Olá, ${params.patientName}.`,
    "",
    `Lembrete da sua consulta na Clínica Glutée para ${dateLabel} às ${timeLabel}.`,
  ];

  if (params.doctorName) {
    lines.push(`Profissional: ${params.doctorName}`);
  }
  if (params.room) {
    lines.push(`Sala: ${params.room}`);
  }

  lines.push("", "Se precisar, responda esta mensagem para confirmar ou solicitar ajuste.");

  if (params.anamnesisLink) {
    lines.push("", "Antes do atendimento, pedimos também o preenchimento da anamnese:", params.anamnesisLink);
  }

  return lines.join("\n");
}

type TussCatalogEntry = {
  code: string;
  name: string;
  description?: string;
};

let tussCatalogCache: TussCatalogEntry[] | null = null;
let tussCatalogPromise: Promise<TussCatalogEntry[]> | null = null;

function normalizeSearchText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadTussCatalog() {
  if (tussCatalogCache) {
    return tussCatalogCache;
  }

  if (!tussCatalogPromise) {
    tussCatalogPromise = fs.promises
      .readFile(path.resolve(process.cwd(), "tuss22_data.json"), "utf-8")
      .then((raw) => JSON.parse(raw) as TussCatalogEntry[])
      .then((rows) =>
        rows.filter((row) => row?.code && row?.name).map((row) => ({
          code: String(row.code).trim(),
          name: String(row.name).trim(),
          description: String(row.description ?? "").trim(),
        })),
      )
      .catch(() => [])
      .finally(() => {
        tussCatalogPromise = null;
      });
  }

  tussCatalogCache = await tussCatalogPromise;
  return tussCatalogCache;
}

function inferExtensionFromMimeType(mimeType?: string | null) {
  const normalized = String(mimeType ?? "").toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("quicktime") || normalized.includes("mov")) return "mov";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("heic")) return "heic";
  return "jpg";
}

function inferMediaType(mimeType?: string | null, filePath?: string | null) {
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();
  const normalizedPath = String(filePath ?? "").toLowerCase();
  if (normalizedMimeType.startsWith("video/")) return "video";
  if (normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".mov") || normalizedPath.endsWith(".webm")) {
    return "video";
  }
  return "image";
}

let ffmpegAvailability: boolean | null = null;

function hasFfmpeg() {
  if (ffmpegAvailability !== null) {
    return ffmpegAvailability;
  }

  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpegAvailability = true;
  } catch {
    ffmpegAvailability = false;
  }

  return ffmpegAvailability;
}

function maybeOptimizeVideo(absolutePath: string, mimeType?: string | null, shouldOptimize: boolean = false) {
  if (inferMediaType(mimeType, absolutePath) !== "video") {
    return { absolutePath, mimeType: mimeType ?? "image/jpeg" };
  }

  if (!shouldOptimize || !hasFfmpeg()) {
    return { absolutePath, mimeType: mimeType ?? "video/mp4" };
  }

  const optimizedPath = absolutePath.replace(/\.[^.]+$/, ".mp4");

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        absolutePath,
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "30",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        optimizedPath,
      ],
      { stdio: "ignore" },
    );

    if (fs.existsSync(optimizedPath)) {
      if (optimizedPath !== absolutePath && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      return { absolutePath: optimizedPath, mimeType: "video/mp4" };
    }
  } catch {
    // Keep original file when optimization is unavailable or fails.
  }

  return { absolutePath, mimeType: mimeType ?? "video/mp4" };
}

function savePatientMediaToPublicDir(
  patientId: number,
  base64: string,
  mimeType?: string | null,
  sourceFolder: "manual" | "patient-submissions" = "manual",
) {
  const extension = inferExtensionFromMimeType(mimeType);
  const relativeDir = path.join("imports", sourceFolder, `patient-${patientId}`);
  const absoluteDir = path.resolve(process.cwd(), "public", relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const initialAbsolutePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(initialAbsolutePath, Buffer.from(base64, "base64"));

  const optimized = maybeOptimizeVideo(
    initialAbsolutePath,
    mimeType,
    sourceFolder === "patient-submissions",
  );
  const finalAbsolutePath = optimized.absolutePath;
  const finalFileName = path.basename(finalAbsolutePath);

  return {
    photoUrl: normalizeMediaUrl(path.posix.join("/", relativeDir.replace(/\\/g, "/"), finalFileName)),
    photoKey: path.posix.join(relativeDir.replace(/\\/g, "/"), finalFileName),
    mimeType: optimized.mimeType,
    mediaType: inferMediaType(optimized.mimeType, finalAbsolutePath),
  };
}

function normalizePhotoRow(row: any) {
  return {
    ...row,
    photoUrl: normalizeMediaUrl(row.photoUrl),
    thumbnailUrl: normalizeMediaUrl(row.thumbnailUrl ?? row.photoUrl),
    mediaType: row.mediaType ?? inferMediaType(row.mimeType, row.photoUrl ?? row.photoKey),
  };
}

function normalizeDocumentRow(row: any) {
  return {
    ...row,
    fileUrl: normalizeMediaUrl(row.fileUrl),
  };
}

function parseTemplateSections(sections: any) {
  if (Array.isArray(sections)) return sections;
  if (typeof sections === "string" && sections.trim()) {
    try {
      return JSON.parse(sections);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTemplateRow(row: any) {
  const sections = parseTemplateSections(row.sections);
  const firstSection = Array.isArray(sections) ? sections[0] : null;
  return {
    ...row,
    sections,
    content:
      firstSection?.content ??
      firstSection?.text ??
      firstSection?.fields?.map?.((field: any) => field.label).join("\n") ??
      "",
  };
}

// --- PATIENTS ----------------------------------------------------------------
export async function listPatients(query?: string, limit: number = 5000) {
  const db = await getDb();
  if (!db) return [];

  const normalizedQuery = query?.trim();
  const rows = unwrapRows<any>(normalizedQuery
    ? await db.execute(sql`
        select *
        from patients
        where fullName like ${`%${normalizedQuery}%`}
           or cpf like ${`%${normalizedQuery}%`}
           or phone like ${`%${normalizedQuery}%`}
        order by fullName asc
        limit ${limit}
      `)
    : await db.execute(sql`
        select *
        from patients
        order by fullName asc
        limit ${limit}
      `));

  return rows.map((row: any) => {
    let addressData: Record<string, string> = {};
    if (typeof row.address === "string" && row.address.trim().startsWith("{")) {
      try {
        addressData = JSON.parse(row.address);
      } catch {
        addressData = {};
      }
    }

    return {
      ...row,
      name: row.fullName ?? "",
      zipCode: addressData.zip ?? "",
      city: addressData.city ?? "",
      state: addressData.state ?? "",
      neighborhood: addressData.neighborhood ?? "",
      address: addressData.street ?? row.address ?? "",
    };
  });
}

export async function createPatient(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`patients`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patients
    where id = ${id}
    limit 1
  `));

  const row = rows[0];
  if (!row) return null;

  let addressData: Record<string, string> = {};
  if (typeof row.address === "string" && row.address.trim().startsWith("{")) {
    try {
      addressData = JSON.parse(row.address);
    } catch {
      addressData = {};
    }
  }

  return {
    ...row,
    name: row.fullName ?? "",
    zipCode: addressData.zip ?? "",
    city: addressData.city ?? "",
    state: addressData.state ?? "",
    neighborhood: addressData.neighborhood ?? "",
    address: addressData.street ?? row.address ?? "",
  };
}

// --- APPOINTMENTS ------------------------------------------------------------
export async function createAppointment(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const scheduledAt = new Date(data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Data e hora do agendamento inválidas.");
  }

  const duration = Math.max(5, Number(data.durationMinutes || data.duration || 30));
  const endsAt = new Date(scheduledAt.getTime() + duration * 60 * 1000);
  const room = String(data.room ?? "").trim();

  if (!room) {
    throw new Error("Informe a sala do atendimento.");
  }

  const conflictingBlocks = unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where active = true
      and startsAt < ${endsAt}
      and endsAt > ${scheduledAt}
      and (room is null or room = ${room})
      and (doctorId is null or doctorId = ${data.doctorId})
    limit 1
  `));

  if (conflictingBlocks[0]) {
    throw new Error("Existe um bloqueio de agenda para este período.");
  }

  const conflictingAppointments = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where status not in ('cancelada', 'falta')
      and room = ${room}
      and scheduledAt < ${endsAt}
      and date_add(scheduledAt, interval duration minute) > ${scheduledAt}
    limit 1
  `));

  if (conflictingAppointments[0]) {
    throw new Error("Já existe um agendamento nesta sala para o horário informado.");
  }

  const result = await db.execute(sql`
    insert into appointments (
      patientId,
      doctorId,
      scheduledAt,
      duration,
      type,
      status,
      notes,
      room,
      createdBy
    ) values (
      ${data.patientId},
      ${data.doctorId},
      ${scheduledAt},
      ${duration},
      ${data.type ?? "consulta"},
      'agendada',
      ${data.notes ?? null},
      ${room},
      ${userId}
    )
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function getAppointmentsByDateRange(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select
      a.*,
      p.fullName as patientName,
      p.phone as patientPhone,
      p.email as patientEmail,
      u.name as doctorName,
      u.role as doctorRole,
      u.specialty as doctorSpecialty
    from appointments a
    left join patients p on p.id = a.patientId
    left join users u on u.id = a.doctorId
    where a.scheduledAt >= ${from}
      and a.scheduledAt <= ${to}
    order by a.scheduledAt asc
  `));
}

export async function updateAppointmentStatus(appointmentId: number, status: string) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(sql`appointments`).set({ status }).where(eq(sql`id`, appointmentId));
  return { success: true };
}

export async function listAppointmentBlocks(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where active = true
      and startsAt <= ${to}
      and endsAt >= ${from}
    order by startsAt asc
  `));
}

export async function createAppointmentBlock(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error("Período de bloqueio inválido.");
  }

  const result = await db.execute(sql`
    insert into appointment_blocks (
      title,
      notes,
      room,
      doctorId,
      startsAt,
      endsAt,
      createdBy,
      active
    ) values (
      ${data.title || "Bloqueio de agenda"},
      ${data.notes ?? null},
      ${data.room || null},
      ${data.doctorId || null},
      ${startsAt},
      ${endsAt},
      ${userId},
      true
    )
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function deleteAppointmentBlock(blockId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update appointment_blocks
    set active = false
    where id = ${blockId}
  `);

  return { success: true };
}

// --- PRESCRIPTIONS -----------------------------------------------------------
export async function createPrescription(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.execute(sql`
    insert into prescriptions (
      patientId,
      doctorId,
      type,
      content,
      observations
    ) values (
      ${data.patientId},
      ${userId},
      ${data.type},
      ${data.content},
      ${data.observations ?? null}
    )
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  if (!insertedId) {
    return { success: true };
  }

  return getPrescriptionById(Number(insertedId));
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  if (!patientId || patientId <= 0) {
    return unwrapRows<any>(await db.execute(sql`
      select *
      from prescriptions
      order by createdAt desc, id desc
    `));
  }

  return unwrapRows<any>(await db.execute(sql`
    select *
    from prescriptions
    where patientId = ${patientId}
    order by createdAt desc, id desc
  `));
}

export async function getPrescriptionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from prescriptions
    where id = ${id}
    limit 1
  `));

  return rows[0] ?? null;
}

export async function listPrescriptionTemplates() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(sql`medical_record_templates`).where(eq(sql`specialty`, 'Prescrição'));
  return rows.map((row: any) => {
    const sections = Array.isArray(row.sections)
      ? row.sections
      : typeof row.sections === "string"
        ? JSON.parse(row.sections)
        : [];
    const firstSection = Array.isArray(sections) ? sections[0] : null;

    return {
      ...row,
      type: row.description || "simples",
      content: firstSection?.content || firstSection?.text || "",
    };
  });
}

export async function createPrescriptionTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.insert(sql`medical_record_templates`).values({
    name: data.name,
    specialty: 'Prescrição',
    description: data.type || "simples",
    sections: JSON.stringify([
      {
        type: "richtext",
        content: data.content ?? "",
      },
    ]),
    active: true,
    createdBy: userId,
  });
  return result[0];
}

// --- EXAM REQUESTS -----------------------------------------------------------
export async function createExamRequest(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`exam_requests`).values({
    ...data,
    doctorId: userId,
  });
  return result[0];
}

export async function getExamRequestsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`exam_requests`).where(eq(sql`patientId`, patientId));
}

export async function getExamRequestById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from exam_requests
    where id = ${id}
    limit 1
  `));

  return rows[0] ?? null;
}

export async function listExamTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`specialty`, 'Exame'));
}

export async function createExamTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    specialty: 'Exame',
    createdBy: userId,
  });
  return result[0];
}

// --- FINANCIAL ---------------------------------------------------------------
export async function createFinancialTransaction(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`financial_transactions`).values({
    ...data,
    createdBy: userId,
  });
  return result[0];
}

export async function listFinancialTransactions() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`financial_transactions`).orderBy(desc(sql`createdAt`));
}

export async function getFinancialSummary(from?: string, to?: string) {
  const db = await getDb();
  if (!db) return { totalReceita: 0, totalDespesa: 0, saldo: 0 };
  
  let query = db.select({
    type: sql`type`,
    total: sql`SUM(amountInCents) as total`
  }).from(sql`financial_transactions`).groupBy(sql`type`);
  
  if (from && to) {
    query = query.where(and(
      gte(sql`createdAt`, from),
      lte(sql`createdAt`, to)
    ));
  }
  
  const results = await query;
  const summary = { totalReceita: 0, totalDespesa: 0, saldo: 0 };
  
  for (const row of results) {
    if (row.type === 'receita') summary.totalReceita = row.total || 0;
    if (row.type === 'despesa') summary.totalDespesa = row.total || 0;
  }
  
  summary.saldo = summary.totalReceita - summary.totalDespesa;
  return summary;
}

// --- CATALOG -----------------------------------------------------------------
export async function listProcedures() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_procedure_catalog`).where(eq(sql`active`, true));
}

export async function createProcedure(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_procedure_catalog`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function createProcedureArea(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_procedure_areas`).values({
    ...data,
    active: true,
  });
  return result[0];
}

export async function getProcedureAreas(procedureId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_procedure_areas`).where(eq(sql`procedureId`, procedureId));
}

export async function getProcedureById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`budget_procedure_catalog`).where(eq(sql`id`, id)).limit(1);
  return result[0];
}

export async function getProcedurePrice(procedureId: number, areaId: number, complexity: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`budget_procedure_pricing`)
    .where(and(
      eq(sql`procedureId`, procedureId),
      eq(sql`areaId`, areaId),
      eq(sql`complexity`, complexity)
    )).limit(1);
  
  return result[0];
}

export async function listPaymentPlans() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_payment_plans`).where(eq(sql`active`, true));
}

export async function createPaymentPlan(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_payment_plans`).values({
    ...data,
    active: true,
  });
  return result[0];
}

export async function upsertProcedurePrice(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getProcedurePrice(data.procedureId, data.areaId, data.complexity);
  
  if (existing) {
    await db.update(sql`budget_procedure_pricing`)
      .set({ priceInCents: data.priceInCents })
      .where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`budget_procedure_pricing`).values(data);
  }
  
  return { success: true };
}

// --- INVENTORY ---------------------------------------------------------------
export async function listInventoryProducts() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`inventory_products`).where(eq(sql`active`, true));
}

export async function createInventoryProduct(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`inventory_products`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function getLowStockItems() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`inventory_products`)
    .where(sql`currentStock <= minimumStock AND active = true`);
}

export async function createInventoryMovement(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`inventory_movements`).values({
    ...data,
    createdBy: userId,
  });
  
  // Atualizar estoque do produto
  const product = await db.select().from(sql`inventory_products`).where(eq(sql`id`, data.productId)).limit(1);
  if (product) {
    let newStock = product[0].currentStock;
    if (data.type === 'entrada') newStock += data.quantity;
    else if (data.type === 'saida') newStock -= data.quantity;
    
    await db.update(sql`inventory_products`)
      .set({ currentStock: newStock })
      .where(eq(sql`id`, data.productId));
  }
  
  return result[0];
}

// --- PHOTOS ------------------------------------------------------------------
export async function getPatientPhotos(patientId: number, category?: string, folderId?: number | null) {
  const db = await getDb();
  if (!db) return [];

  const filters = [sql`p.patientId = ${patientId}`];
  if (category) {
    filters.push(sql`p.category = ${category}`);
  }
  if (folderId === null) {
    filters.push(sql`p.folderId is null`);
  } else if (typeof folderId === "number" && Number.isFinite(folderId)) {
    filters.push(sql`p.folderId = ${folderId}`);
  }

  return unwrapRows<any>(await db.execute(sql`
    select
      p.*,
      f.name as folderName,
      f.description as folderDescription
    from patient_photos p
    left join photo_folders f on f.id = p.folderId
    where ${sql.join(filters, sql` and `)}
    order by coalesce(p.takenAt, p.createdAt) desc, p.id desc
  `)).map(normalizePhotoRow);
}

export async function uploadPatientPhoto(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sourceFolder = data.mediaSource === "patient" ? "patient-submissions" : "manual";
  const stored = savePatientMediaToPublicDir(
    Number(data.patientId),
    String(data.base64 ?? ""),
    data.mimeType,
    sourceFolder,
  );
  const result = await db.insert(sql`patient_photos`).values({
    patientId: data.patientId,
    folderId: data.folderId ?? null,
    category: data.category,
    description: data.description ?? null,
    photoUrl: stored.photoUrl,
    thumbnailUrl: stored.photoUrl,
    photoKey: stored.photoKey,
    mimeType: stored.mimeType ?? data.mimeType ?? null,
    originalFileName: data.originalFileName ?? null,
    mediaType: stored.mediaType,
    mediaSource: data.mediaSource === "patient" ? "patient" : "clinic",
    takenAt: data.takenAt ? new Date(data.takenAt) : null,
    uploadedBy: userId,
  });

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patient_photos
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ? normalizePhotoRow(rows[0]) : { success: true };
}

export async function createPhotoFolder(patientId: number, name: string, description: string | undefined, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.execute(sql`
    insert into photo_folders (patientId, name, description, createdBy)
    values (${patientId}, ${name}, ${description ?? null}, ${userId})
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from photo_folders
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function getPhotoFolders(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select
      f.*,
      count(p.id) as mediaCount
    from photo_folders f
    left join patient_photos p on p.folderId = f.id
    where f.patientId = ${patientId}
    group by f.id
    order by f.name asc, f.id asc
  `));
}

export async function updatePhotoFolder(folderId: number, data: { name?: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const currentRows = unwrapRows<any>(await db.execute(sql`
    select *
    from photo_folders
    where id = ${folderId}
    limit 1
  `));

  const current = currentRows[0];
  if (!current) {
    throw new Error("Pasta não encontrada.");
  }

  await db.execute(sql`
    update photo_folders
    set
      name = ${data.name ?? current.name},
      description = ${data.description ?? current.description},
      updatedAt = current_timestamp
    where id = ${folderId}
  `);

  return { success: true };
}

export async function deletePhotoFolder(folderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update patient_photos
    set folderId = null
    where folderId = ${folderId}
  `);

  await db.execute(sql`
    delete from photo_folders
    where id = ${folderId}
  `);

  return { success: true };
}

export async function createPhotoComparison(patientId: number, photoIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  if (photoIds.length < 2 || photoIds.length > 4) {
    throw new Error("Selecione entre 2 e 4 mídias para comparar.");
  }

  const comparisonId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute(sql`
    insert into photo_comparisons (patientId, comparisonId, photoIds, createdBy)
    values (${patientId}, ${comparisonId}, ${JSON.stringify(photoIds)}, ${userId})
  `);

  const photos = unwrapRows<any>(await db.execute(sql`
    select
      p.*,
      f.name as folderName,
      f.description as folderDescription
    from patient_photos p
    left join photo_folders f on f.id = p.folderId
    where p.patientId = ${patientId}
      and p.id in (${sql.join(photoIds.map((photoId) => sql`${photoId}`), sql`, `)})
  `)).map(normalizePhotoRow);

  return {
    comparisonId,
    createdAt: new Date().toISOString(),
    photos,
  };
}

export async function createPatientMediaUploadLink(
  data: {
    patientId: number;
    folderId?: number | null;
    title?: string;
    allowVideos?: boolean;
    expiresInDays?: number;
  },
  userId: number,
  baseUrl: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + Math.max(1, Number(data.expiresInDays || 7)) * 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    insert into patient_media_upload_links (patientId, folderId, token, title, allowVideos, expiresAt, createdBy)
    values (
      ${data.patientId},
      ${data.folderId ?? null},
      ${token},
      ${data.title ?? "Envio de imagens do paciente"},
      ${data.allowVideos === false ? 0 : 1},
      ${expiresAt},
      ${userId}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName, f.name as folderName
    from patient_media_upload_links l
    left join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.id = ${insertedId}
    limit 1
  `));

  const item = rows[0];
  return {
    ...item,
    uploadUrl: `${baseUrl.replace(/\/$/, "")}/envio-midias/${token}`,
  };
}

export async function listPatientMediaUploadLinks(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName, f.name as folderName
    from patient_media_upload_links l
    left join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.patientId = ${patientId}
    order by l.createdAt desc, l.id desc
  `));
}

export async function revokePatientMediaUploadLink(linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update patient_media_upload_links
    set isActive = 0
    where id = ${linkId}
  `);

  return { success: true };
}

export async function getPatientMediaUploadLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      l.*,
      p.fullName as patientName,
      f.name as folderName
    from patient_media_upload_links l
    inner join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.token = ${token}
      and l.isActive = 1
      and l.expiresAt > now()
    limit 1
  `));

  return rows[0] ?? null;
}

export async function createAnamnesisShareLink(
  data: {
    patientId: number;
    title?: string;
    templateName?: string;
    anamnesisDate?: string;
    questions: Array<Record<string, any>>;
    expiresInDays?: number;
  },
  userId: number,
  baseUrl: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const token = crypto.randomBytes(18).toString("hex");
  const expiresAt = new Date(Date.now() + Math.max(1, Number(data.expiresInDays || 7)) * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    insert into anamnesis_share_links (patientId, token, title, templateName, anamnesisDate, questionsJson, expiresAt, createdBy, source)
    values (
      ${data.patientId},
      ${token},
      ${data.title ?? "Preencher anamnese da Cl?nica Glut?e"},
      ${data.templateName ?? null},
      ${data.anamnesisDate ? new Date(data.anamnesisDate) : new Date()},
      ${JSON.stringify(data.questions ?? [])},
      ${expiresAt},
      ${userId},
      ${"share"}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName
    from anamnesis_share_links l
    left join patients p on p.id = l.patientId
    where l.id = ${insertedId}
    limit 1
  `));

  const link = rows[0] ?? null;
  if (!link) {
    throw new Error("Não foi possível gerar o link da anamnese.");
  }

  return {
    ...link,
    shareUrl: `${baseUrl.replace(/\/$/, "")}/anamnese-publica/${token}`,
    fillUrl: `${baseUrl.replace(/\/$/, "")}/anamnese-preencher/${token}`,
  };
}

export async function getAnamnesisShareLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName
    from anamnesis_share_links l
    inner join patients p on p.id = l.patientId
    where l.token = ${token}
      and l.isActive = 1
      and l.expiresAt > now()
    limit 1
  `));

  const row = rows[0];
  if (!row) return null;

  let questions: Array<{ text: string; type: string; options?: string[] }> = [];
  try {
    questions = JSON.parse(String(row.questionsJson ?? "[]"));
  } catch {
    questions = [];
  }

  let answers: Record<string, string> | null = null;
  try {
    answers = row.submittedAnswers ? JSON.parse(String(row.submittedAnswers)) : null;
  } catch {
    answers = null;
  }

  return {
    ...row,
    questions,
    answers,
  };
}

export async function listPatientAnamneses(patientId: number, viewerRole?: string | null) {
  const db = await getDb();
  if (!db) return [];
  const allowAnswers = canViewAnamnesisAnswers(viewerRole);

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      l.*,
      p.fullName as patientName
    from anamnesis_share_links l
    inner join patients p on p.id = l.patientId
    where l.patientId = ${patientId}
      and coalesce(l.submittedAnswers, '') <> ''
    order by coalesce(l.anamnesisDate, l.submittedAt, l.createdAt) desc, l.id desc
  `));

  const directAnamneses = rows.map((row) => {
    let questions: Array<Record<string, any>> = [];
    let answers: Record<string, string> | null = null;
    try {
      questions = JSON.parse(String(row.questionsJson ?? "[]"));
    } catch {
      questions = [];
    }
    try {
      answers = row.submittedAnswers ? JSON.parse(String(row.submittedAnswers)) : null;
    } catch {
      answers = null;
    }

    return {
      ...row,
      questions: allowAnswers ? questions : [],
      answers: allowAnswers ? answers : null,
      visibilityRestricted: !allowAnswers,
      sourceLabel: row.source === "share" ? "Paciente" : "Cl?nica",
    };
  });

  const legacyRows = unwrapRows<any>(await db.execute(sql`
    select
      mr.id,
      mr.date,
      mr.createdAt,
      mr.anamnesis,
      mr.chiefComplaint,
      mr.sourceSystem,
      mr.notes,
      u.name as doctorName
    from medical_records mr
    left join users u on u.id = mr.doctorId
    where mr.patientId = ${patientId}
      and coalesce(trim(mr.anamnesis), '') <> ''
    order by coalesce(mr.date, mr.createdAt) desc, mr.id desc
  `));

  const legacyAnamneses = legacyRows.map((row) => {
    const title = `Anamnese importada de ${row.sourceSystem === "onedoctor" ? "OneDoctor" : row.sourceSystem === "prontuario_verde" ? "Prontu?rio Verde" : "legado"}`;
    const answerText = String(row.anamnesis ?? "").trim();
    return {
      id: `legacy-${row.id}`,
      title,
      templateName: title,
      anamnesisDate: row.date ?? row.createdAt,
      submittedAt: row.date ?? row.createdAt,
      source: "legacy",
      sourceLabel: row.sourceSystem === "onedoctor" ? "OneDoctor" : row.sourceSystem === "prontuario_verde" ? "Prontu?rio Verde" : "Legado",
      respondentName: row.doctorName ?? null,
      questions: allowAnswers ? [{ text: "Anamnese importada do legado", type: "text", options: [] }] : [],
      answers: allowAnswers ? { "Anamnese importada do legado": answerText } : null,
      visibilityRestricted: !allowAnswers,
      summary: answerText || row.chiefComplaint || "",
    };
  });

  return [...directAnamneses, ...legacyAnamneses].sort((a: any, b: any) => {
    const dateA = new Date(a.anamnesisDate ?? a.submittedAt ?? a.createdAt ?? 0).getTime();
    const dateB = new Date(b.anamnesisDate ?? b.submittedAt ?? b.createdAt ?? 0).getTime();
    return dateB - dateA;
  });
}

export async function patientHasAnyAnamnesis(patientId: number) {
  const db = await getDb();
  if (!db) return false;

  const submittedRows = unwrapRows<any>(await db.execute(sql`
    select count(*) as count
    from anamnesis_share_links
    where patientId = ${patientId}
      and coalesce(submittedAnswers, '') <> ''
  `));

  const legacyRows = unwrapRows<any>(await db.execute(sql`
    select count(*) as count
    from medical_records
    where patientId = ${patientId}
      and coalesce(trim(anamnesis), '') <> ''
  `));

  return Number(submittedRows[0]?.count ?? 0) > 0 || Number(legacyRows[0]?.count ?? 0) > 0;
}

export async function sendPatientAnamnesisRequestViaWhatsApp(
  patientId: number,
  userId: number,
  baseUrl: string,
  options?: { title?: string; expiresInDays?: number },
) {
  const patient = await getPatientById(patientId);
  if (!patient) {
    throw new Error("Paciente não encontrado.");
  }
  if (!patient.phone) {
    throw new Error("O paciente não possui telefone cadastrado para WhatsApp.");
  }

  const template = getDefaultAnamnesisDefinition(patient);
  const link = await createAnamnesisShareLink({
    patientId,
    title: options?.title || `Anamnese de ${patient.fullName}`,
    templateName: template.name,
    anamnesisDate: new Date().toISOString().slice(0, 10),
    questions: template.questions,
    expiresInDays: options?.expiresInDays ?? 14,
  }, userId, baseUrl);

  const result = await sendWhatsAppMessage(patient.phone, buildAnamnesisWhatsappMessage(patient.fullName, link.shareUrl));
  return {
    success: true,
    patientId,
    patientName: patient.fullName,
    phone: patient.phone,
    shareUrl: link.shareUrl,
    ...result,
  };
}

export async function sendAppointmentReminderViaWhatsApp(
  appointmentId: number,
  userId: number,
  baseUrl: string,
  customMessage?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      a.*,
      p.fullName as patientName,
      p.phone as patientPhone,
      u.name as doctorName
    from appointments a
    inner join patients p on p.id = a.patientId
    left join users u on u.id = a.doctorId
    where a.id = ${appointmentId}
    limit 1
  `));

  const appointment = rows[0];
  if (!appointment) {
    throw new Error("Agendamento não encontrado.");
  }
  if (!appointment.patientPhone) {
    throw new Error("O paciente não possui telefone cadastrado para WhatsApp.");
  }

  let anamnesisLink: string | null = null;
  if (!(await patientHasAnyAnamnesis(Number(appointment.patientId)))) {
    const template = getDefaultAnamnesisDefinition({ biologicalSex: appointment.biologicalSex, gender: appointment.gender });
    const link = await createAnamnesisShareLink({
      patientId: Number(appointment.patientId),
      title: `Anamnese de ${appointment.patientName}`,
      templateName: template.name,
      anamnesisDate: new Date(appointment.scheduledAt).toISOString().slice(0, 10),
      questions: template.questions,
      expiresInDays: 7,
    }, userId, baseUrl);
    anamnesisLink = link.shareUrl;
  }

  const message = customMessage?.trim() || buildAppointmentReminderWhatsappMessage({
    patientName: appointment.patientName,
    scheduledAt: appointment.scheduledAt,
    doctorName: appointment.doctorName,
    room: appointment.room,
    anamnesisLink,
  });

  const result = await sendWhatsAppMessage(appointment.patientPhone, message);
  return {
    success: true,
    appointmentId,
    patientId: Number(appointment.patientId),
    patientName: appointment.patientName,
    anamnesisLink,
    ...result,
  };
}

export async function sendTomorrowAppointmentReminders(userId: number, baseUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const end = new Date(tomorrow);
  end.setHours(23, 59, 59, 999);

  const rows = unwrapRows<any>(await db.execute(sql`
    select a.id
    from appointments a
    inner join patients p on p.id = a.patientId
    where a.scheduledAt >= ${tomorrow}
      and a.scheduledAt <= ${end}
      and a.status not in ('cancelada', 'concluida', 'falta')
      and coalesce(trim(p.phone), '') <> ''
    order by a.scheduledAt asc, a.id asc
  `));

  const results = [];
  for (const row of rows) {
    try {
      results.push(await sendAppointmentReminderViaWhatsApp(Number(row.id), userId, baseUrl));
    } catch (error: any) {
      results.push({ success: false, appointmentId: Number(row.id), error: error?.message || "Falha ao enviar lembrete." });
    }
  }

  return {
    success: true,
    total: results.length,
    sent: results.filter((item: any) => item.success).length,
    failed: results.filter((item: any) => !item.success).length,
    results,
  };
}

export async function createPatientAnamnesis(
  data: {
    patientId: number;
    title: string;
    templateName?: string;
    anamnesisDate?: string;
    respondentName?: string | null;
    questions: Array<Record<string, any>>;
    answers: Record<string, string>;
    profilePhotoBase64?: string | null;
    profilePhotoMimeType?: string | null;
    profilePhotoFileName?: string | null;
    profilePhotoDeclarationAccepted?: boolean;
  },
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  let profilePhotoUrl: string | null = null;
  let profilePhotoMimeType: string | null = null;

  if (data.profilePhotoBase64) {
    if (!data.profilePhotoDeclarationAccepted) {
      throw new Error("Confirme que a foto enviada é da própria pessoa.");
    }

    const uploaded = await uploadPatientPhoto({
      patientId: data.patientId,
      category: "perfil",
      description: "Foto de perfil enviada na anamnese",
      base64: data.profilePhotoBase64,
      mimeType: data.profilePhotoMimeType ?? "image/jpeg",
      originalFileName: data.profilePhotoFileName ?? "perfil-anamnese.jpg",
      mediaSource: "patient",
      takenAt: data.anamnesisDate ?? new Date().toISOString(),
    }, userId);

    profilePhotoUrl = uploaded.photoUrl ?? null;
    profilePhotoMimeType = uploaded.mimeType ?? null;
  }

  const token = crypto.randomBytes(18).toString("hex");
  const result = await db.execute(sql`
    insert into anamnesis_share_links (
      patientId,
      token,
      title,
      templateName,
      anamnesisDate,
      questionsJson,
      submittedAnswers,
      respondentName,
      source,
      profilePhotoUrl,
      profilePhotoMimeType,
      profilePhotoDeclarationAccepted,
      isActive,
      expiresAt,
      submittedAt,
      createdBy
    )
    values (
      ${data.patientId},
      ${token},
      ${data.title},
      ${data.templateName ?? null},
      ${data.anamnesisDate ? new Date(data.anamnesisDate) : new Date()},
      ${JSON.stringify(data.questions ?? [])},
      ${JSON.stringify(data.answers ?? {})},
      ${data.respondentName ?? null},
      ${"internal"},
      ${profilePhotoUrl},
      ${profilePhotoMimeType},
      ${data.profilePhotoDeclarationAccepted ? 1 : 0},
      1,
      ${new Date("2099-12-31T23:59:59Z")},
      now(),
      ${userId}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId ?? null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from anamnesis_share_links
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function submitAnamnesisShareLink(
  token: string,
  answers: Record<string, string>,
  respondentName?: string | null,
  profilePhoto?: {
    base64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    declarationAccepted?: boolean;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const link = await getAnamnesisShareLinkByToken(token);
  if (!link) {
    throw new Error("Link da anamnese não encontrado ou expirado.");
  }

  let profilePhotoUrl = link.profilePhotoUrl ?? null;
  let profilePhotoMimeType = link.profilePhotoMimeType ?? null;
  let declarationAccepted = Number(link.profilePhotoDeclarationAccepted ?? 0) === 1;

  if (profilePhoto?.base64) {
    if (!profilePhoto.declarationAccepted) {
      throw new Error("Confirme que a foto enviada é da própria pessoa.");
    }

    const uploaded = await uploadPatientPhoto({
      patientId: link.patientId,
      category: "perfil",
      description: "Foto de perfil enviada na anamnese",
      base64: profilePhoto.base64,
      mimeType: profilePhoto.mimeType ?? "image/jpeg",
      originalFileName: profilePhoto.fileName ?? "perfil-anamnese.jpg",
      mediaSource: "patient",
      takenAt: link.anamnesisDate ?? new Date().toISOString(),
    }, Number(link.createdBy ?? 1));

    profilePhotoUrl = uploaded.photoUrl ?? null;
    profilePhotoMimeType = uploaded.mimeType ?? null;
    declarationAccepted = true;
  }

  await db.execute(sql`
    update anamnesis_share_links
    set
      submittedAnswers = ${JSON.stringify(answers ?? {})},
      respondentName = ${respondentName ?? null},
      profilePhotoUrl = ${profilePhotoUrl},
      profilePhotoMimeType = ${profilePhotoMimeType},
      profilePhotoDeclarationAccepted = ${declarationAccepted ? 1 : 0},
      submittedAt = now()
    where id = ${link.id}
  `);

  return { success: true };
}

export async function deletePatientPhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    delete from patient_photos
    where id = ${photoId}
  `);
  return { success: true };
}

export async function getPatientDocuments(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patient_documents
    where patientId = ${patientId}
    order by createdAt desc, id desc
  `));

  return rows.map(normalizeDocumentRow);
}

export async function getPatientHistory(patientId: number) {
  const db = await getDb();
  if (!db) return { appointments: [], records: [], prescriptions: [], documents: [], photos: [] };

  const appointments = unwrapRows<any>(await db.execute(sql`
    select a.*, u.name as doctorName
    from appointments a
    left join users u on u.id = a.doctorId
    where a.patientId = ${patientId}
    order by a.scheduledAt desc, a.id desc
  `));

  const records = unwrapRows<any>(await db.execute(sql`
    select mr.*, u.name as doctorName
    from medical_records mr
    left join users u on u.id = mr.doctorId
    where mr.patientId = ${patientId}
    order by coalesce(mr.date, mr.createdAt) desc, mr.id desc
  `));

  const prescriptions = unwrapRows<any>(await db.execute(sql`
    select p.*, u.name as doctorName
    from prescriptions p
    left join users u on u.id = p.doctorId
    where p.patientId = ${patientId}
    order by coalesce(p.date, p.createdAt) desc, p.id desc
  `));

  const documents = await getPatientDocuments(patientId);
  const photos = await getPatientPhotos(patientId);

  return {
    appointments,
    records,
    prescriptions,
    documents,
    photos,
  };
}

export async function searchTussCatalog(query?: string, limit: number = 60) {
  const catalog = await loadTussCatalog();
  if (!catalog.length) return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return catalog.slice(0, limit);
  }

  const matches = catalog.filter((entry) => {
    const haystack = normalizeSearchText(`${entry.code} ${entry.name} ${entry.description ?? ""}`);
    return haystack.includes(normalizedQuery);
  });

  return matches.slice(0, limit);
}

// --- CHAT --------------------------------------------------------------------
export async function getChatMessages(channelId: string, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`chat_messages`)
    .where(eq(sql`channelId`, channelId))
    .orderBy(desc(sql`createdAt`))
    .limit(limit);
}

export async function createChatMessage(channelId: string, userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`chat_messages`).values({
    channelId,
    senderId: userId,
    content,
    messageType: 'text',
  });
  return result[0];
}

// --- CLINIC ------------------------------------------------------------------
export async function getClinicSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`clinic_settings`).limit(1);
  return result[0];
}

export async function updateClinicSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getClinicSettings();
  
  if (existing) {
    await db.update(sql`clinic_settings`).set(data).where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`clinic_settings`).values(data);
  }
  
  return { success: true };
}

// --- FISCAL ------------------------------------------------------------------
function decimalToCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function centsToDecimal(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(numeric)) return 0;
  return Number((numeric / 100).toFixed(2));
}

const DEFAULT_FISCAL_SERVICE_DESCRIPTION =
  "Referente a procedimentos médicos ambulatoriais.";
const DEFAULT_FISCAL_LEGAL_TEXT =
  "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS.";

const REGIME_TRIBUTARIO_ENUM = ["simples_nacional", "lucro_presumido", "lucro_real", "mei"] as const;
type RegimeTributario = typeof REGIME_TRIBUTARIO_ENUM[number];

function normalizeRegimeTributario(value: unknown): RegimeTributario | null {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  // exact match
  if (REGIME_TRIBUTARIO_ENUM.includes(s as RegimeTributario)) return s as RegimeTributario;
  // fuzzy match for human-readable values sent from frontend
  if (s.includes("simples")) return "simples_nacional";
  if (s.includes("presumido")) return "lucro_presumido";
  if (s.includes("real")) return "lucro_real";
  if (s.includes("mei")) return "mei";
  return "simples_nacional"; // safe default
}

function normalizeDecimalInput(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  let s = String(value).trim();
  // Brazilian format "1.234,56": only strip dots when a comma is also present
  // (dots are thousand separators in pt-BR; if no comma, dot is the decimal separator)
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number.parseFloat(s);
  if (!Number.isFinite(parsed)) return null;

  return Number(parsed.toFixed(4));
}

function inferDocumentType(document: string | null | undefined): "cpf" | "cnpj" {
  const digits = String(document ?? "").replace(/\D/g, "");
  return digits.length > 11 ? "cnpj" : "cpf";
}

function formatPaymentDescription(formaPagamento: string | null | undefined, detalhesPagamento: string | null | undefined) {
  const normalized = String(formaPagamento ?? "").trim().toLowerCase();
  const details = String(detalhesPagamento ?? "").trim();

  const labels: Record<string, string> = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    cartao_credito: "Cartão de crédito",
    cartao_debito: "Cartão de débito",
    boleto: "Boleto",
    transferencia: "Transferência bancária",
    financiamento: "Financiamento",
    outro: "Outro",
  };

  const baseLabel = labels[normalized] ?? (normalized ? normalized.replace(/_/g, " ") : "Forma de pagamento não informada");
  return details ? `${baseLabel} ${details}`.trim() : baseLabel;
}

function buildFiscalServiceDescription(
  fiscal: any,
  overrides: {
    descricaoServico?: string | null;
    complementoDescricao?: string | null;
    formaPagamento?: string | null;
    detalhesPagamento?: string | null;
  },
) {
  const baseDescription = String(
    overrides.descricaoServico ||
      fiscal?.descricaoServicoPadrao ||
      fiscal?.descricaoServico ||
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
  ).trim();
  const legalText = String(fiscal?.textoLegalFixo || DEFAULT_FISCAL_LEGAL_TEXT).trim();
  const paymentDescription = formatPaymentDescription(
    overrides.formaPagamento,
    overrides.detalhesPagamento,
  );
  const parts = [
    baseDescription || DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    `Forma de Pagamento: ${paymentDescription}`,
    legalText || DEFAULT_FISCAL_LEGAL_TEXT,
  ];

  const complemento = String(overrides.complementoDescricao || "").trim();
  if (complemento) {
    parts.push(`Informações complementares: ${complemento}`);
  }

  return parts.filter(Boolean).join("\n");
}

function parseBudgetItems(raw: unknown) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeNfseRow(row: any) {
  return {
    ...row,
    tomadorDocumento: row.tomadorCpfCnpj ?? row.tomadorDocumento ?? "",
    tomadorTipoDocumento: row.tomadorTipoDocumento ?? inferDocumentType(row.tomadorCpfCnpj),
    valorServico: decimalToCents(row.valorServicos ?? row.valorServico),
    valorDeducao: decimalToCents(row.valorDeducoes ?? row.valorDeducao),
    valorDescontoIncondicionado: decimalToCents(row.descontoIncondicionado ?? row.valorDescontoIncondicionado),
    valorLiquido: decimalToCents(row.valorLiquidoNfse ?? row.valorLiquido),
  };
}

async function logNfseEvent(
  nfseId: number,
  event: string,
  params: {
    status?: string | null;
    message?: string | null;
    xmlRequest?: string | null;
    xmlResponse?: string | null;
    userId?: number | null;
  } = {},
) {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    insert into nfse_events (nfseId, event, status, message, xmlRequest, xmlResponse, userId)
    values (
      ${nfseId}, ${event},
      ${params.status ?? null}, ${params.message ?? null},
      ${params.xmlRequest ?? null}, ${params.xmlResponse ?? null},
      ${params.userId ?? null}
    )
  `);
}

export async function getFiscalSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const rows = unwrapRows<any>(await db.execute(sql`select * from fiscal_config limit 1`));
  const fiscal = rows[0];
  if (!fiscal) return null;

  return {
    ...fiscal,
    optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
    regimeApuracao: fiscal.regimeApuracao ?? fiscal.regimeTributario ?? null,
    descricaoServicoPadrao:
      fiscal.descricaoServicoPadrao ??
      fiscal.descricaoServico ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    textoLegalFixo: fiscal.textoLegalFixo ?? DEFAULT_FISCAL_LEGAL_TEXT,
    municipioIncidencia: fiscal.municipioIncidencia ?? fiscal.municipio ?? null,
    ufIncidencia: fiscal.ufIncidencia ?? fiscal.uf ?? null,
    provedor: fiscal.provedor ?? "nfse_nacional",
    certificadoConfigurado: Boolean(fiscal.certificadoDigital && fiscal.certificadoSenha),
    certificadoDigital: maskStoredValue(fiscal.certificadoDigital),
    certificadoSenha: maskStoredValue(fiscal.certificadoSenha),
  };
}

export async function upsertFiscalSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getFiscalSettings();
  const payload = {
    cnpj: data.cnpj ?? null,
    razaoSocial: data.razaoSocial ?? null,
    nomeFantasia: data.nomeFantasia ?? null,
    inscricaoMunicipal: data.inscricaoMunicipal ?? null,
    inscricaoEstadual: data.inscricaoEstadual ?? null,
    codigoMunicipio: data.codigoMunicipio ?? null,
    municipio: data.municipio ?? null,
    uf: data.uf ?? null,
    cep: data.cep ?? null,
    logradouro: data.logradouro ?? null,
    numero: data.numero ?? null,
    complemento: data.complemento ?? null,
    bairro: data.bairro ?? null,
    telefone: data.telefone ?? null,
    email: data.email ?? null,
    optanteSimplesNacional: data.optanteSimplesNacional ? 1 : 0,
    regimeTributario: normalizeRegimeTributario(data.regimeTributario ?? data.regimeApuracao),
    regimeApuracao: data.regimeApuracao ?? data.regimeTributario ?? null,
    codigoTributacaoNacional: data.codigoTributacaoNacional ?? data.codigoServico ?? null,
    descricaoTributacao: data.descricaoTributacao ?? null,
    itemNbs: data.itemNbs ?? null,
    descricaoNbs: data.descricaoNbs ?? null,
    aliquotaSimplesNacional: normalizeDecimalInput(data.aliquotaSimplesNacional),
    aliquotaIss: normalizeDecimalInput(data.aliquotaIss),
    descricaoServico:
      data.descricaoServico ??
      data.descricaoServicoPadrao ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    descricaoServicoPadrao:
      data.descricaoServicoPadrao ??
      data.descricaoServico ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    textoLegalFixo: data.textoLegalFixo ?? DEFAULT_FISCAL_LEGAL_TEXT,
    municipioIncidencia: data.municipioIncidencia ?? data.municipio ?? null,
    ufIncidencia: data.ufIncidencia ?? data.uf ?? null,
    provedor: data.provedor ?? "nfse_nacional",
    ambiente: data.ambiente ?? existing?.ambiente ?? "homologacao",
    ativo: data.cnpj && data.razaoSocial ? 1 : 0,
    codigoServico: data.codigoServico ?? data.codigoTributacaoNacional ?? null,
    itemListaServico: data.itemListaServico ?? null,
    cnaeServico: data.cnaeServico ?? null,
    webserviceUrl: data.webserviceUrl ?? null,
  };
  
  if (existing) {
    await db.execute(sql`
      update fiscal_config set
        cnpj = ${payload.cnpj}, razaoSocial = ${payload.razaoSocial}, nomeFantasia = ${payload.nomeFantasia},
        inscricaoMunicipal = ${payload.inscricaoMunicipal}, inscricaoEstadual = ${payload.inscricaoEstadual},
        codigoMunicipio = ${payload.codigoMunicipio}, municipio = ${payload.municipio}, uf = ${payload.uf},
        cep = ${payload.cep}, logradouro = ${payload.logradouro}, numero = ${payload.numero},
        complemento = ${payload.complemento}, bairro = ${payload.bairro},
        telefone = ${payload.telefone}, email = ${payload.email},
        optanteSimplesNacional = ${payload.optanteSimplesNacional},
        regimeTributario = ${payload.regimeTributario}, regimeApuracao = ${payload.regimeApuracao},
        codigoTributacaoNacional = ${payload.codigoTributacaoNacional}, codigoServico = ${payload.codigoServico},
        itemListaServico = ${payload.itemListaServico}, cnaeServico = ${payload.cnaeServico},
        descricaoTributacao = ${payload.descricaoTributacao},
        itemNbs = ${payload.itemNbs}, descricaoNbs = ${payload.descricaoNbs},
        aliquotaSimplesNacional = ${payload.aliquotaSimplesNacional}, aliquotaIss = ${payload.aliquotaIss},
        descricaoServico = ${payload.descricaoServico}, descricaoServicoPadrao = ${payload.descricaoServicoPadrao},
        textoLegalFixo = ${payload.textoLegalFixo},
        municipioIncidencia = ${payload.municipioIncidencia}, ufIncidencia = ${payload.ufIncidencia},
        provedor = ${payload.provedor}, ambiente = ${payload.ambiente}, ativo = ${payload.ativo},
        webserviceUrl = ${payload.webserviceUrl}
      where id = ${existing.id}
    `);
  } else {
    await db.execute(sql`
      insert into fiscal_config (
        cnpj, razaoSocial, nomeFantasia, inscricaoMunicipal, inscricaoEstadual,
        codigoMunicipio, municipio, uf, cep, logradouro, numero, complemento, bairro,
        telefone, email, optanteSimplesNacional,
        regimeTributario, regimeApuracao, codigoTributacaoNacional, codigoServico,
        itemListaServico, cnaeServico, descricaoTributacao,
        itemNbs, descricaoNbs, aliquotaSimplesNacional, aliquotaIss,
        descricaoServico, descricaoServicoPadrao, textoLegalFixo,
        municipioIncidencia, ufIncidencia, provedor, ambiente, ativo, webserviceUrl
      ) values (
        ${payload.cnpj}, ${payload.razaoSocial}, ${payload.nomeFantasia},
        ${payload.inscricaoMunicipal}, ${payload.inscricaoEstadual},
        ${payload.codigoMunicipio}, ${payload.municipio}, ${payload.uf},
        ${payload.cep}, ${payload.logradouro}, ${payload.numero},
        ${payload.complemento}, ${payload.bairro},
        ${payload.telefone}, ${payload.email}, ${payload.optanteSimplesNacional},
        ${payload.regimeTributario}, ${payload.regimeApuracao},
        ${payload.codigoTributacaoNacional}, ${payload.codigoServico},
        ${payload.itemListaServico}, ${payload.cnaeServico}, ${payload.descricaoTributacao},
        ${payload.itemNbs}, ${payload.descricaoNbs},
        ${payload.aliquotaSimplesNacional}, ${payload.aliquotaIss},
        ${payload.descricaoServico}, ${payload.descricaoServicoPadrao}, ${payload.textoLegalFixo},
        ${payload.municipioIncidencia}, ${payload.ufIncidencia},
        ${payload.provedor}, ${payload.ambiente}, ${payload.ativo}, ${payload.webserviceUrl}
      )
    `);
  }
  
  return { success: true };
}

async function getRawFiscalConfig() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from fiscal_config
    limit 1
  `));

  return rows[0] ?? null;
}

export async function saveFiscalCertificate(data: {
  fileName: string;
  mimeType?: string | null;
  fileBase64: string;
  password: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getRawFiscalConfig();
  if (!existing?.id) {
    throw new Error("Salve primeiro os dados fiscais da clínica antes de enviar o certificado A1.");
  }

  const cleanedBase64 = String(data.fileBase64 ?? "").trim();
  if (!cleanedBase64) {
    throw new Error("Arquivo do certificado inválido.");
  }

  await db.execute(sql`
    update fiscal_config set
      certificadoDigital = ${encryptSensitiveValue(cleanedBase64)},
      certificadoSenha = ${encryptSensitiveValue(data.password)},
      certificadoArquivoNome = ${data.fileName},
      certificadoMimeType = ${data.mimeType ?? null},
      certificadoAtualizadoEm = NOW()
    where id = ${existing.id}
  `);

  return {
    success: true,
    certificadoConfigurado: true,
    fileName: data.fileName,
  };
}

export async function testFiscalNationalApi(ambiente?: "homologacao" | "producao") {
  const fiscal = await getRawFiscalConfig();
  if (!fiscal) {
    throw new Error("Configure primeiro os dados fiscais da clínica.");
  }

  return testNationalApiConnection(
    {
      ...fiscal,
      ambiente: ambiente ?? fiscal.ambiente ?? "homologacao",
      optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
    },
    ambiente ?? fiscal.ambiente ?? "homologacao",
  );
}

export async function syncFiscalMunicipalParameters(ambiente?: "homologacao" | "producao") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const fiscal = await getRawFiscalConfig();
  if (!fiscal?.codigoMunicipio) {
    throw new Error("Informe o código IBGE do município para sincronizar os parâmetros oficiais.");
  }

  const params = await fetchMunicipalParameters(
    fiscal.codigoMunicipio,
    ambiente ?? fiscal.ambiente ?? "homologacao",
  );

  const source = params?.convenio || params?.prestador || params?.parametros || params?.data || params;

  if (source && typeof source === "object") {
    await db.execute(sql`
      update fiscal_config set
        municipio = ${source.municipio ?? fiscal.municipio ?? null},
        uf = ${source.uf ?? fiscal.uf ?? null},
        codigoMunicipio = ${source.codigoMunicipio ?? fiscal.codigoMunicipio ?? null},
        codigoServico = ${source.codigoServico ?? fiscal.codigoServico ?? null},
        itemListaServico = ${source.itemListaServico ?? fiscal.itemListaServico ?? null},
        webserviceUrl = ${source.webserviceUrl ?? fiscal.webserviceUrl ?? null}
      where id = ${fiscal.id}
    `);
  }

  return {
    success: true,
    parametros: params,
  };
}

// --- NFSE --------------------------------------------------------------------
export async function listNfse() {
  const db = await getDb();
  if (!db) return [];
  
  const rows = unwrapRows<any>(await db.execute(sql`select * from nfse order by createdAt desc`));
  return rows.map(normalizeNfseRow);
}

export async function createNfse(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const fiscal = await getFiscalSettings();
  if (!fiscal) {
    throw new Error("Configure os dados fiscais da clínica antes de criar a NFS-e.");
  }

  const numeroRps = Number(fiscal.numeracaoSequencial || 1);
  const valorServicos = centsToDecimal(data.valorServico);
  const valorDeducoes = centsToDecimal(data.valorDeducao);
  const descontoIncondicionado = centsToDecimal(data.valorDescontoIncondicionado);
  const baseCalculo = Math.max(0, Number((valorServicos - valorDeducoes - descontoIncondicionado).toFixed(2)));
  const aliquotaIssPercent = Number.parseFloat(String(fiscal.aliquotaIss ?? 0));
  const aliquota = Number.isFinite(aliquotaIssPercent) ? Number((aliquotaIssPercent / 100).toFixed(4)) : 0;
  const valorIss = Number((baseCalculo * aliquota).toFixed(2));
  const valorLiquidoNfse = Number(baseCalculo.toFixed(2));
  const dataCompetencia = data.dataCompetencia || new Date().toISOString().slice(0, 10);
  const descricaoServico = buildFiscalServiceDescription(fiscal, data);
  const tomadorEndereco = JSON.stringify({
    cep: data.tomadorCep || null,
    municipio: data.tomadorMunicipio || null,
    uf: data.tomadorUf || null,
    bairro: data.tomadorBairro || null,
    logradouro: data.tomadorLogradouro || null,
    numero: data.tomadorNumero || null,
    complemento: data.tomadorComplemento || null,
  });
  
  const insertResult: any = await db.execute(sql`
    insert into nfse (
      patientId, budgetId,
      tomadorNome, tomadorCpfCnpj, tomadorTipoDocumento, tomadorEmail, tomadorEndereco,
      numeroRps, dataEmissao, dataCompetencia,
      descricaoServico, codigoServico, itemListaServico, cnaeServico, codigoMunicipioIncidencia,
      valorServicos, valorDeducoes, valorIss, baseCalculo, aliquota, valorLiquidoNfse,
      descontoIncondicionado, formaPagamento, detalhesPagamento,
      ambiente, enviadoPorId, status
    ) values (
      ${data.patientId ?? null}, ${data.budgetId ?? null},
      ${data.tomadorNome}, ${data.tomadorDocumento},
      ${data.tomadorTipoDocumento ?? inferDocumentType(data.tomadorDocumento)},
      ${data.tomadorEmail ?? null}, ${tomadorEndereco},
      ${numeroRps}, NOW(), ${dataCompetencia},
      ${descricaoServico},
      ${fiscal.codigoServico ?? fiscal.codigoTributacaoNacional ?? null},
      ${fiscal.itemListaServico ?? null}, ${fiscal.cnaeServico ?? null},
      ${fiscal.codigoMunicipio ?? null},
      ${valorServicos}, ${valorDeducoes}, ${valorIss}, ${baseCalculo}, ${aliquota}, ${valorLiquidoNfse},
      ${descontoIncondicionado}, ${data.formaPagamento ?? null}, ${data.detalhesPagamento ?? null},
      ${data.ambiente ?? fiscal.ambiente ?? "homologacao"}, ${userId}, ${"rascunho"}
    )
  `);

  const insertedId = insertResult?.insertId ?? insertResult?.[0]?.insertId;
  if (!insertedId) {
    throw new Error("Não foi possível identificar o rascunho da NFS-e criado.");
  }

  await db.execute(sql`
    update fiscal_config set numeracaoSequencial = ${numeroRps + 1} where id = ${fiscal.id}
  `);

  const insertedRows = unwrapRows<any>(await db.execute(sql`
    select * from nfse where id = ${insertedId} limit 1
  `));

  return normalizeNfseRow(insertedRows[0]);
}

export async function emitNfse(nfseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = unwrapRows<any>(await db.execute(sql`select * from nfse where id = ${nfseId} limit 1`));
  if (!current[0]) throw new Error("NFS-e não encontrada.");

  const pendingMessage =
    "A emissão automática no Emissor Nacional ainda não está integrada. O rascunho foi preparado para conferência e emissão manual no portal nfse.gov.br.";

  await db.execute(sql`
    update nfse set
      status = ${'aguardando'},
      erroMensagem = ${pendingMessage},
      tentativas = tentativas + 1
    where id = ${nfseId}
  `);

  return {
    success: true,
    status: 'aguardando',
    message: pendingMessage,
  };
}

export async function cancelNfse(nfseId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.execute(sql`
    update nfse set
      status = ${'cancelada'},
      motivoCancelamento = ${reason},
      dataCancelamento = NOW()
    where id = ${nfseId}
  `);
  return { success: true };
}

export async function emitNfseThroughNationalApi(nfseId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const current = unwrapRows<any>(await db.execute(sql`select * from nfse where id = ${nfseId} limit 1`));
  if (!current[0]) throw new Error("NFS-e não encontrada.");

  const fiscal = await getRawFiscalConfig();
  if (!fiscal) {
    throw new Error("Configure os dados fiscais da clínica antes de emitir a NFS-e.");
  }

  try {
    const result = await emitNfseWithNationalApi(
      {
        ...fiscal,
        optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
      },
      current[0] as any,
    );

    await db.execute(sql`
      update nfse set
        status = ${result.status},
        numeroNfse = ${result.numeroNfse ?? null},
        chaveAcesso = ${result.chaveAcesso ?? null},
        protocolo = ${result.protocolo ?? null},
        numeroDps = ${result.numeroDps ?? null},
        codigoVerificacao = ${result.codigoVerificacao ?? null},
        linkNfse = ${result.linkNfse ?? null},
        xmlEnviado = ${result.xmlEnviado},
        xmlRetorno = ${result.xmlRetorno},
        xmlNfse = ${result.xmlNfse},
        erroMensagem = null,
        tentativas = tentativas + 1,
        updatedAt = NOW()
      where id = ${nfseId}
    `);

    await logNfseEvent(nfseId, "emissao", {
      status: result.status,
      message: result.message,
      xmlRequest: result.xmlEnviado,
      xmlResponse: result.xmlRetorno,
      userId,
    });

    return {
      success: true,
      status: result.status,
      message: result.message,
      chaveAcesso: result.chaveAcesso,
      numeroNfse: result.numeroNfse,
      protocolo: result.protocolo,
      linkNfse: result.linkNfse,
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao emitir a NFS-e na API nacional.";

    await db.execute(sql`
      update nfse set
        status = ${'erro'},
        erroMensagem = ${message},
        tentativas = tentativas + 1,
        updatedAt = NOW()
      where id = ${nfseId}
    `);

    await logNfseEvent(nfseId, "erro", {
      status: "erro",
      message,
      userId,
    });

    throw new Error(message);
  }
}

// --- BUDGETS -----------------------------------------------------------------
export async function listBudgets() {
  const db = await getDb();
  if (!db) return [];

  const budgets = unwrapRows<any>(await db.execute(sql`
    select
      b.*,
      p.fullName as patientName,
      p.email as patientEmail,
      p.phone as patientPhone
    from budgets b
    left join patients p on p.id = b.patientId
    order by b.createdAt desc
  `));

  const budgetIds = budgets.map((budget) => Number(budget.id)).filter(Boolean);
  const latestNfseByBudgetId = new Map<number, any>();

  if (budgetIds.length > 0) {
    const nfseRows = unwrapRows<any>(await db.execute(sql`
      select *
      from nfse
      where budgetId in (${sql.join(budgetIds.map((id) => sql`${id}`), sql`, `)})
      order by createdAt desc, id desc
    `));

    for (const nfse of nfseRows) {
      const currentBudgetId = Number(nfse.budgetId || 0);
      if (!currentBudgetId || latestNfseByBudgetId.has(currentBudgetId)) continue;
      latestNfseByBudgetId.set(currentBudgetId, normalizeNfseRow(nfse));
    }
  }

  return budgets.map((budget) => {
    const total = Number.parseFloat(String(budget.total ?? 0));
    const subtotal = Number.parseFloat(String(budget.subtotal ?? total));
    const discount = Number.parseFloat(String(budget.discount ?? 0));

    return {
      ...budget,
      items: parseBudgetItems(budget.items),
      totalInCents: decimalToCents(total),
      subtotalInCents: decimalToCents(subtotal),
      discountInCents: decimalToCents(discount),
      patientName: budget.patientName ?? `Paciente #${budget.patientId}`,
      patientEmail: budget.patientEmail ?? null,
      patientPhone: budget.patientPhone ?? null,
      latestNfse: latestNfseByBudgetId.get(Number(budget.id)) ?? null,
    };
  });
}

export async function createBudget(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const resolvedItems: any[] = [];

  for (const [index, item] of (data.items ?? []).entries()) {
    const procedure = await getProcedureById(item.procedureId);
    const price = await getProcedurePrice(item.procedureId, item.areaId, item.complexity);
    const areas = await getProcedureAreas(item.procedureId);
    const area = areas.find((entry: any) => Number(entry.id) === Number(item.areaId));

    if (!procedure || !price || !area) {
      throw new Error(`Não foi possível montar o item ${index + 1} do orçamento.`);
    }

    const quantity = Number(item.quantity || 1);
    const unitPriceInCents = Number(price.priceInCents || 0);

    resolvedItems.push({
      procedureId: item.procedureId,
      procedureName: procedure.name,
      areaId: item.areaId,
      areaName: area.areaName,
      complexity: item.complexity,
      quantity,
      unitPriceInCents,
      subtotalInCents: unitPriceInCents * quantity,
    });
  }

  const subtotalInCents = resolvedItems.reduce((sum, item) => sum + item.subtotalInCents, 0);
  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 10);
  const title =
    resolvedItems.length === 1
      ? resolvedItems[0].procedureName
      : `${resolvedItems.length} procedimentos`;

  const result = await db.insert(sql`budgets`).values({
    patientId: data.patientId,
    doctorId: userId,
    date: today.toISOString().slice(0, 10),
    validUntil: validUntil.toISOString().slice(0, 10),
    title,
    items: JSON.stringify(resolvedItems),
    subtotal: centsToDecimal(subtotalInCents),
    discount: 0,
    total: centsToDecimal(subtotalInCents),
    status: 'rascunho',
    notes: data.clinicalNotes ?? null,
  });

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from budgets
    where id = ${insertedId}
    limit 1
  `));

  return {
    ...rows[0],
    items: resolvedItems,
    totalInCents: subtotalInCents,
    subtotalInCents,
    discountInCents: 0,
  };
}

export async function emitBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'enviado' }).where(eq(sql`id`, budgetId));
  return { success: true };
}

export async function approveBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'aprovado' }).where(eq(sql`id`, budgetId));
  return { success: true };
}

export async function emitBudgetNfse(
  budgetId: number,
  data: {
    formaPagamento: string;
    detalhesPagamento?: string | null;
    dataCompetencia?: string | null;
    ambiente?: "homologacao" | "producao";
  },
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const budgets = unwrapRows<any>(await db.execute(sql`
    select *
    from budgets
    where id = ${budgetId}
    limit 1
  `));
  const budget = budgets[0];

  if (!budget) {
    throw new Error("Orçamento não encontrado.");
  }

  if (budget.status !== "aprovado") {
    throw new Error("A NFS-e só pode ser emitida após a aprovação do orçamento.");
  }

  const existingNfseRows = unwrapRows<any>(await db.execute(sql`
    select *
    from nfse
    where budgetId = ${budgetId}
    order by createdAt desc, id desc
    limit 1
  `));
  const existingNfse = existingNfseRows[0];

  if (existingNfse?.status === "autorizada") {
    return {
      success: true,
      reused: true,
      message: "A NFS-e deste orçamento já está autorizada.",
      nfse: normalizeNfseRow(existingNfse),
    };
  }

  if (existingNfse?.status === "rascunho" || existingNfse?.status === "erro") {
    const emission = await emitNfseThroughNationalApi(Number(existingNfse.id), userId);
    const refreshed = unwrapRows<any>(await db.execute(sql`
      select *
      from nfse
      where id = ${existingNfse.id}
      limit 1
    `));

    return {
      ...emission,
      nfse: refreshed[0] ? normalizeNfseRow(refreshed[0]) : null,
    };
  }

  const patient = await getPatientById(Number(budget.patientId));
  if (!patient) {
    throw new Error("Paciente vinculado ao orçamento não foi encontrado.");
  }

  const created = await createNfse(
    {
      budgetId,
      patientId: budget.patientId,
      tomadorDocumento: patient.cpf || "",
      tomadorTipoDocumento: inferDocumentType(patient.cpf || ""),
      tomadorNome: patient.name || patient.fullName || `Paciente #${budget.patientId}`,
      tomadorEmail: patient.email || undefined,
      tomadorTelefone: patient.phone || undefined,
      tomadorCep: patient.zipCode || undefined,
      tomadorMunicipio: patient.city || undefined,
      tomadorUf: patient.state || undefined,
      tomadorBairro: patient.neighborhood || undefined,
      tomadorLogradouro: typeof patient.address === "string" ? patient.address : "",
      tomadorNumero: undefined,
      tomadorComplemento: undefined,
      descricaoServico: undefined,
      complementoDescricao: budget.notes || undefined,
      valorServico: decimalToCents(Number.parseFloat(String(budget.total ?? 0))),
      formaPagamento: data.formaPagamento,
      detalhesPagamento: data.detalhesPagamento || undefined,
      dataCompetencia: data.dataCompetencia || budget.date,
      ambiente: data.ambiente,
    },
    userId,
  );

  const emission = await emitNfseThroughNationalApi(Number(created.id), userId);
  const refreshed = unwrapRows<any>(await db.execute(sql`
    select *
    from nfse
    where id = ${created.id}
    limit 1
  `));

  return {
    ...emission,
    nfse: refreshed[0] ? normalizeNfseRow(refreshed[0]) : normalizeNfseRow(created),
  };
}

// --- CRM ---------------------------------------------------------------------
export async function listCrmIndications(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`crm_indications`).orderBy(desc(sql`createdAt`)).limit(limit);
}

export async function createCrmIndication(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`crm_indications`).values({
    ...data,
    indicatedBy: userId,
    status: 'indicado',
  });
  return result[0];
}

export async function updateCrmIndication(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`crm_indications`).set(data).where(eq(sql`id`, id));
  return { success: true };
}

// --- SIGNATURES ---------------------------------------------------------------
export async function sendForSignature(
  documentId: number,
  documentType: string,
  userId: number,
  extra: {
    d4signDocumentKey?: string;
    d4signSafeKey?: string;
    status?: string;
    signatureType?: string;
    signedDocumentUrl?: string;
    webhookData?: any;
  } = {},
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`document_signatures`).values({
    resourceId: documentId,
    resourceType: documentType,
    doctorId: userId,
    d4signDocumentKey: extra.d4signDocumentKey,
    d4signSafeKey: extra.d4signSafeKey,
    status: extra.status || 'enviado',
    signatureType: extra.signatureType || 'eletronica',
    signedDocumentUrl: extra.signedDocumentUrl,
    webhookData: extra.webhookData ? JSON.stringify(extra.webhookData) : undefined,
  });
  return result[0];
}

// --- TEMPLATES ----------------------------------------------------------------
export async function listTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
}

export async function createTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

// --- MEDICAL RECORDS ----------------------------------------------------------
export async function listMedicalRecordTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
}

export async function listTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function createTemplateNormalized(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const result = await db.insert(sql`medical_record_templates`).values({
    name: data.name,
    specialty: data.specialty ?? null,
    description: data.description ?? null,
    sections: JSON.stringify(sections),
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function listMedicalRecordTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));
  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function listPrescriptionTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
      and specialty in ('Prescrição', 'Prescricao')
    order by name asc
  `));

  return rows.map((row: any) => ({
    ...normalizeTemplateRow(row),
    type: row.description || "simples",
  }));
}

export async function createPrescriptionTemplateNormalized(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.insert(sql`medical_record_templates`).values({
    name: data.name,
    specialty: "Prescrição",
    description: data.type || "simples",
    sections: JSON.stringify([
      {
        title: data.name,
        type: "richtext",
        content: data.content ?? "",
      },
    ]),
    active: true,
    createdBy: userId,
  });
  return result[0];
}

export async function listExamTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
      and specialty in ('Exame', 'Exames', 'Pedido de Exames')
    order by name asc
  `));

  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function createExamTemplateNormalized(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.insert(sql`medical_record_templates`).values({
    name: data.name,
    specialty: "Exame",
    description: data.specialty ?? null,
    sections: JSON.stringify([
      {
        title: data.name,
        type: "richtext",
        content: data.content ?? "",
      },
    ]),
    active: true,
    createdBy: userId,
  });
  return result[0];
}

// --- WHATSAPP -----------------------------------------------------------------
export async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  const service = await createWhatsAppService();
  if (!service) {
    throw new Error("A API oficial do WhatsApp ainda não foi configurada. Informe Token, Phone Number ID e Business Account ID da Meta.");
  }

  const result = await service.sendTextMessage(phoneNumber, message);
  return {
    success: true,
    provider: "meta_cloud_api",
    messageId: result?.messages?.[0]?.id ?? `msg_${Date.now()}`,
    raw: result,
  };
}

// --- AI -----------------------------------------------------------------------
export async function invokeAI(messages: any[]) {
  // Implementação com LLM
  return { role: 'assistant', content: 'Resposta da IA' };
}

// --- ADMIN --------------------------------------------------------------------
export async function getDoctors() {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from users
    where (role = 'medico' or role = 'admin')
      and status = 'active'
    order by name asc
  `));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, todayAppointments: 0, totalAppointments: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const patients = unwrapRows<any>(await db.execute(sql`select count(*) as count from patients`));
  const appointments = unwrapRows<any>(await db.execute(sql`select count(*) as count from appointments`));
  const todayAppointments = unwrapRows<any>(await db.execute(sql`
    select count(*) as count
    from appointments
    where scheduledAt >= ${todayStart}
      and scheduledAt <= ${todayEnd}
  `));

  const parseCount = (value: any) => Number(value?.count ?? value?.COUNT ?? value?.total ?? 0);

  return {
    totalPatients: parseCount(patients[0]),
    todayAppointments: parseCount(todayAppointments[0]),
    totalAppointments: parseCount(appointments[0]),
  };
}

export async function getAppointmentStats(from?: string, to?: string) {
  const db = await getDb();
  if (!db) return {};
  
  let query = db.select({
    status: sql`status`,
    count: sql`COUNT(*) as count`
  }).from(sql`appointments`).groupBy(sql`status`);
  
  if (from && to) {
    query = query.where(and(
      gte(sql`scheduledAt`, from),
      lte(sql`scheduledAt`, to)
    ));
  }
  
  return query;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`audit_logs`).orderBy(desc(sql`createdAt`)).limit(limit);
}

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`permissions`).where(eq(sql`userId`, userId));
}

export async function setUserPermission(userId: number, module: string, permission: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await db.select().from(sql`permissions`)
    .where(and(eq(sql`userId`, userId), eq(sql`module`, module)))
    .limit(1);
  
  if (existing && existing[0]) {
    await db.update(sql`permissions`)
      .set(permission)
      .where(eq(sql`id`, existing[0].id));
  } else {
    await db.insert(sql`permissions`).values({
      userId,
      module,
      ...permission,
    });
  }
  
  return { success: true };
}

export async function updateUserProfile(userId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const normalizedEmail = data.email ? String(data.email).trim().toLowerCase() : null;
  if (normalizedEmail) {
    const existingUsers = unwrapRows<any>(await db.execute(sql`
      select id
      from users
      where email = ${normalizedEmail}
        and id <> ${userId}
      limit 1
    `));

    if (existingUsers[0]) {
      throw new Error("Já existe outro usuário com este e-mail.");
    }
  }

  const name = data.name ? String(data.name).trim() : null;
  const specialty = data.specialty ? String(data.specialty).trim() : null;
  const profession = data.profession ? String(data.profession).trim() : null;
  const crm = data.crm ? String(data.crm).trim() : null;
  const professionalLicenseType = data.professionalLicenseType ? String(data.professionalLicenseType).trim().toUpperCase() : null;
  const professionalLicenseState = data.professionalLicenseState ? String(data.professionalLicenseState).trim().toUpperCase() : null;
  const phone = data.phone ? String(data.phone).trim() : null;

  await db.execute(sql`
    update users set
      name = ${name},
      email = ${normalizedEmail},
      specialty = ${specialty},
      profession = ${profession},
      crm = ${crm},
      professionalLicenseType = ${professionalLicenseType},
      professionalLicenseState = ${professionalLicenseState},
      phone = ${phone}
    where id = ${userId}
  `);
  return { success: true };
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update users set role = ${role} where id = ${userId}
  `);
  return { success: true };
}

// ─── CLOUD SIGNATURE (VIDaaS / BirdID) ───────────────────────────────────────

export async function getCloudSignatureConfig(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select cloudSignatureProvider, cloudSignatureCpf, cloudSignatureClientId,
           cloudSignatureClientSecret, cloudSignatureAmbiente
    from users
    where id = ${userId}
    limit 1
  `));

  const u = rows[0];
  if (!u?.cloudSignatureClientId) return null;

  return {
    provider: (u.cloudSignatureProvider || "vidaas") as "vidaas" | "birdid",
    cpf: String(u.cloudSignatureCpf || "").replace(/\D/g, ""),
    clientId: u.cloudSignatureClientId || "",
    clientSecret: u.cloudSignatureClientSecret || "",
    ambiente: (u.cloudSignatureAmbiente || "homologacao") as "producao" | "homologacao",
  };
}

export async function saveCloudSignatureConfig(
  userId: number,
  data: {
    provider: "vidaas" | "birdid";
    cpf: string;
    clientId: string;
    clientSecret: string;
    ambiente: "producao" | "homologacao";
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update users set
      cloudSignatureProvider = ${data.provider},
      cloudSignatureCpf = ${data.cpf.replace(/\D/g, "")},
      cloudSignatureClientId = ${data.clientId},
      cloudSignatureClientSecret = ${data.clientSecret},
      cloudSignatureAmbiente = ${data.ambiente}
    where id = ${userId}
  `);

  return { success: true };
}

export async function createSignatureSession(data: {
  userId: number;
  provider: "vidaas" | "birdid";
  documentType: string;
  documentId: number;
  documentAlias: string;
  documentHash: string;
  authorizeCode: string;
  codeVerifier: string;
  expiresInSeconds: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const expiresAt = new Date(Date.now() + data.expiresInSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const result: any = await db.execute(sql`
    insert into signature_sessions
      (userId, provider, documentType, documentId, documentAlias, documentHash,
       authorizeCode, codeVerifier, status, expiresAt)
    values
      (${data.userId}, ${data.provider}, ${data.documentType}, ${data.documentId},
       ${data.documentAlias}, ${data.documentHash},
       ${data.authorizeCode}, ${data.codeVerifier}, ${"pendente"}, ${expiresAt})
  `);

  return result?.insertId ?? result?.[0]?.insertId;
}

export async function getSignatureSession(sessionId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select * from signature_sessions where id = ${sessionId} limit 1
  `));

  return rows[0] ?? null;
}

export async function updateSignatureSession(
  sessionId: number,
  data: {
    status?: string;
    accessToken?: string;
    signatureCms?: string;
    errorMessage?: string;
    codeVerifier?: string;
    authorizeCode?: string;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update signature_sessions set
      status = ${data.status ?? sql`status`},
      accessToken = ${data.accessToken ?? sql`accessToken`},
      signatureCms = ${data.signatureCms ?? sql`signatureCms`},
      errorMessage = ${data.errorMessage ?? sql`errorMessage`},
      codeVerifier = ${data.codeVerifier ?? sql`codeVerifier`},
      authorizeCode = ${data.authorizeCode ?? sql`authorizeCode`}
    where id = ${sessionId}
  `);
}

export async function listSignatureSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select id, provider, documentType, documentId, documentAlias, status,
           errorMessage, expiresAt, createdAt
    from signature_sessions
    where userId = ${userId}
    order by createdAt desc
    limit 50
  `));

  return rows;
}

export async function applyDocumentSignature(data: {
  documentType: string;
  documentId: number;
  sessionId: number;
  provider: string;
  signedByName: string;
  signatureCms: string;
  validationCode: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  if (data.documentType === "evolucao") {
    await db.execute(sql`
      update clinical_evolutions set
        signatureProvider = ${data.provider},
        signedByDoctorName = ${data.signedByName},
        signedPdfUrl = null,
        signatureHash = ${data.validationCode},
        signatureValidationCode = ${data.validationCode},
        signatureCertificateLabel = ${data.provider === "vidaas" ? "VIDaaS ICP-Brasil A3" : "BirdID ICP-Brasil A3"},
        signedAt = ${now},
        d4signStatus = ${"assinado"},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  } else if (data.documentType === "atestado") {
    await db.execute(sql`
      update attestations set
        signatureProvider = ${data.provider},
        signedByName = ${data.signedByName},
        signatureCms = ${data.signatureCms},
        signatureValidationCode = ${data.validationCode},
        signedAt = ${now},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  } else if (data.documentType === "prescricao") {
    await db.execute(sql`
      update prescriptions set
        signatureProvider = ${data.provider},
        signedByName = ${data.signedByName},
        signatureCms = ${data.signatureCms},
        signatureValidationCode = ${data.validationCode},
        signedAt = ${now},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  } else if (data.documentType === "exame") {
    await db.execute(sql`
      update exam_requests set
        signatureProvider = ${data.provider},
        signedByName = ${data.signedByName},
        signatureCms = ${data.signatureCms},
        signatureValidationCode = ${data.validationCode},
        signedAt = ${now},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  }

  return { success: true };
}

// ─── CERTIFICADO A1 PF POR USUÁRIO ────────────────────────────────────────────

export async function saveUserA1Certificate(
  userId: number,
  data: { fileName: string; fileBase64: string; password: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const cleanedBase64 = String(data.fileBase64 ?? "").trim();
  if (!cleanedBase64) throw new Error("Arquivo do certificado inválido.");

  await db.execute(sql`
    update users set
      a1PfCertificado = ${encryptSensitiveValue(cleanedBase64)},
      a1PfSenha       = ${encryptSensitiveValue(data.password)},
      a1PfArquivoNome = ${data.fileName},
      a1PfAtualizadoEm = NOW()
    where id = ${userId}
  `);

  return { success: true, fileName: data.fileName };
}

export async function getUserA1CertificateRaw(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select a1PfCertificado, a1PfSenha, a1PfArquivoNome, a1PfAtualizadoEm
    from users where id = ${userId} limit 1
  `));

  const u = rows[0];
  if (!u?.a1PfCertificado || !u?.a1PfSenha) return null;

  const { decryptSensitiveValue } = await import("./lib/secure-storage");
  return {
    fileBase64: decryptSensitiveValue(u.a1PfCertificado) ?? "",
    password:   decryptSensitiveValue(u.a1PfSenha) ?? "",
    fileName:   u.a1PfArquivoNome ?? "",
    updatedAt:  u.a1PfAtualizadoEm ?? null,
  };
}

export async function getUserA1CertificateStatus(userId: number) {
  const db = await getDb();
  if (!db) return { configured: false };

  const rows = unwrapRows<any>(await db.execute(sql`
    select a1PfArquivoNome, a1PfAtualizadoEm,
           (a1PfCertificado IS NOT NULL AND a1PfSenha IS NOT NULL) as configured
    from users where id = ${userId} limit 1
  `));

  const u = rows[0];
  return {
    configured: Boolean(u?.configured),
    fileName: u?.a1PfArquivoNome ?? null,
    updatedAt: u?.a1PfAtualizadoEm ?? null,
  };
}
