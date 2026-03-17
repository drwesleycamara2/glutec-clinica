import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "pending_password_change"]).default("active").notNull(),
  permissions: text("permissions"), // JSON string of allowed modules
  password: text("password"), // For local password fallback if needed, though Manus uses OAuth
  mustChangePassword: int("mustChangePassword").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── CID-10 Codes ───────────────────────────────────────────────────────────

export const icd10Codes = mysqlTable("icd10_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  description: text("description").notNull(),
  descriptionAbbrev: varchar("descriptionAbbrev", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Icd10Code = typeof icd10Codes.$inferSelect;
export type InsertIcd10Code = typeof icd10Codes.$inferInsert;

// ─── User Favorite CID-10 ───────────────────────────────────────────────────

export const userFavoriteIcds = mysqlTable("user_favorite_icds", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  icd10CodeId: int("icd10CodeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserFavoriteIcd = typeof userFavoriteIcds.$inferSelect;
export type InsertUserFavoriteIcd = typeof userFavoriteIcds.$inferInsert;

// ─── Audio Transcriptions ────────────────────────────────────────────────────

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

// TODO: Add your tables here