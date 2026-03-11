import { and, desc, eq, gte, like, lte, or, sql, asc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertAuditLog,
  InsertExamRequest,
  InsertMedicalRecord,
  InsertPatient,
  InsertPrescription,
  InsertScheduleBlock,
  InsertUser,
  InsertAppointment,
  InsertDocumentSignature,
  InsertMedicalRecordTemplate,
  InsertMedicalRecordChaperone,
  InsertPatientPhoto,
  InsertPatientDocument,
  InsertInventoryProduct,
  InsertInventoryMovement,
  InsertCrmIndication,
  InsertBudgetProcedureCatalog,
  InsertBudgetProcedureArea,
  InsertBudgetProcedurePricing,
  InsertBudgetPaymentPlan,
  InsertBudget,
  InsertBudgetItem,
  InsertFinancialTransaction,
  InsertChatMessage,
  InsertClinicSettings,
  InsertAnamnesisLink,
  InsertAudioTranscription,
  InsertPermission,
  InsertUserSession,
  InsertPrescriptionTemplate,
  InsertExamRequestTemplate,
  auditLogs,
  prescriptionTemplates,
  examRequestTemplates,
  documentSignatures,
  examRequests,
  medicalRecords,
  patients,
  prescriptions,
  scheduleBlocks,
  appointments,
  users,
  userSessions,
  permissions,
  clinicSettings,
  medicalRecordTemplates,
  medicalRecordChaperones,
  patientPhotos,
  patientDocuments,
  inventoryProducts,
  inventoryMovements,
  crmIndications,
  budgetProcedureCatalog,
  budgetProcedureAreas,
  budgetProcedurePricing,
  budgetPaymentPlans,
  budgets,
  budgetItems,
  financialTransactions,
  chatMessages,
  anamnesisLinks,
  audioTranscriptions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import crypto from "crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function getDoctors() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.role, "medico")).orderBy(users.name);
}

export async function getStaffByRoles(roles: string[]) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(and(inArray(users.role, roles as any), eq(users.active, true))).orderBy(users.name);
}

export async function updateUserRole(userId: number, role: "admin" | "medico" | "recepcionista" | "enfermeiro" | "user") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function updateUserProfile(userId: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

export async function incrementFailedLogin(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
  }).where(eq(users.id, userId));
}

export async function resetFailedLogin(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
}

export async function lockUser(userId: number, until: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lockedUntil: until }).where(eq(users.id, userId));
}

// ─── User Sessions ───────────────────────────────────────────────────────────

export async function createUserSession(data: InsertUserSession) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(userSessions).values(data);
}

export async function getActiveSession(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userSessions)
    .where(and(eq(userSessions.sessionToken, token), gte(userSessions.expiresAt, new Date())))
    .limit(1);
  return result[0];
}

export async function revokeSession(sessionId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, sessionId));
}

export async function revokeAllUserSessions(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.userId, userId));
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(permissions).where(eq(permissions.userId, userId));
}

export async function setUserPermission(data: InsertPermission) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(permissions)
    .where(and(eq(permissions.userId, data.userId), eq(permissions.module, data.module)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(permissions).set(data).where(eq(permissions.id, existing[0].id));
  } else {
    await db.insert(permissions).values(data);
  }
}

// ─── Clinic Settings ─────────────────────────────────────────────────────────

export async function getClinicSettings() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clinicSettings).limit(1);
  return result[0];
}

export async function upsertClinicSettings(data: InsertClinicSettings) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(clinicSettings).limit(1);
  if (existing.length > 0) {
    await db.update(clinicSettings).set(data).where(eq(clinicSettings.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(clinicSettings).values(data);
    return result[0].insertId;
  }
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export async function createPatient(data: InsertPatient) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(patients).values(data);
  return result[0];
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return result[0];
}

export async function searchPatients(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const q = `%${query}%`;
  return db
    .select()
    .from(patients)
    .where(and(eq(patients.active, true), or(like(patients.fullName, q), like(patients.cpf, q), like(patients.phone, q))))
    .orderBy(patients.fullName)
    .limit(limit);
}

export async function listPatients(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(patients)
    .where(eq(patients.active, true))
    .orderBy(patients.fullName)
    .limit(limit)
    .offset(offset);
}

export async function updatePatient(id: number, data: Partial<InsertPatient>) {
  const db = await getDb();
  if (!db) return;
  await db.update(patients).set(data).where(eq(patients.id, id));
}

export async function countPatients() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(patients).where(eq(patients.active, true));
  return result[0]?.count ?? 0;
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(appointments).values(data);
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function getAppointmentsByDoctor(doctorId: number, from: Date, to: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(appointments)
    .where(and(eq(appointments.doctorId, doctorId), gte(appointments.scheduledAt, from), lte(appointments.scheduledAt, to)))
    .orderBy(appointments.scheduledAt);
}

export async function getAppointmentsByDate(from: Date, to: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(appointments)
    .where(and(gte(appointments.scheduledAt, from), lte(appointments.scheduledAt, to)))
    .orderBy(appointments.scheduledAt);
}

export async function getAppointmentsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(appointments)
    .where(eq(appointments.patientId, patientId))
    .orderBy(desc(appointments.scheduledAt));
}

export async function updateAppointmentStatus(id: number, status: string, reason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(appointments).set({ status: status as any, cancellationReason: reason }).where(eq(appointments.id, id));
}

export async function updateAppointment(id: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}

export async function countTodayAppointments() {
  const db = await getDb();
  if (!db) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(and(gte(appointments.scheduledAt, today), lte(appointments.scheduledAt, tomorrow)));
  return result[0]?.count ?? 0;
}

// ─── Schedule Blocks ──────────────────────────────────────────────────────────

export async function createScheduleBlock(data: InsertScheduleBlock) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(scheduleBlocks).values(data);
}

export async function getScheduleBlocksByDoctor(doctorId: number, from: Date, to: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.doctorId, doctorId), gte(scheduleBlocks.startAt, from), lte(scheduleBlocks.endAt, to)));
}

export async function deleteScheduleBlock(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
}

// ─── Medical Record Templates ────────────────────────────────────────────────

export async function createMedicalRecordTemplate(data: InsertMedicalRecordTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(medicalRecordTemplates).values(data);
  return result[0];
}

export async function listMedicalRecordTemplates(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const where = activeOnly ? eq(medicalRecordTemplates.active, true) : undefined;
  return db.select().from(medicalRecordTemplates).where(where).orderBy(medicalRecordTemplates.name);
}

export async function getMedicalRecordTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(medicalRecordTemplates).where(eq(medicalRecordTemplates.id, id)).limit(1);
  return result[0];
}

export async function updateMedicalRecordTemplate(id: number, data: Partial<InsertMedicalRecordTemplate>) {
  const db = await getDb();
  if (!db) return;
  await db.update(medicalRecordTemplates).set(data).where(eq(medicalRecordTemplates.id, id));
}

// ─── Medical Records ──────────────────────────────────────────────────────────

export async function createMedicalRecord(data: InsertMedicalRecord) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(medicalRecords).values(data);
  return result[0];
}

export async function getMedicalRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(medicalRecords).where(eq(medicalRecords.id, id)).limit(1);
  return result[0];
}

export async function getMedicalRecordsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.patientId, patientId))
    .orderBy(desc(medicalRecords.createdAt));
}

export async function updateMedicalRecord(id: number, data: Partial<InsertMedicalRecord>) {
  const db = await getDb();
  if (!db) return;
  await db.update(medicalRecords).set(data).where(eq(medicalRecords.id, id));
}

// ─── Medical Record Chaperones ───────────────────────────────────────────────

export async function addChaperone(data: InsertMedicalRecordChaperone) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(medicalRecordChaperones).values(data);
}

export async function getChaperonesByRecord(medicalRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(medicalRecordChaperones).where(eq(medicalRecordChaperones.medicalRecordId, medicalRecordId));
}

// ─── Patient Photos ──────────────────────────────────────────────────────────

export async function createPatientPhoto(data: InsertPatientPhoto) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(patientPhotos).values(data);
  return result[0];
}

export async function getPatientPhotos(patientId: number, category?: string) {
  const db = await getDb();
  if (!db) return [];
  const where = category
    ? and(eq(patientPhotos.patientId, patientId), eq(patientPhotos.category, category as any))
    : eq(patientPhotos.patientId, patientId);
  return db.select().from(patientPhotos).where(where).orderBy(desc(patientPhotos.createdAt));
}

export async function deletePatientPhoto(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(patientPhotos).where(eq(patientPhotos.id, id));
}

// ─── Patient Documents ───────────────────────────────────────────────────────

export async function createPatientDocument(data: InsertPatientDocument) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(patientDocuments).values(data);
  return result[0];
}

export async function getPatientDocuments(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(patientDocuments).where(eq(patientDocuments.patientId, patientId)).orderBy(desc(patientDocuments.createdAt));
}

export async function deletePatientDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(patientDocuments).where(eq(patientDocuments.id, id));
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export async function createInventoryProduct(data: InsertInventoryProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(inventoryProducts).values(data);
  return result[0];
}

export async function listInventoryProducts(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const where = activeOnly ? eq(inventoryProducts.active, true) : undefined;
  return db.select().from(inventoryProducts).where(where).orderBy(inventoryProducts.name);
}

export async function getInventoryProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inventoryProducts).where(eq(inventoryProducts.id, id)).limit(1);
  return result[0];
}

export async function updateInventoryProduct(id: number, data: Partial<InsertInventoryProduct>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inventoryProducts).set(data).where(eq(inventoryProducts.id, id));
}

export async function createInventoryMovement(data: InsertInventoryMovement) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(inventoryMovements).values(data);
  // Update stock
  const product = await getInventoryProductById(data.productId);
  if (product) {
    let newStock = product.currentStock;
    if (data.type === "entrada") newStock += data.quantity;
    else if (data.type === "saida") newStock -= data.quantity;
    else newStock = data.quantity; // ajuste
    await db.update(inventoryProducts).set({ currentStock: newStock }).where(eq(inventoryProducts.id, data.productId));
  }
}

export async function getInventoryMovements(productId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryMovements).where(eq(inventoryMovements.productId, productId)).orderBy(desc(inventoryMovements.createdAt)).limit(limit);
}

export async function getLowStockProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventoryProducts)
    .where(and(eq(inventoryProducts.active, true), sql`${inventoryProducts.currentStock} <= ${inventoryProducts.minimumStock}`))
    .orderBy(inventoryProducts.name);
}

// ─── CRM / Indicações ────────────────────────────────────────────────────────

export async function createCrmIndication(data: InsertCrmIndication) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(crmIndications).values(data);
  return result[0];
}

export async function getCrmIndicationsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(crmIndications).where(eq(crmIndications.patientId, patientId)).orderBy(desc(crmIndications.createdAt));
}

export async function listCrmIndications(status?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const where = status ? eq(crmIndications.status, status as any) : undefined;
  return db.select().from(crmIndications).where(where).orderBy(desc(crmIndications.createdAt)).limit(limit);
}

export async function updateCrmIndication(id: number, data: Partial<InsertCrmIndication>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmIndications).set(data).where(eq(crmIndications.id, id));
}

// ─── Prescriptions ────────────────────────────────────────────────────────────

export async function createPrescription(data: InsertPrescription) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(prescriptions).values(data);
  return result[0];
}

export async function getPrescriptionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(prescriptions).where(eq(prescriptions.id, id)).limit(1);
  return result[0];
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.patientId, patientId))
    .orderBy(desc(prescriptions.createdAt));
}

export async function updatePrescription(id: number, data: Partial<InsertPrescription>) {
  const db = await getDb();
  if (!db) return;
  await db.update(prescriptions).set(data).where(eq(prescriptions.id, id));
}

// ─── Exam Requests ────────────────────────────────────────────────────────────

export async function createExamRequest(data: InsertExamRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(examRequests).values(data);
  return result[0];
}

export async function getExamRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(examRequests).where(eq(examRequests.id, id)).limit(1);
  return result[0];
}

export async function getExamRequestsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(examRequests)
    .where(eq(examRequests.patientId, patientId))
    .orderBy(desc(examRequests.createdAt));
}

export async function updateExamRequest(id: number, data: Partial<InsertExamRequest>) {
  const db = await getDb();
  if (!db) return;
  await db.update(examRequests).set(data).where(eq(examRequests.id, id));
}

// ─── Prescription & Exam Templates ───────────────────────────────────────────

export async function listPrescriptionTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(prescriptionTemplates).where(eq(prescriptionTemplates.active, true)).orderBy(prescriptionTemplates.name);
}

export async function createPrescriptionTemplate(data: InsertPrescriptionTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(prescriptionTemplates).values(data);
  return result[0];
}

export async function updatePrescriptionTemplate(id: number, data: Partial<InsertPrescriptionTemplate>) {
  const db = await getDb();
  if (!db) return;
  await db.update(prescriptionTemplates).set(data).where(eq(prescriptionTemplates.id, id));
}

export async function listExamRequestTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(examRequestTemplates).where(eq(examRequestTemplates.active, true)).orderBy(examRequestTemplates.name);
}

export async function createExamRequestTemplate(data: InsertExamRequestTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(examRequestTemplates).values(data);
  return result[0];
}

export async function updateExamRequestTemplate(id: number, data: Partial<InsertExamRequestTemplate>) {
  const db = await getDb();
  if (!db) return;
  await db.update(examRequestTemplates).set(data).where(eq(examRequestTemplates.id, id));
}

// ─── Inventory / Estoque ─────────────────────────────────────────────────────

export async function createBudgetProcedure(data: InsertBudgetProcedureCatalog) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(budgetProcedureCatalog).values(data);
  return result[0];
}

export async function listBudgetProcedures(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const where = activeOnly ? eq(budgetProcedureCatalog.active, true) : undefined;
  return db.select().from(budgetProcedureCatalog).where(where).orderBy(budgetProcedureCatalog.name);
}

export async function getBudgetProcedureById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(budgetProcedureCatalog).where(eq(budgetProcedureCatalog.id, id)).limit(1);
  return result[0];
}

export async function updateBudgetProcedure(id: number, data: Partial<InsertBudgetProcedureCatalog>) {
  const db = await getDb();
  if (!db) return;
  await db.update(budgetProcedureCatalog).set(data).where(eq(budgetProcedureCatalog.id, id));
}

// ─── Budget Procedure Areas ──────────────────────────────────────────────────

export async function createBudgetProcedureArea(data: InsertBudgetProcedureArea) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(budgetProcedureAreas).values(data);
  return result[0];
}

export async function getAreasByProcedure(procedureId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetProcedureAreas)
    .where(and(eq(budgetProcedureAreas.procedureId, procedureId), eq(budgetProcedureAreas.active, true)))
    .orderBy(budgetProcedureAreas.sortOrder);
}

export async function updateBudgetProcedureArea(id: number, data: Partial<InsertBudgetProcedureArea>) {
  const db = await getDb();
  if (!db) return;
  await db.update(budgetProcedureAreas).set(data).where(eq(budgetProcedureAreas.id, id));
}

// ─── Budget Procedure Pricing ────────────────────────────────────────────────

export async function upsertBudgetPricing(data: InsertBudgetProcedurePricing) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(budgetProcedurePricing)
    .where(and(
      eq(budgetProcedurePricing.procedureId, data.procedureId),
      eq(budgetProcedurePricing.areaId, data.areaId),
      eq(budgetProcedurePricing.complexity, data.complexity),
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(budgetProcedurePricing).set({ priceInCents: data.priceInCents }).where(eq(budgetProcedurePricing.id, existing[0].id));
  } else {
    await db.insert(budgetProcedurePricing).values(data);
  }
}

export async function getPricingByProcedure(procedureId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetProcedurePricing)
    .where(and(eq(budgetProcedurePricing.procedureId, procedureId), eq(budgetProcedurePricing.active, true)));
}

export async function getPrice(procedureId: number, areaId: number, complexity: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(budgetProcedurePricing)
    .where(and(
      eq(budgetProcedurePricing.procedureId, procedureId),
      eq(budgetProcedurePricing.areaId, areaId),
      eq(budgetProcedurePricing.complexity, complexity as any),
      eq(budgetProcedurePricing.active, true),
    ))
    .limit(1);
  return result[0];
}

// ─── Budget Payment Plans ────────────────────────────────────────────────────

export async function listPaymentPlans(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const where = activeOnly ? eq(budgetPaymentPlans.active, true) : undefined;
  return db.select().from(budgetPaymentPlans).where(where).orderBy(budgetPaymentPlans.sortOrder);
}

export async function createPaymentPlan(data: InsertBudgetPaymentPlan) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(budgetPaymentPlans).values(data);
}

export async function updatePaymentPlan(id: number, data: Partial<InsertBudgetPaymentPlan>) {
  const db = await getDb();
  if (!db) return;
  await db.update(budgetPaymentPlans).set(data).where(eq(budgetPaymentPlans.id, id));
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export async function createBudget(data: InsertBudget) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(budgets).values(data);
  return result[0];
}

export async function getBudgetById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1);
  return result[0];
}

export async function getBudgetsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgets).where(eq(budgets.patientId, patientId)).orderBy(desc(budgets.createdAt));
}

export async function listBudgets(status?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const where = status ? eq(budgets.status, status as any) : undefined;
  return db.select().from(budgets).where(where).orderBy(desc(budgets.createdAt)).limit(limit);
}

export async function updateBudget(id: number, data: Partial<InsertBudget>) {
  const db = await getDb();
  if (!db) return;
  await db.update(budgets).set(data).where(eq(budgets.id, id));
}

// ─── Budget Items ────────────────────────────────────────────────────────────

export async function addBudgetItem(data: InsertBudgetItem) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(budgetItems).values(data);
}

export async function getBudgetItems(budgetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetItems).where(eq(budgetItems.budgetId, budgetId)).orderBy(budgetItems.sortOrder);
}

export async function removeBudgetItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(budgetItems).where(eq(budgetItems.id, id));
}

export async function clearBudgetItems(budgetId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(budgetItems).where(eq(budgetItems.budgetId, budgetId));
}

// ─── Financial Transactions ──────────────────────────────────────────────────

export async function createFinancialTransaction(data: InsertFinancialTransaction) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(financialTransactions).values(data);
  return result[0];
}

export async function listFinancialTransactions(filters: { type?: string; status?: string; from?: Date; to?: Date }, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.type) conditions.push(eq(financialTransactions.type, filters.type as any));
  if (filters.status) conditions.push(eq(financialTransactions.status, filters.status as any));
  if (filters.from) conditions.push(gte(financialTransactions.createdAt, filters.from));
  if (filters.to) conditions.push(lte(financialTransactions.createdAt, filters.to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(financialTransactions).where(where).orderBy(desc(financialTransactions.createdAt)).limit(limit);
}

export async function updateFinancialTransaction(id: number, data: Partial<InsertFinancialTransaction>) {
  const db = await getDb();
  if (!db) return;
  await db.update(financialTransactions).set(data).where(eq(financialTransactions.id, id));
}

export async function getFinancialSummary(from: Date, to: Date) {
  const db = await getDb();
  if (!db) return { totalReceitas: 0, totalDespesas: 0, saldo: 0 };
  const [receitas, despesas] = await Promise.all([
    db.select({ total: sql<number>`COALESCE(SUM(${financialTransactions.amountInCents}), 0)` })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.type, "receita"), eq(financialTransactions.status, "pago"), gte(financialTransactions.createdAt, from), lte(financialTransactions.createdAt, to))),
    db.select({ total: sql<number>`COALESCE(SUM(${financialTransactions.amountInCents}), 0)` })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.type, "despesa"), eq(financialTransactions.status, "pago"), gte(financialTransactions.createdAt, from), lte(financialTransactions.createdAt, to))),
  ]);
  const totalReceitas = receitas[0]?.total ?? 0;
  const totalDespesas = despesas[0]?.total ?? 0;
  return { totalReceitas, totalDespesas, saldo: totalReceitas - totalDespesas };
}

// ─── Chat Messages ───────────────────────────────────────────────────────────

export async function createChatMessage(data: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(chatMessages).values(data);
  return result[0];
}

export async function getChatMessages(channelId: string, limit = 50, before?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(chatMessages.channelId, channelId)];
  if (before) conditions.push(sql`${chatMessages.id} < ${before}`);
  return db.select().from(chatMessages).where(and(...conditions)).orderBy(desc(chatMessages.id)).limit(limit);
}

// ─── Anamnesis Links ─────────────────────────────────────────────────────────

export async function createAnamnesisLink(data: InsertAnamnesisLink) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(anamnesisLinks).values(data);
  return result[0];
}

export async function getAnamnesisLinkByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(anamnesisLinks).where(eq(anamnesisLinks.token, token)).limit(1);
  return result[0];
}

export async function updateAnamnesisLink(id: number, data: Partial<InsertAnamnesisLink>) {
  const db = await getDb();
  if (!db) return;
  await db.update(anamnesisLinks).set(data).where(eq(anamnesisLinks.id, id));
}

// ─── Audio Transcriptions ────────────────────────────────────────────────────

export async function createAudioTranscription(data: InsertAudioTranscription) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(audioTranscriptions).values(data);
  return result[0];
}

export async function updateAudioTranscription(id: number, data: Partial<InsertAudioTranscription>) {
  const db = await getDb();
  if (!db) return;
  await db.update(audioTranscriptions).set(data).where(eq(audioTranscriptions.id, id));
}

export async function getAudioTranscriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(audioTranscriptions).where(eq(audioTranscriptions.patientId, patientId)).orderBy(desc(audioTranscriptions.createdAt));
}

// ─── Audit Logs (LGPD) ──────────────────────────────────────────────────────

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  
  // Se houver dataBefore e dataAfter, garantir que sejam strings JSON se necessário
  // (Drizzle lida com isso se o tipo for json, mas vamos garantir a consistência)
  
  // Generate integrity hash (chain-based)
  const payload = JSON.stringify({ 
    userId: data.userId,
    action: data.action,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    timestamp: new Date().toISOString() 
  });
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  await db.insert(auditLogs).values({ ...data, integrityHash: hash });
}

export async function getAuditLogsByPatient(patientId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.patientId, patientId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAuditLogsByUser(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getRecentAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Document Signatures ──────────────────────────────────────────────────────

export async function createDocumentSignature(data: InsertDocumentSignature) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(documentSignatures).values(data);
  return result[0];
}

export async function getDocumentSignatureByResource(resourceType: string, resourceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(documentSignatures)
    .where(and(eq(documentSignatures.resourceType, resourceType as any), eq(documentSignatures.resourceId, resourceId)))
    .orderBy(desc(documentSignatures.createdAt))
    .limit(1);
  return result[0];
}

export async function updateDocumentSignature(id: number, data: Partial<InsertDocumentSignature>) {
  const db = await getDb();
  if (!db) return;
  await db.update(documentSignatures).set(data).where(eq(documentSignatures.id, id));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, todayAppointments: 0, pendingSignatures: 0, totalDoctors: 0, pendingBudgets: 0, lowStockItems: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalPatientsResult, todayAppointmentsResult, pendingSignaturesResult, totalDoctorsResult, pendingBudgetsResult, lowStockResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(patients).where(eq(patients.active, true)),
    db.select({ count: sql<number>`count(*)` }).from(appointments).where(and(gte(appointments.scheduledAt, today), lte(appointments.scheduledAt, tomorrow))),
    db.select({ count: sql<number>`count(*)` }).from(documentSignatures).where(eq(documentSignatures.status, "enviado")),
    db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "medico"), eq(users.active, true))),
    db.select({ count: sql<number>`count(*)` }).from(budgets).where(eq(budgets.status, "emitido")),
    db.select({ count: sql<number>`count(*)` }).from(inventoryProducts).where(and(eq(inventoryProducts.active, true), sql`${inventoryProducts.currentStock} <= ${inventoryProducts.minimumStock}`)),
  ]);

  return {
    totalPatients: totalPatientsResult[0]?.count ?? 0,
    todayAppointments: todayAppointmentsResult[0]?.count ?? 0,
    pendingSignatures: pendingSignaturesResult[0]?.count ?? 0,
    totalDoctors: totalDoctorsResult[0]?.count ?? 0,
    pendingBudgets: pendingBudgetsResult[0]?.count ?? 0,
    lowStockItems: lowStockResult[0]?.count ?? 0,
  };
}

export async function getAppointmentStatsByDoctor(from: Date, to: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      doctorId: appointments.doctorId,
      count: sql<number>`count(*)`,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(gte(appointments.scheduledAt, from), lte(appointments.scheduledAt, to)))
    .groupBy(appointments.doctorId, appointments.status);
}
