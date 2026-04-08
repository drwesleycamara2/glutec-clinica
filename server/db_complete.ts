import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { eq, like, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  emitNfseWithNationalApi,
  fetchMunicipalParameters,
  testNationalApiConnection,
} from "./lib/nfse-nacional";
import { encryptSensitiveValue, maskStoredValue } from "./lib/secure-storage";

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

function savePatientMediaToPublicDir(patientId: number, base64: string, mimeType?: string | null) {
  const extension = inferExtensionFromMimeType(mimeType);
  const relativeDir = path.join("imports", "manual", `patient-${patientId}`);
  const absoluteDir = path.resolve(process.cwd(), "public", relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const absolutePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(absolutePath, Buffer.from(base64, "base64"));

  return {
    photoUrl: normalizeMediaUrl(path.posix.join("/", relativeDir.replace(/\\/g, "/"), fileName)),
    photoKey: path.posix.join(relativeDir.replace(/\\/g, "/"), fileName),
  };
}

function normalizePhotoRow(row: any) {
  return {
    ...row,
    photoUrl: normalizeMediaUrl(row.photoUrl),
    thumbnailUrl: normalizeMediaUrl(row.thumbnailUrl ?? row.photoUrl),
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

// ─── PATIENTS ────────────────────────────────────────────────────────────────
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

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────
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
    select *
    from appointments
    where scheduledAt >= ${from}
      and scheduledAt <= ${to}
    order by scheduledAt asc
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

// ─── PRESCRIPTIONS ───────────────────────────────────────────────────────────
export async function createPrescription(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`prescriptions`).values({
    ...data,
    doctorId: userId,
  });
  return result[0];
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`prescriptions`).where(eq(sql`patientId`, patientId));
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

// ─── EXAM REQUESTS ───────────────────────────────────────────────────────────
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

// ─── FINANCIAL ───────────────────────────────────────────────────────────────
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

// ─── CATALOG ─────────────────────────────────────────────────────────────────
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

// ─── INVENTORY ───────────────────────────────────────────────────────────────
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

// ─── PHOTOS ──────────────────────────────────────────────────────────────────
export async function getPatientPhotos(patientId: number, category?: string) {
  const db = await getDb();
  if (!db) return [];

  if (category) {
    return unwrapRows<any>(await db.execute(sql`
      select *
      from patient_photos
      where patientId = ${patientId}
        and category = ${category}
      order by coalesce(takenAt, createdAt) desc, id desc
    `)).map(normalizePhotoRow);
  }

  return unwrapRows<any>(await db.execute(sql`
    select *
    from patient_photos
    where patientId = ${patientId}
    order by coalesce(takenAt, createdAt) desc, id desc
  `)).map(normalizePhotoRow);
}

export async function uploadPatientPhoto(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const stored = savePatientMediaToPublicDir(Number(data.patientId), String(data.base64 ?? ""), data.mimeType);
  const result = await db.insert(sql`patient_photos`).values({
    patientId: data.patientId,
    category: data.category,
    description: data.description ?? null,
    photoUrl: stored.photoUrl,
    thumbnailUrl: stored.photoUrl,
    photoKey: stored.photoKey,
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

// ─── CHAT ────────────────────────────────────────────────────────────────────
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

// ─── CLINIC ──────────────────────────────────────────────────────────────────
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

// ─── FISCAL ──────────────────────────────────────────────────────────────────
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
  "Não sujeito à retenção de seguridade social, conforme art-31 da lei-8.212/91, os/inss-209/99, In/inss-dc-100/03 e in 971/09 art.120 inciso III. Os serviços acima descritos foram prestados pessoalmente pelo(s) sócio(s) e sem o concurso de empregados ou outros contribuintes individuais.";

function normalizeDecimalInput(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
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

  await db.insert(sql`nfse_events`).values({
    nfseId,
    event,
    status: params.status ?? null,
    message: params.message ?? null,
    xmlRequest: params.xmlRequest ?? null,
    xmlResponse: params.xmlResponse ?? null,
    userId: params.userId ?? null,
  });
}

export async function getFiscalSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`fiscal_config`).limit(1);
  const fiscal = result[0];
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
    regimeTributario: data.regimeTributario ?? data.regimeApuracao ?? null,
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
    await db.update(sql`fiscal_config`).set(payload).where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`fiscal_config`).values(payload);
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

  await db.update(sql`fiscal_config`).set({
    certificadoDigital: encryptSensitiveValue(cleanedBase64),
    certificadoSenha: encryptSensitiveValue(data.password),
    certificadoArquivoNome: data.fileName,
    certificadoMimeType: data.mimeType ?? null,
    certificadoAtualizadoEm: new Date(),
  }).where(eq(sql`id`, existing.id));

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
    await db.update(sql`fiscal_config`).set({
      municipio: source.municipio ?? fiscal.municipio ?? null,
      uf: source.uf ?? fiscal.uf ?? null,
      codigoMunicipio: source.codigoMunicipio ?? fiscal.codigoMunicipio ?? null,
      codigoServico: source.codigoServico ?? fiscal.codigoServico ?? null,
      itemListaServico: source.itemListaServico ?? fiscal.itemListaServico ?? null,
      webserviceUrl: source.webserviceUrl ?? fiscal.webserviceUrl ?? null,
    }).where(eq(sql`id`, fiscal.id));
  }

  return {
    success: true,
    parametros: params,
  };
}

// ─── NFSE ────────────────────────────────────────────────────────────────────
export async function listNfse() {
  const db = await getDb();
  if (!db) return [];
  
  const rows = await db.select().from(sql`nfse`).orderBy(desc(sql`createdAt`));
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
  
  const result = await db.insert(sql`nfse`).values({
    patientId: data.patientId ?? null,
    budgetId: data.budgetId ?? null,
    tomadorNome: data.tomadorNome,
    tomadorCpfCnpj: data.tomadorDocumento,
    tomadorTipoDocumento: data.tomadorTipoDocumento ?? inferDocumentType(data.tomadorDocumento),
    tomadorEmail: data.tomadorEmail ?? null,
    tomadorEndereco,
    numeroRps,
    dataEmissao: new Date(),
    dataCompetencia,
    descricaoServico,
    codigoServico: fiscal.codigoServico ?? fiscal.codigoTributacaoNacional ?? null,
    itemListaServico: fiscal.itemListaServico ?? null,
    cnaeServico: fiscal.cnaeServico ?? null,
    codigoMunicipioIncidencia: fiscal.codigoMunicipio ?? null,
    valorServicos,
    valorDeducoes,
    valorIss,
    baseCalculo,
    aliquota,
    valorLiquidoNfse,
    descontoIncondicionado,
    formaPagamento: data.formaPagamento ?? null,
    detalhesPagamento: data.detalhesPagamento ?? null,
    ambiente: data.ambiente ?? fiscal.ambiente ?? "homologacao",
    enviadoPorId: userId,
    status: 'rascunho',
  });

  await db
    .update(sql`fiscal_config`)
    .set({ numeracaoSequencial: numeroRps + 1 })
    .where(eq(sql`id`, fiscal.id));

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;
  if (!insertedId) {
    throw new Error("Não foi possível identificar o rascunho da NFS-e criado.");
  }

  const inserted = await db
    .select()
    .from(sql`nfse`)
    .where(eq(sql`id`, insertedId))
    .limit(1);

  return normalizeNfseRow(inserted[0]);
}

export async function emitNfse(nfseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = await db.select().from(sql`nfse`).where(eq(sql`id`, nfseId)).limit(1);
  if (!current[0]) throw new Error("NFS-e não encontrada.");
  
  const pendingMessage =
    "A emissão automática no Emissor Nacional ainda não está integrada. O rascunho foi preparado para conferência e emissão manual no portal nfse.gov.br.";

  await db.update(sql`nfse`).set({
    status: 'aguardando',
    erroMensagem: pendingMessage,
    tentativas: sql`tentativas + 1`,
  }).where(eq(sql`id`, nfseId));

  return {
    success: true,
    status: 'aguardando',
    message: pendingMessage,
  };
}

export async function cancelNfse(nfseId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`nfse`).set({
    status: 'cancelada',
    motivoCancelamento: reason,
    dataCancelamento: new Date(),
  }).where(eq(sql`id`, nfseId));
  return { success: true };
}

export async function emitNfseThroughNationalApi(nfseId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const current = await db.select().from(sql`nfse`).where(eq(sql`id`, nfseId)).limit(1);
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

    await db.update(sql`nfse`).set({
      status: result.status,
      numeroNfse: result.numeroNfse ?? null,
      chaveAcesso: result.chaveAcesso ?? null,
      protocolo: result.protocolo ?? null,
      numeroDps: result.numeroDps ?? null,
      codigoVerificacao: result.codigoVerificacao ?? null,
      linkNfse: result.linkNfse ?? null,
      xmlEnviado: result.xmlEnviado,
      xmlRetorno: result.xmlRetorno,
      xmlNfse: result.xmlNfse,
      erroMensagem: null,
      tentativas: sql`tentativas + 1`,
      updatedAt: new Date(),
    }).where(eq(sql`id`, nfseId));

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

    await db.update(sql`nfse`).set({
      status: "erro",
      erroMensagem: message,
      tentativas: sql`tentativas + 1`,
      updatedAt: new Date(),
    }).where(eq(sql`id`, nfseId));

    await logNfseEvent(nfseId, "erro", {
      status: "erro",
      message,
      userId,
    });

    throw new Error(message);
  }
}

// ─── BUDGETS ─────────────────────────────────────────────────────────────────
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

// ─── CRM ─────────────────────────────────────────────────────────────────────
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

// ─── SIGNATURES ───────────────────────────────────────────────────────────────
export async function sendForSignature(documentId: number, documentType: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`document_signatures`).values({
    resourceId: documentId,
    resourceType: documentType,
    doctorId: userId,
    status: 'enviado',
  });
  return result[0];
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
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

// ─── MEDICAL RECORDS ──────────────────────────────────────────────────────────
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

  const rows = await db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function listPrescriptionTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
      and specialty in ('Prescrição', 'PrescriÃ§Ã£o', 'Prescricao')
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

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
export async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  // Implementação com WhatsApp API
  return { success: true, messageId: `msg_${Date.now()}` };
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export async function invokeAI(messages: any[]) {
  // Implementação com LLM
  return { role: 'assistant', content: 'Resposta da IA' };
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
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
  
  const patients = await db.select(sql`COUNT(*) as count`).from(sql`patients`);
  const appointments = await db.select(sql`COUNT(*) as count`).from(sql`appointments`);
  
  return {
    totalPatients: patients[0]?.count || 0,
    todayAppointments: 0,
    totalAppointments: appointments[0]?.count || 0,
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
  
  await db.update(sql`users`).set(data).where(eq(sql`id`, userId));
  return { success: true };
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`users`).set({ role }).where(eq(sql`id`, userId));
  return { success: true };
}
