import {
  boolean,
  date,
  datetime,
  decimal,
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
  specialty: varchar("specialty", { length: 128 }),
  crm: varchar("crm", { length: 32 }),
  d4signSafeKey: varchar("d4signSafeKey", { length: 256 }), // Cofre individual do médico
  phone: varchar("phone", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  // Auth local
  passwordHash: varchar("passwordHash", { length: 256 }),
  passwordSalt: varchar("passwordSalt", { length: 64 }),
  mustChangePassword: boolean("mustChangePassword").default(false),
  failedLoginAttempts: int("failedLoginAttempts").default(0),
  lockedUntil: timestamp("lockedUntil"),
  lastPasswordChange: timestamp("lastPasswordChange"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── User Sessions ───────────────────────────────────────────────────────────

export const userSessions = mysqlTable("user_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionToken: varchar("sessionToken", { length: 256 }).notNull().unique(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  loginMethod: varchar("loginMethod", { length: 32 }).default("password").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;

// ─── Granular Permissions (Fase 15) ──────────────────────────────────────────

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canRead: boolean("canRead").default(true).notNull(),
  canUpdate: boolean("canUpdate").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

// ─── Clinic / Empresa (Fase 3) ───────────────────────────────────────────────

export const clinicSettings = mysqlTable("clinic_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  tradeName: varchar("tradeName", { length: 256 }),
  cnpj: varchar("cnpj", { length: 18 }),
  stateRegistration: varchar("stateRegistration", { length: 32 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 256 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 9 }),
  neighborhood: varchar("neighborhood", { length: 128 }),
  logoUrl: text("logoUrl"),
  logoKey: varchar("logoKey", { length: 256 }),
  specialties: json("specialties"), // string[]
  openingHours: json("openingHours"), // { day: string, open: string, close: string }[]
  d4signTokenApi: varchar("d4signTokenApi", { length: 256 }),
  d4signCryptKey: varchar("d4signCryptKey", { length: 256 }),
  d4signSafeKey: varchar("d4signSafeKey", { length: 256 }),
  nfeConfig: json("nfeConfig"), // NF-e config data
  d4signSafeKeyNfe: varchar("d4signSafeKeyNfe", { length: 256 }), // Cofre para Notas Fiscais (CNPJ)
  d4signSafeKeyClinical: varchar("d4signSafeKeyClinical", { length: 256 }), // Cofre para Prontuários (Profissional)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ClinicSettings = typeof clinicSettings.$inferSelect;
export type InsertClinicSettings = typeof clinicSettings.$inferInsert;

// ─── Patients / Pacientes ─────────────────────────────────────────────────────

export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 256 }).notNull(),
  socialName: varchar("socialName", { length: 256 }),
  birthDate: date("birthDate"),
  gender: mysqlEnum("gender", ["masculino", "feminino", "outro", "nao_informado"]).default("nao_informado"),
  biologicalSex: mysqlEnum("biologicalSex", ["masculino", "feminino", "intersexo", "nao_informado"]).default("nao_informado"),
  cpf: varchar("cpf", { length: 14 }).unique(),
  rg: varchar("rg", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  motherName: varchar("motherName", { length: 256 }),
  maritalStatus: mysqlEnum("maritalStatus", ["solteiro", "casado", "divorciado", "viuvo", "uniao_estavel", "nao_informado"]).default("nao_informado"),
  religion: varchar("religion", { length: 128 }).default("Não informada"),
  address: text("address"),
  neighborhood: varchar("neighborhood", { length: 128 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 9 }),
  insuranceName: varchar("insuranceName", { length: 128 }),
  insuranceNumber: varchar("insuranceNumber", { length: 64 }),
  photoUrl: text("photoUrl"),
  photoKey: varchar("photoKey", { length: 256 }),
  bloodType: mysqlEnum("bloodType", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"]).default("desconhecido"),
  allergies: text("allergies"),
  chronicConditions: text("chronicConditions"),
  emergencyContactName: varchar("emergencyContactName", { length: 256 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 20 }),
  referralSource: varchar("referralSource", { length: 128 }),
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

// ─── Medical Record Templates (Fase 4) ──────────────────────────────────────

export const medicalRecordTemplates = mysqlTable("medical_record_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  specialty: varchar("specialty", { length: 128 }),
  description: text("description"),
  sections: json("sections").notNull(), // TemplateSection[]
  isDefault: boolean("isDefault").default(false),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MedicalRecordTemplate = typeof medicalRecordTemplates.$inferSelect;
export type InsertMedicalRecordTemplate = typeof medicalRecordTemplates.$inferInsert;

// ─── Medical Records / Prontuário Eletrônico (CFM 1821/2007) ─────────────────

export const medicalRecords = mysqlTable("medical_records", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  appointmentId: int("appointmentId"),
  doctorId: int("doctorId").notNull(),
  // Template support
  templateId: int("templateId"),
  templateResponses: json("templateResponses"),
  recordType: mysqlEnum("recordType", ["livre", "template", "misto"]).default("livre"),
  // Anamnese
  chiefComplaint: text("chiefComplaint"),
  historyOfPresentIllness: text("historyOfPresentIllness"),
  pastMedicalHistory: text("pastMedicalHistory"),
  familyHistory: text("familyHistory"),
  socialHistory: text("socialHistory"),
  currentMedications: text("currentMedications"),
  allergies: text("allergies"),
  // Exame físico
  physicalExam: text("physicalExam"),
  vitalSigns: json("vitalSigns"),
  // Diagnóstico e conduta
  diagnosis: text("diagnosis"),
  icdCode: varchar("icdCode", { length: 16 }),
  clinicalEvolution: text("clinicalEvolution"),
  treatmentPlan: text("treatmentPlan"),
  // Controle e Segurança Jurídica
  status: mysqlEnum("status", ["rascunho", "salvo", "encerrado", "assinado", "alterado"]).default("rascunho").notNull(),
  isLocked: boolean("isLocked").default(false).notNull(),
  lockedAt: timestamp("lockedAt"),
  lockedByUserId: int("lockedByUserId"),
  signedAt: timestamp("signedAt"),
  signedByDoctorId: int("signedByDoctorId"),
  lastChangeJustification: text("lastChangeJustification"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type InsertMedicalRecord = typeof medicalRecords.$inferInsert;

// ─── Medical Record Chaperones (Ética CFM) ──────────────────────────────────

export const medicalRecordChaperones = mysqlTable("medical_record_chaperones", {
  id: int("id").autoincrement().primaryKey(),
  medicalRecordId: int("medicalRecordId").notNull(),
  userId: int("userId").notNull(),
  role: varchar("role", { length: 64 }).default("assistente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MedicalRecordChaperone = typeof medicalRecordChaperones.$inferSelect;
export type InsertMedicalRecordChaperone = typeof medicalRecordChaperones.$inferInsert;

// ─── Patient Photos (Fase 5) ────────────────────────────────────────────────

export const patientPhotos = mysqlTable("patient_photos", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  medicalRecordId: int("medicalRecordId"),
  category: mysqlEnum("category", ["antes", "depois", "evolucao", "exame", "documento", "outro"]).default("outro").notNull(),
  description: text("description"),
  photoUrl: text("photoUrl").notNull(),
  photoKey: varchar("photoKey", { length: 256 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  annotations: json("annotations"), // Drawing annotations JSON
  sortOrder: int("sortOrder").default(0),
  takenAt: timestamp("takenAt"),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PatientPhoto = typeof patientPhotos.$inferSelect;
export type InsertPatientPhoto = typeof patientPhotos.$inferInsert;

// ─── Patient Documents / Media (Fase 6) ─────────────────────────────────────

export const patientDocuments = mysqlTable("patient_documents", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  type: mysqlEnum("type", ["exame_pdf", "exame_imagem", "video", "rg", "cpf", "convenio", "termo", "outro"]).default("outro").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 256 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSizeBytes: int("fileSizeBytes"),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = typeof patientDocuments.$inferInsert;

// ─── Inventory / Estoque (Fase 7) ───────────────────────────────────────────

export const inventoryProducts = mysqlTable("inventory_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  sku: varchar("sku", { length: 64 }).unique(),
  brand: varchar("brand", { length: 128 }),
  size: varchar("size", { length: 64 }),
  category: varchar("category", { length: 128 }),
  description: text("description"),
  unit: varchar("unit", { length: 32 }).default("un"),
  currentStock: int("currentStock").default(0).notNull(),
  minimumStock: int("minimumStock").default(5),
  costPriceInCents: int("costPriceInCents"),
  expirationDate: date("expirationDate"),
  supplierName: varchar("supplierName", { length: 256 }),
  supplierContact: varchar("supplierContact", { length: 128 }),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryProduct = typeof inventoryProducts.$inferSelect;
export type InsertInventoryProduct = typeof inventoryProducts.$inferInsert;

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  type: mysqlEnum("type", ["entrada", "saida", "ajuste"]).notNull(),
  quantity: int("quantity").notNull(),
  reason: varchar("reason", { length: 256 }),
  patientId: int("patientId"),
  appointmentId: int("appointmentId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovements.$inferInsert;

// ─── CRM / Indicações (Fase 8) ──────────────────────────────────────────────

export const crmIndications = mysqlTable("crm_indications", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  procedureName: varchar("procedureName", { length: 256 }).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["indicado", "agendado", "realizado", "cancelado"]).default("indicado").notNull(),
  indicatedBy: int("indicatedBy").notNull(),
  convertedAt: timestamp("convertedAt"),
  appointmentId: int("appointmentId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CrmIndication = typeof crmIndications.$inferSelect;
export type InsertCrmIndication = typeof crmIndications.$inferInsert;

// ─── Prescriptions / Prescrições Médicas ─────────────────────────────────────

export const prescriptions = mysqlTable("prescriptions", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  medicalRecordId: int("medicalRecordId"),
  appointmentId: int("appointmentId"),
  type: mysqlEnum("type", ["simples", "especial_azul", "especial_amarelo", "antimicrobiano"]).default("simples").notNull(),
  items: json("items"), // Mantido para compatibilidade, mas opcional agora
  content: text("content"), // Novo campo de texto livre
  observations: text("observations"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 256 }),
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
  exams: json("exams"), // Mantido para compatibilidade, mas opcional agora
  content: text("content"), // Novo campo de texto livre
  clinicalIndication: text("clinicalIndication"),
  observations: text("observations"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 256 }),
  d4signDocumentKey: varchar("d4signDocumentKey", { length: 128 }),
  d4signStatus: mysqlEnum("d4signStatus", ["pendente", "enviado", "assinado", "cancelado"]).default("pendente"),
  signedAt: timestamp("signedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExamRequest = typeof examRequests.$inferSelect;
export type InsertExamRequest = typeof examRequests.$inferInsert;

// ─── Prescription & Exam Templates (Ajuste Visual/Funcional) ──────────────────

export const prescriptionTemplates = mysqlTable("prescription_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  content: text("content").notNull(), // Texto livre com o modelo
  type: mysqlEnum("type", ["simples", "especial_azul", "especial_amarelo", "antimicrobiano"]).default("simples").notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PrescriptionTemplate = typeof prescriptionTemplates.$inferSelect;
export type InsertPrescriptionTemplate = typeof prescriptionTemplates.$inferInsert;

export const examRequestTemplates = mysqlTable("exam_request_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  content: text("content").notNull(), // Texto livre com a lista de exames/instruções
  specialty: varchar("specialty", { length: 128 }),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExamRequestTemplate = typeof examRequestTemplates.$inferSelect;
export type InsertExamRequestTemplate = typeof examRequestTemplates.$inferInsert;

// ─── Budget Procedure Catalog (Motor de Orçamentos - Fase 12) ───────────────

export const budgetProcedureCatalog = mysqlTable("budget_procedure_catalog", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  category: varchar("category", { length: 128 }),
  description: text("description"),
  estimatedSessionsMin: int("estimatedSessionsMin").default(1),
  estimatedSessionsMax: int("estimatedSessionsMax").default(1),
  sessionIntervalDays: int("sessionIntervalDays").default(30),
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BudgetProcedureCatalog = typeof budgetProcedureCatalog.$inferSelect;
export type InsertBudgetProcedureCatalog = typeof budgetProcedureCatalog.$inferInsert;

export const budgetProcedureAreas = mysqlTable("budget_procedure_areas", {
  id: int("id").autoincrement().primaryKey(),
  procedureId: int("procedureId").notNull(),
  areaName: varchar("areaName", { length: 128 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  active: boolean("active").default(true).notNull(),
});

export type BudgetProcedureArea = typeof budgetProcedureAreas.$inferSelect;
export type InsertBudgetProcedureArea = typeof budgetProcedureAreas.$inferInsert;

export const budgetProcedurePricing = mysqlTable("budget_procedure_pricing", {
  id: int("id").autoincrement().primaryKey(),
  procedureId: int("procedureId").notNull(),
  areaId: int("areaId").notNull(),
  complexity: mysqlEnum("complexity", ["P", "M", "G"]).notNull(),
  priceInCents: int("priceInCents").notNull(),
  active: boolean("active").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BudgetProcedurePricing = typeof budgetProcedurePricing.$inferSelect;
export type InsertBudgetProcedurePricing = typeof budgetProcedurePricing.$inferInsert;

export const budgetPaymentPlans = mysqlTable("budget_payment_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["a_vista", "parcelado_sem_juros", "parcelado_com_juros", "financiamento", "pagamento_programado"]).notNull(),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  maxInstallments: int("maxInstallments").default(1),
  interestRatePercent: decimal("interestRatePercent", { precision: 5, scale: 2 }).default("0"),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BudgetPaymentPlan = typeof budgetPaymentPlans.$inferSelect;
export type InsertBudgetPaymentPlan = typeof budgetPaymentPlans.$inferInsert;

export const budgets = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  doctorId: int("doctorId").notNull(),
  status: mysqlEnum("status", ["rascunho", "emitido", "aprovado", "rejeitado", "expirado", "cancelado"]).default("rascunho").notNull(),
  totalInCents: int("totalInCents").default(0).notNull(),
  discountInCents: int("discountInCents").default(0),
  finalTotalInCents: int("finalTotalInCents").default(0).notNull(),
  selectedPaymentPlanId: int("selectedPaymentPlanId"),
  paymentConditions: json("paymentConditions"),
  estimatedSessions: int("estimatedSessions"),
  sessionIntervalDescription: varchar("sessionIntervalDescription", { length: 256 }),
  clinicalNotes: text("clinicalNotes"),
  validityDays: int("validityDays").default(10),
  expiresAt: timestamp("expiresAt"),
  approvedAt: timestamp("approvedAt"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = typeof budgets.$inferInsert;

export const budgetItems = mysqlTable("budget_items", {
  id: int("id").autoincrement().primaryKey(),
  budgetId: int("budgetId").notNull(),
  procedureId: int("procedureId").notNull(),
  procedureName: varchar("procedureName", { length: 256 }).notNull(),
  areaId: int("areaId").notNull(),
  areaName: varchar("areaName", { length: 128 }).notNull(),
  complexity: mysqlEnum("complexity", ["P", "M", "G"]).notNull(),
  unitPriceInCents: int("unitPriceInCents").notNull(),
  quantity: int("quantity").default(1).notNull(),
  subtotalInCents: int("subtotalInCents").notNull(),
  sortOrder: int("sortOrder").default(0),
});

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

// ─── Financial / Financeiro (Fase 12) ────────────────────────────────────────

export const financialTransactions = mysqlTable("financial_transactions", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["receita", "despesa"]).notNull(),
  category: varchar("category", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amountInCents: int("amountInCents").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["pix", "dinheiro", "cartao_credito", "cartao_debito", "transferencia", "boleto", "outro"]),
  patientId: int("patientId"),
  budgetId: int("budgetId"),
  appointmentId: int("appointmentId"),
  dueDate: date("dueDate"),
  paidAt: timestamp("paidAt"),
  status: mysqlEnum("status", ["pendente", "pago", "atrasado", "cancelado"]).default("pendente").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = typeof financialTransactions.$inferInsert;

// ─── Chat Messages (Fase 14) ────────────────────────────────────────────────

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  channelId: varchar("channelId", { length: 64 }).notNull().default("geral"),
  senderId: int("senderId").notNull(),
  content: text("content").notNull(),
  messageType: mysqlEnum("messageType", ["text", "file", "system"]).default("text").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 256 }),
  mentions: json("mentions"), // number[] of user IDs
  readBy: json("readBy"), // number[] of user IDs
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Audit Logs / Logs de Auditoria (LGPD) ──────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: int("sessionId"),
  action: varchar("action", { length: 64 }).notNull(),
  resourceType: varchar("resourceType", { length: 64 }).notNull(),
  resourceId: int("resourceId"),
  patientId: int("patientId"),
  details: json("details"),
  dataBefore: json("dataBefore"),
  dataAfter: json("dataAfter"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  integrityHash: varchar("integrityHash", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Document Signatures / Assinaturas ───────────────────────────────────────

export const documentSignatures = mysqlTable("document_signatures", {
  id: int("id").autoincrement().primaryKey(),
  resourceType: mysqlEnum("resourceType", ["prescription", "exam_request", "medical_record", "budget"]).notNull(),
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

// ─── Anamnesis Links (Fase 4) ────────────────────────────────────────────────

export const anamnesisLinks = mysqlTable("anamnesis_links", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  templateId: int("templateId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  responses: json("responses"),
  status: mysqlEnum("status", ["pendente", "preenchido", "expirado"]).default("pendente").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnamnesisLink = typeof anamnesisLinks.$inferSelect;
export type InsertAnamnesisLink = typeof anamnesisLinks.$inferInsert;

// ─── Audio Transcriptions (Fase 11) ─────────────────────────────────────────

export const audioTranscriptions = mysqlTable("audio_transcriptions", {
  id: int("id").autoincrement().primaryKey(),
  medicalRecordId: int("medicalRecordId"),
  patientId: int("patientId").notNull(),
  audioUrl: text("audioUrl").notNull(),
  audioKey: varchar("audioKey", { length: 256 }).notNull(),
  transcription: text("transcription"),
  suggestedDiagnosis: text("suggestedDiagnosis"),
  status: mysqlEnum("status", ["processando", "concluido", "erro"]).default("processando").notNull(),
  durationSeconds: int("durationSeconds"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AudioTranscription = typeof audioTranscriptions.$inferSelect;
export type InsertAudioTranscription = typeof audioTranscriptions.$inferInsert;
