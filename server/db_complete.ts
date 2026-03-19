import { getDb } from "./db";
import { eq, like, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── PATIENTS ────────────────────────────────────────────────────────────────
export async function listPatients(query?: string, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  let query_obj = db.select().from(sql`patients`);
  if (query) {
    query_obj = query_obj.where(like(sql`fullName`, `%${query}%`));
  }
  return query_obj.limit(limit);
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
  
  const result = await db.select().from(sql`patients`).where(eq(sql`id`, id)).limit(1);
  return result[0];
}

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────
export async function createAppointment(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`appointments`).values({
    ...data,
    createdBy: userId,
  });
  return result[0];
}

export async function getAppointmentsByDateRange(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`appointments`)
    .where(and(
      gte(sql`scheduledAt`, from),
      lte(sql`scheduledAt`, to)
    ));
}

export async function updateAppointmentStatus(appointmentId: number, status: string) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(sql`appointments`).set({ status }).where(eq(sql`id`, appointmentId));
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
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`specialty`, 'Prescrição'));
}

export async function createPrescriptionTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    specialty: 'Prescrição',
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
  
  let query = db.select().from(sql`patient_photos`).where(eq(sql`patientId`, patientId));
  
  if (category) {
    query = query.where(eq(sql`category`, category));
  }
  
  return query.orderBy(desc(sql`createdAt`));
}

export async function uploadPatientPhoto(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`patient_photos`).values({
    ...data,
    uploadedBy: userId,
  });
  return result[0];
}

export async function deletePatientPhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(sql`patient_photos`).where(eq(sql`id`, photoId));
  return { success: true };
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
export async function getFiscalSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`fiscal_settings`).limit(1);
  return result[0];
}

export async function upsertFiscalSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getFiscalSettings();
  
  if (existing) {
    await db.update(sql`fiscal_settings`).set(data).where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`fiscal_settings`).values(data);
  }
  
  return { success: true };
}

// ─── NFSE ────────────────────────────────────────────────────────────────────
export async function listNfse() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`nfse`).orderBy(desc(sql`createdAt`));
}

export async function createNfse(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`nfse`).values({
    ...data,
    createdBy: userId,
    status: 'rascunho',
  });
  return result[0];
}

export async function emitNfse(nfseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`nfse`).set({ status: 'emitido' }).where(eq(sql`id`, nfseId));
  return { success: true };
}

export async function cancelNfse(nfseId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`nfse`).set({ status: 'cancelado', cancellationReason: reason }).where(eq(sql`id`, nfseId));
  return { success: true };
}

// ─── BUDGETS ─────────────────────────────────────────────────────────────────
export async function listBudgets() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budgets`).orderBy(desc(sql`createdAt`));
}

export async function createBudget(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budgets`).values({
    ...data,
    createdBy: userId,
    status: 'rascunho',
  });
  return result[0];
}

export async function emitBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'emitido' }).where(eq(sql`id`, budgetId));
  return { success: true };
}

export async function approveBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'aprovado' }).where(eq(sql`id`, budgetId));
  return { success: true };
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
  
  return db.select().from(sql`users`).where(eq(sql`role`, 'medico'));
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
