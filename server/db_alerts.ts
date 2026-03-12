import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  anamnesisQuestionAlerts,
  patientAnamnesisAlerts,
  patientAllergies,
  alertDisplayLog,
} from "../drizzle/schema_alerts";

/**
 * Salvar configuração de alerta para uma pergunta de anamnese
 */
export async function saveQuestionAlert(data: {
  templateId: number;
  questionId: string;
  triggerResponses: string[];
  alertMessage: string;
  alertTitle?: string;
  severity: "informativo" | "atencao" | "critico";
  displayScreens: string[];
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db.insert(anamnesisQuestionAlerts).values({
    templateId: data.templateId,
    questionId: data.questionId,
    triggerResponses: data.triggerResponses,
    alertMessage: data.alertMessage,
    alertTitle: data.alertTitle,
    severity: data.severity,
    displayScreens: data.displayScreens,
    active: true,
    createdBy: data.createdBy,
  });

  return result;
}

/**
 * Buscar alertas configurados para um template de anamnese
 */
export async function getTemplateAlerts(templateId: number) {
  const db = await getDb();
  if (!db) return [];

  const alerts = await db
    .select()
    .from(anamnesisQuestionAlerts)
    .where(
      and(
        eq(anamnesisQuestionAlerts.templateId, templateId),
        eq(anamnesisQuestionAlerts.active, true)
      )
    );

  return alerts;
}

/**
 * Registrar um alerta ativo para um paciente
 * (quando ele responde uma pergunta que aciona um alerta)
 */
export async function createPatientAlert(data: {
  patientId: number;
  medicalRecordId?: number;
  questionAlertId: number;
  alertMessage: string;
  alertTitle?: string;
  severity: "informativo" | "atencao" | "critico";
  displayScreens: string[];
  triggerResponse: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db.insert(patientAnamnesisAlerts).values({
    patientId: data.patientId,
    medicalRecordId: data.medicalRecordId,
    questionAlertId: data.questionAlertId,
    alertMessage: data.alertMessage,
    alertTitle: data.alertTitle,
    severity: data.severity,
    displayScreens: data.displayScreens,
    triggerResponse: data.triggerResponse,
    isActive: true,
  });

  return result;
}

/**
 * Buscar alertas ativos para um paciente
 */
export async function getPatientAlerts(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  const alerts = await db
    .select()
    .from(patientAnamnesisAlerts)
    .where(
      and(
        eq(patientAnamnesisAlerts.patientId, patientId),
        eq(patientAnamnesisAlerts.isActive, true)
      )
    );

  return alerts;
}

/**
 * Descartar um alerta (marcar como não ativo)
 */
export async function dismissAlert(alertId: number, dismissedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(patientAnamnesisAlerts)
    .set({
      isActive: false,
      dismissedAt: new Date(),
      dismissedBy: dismissedBy,
    })
    .where(eq(patientAnamnesisAlerts.id, alertId));
}

/**
 * Registrar alergia de um paciente
 */
export async function addPatientAllergy(data: {
  patientId: number;
  allergen: string;
  reactionType?: string;
  severity: "leve" | "moderada" | "grave" | "desconhecida";
  description?: string;
  source: "cadastro_paciente" | "anamnese" | "evolucao" | "outro";
  medicalRecordId?: number;
  recordedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db.insert(patientAllergies).values({
    patientId: data.patientId,
    allergen: data.allergen,
    reactionType: data.reactionType,
    severity: data.severity,
    description: data.description,
    source: data.source,
    medicalRecordId: data.medicalRecordId,
    active: true,
    recordedBy: data.recordedBy,
    recordedAt: new Date(),
  });

  return result;
}

/**
 * Buscar alergias de um paciente
 */
export async function getPatientAllergies(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  const allergies = await db
    .select()
    .from(patientAllergies)
    .where(
      and(
        eq(patientAllergies.patientId, patientId),
        eq(patientAllergies.active, true)
      )
    );

  return allergies;
}

/**
 * Registrar visualização de alerta (para auditoria)
 */
export async function logAlertView(data: {
  alertType: "anamnesis_conditional" | "allergy_persistent";
  patientId: number;
  alertId: number;
  screen: string;
  viewedBy: number;
  sessionId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db.insert(alertDisplayLog).values({
    alertType: data.alertType,
    patientId: data.patientId,
    alertId: data.alertId,
    screen: data.screen,
    sessionId: data.sessionId,
    viewedAt: new Date(),
    viewedBy: data.viewedBy,
  });
}
