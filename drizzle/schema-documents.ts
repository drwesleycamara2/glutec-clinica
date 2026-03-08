import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// ─── Document Templates / Modelos de Documentos ────────────────────────────────

export const documentTemplates = mysqlTable("document_templates", {
  id: int("id").autoincrement().primaryKey(),
  doctorId: int("doctorId").notNull(),
  type: mysqlEnum("type", ["prescricao", "exame", "atestado"]).notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  content: text("content").notNull(), // Conteúdo do modelo em texto livre
  isDefault: boolean("isDefault").default(false),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = typeof documentTemplates.$inferInsert;

// ─── Free Text Documents / Documentos em Texto Livre ──────────────────────────

export const freeTextDocuments = mysqlTable("free_text_documents", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  appointmentId: int("appointmentId"),
  type: mysqlEnum("type", ["prescricao", "exame", "atestado"]).notNull(),
  templateId: int("templateId"), // Referência ao modelo usado
  title: varchar("title", { length: 256 }).notNull(),
  content: text("content").notNull(), // Conteúdo em texto livre (HTML ou Markdown)
  status: mysqlEnum("status", ["rascunho", "finalizado", "assinado", "cancelado"]).default("rascunho").notNull(),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FreeTextDocument = typeof freeTextDocuments.$inferSelect;
export type InsertFreeTextDocument = typeof freeTextDocuments.$inferInsert;

// ─── Attestations / Atestados ─────────────────────────────────────────────────

export const attestations = mysqlTable("attestations", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  appointmentId: int("appointmentId"),
  type: mysqlEnum("type", ["comparecimento", "afastamento", "aptidao", "outro"]).default("comparecimento").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  reason: text("reason"),
  content: text("content").notNull(), // Conteúdo em texto livre
  status: mysqlEnum("status", ["rascunho", "finalizado", "assinado", "cancelado"]).default("rascunho").notNull(),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Attestation = typeof attestations.$inferSelect;
export type InsertAttestation = typeof attestations.$inferInsert;
