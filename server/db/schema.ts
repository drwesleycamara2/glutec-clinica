import { mysqlEnum, mysqlTable, text, timestamp, varchar, int, boolean } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const users = mysqlTable("users", {
    id: varchar("id", { length: 255 }).primaryKey(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }),
    role: varchar("role", { length: 255 }).default("user"),
    status: mysqlEnum("status", ["pending", "active", "inactive"]).default("pending").notNull(),
    twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
    inviteToken: varchar("invite_token", { length: 255 }).unique(),
    permissions: text("permissions"), // JSON string for granular permissions
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow(),
});


export const icd10Codes = mysqlTable("icd10_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  description: text("description").notNull(),
  descriptionAbbrev: varchar("descriptionAbbrev", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Icd10Code = typeof icd10Codes.$inferSelect;
export type InsertIcd10Code = typeof icd10Codes.$inferInsert;

export const userFavoriteIcds = mysqlTable("user_favorite_icds", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  icd10CodeId: int("icd10CodeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserFavoriteIcd = typeof userFavoriteIcds.$inferSelect;
export type InsertUserFavoriteIcd = typeof userFavoriteIcds.$inferInsert;

export const audioTranscriptions = mysqlTable("audio_transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  medicalRecordId: int("medicalRecordId"),
  userId: int("userId").notNull(),
  audioUrl: text("audioUrl").notNull(),
  audioKey: varchar("audioKey", { length: 256 }).notNull(),
  transcription: text("transcription"),
  language: varchar("language", { length: 10 }).default("pt"),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AudioTranscription = typeof audioTranscriptions.$inferSelect;
export type InsertAudioTranscription = typeof audioTranscriptions.$inferInsert;


export const clinicalEvolutions = mysqlTable("clinical_evolutions", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  evolutionText: text("evolutionText").notNull(),
  status: mysqlEnum("status", ["rascunho", "finalizado", "assinado"]).default("rascunho").notNull(),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 255 }),
  d4signStatus: varchar("d4signStatus", { length: 255 }),
  signedAt: timestamp("signedAt"),
  signedByDoctorId: int("signedByDoctorId"),
  signedByDoctorName: varchar("signedByDoctorName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClinicalEvolution = typeof clinicalEvolutions.$inferSelect;
export type InsertClinicalEvolution = typeof clinicalEvolutions.$inferInsert;

export const signatureAuditLog = mysqlTable("signature_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  clinicalEvolutionId: int("clinicalEvolutionId").notNull(),
  doctorId: int("doctorId").notNull(),
  doctorName: varchar("doctorName", { length: 255 }).notNull(),
  doctorCRM: varchar("doctorCRM", { length: 255 }),
  action: varchar("action", { length: 255 }).notNull(),
  signatureMethod: varchar("signatureMethod", { length: 255 }).notNull(),
  signatureTimestamp: timestamp("signatureTimestamp").defaultNow().notNull(),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SignatureAuditLog = typeof signatureAuditLog.$inferSelect;
export type InsertSignatureAuditLog = typeof signatureAuditLog.$inferInsert;
