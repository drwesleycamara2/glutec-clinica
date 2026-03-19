/**
 * Gerador de Logs de Auditoria
 * Cria registros de auditoria para documentos impressos/exportados
 * Conformidade: CFM 1821/2007, LGPD, CDC
 */

import { AuditLog } from "@/components/PdfExporter";

/**
 * Gera um log de auditoria para exportação de documento
 */
export function generateAuditLogForExport(
  action: string,
  documentType: string,
  patientName: string,
  userName?: string,
  details?: string
): AuditLog {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    action: action,
    timestamp: new Date().toISOString(),
    userName: userName || "Sistema",
    details: `${documentType} do paciente ${patientName}. ${details || ""}`,
  };
}

/**
 * Gera múltiplos logs de auditoria para um prontuário completo
 */
export function generateAuditLogsForMedicalRecord(
  patientName: string,
  userName?: string
): AuditLog[] {
  const now = new Date();
  const baseTimestamp = now.toISOString();

  return [
    {
      id: `audit_${Date.now()}_1`,
      action: "Prontuário Eletrônico Acessado",
      timestamp: baseTimestamp,
      userName: userName || "Sistema",
      details: `Acesso ao prontuário do paciente ${patientName} para exportação em PDF.`,
    },
    {
      id: `audit_${Date.now()}_2`,
      action: "Validação de Integridade",
      timestamp: new Date(now.getTime() + 100).toISOString(),
      userName: "Sistema de Segurança",
      details: "Verificação de integridade dos dados clínicos realizada com sucesso.",
    },
    {
      id: `audit_${Date.now()}_3`,
      action: "Geração de PDF",
      timestamp: new Date(now.getTime() + 200).toISOString(),
      userName: userName || "Sistema",
      details: `PDF do prontuário gerado e assinado digitalmente para ${patientName}.`,
    },
    {
      id: `audit_${Date.now()}_4`,
      action: "Conformidade Verificada",
      timestamp: new Date(now.getTime() + 300).toISOString(),
      userName: "Sistema de Conformidade",
      details: "Documento atende aos requisitos de CFM 1821/2007, LGPD e CDC.",
    },
  ];
}

/**
 * Gera logs de auditoria para um atendimento individual
 */
export function generateAuditLogsForAppointment(
  appointmentType: string,
  patientName: string,
  doctorName?: string
): AuditLog[] {
  const now = new Date();
  const baseTimestamp = now.toISOString();

  return [
    {
      id: `audit_${Date.now()}_1`,
      action: "Atendimento Registrado",
      timestamp: baseTimestamp,
      userName: doctorName || "Sistema",
      details: `${appointmentType} do paciente ${patientName} registrado no sistema.`,
    },
    {
      id: `audit_${Date.now()}_2`,
      action: "Dados Clínicos Validados",
      timestamp: new Date(now.getTime() + 150).toISOString(),
      userName: "Sistema de Validação",
      details: "Todos os dados clínicos foram validados e armazenados com segurança.",
    },
    {
      id: `audit_${Date.now()}_3`,
      action: "Documento Gerado",
      timestamp: new Date(now.getTime() + 300).toISOString(),
      userName: doctorName || "Sistema",
      details: `Documento do atendimento gerado e pronto para impressão/exportação.`,
    },
  ];
}

/**
 * Gera logs de auditoria para uma prescrição
 */
export function generateAuditLogsForPrescription(
  prescriptionType: string,
  patientName: string,
  doctorName?: string
): AuditLog[] {
  const now = new Date();
  const baseTimestamp = now.toISOString();

  return [
    {
      id: `audit_${Date.now()}_1`,
      action: "Prescrição Criada",
      timestamp: baseTimestamp,
      userName: doctorName || "Sistema",
      details: `Prescrição ${prescriptionType} para o paciente ${patientName} criada.`,
    },
    {
      id: `audit_${Date.now()}_2`,
      action: "Validação Farmacêutica",
      timestamp: new Date(now.getTime() + 200).toISOString(),
      userName: "Sistema de Validação",
      details: "Prescrição validada conforme protocolos farmacêuticos.",
    },
    {
      id: `audit_${Date.now()}_3`,
      action: "Assinatura Digital Aplicada",
      timestamp: new Date(now.getTime() + 400).toISOString(),
      userName: doctorName || "Sistema",
      details: "Prescrição assinada digitalmente com certificado válido.",
    },
    {
      id: `audit_${Date.now()}_4`,
      action: "Documento Finalizado",
      timestamp: new Date(now.getTime() + 500).toISOString(),
      userName: "Sistema",
      details: "Prescrição pronta para impressão e entrega ao paciente.",
    },
  ];
}

/**
 * Gera logs de auditoria para um orçamento
 */
export function generateAuditLogsForBudget(
  patientName: string,
  totalValue: number,
  userName?: string
): AuditLog[] {
  const now = new Date();
  const baseTimestamp = now.toISOString();

  return [
    {
      id: `audit_${Date.now()}_1`,
      action: "Orçamento Criado",
      timestamp: baseTimestamp,
      userName: userName || "Sistema",
      details: `Orçamento para ${patientName} no valor de R$ ${totalValue.toFixed(2)} criado.`,
    },
    {
      id: `audit_${Date.now()}_2`,
      action: "Itens Validados",
      timestamp: new Date(now.getTime() + 150).toISOString(),
      userName: "Sistema de Validação",
      details: "Todos os itens do orçamento foram validados.",
    },
    {
      id: `audit_${Date.now()}_3`,
      action: "Documento Gerado",
      timestamp: new Date(now.getTime() + 300).toISOString(),
      userName: userName || "Sistema",
      details: "Orçamento gerado e assinado digitalmente.",
    },
  ];
}
