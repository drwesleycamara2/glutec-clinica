import { Router, Request, Response } from "express";
import {
  saveQuestionAlert,
  getTemplateAlerts,
  createPatientAlert,
  getPatientAlerts,
  dismissAlert,
  addPatientAllergy,
  getPatientAllergies,
  logAlertView,
} from "../db_alerts";
import { getPatient, createAuditLog } from "../db";

const router = Router();

// ─── Endpoints para Configuração de Alertas em Perguntas ─────────────────────

/**
 * POST /api/alerts/question
 * Salvar configuração de alerta para uma pergunta de anamnese
 */
router.post("/question", async (req: Request, res: Response) => {
  try {
    const { templateId, questionId, triggerResponses, alertMessage, alertTitle, severity, displayScreens } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!templateId || !questionId || !triggerResponses || !alertMessage || !severity || !displayScreens) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    const result = await saveQuestionAlert({
      templateId,
      questionId,
      triggerResponses,
      alertMessage,
      alertTitle,
      severity,
      displayScreens,
      createdBy: userId,
    });

    // Log de auditoria
    await createAuditLog({
      userId,
      action: "create_question_alert",
      resourceType: "anamnesis_question_alert",
      resourceId: result[0],
      dataBefore: null,
      dataAfter: JSON.stringify({ templateId, questionId, severity }),
    });

    res.json({ success: true, id: result[0] });
  } catch (error) {
    console.error("Erro ao salvar alerta:", error);
    res.status(500).json({ error: "Erro ao salvar alerta" });
  }
});

/**
 * GET /api/alerts/template/:templateId/questions
 * Buscar alertas configurados para um template de anamnese
 */
router.get("/template/:templateId/questions", async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const alerts = await getTemplateAlerts(parseInt(templateId));
    res.json(alerts);
  } catch (error) {
    console.error("Erro ao buscar alertas:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

// ─── Endpoints para Alertas de Pacientes ──────────────────────────────────────

/**
 * GET /api/alerts/patient/:patientId/anamnesis
 * Buscar alertas de anamnese ativos para um paciente
 */
router.get("/patient/:patientId/anamnesis", async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const userId = (req as any).user?.id;

    // Verificar permissão de acesso ao paciente
    const patient = await getPatient(parseInt(patientId));
    if (!patient) {
      return res.status(404).json({ error: "Paciente não encontrado" });
    }

    const alerts = await getPatientAlerts(parseInt(patientId));

    // Log de auditoria
    if (userId) {
      await createAuditLog({
        userId,
        action: "view_patient_alerts",
        resourceType: "patient",
        resourceId: parseInt(patientId),
        dataBefore: null,
        dataAfter: null,
      });
    }

    res.json(alerts);
  } catch (error) {
    console.error("Erro ao buscar alertas do paciente:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

/**
 * GET /api/alerts/patient/:patientId/allergies
 * Buscar alergias de um paciente
 */
router.get("/patient/:patientId/allergies", async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const userId = (req as any).user?.id;

    // Verificar permissão de acesso ao paciente
    const patient = await getPatient(parseInt(patientId));
    if (!patient) {
      return res.status(404).json({ error: "Paciente não encontrado" });
    }

    const allergies = await getPatientAllergies(parseInt(patientId));

    // Log de auditoria
    if (userId) {
      await createAuditLog({
        userId,
        action: "view_patient_allergies",
        resourceType: "patient",
        resourceId: parseInt(patientId),
        dataBefore: null,
        dataAfter: null,
      });
    }

    res.json(allergies);
  } catch (error) {
    console.error("Erro ao buscar alergias:", error);
    res.status(500).json({ error: "Erro ao buscar alergias" });
  }
});

/**
 * POST /api/alerts/patient/:patientId/allergy
 * Adicionar alergia para um paciente
 */
router.post("/patient/:patientId/allergy", async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { allergen, reactionType, severity, description, source, medicalRecordId } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!allergen || !severity) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    const result = await addPatientAllergy({
      patientId: parseInt(patientId),
      allergen,
      reactionType,
      severity,
      description,
      source: source || "outro",
      medicalRecordId: medicalRecordId ? parseInt(medicalRecordId) : undefined,
      recordedBy: userId,
    });

    // Log de auditoria
    await createAuditLog({
      userId,
      action: "create_patient_allergy",
      resourceType: "patient_allergy",
      resourceId: result[0],
      dataBefore: null,
      dataAfter: JSON.stringify({ allergen, severity }),
    });

    res.json({ success: true, id: result[0] });
  } catch (error) {
    console.error("Erro ao adicionar alergia:", error);
    res.status(500).json({ error: "Erro ao adicionar alergia" });
  }
});

/**
 * POST /api/alerts/dismiss
 * Descartar um alerta
 */
router.post("/dismiss", async (req: Request, res: Response) => {
  try {
    const { alertId, alertType } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!alertId || !alertType) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    if (alertType === "anamnesis_conditional") {
      await dismissAlert(alertId, userId);
    }

    // Log de auditoria
    await createAuditLog({
      userId,
      action: "dismiss_alert",
      resourceType: "alert",
      resourceId: alertId,
      dataBefore: null,
      dataAfter: JSON.stringify({ alertType }),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao descartar alerta:", error);
    res.status(500).json({ error: "Erro ao descartar alerta" });
  }
});

/**
 * POST /api/alerts/log-view
 * Registrar visualização de alerta (para auditoria)
 */
router.post("/log-view", async (req: Request, res: Response) => {
  try {
    const { alertType, patientId, alertId, screen } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    if (!alertType || !patientId || !alertId || !screen) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    await logAlertView({
      alertType,
      patientId: parseInt(patientId),
      alertId,
      screen,
      viewedBy: userId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao registrar visualização:", error);
    res.status(500).json({ error: "Erro ao registrar visualização" });
  }
});

export default router;
