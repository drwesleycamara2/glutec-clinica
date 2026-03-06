import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertAuditLog,
  InsertExamRequest,
  InsertMedicalRecord,
  InsertPatient,
  InsertPrescription,
  InsertScheduleBlock,
  InsertUser,
  auditLogs,
  documentSignatures,
  examRequests,
  medicalRecords,
  patients,
  prescriptions,
  scheduleBlocks,
  appointments,
  users,
  InsertAppointment,
  InsertDocumentSignature,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
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
  if (!db) return { totalPatients: 0, todayAppointments: 0, pendingSignatures: 0, totalDoctors: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalPatientsResult, todayAppointmentsResult, pendingSignaturesResult, totalDoctorsResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(patients).where(eq(patients.active, true)),
    db.select({ count: sql<number>`count(*)` }).from(appointments).where(and(gte(appointments.scheduledAt, today), lte(appointments.scheduledAt, tomorrow))),
    db.select({ count: sql<number>`count(*)` }).from(documentSignatures).where(eq(documentSignatures.status, "enviado")),
    db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "medico"), eq(users.active, true))),
  ]);

  return {
    totalPatients: totalPatientsResult[0]?.count ?? 0,
    todayAppointments: todayAppointmentsResult[0]?.count ?? 0,
    pendingSignatures: pendingSignaturesResult[0]?.count ?? 0,
    totalDoctors: totalDoctorsResult[0]?.count ?? 0,
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
