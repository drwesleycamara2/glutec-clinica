import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// ─── Clinical Evolutions / Evoluções Clínicas ────────────────────────────────

export const clinicalEvolutions = mysqlTable("clinical_evolutions", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  assistantUserId: int("assistantUserId"),
  medicalRecordId: int("medicalRecordId"),
  appointmentId: int("appointmentId"),
  
  // Clinical Information
  icdCode: varchar("icdCode", { length: 16 }).notNull(), // CID-10 code
  icdDescription: text("icdDescription").notNull(), // CID-10 description
  clinicalNotes: text("clinicalNotes").notNull(), // Notas clínicas
  audioTranscription: text("audioTranscription"), // Transcrição de áudio
  audioUrl: text("audioUrl"), // URL do áudio original
  audioKey: varchar("audioKey", { length: 256 }), // Chave S3 do áudio
  
  // Tipo de atendimento (obrigatório)
  attendanceType: mysqlEnum("attendanceType", ["presencial", "online"]),

  // Status and Workflow
  status: mysqlEnum("status", ["rascunho", "finalizado", "assinado", "cancelado"]).default("rascunho").notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  finalizedAt: timestamp("finalizedAt"),
  isRetroactive: int("isRetroactive").default(0).notNull(),
  retroactiveJustification: text("retroactiveJustification"),
  assistantName: varchar("assistantName", { length: 255 }).notNull(),
  
  // Digital Signature (D4Sign Integration)
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedByDoctorId: int("signedByDoctorId"),
  signedByDoctorName: varchar("signedByDoctorName", { length: 256 }),
  signedPdfUrl: text("signedPdfUrl"),
  signatureHash: varchar("signatureHash", { length: 256 }), // Hash da assinatura para auditoria
  signatureProvider: varchar("signatureProvider", { length: 64 }),
  signatureCertificateLabel: varchar("signatureCertificateLabel", { length: 255 }),
  signatureValidationCode: varchar("signatureValidationCode", { length: 128 }),
  
  // Audit Trail
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdBy: int("createdBy"),
  updatedBy: int("updatedBy"),
});

export type ClinicalEvolution = typeof clinicalEvolutions.$inferSelect;
export type InsertClinicalEvolution = typeof clinicalEvolutions.$inferInsert;

// ─── Digital Signature Audit Log / Log de Auditoria de Assinatura ─────────────

export const signatureAuditLog = mysqlTable("signature_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  clinicalEvolutionId: int("clinicalEvolutionId").notNull(),
  doctorId: int("doctorId").notNull(),
  doctorName: varchar("doctorName", { length: 256 }).notNull(),
  doctorCRM: varchar("doctorCRM", { length: 32 }),
  
  // Signature Details
  action: mysqlEnum("action", ["signed", "unsigned", "rejected", "verified"]).notNull(),
  signatureMethod: mysqlEnum("signatureMethod", ["eletronica", "icp_brasil_a1", "icp_brasil_a3"]).default("eletronica"),
  signatureTimestamp: timestamp("signatureTimestamp").notNull(),
  
  // D4Sign Integration
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signSafeKey: varchar("d4signSafeKey", { length: 128 }),
  d4signStatus: varchar("d4signStatus", { length: 64 }),
  
  // Audit Information
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  details: text("details"), // JSON com detalhes adicionais
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SignatureAuditLog = typeof signatureAuditLog.$inferSelect;
export type InsertSignatureAuditLog = typeof signatureAuditLog.$inferInsert;

// ─── Edit Audit Log ────────────────────────────────────────────────────────
// Qualquer alteração em uma evolução finalizada/assinada é registrada aqui
// com justificativa obrigatória, snapshot anterior e posterior.
export const clinicalEvolutionEditLog = mysqlTable("clinical_evolution_edit_log", {
  id: int("id").autoincrement().primaryKey(),
  clinicalEvolutionId: int("clinicalEvolutionId").notNull(),
  editedByUserId: int("editedByUserId").notNull(),
  editedByUserName: varchar("editedByUserName", { length: 256 }).notNull(),
  editedByUserRole: varchar("editedByUserRole", { length: 64 }),
  previousStatus: varchar("previousStatus", { length: 32 }),
  newStatus: varchar("newStatus", { length: 32 }),
  justification: text("justification").notNull(),
  changedFields: json("changedFields"),
  previousSnapshot: json("previousSnapshot"),
  newSnapshot: json("newSnapshot"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  editedAt: timestamp("editedAt").defaultNow().notNull(),
});

export type ClinicalEvolutionEditLog = typeof clinicalEvolutionEditLog.$inferSelect;
export type InsertClinicalEvolutionEditLog = typeof clinicalEvolutionEditLog.$inferInsert;
