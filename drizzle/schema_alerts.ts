// ─── Alert Configuration Tables ──────────────────────────────────────────────────
// Estas tabelas suportam o sistema de Alertas Condicionais de Anamnese e Alertas de Alergias

import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/mysql-core";

/**
 * Tabela: anamnesisQuestionAlerts
 * Descrição: Armazena as configurações de alertas para perguntas específicas em formulários de anamnese.
 * 
 * Exemplo de uso:
 * - Uma pergunta "Você fuma?" pode ter um alerta configurado que é acionado quando a resposta é "Sim"
 * - Este alerta será exibido em telas específicas (Dashboard, Prontuário, Evolução)
 */
export const anamnesisQuestionAlerts = mysqlTable("anamnesis_question_alerts", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência ao template de anamnese e à pergunta específica
  templateId: int("templateId").notNull(),
  questionId: varchar("questionId", { length: 256 }).notNull(), // ID único da pergunta dentro do template (ex: "q_1_smoking")
  
  // Resposta(s) que acionam o alerta (pode ser múltipla)
  triggerResponses: json("triggerResponses").notNull(), // string[] - ex: ["Sim", "Fumante ativo"]
  
  // Configuração do alerta
  alertMessage: text("alertMessage").notNull(), // Mensagem a ser exibida
  alertTitle: varchar("alertTitle", { length: 256 }), // Título do alerta (opcional)
  severity: mysqlEnum("severity", ["informativo", "atencao", "critico"]).default("atencao").notNull(),
  
  // Telas onde o alerta deve ser exibido
  displayScreens: json("displayScreens").notNull(), // string[] - ex: ["dashboard", "prontuario", "evolucao", "resumo"]
  
  // Controle
  active: boolean("active").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnamnesisQuestionAlert = typeof anamnesisQuestionAlerts.$inferSelect;
export type InsertAnamnesisQuestionAlert = typeof anamnesisQuestionAlerts.$inferInsert;

/**
 * Tabela: patientAnamnesisAlerts
 * Descrição: Armazena os alertas ativos para cada paciente, baseado nas respostas de anamnese.
 * 
 * Esta tabela é uma "materialização" dos alertas ativos para um paciente, facilitando
 * a consulta rápida de quais alertas devem ser exibidos em suas telas de atendimento.
 */
export const patientAnamnesisAlerts = mysqlTable("patient_anamnesis_alerts", {
  id: int("id").autoincrement().primaryKey(),
  
  // Referência ao paciente e ao prontuário/anamnese
  patientId: int("patientId").notNull(),
  medicalRecordId: int("medicalRecordId"), // Prontuário específico onde a resposta foi registrada
  
  // Referência ao alerta configurado
  questionAlertId: int("questionAlertId").notNull(),
  
  // Informações do alerta para rápido acesso (desnormalização para performance)
  alertMessage: text("alertMessage").notNull(),
  alertTitle: varchar("alertTitle", { length: 256 }),
  severity: mysqlEnum("severity", ["informativo", "atencao", "critico"]).default("atencao").notNull(),
  displayScreens: json("displayScreens").notNull(), // string[]
  
  // Resposta que acionou o alerta
  triggerResponse: varchar("triggerResponse", { length: 256 }).notNull(),
  
  // Controle de visualização
  isActive: boolean("isActive").default(true).notNull(),
  dismissedAt: timestamp("dismissedAt"), // Quando o alerta foi descartado (se aplicável)
  dismissedBy: int("dismissedBy"), // Qual usuário descartou
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PatientAnamnesisAlert = typeof patientAnamnesisAlerts.$inferSelect;
export type InsertPatientAnamnesisAlert = typeof patientAnamnesisAlerts.$inferInsert;

/**
 * Tabela: patientAllergies
 * Descrição: Tabela centralizada para armazenar alergias de pacientes.
 * 
 * As alergias podem ser registradas em:
 * 1. Cadastro do paciente (campo patients.allergies)
 * 2. Prontuário/Anamnese (campo medical_records.allergies)
 * 3. Evoluções subsequentes
 * 
 * Esta tabela centraliza todas as alergias para facilitar a exibição contínua de alertas.
 */
export const patientAllergies = mysqlTable("patient_allergies", {
  id: int("id").autoincrement().primaryKey(),
  
  patientId: int("patientId").notNull(),
  
  // Detalhes da alergia
  allergen: varchar("allergen", { length: 256 }).notNull(), // Ex: "Penicilina", "Amendoim", "Dipirona"
  reactionType: varchar("reactionType", { length: 128 }), // Ex: "Anafilaxia", "Urticária", "Angioedema"
  severity: mysqlEnum("severity", ["leve", "moderada", "grave", "desconhecida"]).default("desconhecida").notNull(),
  description: text("description"), // Descrição adicional da reação
  
  // Rastreamento da origem
  source: mysqlEnum("source", ["cadastro_paciente", "anamnese", "evolucao", "outro"]).default("outro").notNull(),
  medicalRecordId: int("medicalRecordId"), // Referência ao prontuário/evolução onde foi registrada
  
  // Controle
  active: boolean("active").default(true).notNull(),
  recordedBy: int("recordedBy").notNull(),
  recordedAt: timestamp("recordedAt").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PatientAllergy = typeof patientAllergies.$inferSelect;
export type InsertPatientAllergy = typeof patientAllergies.$inferInsert;

/**
 * Tabela: alertDisplayLog
 * Descrição: Log de quando e onde os alertas foram exibidos para auditoria.
 * 
 * Esta tabela é opcional mas recomendada para conformidade com LGPD e auditoria clínica.
 * Permite rastrear quando um alerta foi visto/reconhecido pela equipe.
 */
export const alertDisplayLog = mysqlTable("alert_display_log", {
  id: int("id").autoincrement().primaryKey(),
  
  // Tipo de alerta
  alertType: mysqlEnum("alertType", ["anamnesis_conditional", "allergy_persistent"]).notNull(),
  
  // Referências
  patientId: int("patientId").notNull(),
  alertId: int("alertId"), // ID do alerta (pode ser questionAlertId ou allergyId)
  
  // Contexto de exibição
  screen: varchar("screen", { length: 128 }).notNull(), // Ex: "dashboard", "prontuario", "evolucao"
  sessionId: varchar("sessionId", { length: 256 }), // Sessão do usuário
  
  // Ação do usuário
  viewedAt: timestamp("viewedAt").notNull(),
  viewedBy: int("viewedBy").notNull(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledgedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlertDisplayLog = typeof alertDisplayLog.$inferSelect;
export type InsertAlertDisplayLog = typeof alertDisplayLog.$inferInsert;
