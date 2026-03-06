import {
  boolean,
  date,
  datetime,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users / Profissionais ────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "medico", "recepcionista", "enfermeiro", "user"]).default("user").notNull(),
  specialty: varchar("specialty", { length: 128 }), // Para médicos
  crm: varchar("crm", { length: 32 }), // Registro CRM do médico
  phone: varchar("phone", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Patients / Pacientes ─────────────────────────────────────────────────────

export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  // Dados pessoais
  fullName: varchar("fullName", { length: 256 }).notNull(),
  birthDate: date("birthDate"),
  gender: mysqlEnum("gender", ["masculino", "feminino", "outro", "nao_informado"]).default("nao_informado"),
  cpf: varchar("cpf", { length: 14 }).unique(),
  rg: varchar("rg", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  // Endereço
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 9 }),
  // Convênio
  insuranceName: varchar("insuranceName", { length: 128 }),
  insuranceNumber: varchar("insuranceNumber", { length: 64 }),
  // Foto
  photoUrl: text("photoUrl"),
  photoKey: varchar("photoKey", { length: 256 }),
  // Dados médicos gerais
  bloodType: mysqlEnum("bloodType", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"]).default("desconhecido"),
  allergies: text("allergies"),
  chronicConditions: text("chronicConditions"),
  emergencyContactName: varchar("emergencyContactName", { length: 256 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 20 }),
  // Controle
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// ─── Appointments / Consultas ─────────────────────────────────────────────────

export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  scheduledAt: datetime("scheduledAt").notNull(),
  durationMinutes: int("durationMinutes").default(30).notNull(),
  type: mysqlEnum("type", ["consulta", "retorno", "exame", "procedimento", "teleconsulta"]).default("consulta").notNull(),
  status: mysqlEnum("status", ["agendada", "confirmada", "em_atendimento", "concluida", "cancelada", "falta"]).default("agendada").notNull(),
  notes: text("notes"),
  cancellationReason: text("cancellationReason"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

// ─── Schedule Blocks / Bloqueios de Agenda ────────────────────────────────────

export const scheduleBlocks = mysqlTable("schedule_blocks", {
  id: int("id").autoincrement().primaryKey(),
  doctorId: int("doctorId").notNull(),
  startAt: datetime("startAt").notNull(),
  endAt: datetime("endAt").notNull(),
  reason: varchar("reason", { length: 256 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScheduleBlock = typeof scheduleBlocks.$inferSelect;
export type InsertScheduleBlock = typeof scheduleBlocks.$inferInsert;

// ─── Medical Records / Prontuário Eletrônico (CFM 1821/2007) ─────────────────

export const medicalRecords = mysqlTable("medical_records", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  appointmentId: int("appointmentId"),
  doctorId: int("doctorId").notNull(),
  // Anamnese
  chiefComplaint: text("chiefComplaint"), // Queixa principal
  historyOfPresentIllness: text("historyOfPresentIllness"), // HDA
  pastMedicalHistory: text("pastMedicalHistory"), // Antecedentes
  familyHistory: text("familyHistory"), // Histórico familiar
  socialHistory: text("socialHistory"), // Histórico social
  currentMedications: text("currentMedications"), // Medicações em uso
  allergies: text("allergies"), // Alergias (snapshot)
  // Exame físico
  physicalExam: text("physicalExam"),
  vitalSigns: json("vitalSigns"), // { bp, hr, temp, weight, height, spo2, rr }
  // Diagnóstico e conduta
  diagnosis: text("diagnosis"),
  icdCode: varchar("icdCode", { length: 16 }), // CID-10
  clinicalEvolution: text("clinicalEvolution"),
  treatmentPlan: text("treatmentPlan"),
  // Controle
  signedAt: timestamp("signedAt"),
  signedByDoctorId: int("signedByDoctorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type InsertMedicalRecord = typeof medicalRecords.$inferInsert;

// ─── Prescriptions / Prescrições Médicas ─────────────────────────────────────

export const prescriptions = mysqlTable("prescriptions", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  medicalRecordId: int("medicalRecordId"),
  appointmentId: int("appointmentId"),
  type: mysqlEnum("type", ["simples", "especial_azul", "especial_amarelo", "antimicrobiano"]).default("simples").notNull(),
  items: json("items").notNull(), // Array de { medication, dosage, frequency, duration, instructions }
  observations: text("observations"),
  // PDF e assinatura
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 256 }),
  // D4Sign
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = typeof prescriptions.$inferInsert;

// ─── Exam Requests / Pedidos de Exames ───────────────────────────────────────

export const examRequests = mysqlTable("exam_requests", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  medicalRecordId: int("medicalRecordId"),
  appointmentId: int("appointmentId"),
  specialty: varchar("specialty", { length: 128 }),
  exams: json("exams").notNull(), // Array de { name, code, instructions, urgency }
  clinicalIndication: text("clinicalIndication"),
  observations: text("observations"),
  // PDF e assinatura
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 256 }),
  // D4Sign
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExamRequest = typeof examRequests.$inferSelect;
export type InsertExamRequest = typeof examRequests.$inferInsert;

// ─── Audit Logs / Logs de Auditoria (LGPD) ───────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(), // ex: VIEW_RECORD, EDIT_RECORD, CREATE_PRESCRIPTION
  resourceType: varchar("resourceType", { length: 64 }).notNull(), // ex: medical_record, patient, prescription
  resourceId: int("resourceId"),
  patientId: int("patientId"),
  details: json("details"), // Informações adicionais da ação
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Document Signatures / Assinaturas ───────────────────────────────────────

export const documentSignatures = mysqlTable("document_signatures", {
  id: int("id").autoincrement().primaryKey(),
  resourceType: mysqlEnum("resourceType", ["prescription", "exam_request", "medical_record"]).notNull(),
  resourceId: int("resourceId").notNull(),
  doctorId: int("doctorId").notNull(),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signSafeKey: varchar("d4signSafeKey", { length: 128 }),
  status: mysqlEnum("status", ["pendente", "enviado", "assinado", "cancelado", "erro"]).default("pendente").notNull(),
  signatureType: mysqlEnum("signatureType", ["eletronica", "icp_brasil_a1", "icp_brasil_a3"]).default("eletronica"),
  signedAt: timestamp("signedAt"),
  signedDocumentUrl: text("signedDocumentUrl"),
  webhookData: json("webhookData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DocumentSignature = typeof documentSignatures.$inferSelect;
export type InsertDocumentSignature = typeof documentSignatures.$inferInsert;
