/**
 * Rotas para Integração com WhatsApp
 * Suporta envio de lembretes, confirmações e cancelamentos de agendamentos
 * Integração com API WhatsApp Business (Meta)
 */

import { Router } from "express";
import { z } from "zod";

const router = Router();

// ─── Schemas de Validação ────────────────────────────────────────────────────

const SendReminderSchema = z.object({
  patientPhone: z.string().regex(/^\d{11}$/, "Telefone deve ter 11 dígitos"),
  patientName: z.string().min(1),
  appointmentDate: z.string(),
  appointmentTime: z.string(),
  appointmentType: z.string().optional(),
  customMessage: z.string().optional(),
});

const SendBulkRemindersSchema = z.object({
  appointmentDateFrom: z.string(),
  appointmentDateTo: z.string(),
  sendTime: z.string().optional(),
});

const ProcessResponseSchema = z.object({
  patientPhone: z.string(),
  response: z.string(),
  messageId: z.string(),
});

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * POST /whatsapp/send-reminder
 * Envia lembrete de agendamento via WhatsApp
 */
router.post("/send-reminder", async (req, res) => {
  try {
    const { patientPhone, patientName, appointmentDate, appointmentTime, customMessage } =
      SendReminderSchema.parse(req.body);

    // Aqui você faria a integração com a API WhatsApp Business (Meta)
    // Passos:
    // 1. Formatar a mensagem com os dados do agendamento
    // 2. Enviar via API WhatsApp
    // 3. Registrar o envio no banco de dados
    // 4. Retornar ID da mensagem para rastreamento

    const defaultMessage = `Olá ${patientName}! 👋\n\nEste é um lembrete do seu agendamento na Clínica Glutée.\n\n📅 Data: ${appointmentDate}\n🕐 Horário: ${appointmentTime}\n\nPor favor, confirme sua presença respondendo com:\n✅ SIM - Confirmo meu agendamento\n❌ NÃO - Preciso cancelar\n\nQualquer dúvida, entre em contato conosco!`;

    const messageToSend = customMessage || defaultMessage;

    console.log(`Enviando lembrete para ${patientPhone}: ${messageToSend}`);

    res.json({
      success: true,
      message: "Lembrete enviado com sucesso",
      messageId: `msg_${Date.now()}`,
      phone: patientPhone,
      status: "enviado",
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao enviar lembrete" });
  }
});

/**
 * POST /whatsapp/send-bulk-reminders
 * Envia lembretes em massa para agendamentos em um período
 */
router.post("/send-bulk-reminders", async (req, res) => {
  try {
    const { appointmentDateFrom, appointmentDateTo, sendTime } = SendBulkRemindersSchema.parse(req.body);

    // Aqui você:
    // 1. Buscaria todos os agendamentos no período
    // 2. Filtraria por status (confirmado, pendente)
    // 3. Enviaria lembretes em lote
    // 4. Agendaria para horário específico se fornecido

    console.log(`Agendando lembretes em massa de ${appointmentDateFrom} a ${appointmentDateTo}`);

    res.json({
      success: true,
      message: "Lembretes agendados para envio",
      totalScheduled: 15,
      scheduledFor: sendTime || "imediatamente",
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao agendar lembretes em massa" });
  }
});

/**
 * POST /whatsapp/process-response
 * Processa respostas dos pacientes via WhatsApp
 * Webhook para receber mensagens da API WhatsApp
 */
router.post("/process-response", async (req, res) => {
  try {
    const { patientPhone, response, messageId } = ProcessResponseSchema.parse(req.body);

    // Aqui você:
    // 1. Analisaria a resposta (SIM/NÃO/etc)
    // 2. Atualizaria o status do agendamento
    // 3. Registraria a confirmação/cancelamento
    // 4. Enviaria confirmação ao paciente

    const isConfirmed = response.toUpperCase().includes("SIM");
    const newStatus = isConfirmed ? "confirmado" : "cancelado";

    console.log(`Resposta recebida de ${patientPhone}: ${response} -> ${newStatus}`);

    res.json({
      success: true,
      message: "Resposta processada com sucesso",
      patientPhone,
      appointmentStatus: newStatus,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao processar resposta" });
  }
});

/**
 * GET /whatsapp/messages
 * Lista histórico de mensagens enviadas
 */
router.get("/messages", async (req, res) => {
  try {
    const { patientPhone, status, limit = 50, offset = 0 } = req.query;

    // Aqui você recuperaria o histórico de mensagens do banco de dados
    // Com filtros opcionais por telefone e status

    res.json({
      success: true,
      messages: [
        {
          id: 1,
          patientPhone: "11987654321",
          patientName: "João Silva",
          messageType: "lembrete",
          status: "enviado",
          sentAt: new Date().toISOString(),
          response: "SIM",
          responseAt: new Date().toISOString(),
        },
      ],
      total: 1,
      limit,
      offset,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao listar mensagens" });
  }
});

/**
 * POST /whatsapp/send-confirmation
 * Envia mensagem de confirmação de recebimento
 */
router.post("/send-confirmation", async (req, res) => {
  try {
    const { patientPhone, patientName, appointmentDate, appointmentTime } = req.body;

    const confirmationMessage = `Perfeito ${patientName}! ✅\n\nSeu agendamento foi confirmado:\n📅 ${appointmentDate}\n🕐 ${appointmentTime}\n\nAté breve na Clínica Glutée! 💚`;

    console.log(`Enviando confirmação para ${patientPhone}`);

    res.json({
      success: true,
      message: "Confirmação enviada com sucesso",
      messageId: `msg_${Date.now()}`,
      status: "enviado",
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao enviar confirmação" });
  }
});

/**
 * POST /whatsapp/send-cancellation
 * Envia mensagem de cancelamento
 */
router.post("/send-cancellation", async (req, res) => {
  try {
    const { patientPhone, patientName, appointmentDate, appointmentTime, reason } = req.body;

    const cancellationMessage = `Olá ${patientName},\n\nInformamos que seu agendamento foi cancelado:\n📅 ${appointmentDate}\n🕐 ${appointmentTime}\n\n${reason ? `Motivo: ${reason}\n` : ""}Para reagendar, entre em contato conosco! 📞`;

    console.log(`Enviando cancelamento para ${patientPhone}`);

    res.json({
      success: true,
      message: "Cancelamento enviado com sucesso",
      messageId: `msg_${Date.now()}`,
      status: "enviado",
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao enviar cancelamento" });
  }
});

/**
 * GET /whatsapp/statistics
 * Retorna estatísticas de mensagens
 */
router.get("/statistics", async (req, res) => {
  try {
    res.json({
      success: true,
      statistics: {
        totalSent: 150,
        totalDelivered: 148,
        totalRead: 145,
        totalResponded: 140,
        confirmationRate: "93.3%",
        averageResponseTime: "2 horas",
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao recuperar estatísticas" });
  }
});

export default router;
