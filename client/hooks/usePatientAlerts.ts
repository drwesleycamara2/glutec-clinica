import { useQuery, useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

/**
 * Hook: usePatientAlerts
 * 
 * Busca todos os alertas ativos para um paciente específico
 * Inclui:
 * - Alertas condicionais de anamnese
 * - Alertas de alergias persistentes
 */
export function usePatientAlerts(patientId: number) {
  return useQuery({
    queryKey: ["patient-alerts", patientId],
    queryFn: async () => {
      // Buscar alertas de anamnese
      const anamnesisAlerts = await fetch(
        `/api/alerts/patient/${patientId}/anamnesis`
      ).then((r) => r.json());

      // Buscar alergias
      const allergies = await fetch(
        `/api/alerts/patient/${patientId}/allergies`
      ).then((r) => r.json());

      return {
        anamnesisAlerts,
        allergies,
      };
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });
}

/**
 * Hook: useAnamnesisQuestionAlerts
 * 
 * Busca alertas configurados para um template de anamnese específico
 */
export function useAnamnesisQuestionAlerts(templateId: number) {
  return useQuery({
    queryKey: ["anamnesis-alerts", templateId],
    queryFn: async () => {
      return fetch(`/api/alerts/template/${templateId}/questions`).then(
        (r) => r.json()
      );
    },
  });
}

/**
 * Hook: useSaveQuestionAlert
 * 
 * Salva a configuração de alerta para uma pergunta de anamnese
 */
export function useSaveQuestionAlert() {
  return useMutation({
    mutationFn: async (data: {
      templateId: number;
      questionId: string;
      triggerResponses: string[];
      alertMessage: string;
      alertTitle?: string;
      severity: "informativo" | "atencao" | "critico";
      displayScreens: string[];
    }) => {
      const response = await fetch("/api/alerts/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Falha ao salvar alerta");
      return response.json();
    },
  });
}

/**
 * Hook: useDismissAlert
 * 
 * Marca um alerta como descartado
 */
export function useDismissAlert() {
  return useMutation({
    mutationFn: async (data: {
      alertId: number;
      alertType: "anamnesis_conditional" | "allergy_persistent";
    }) => {
      const response = await fetch("/api/alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Falha ao descartar alerta");
      return response.json();
    },
  });
}

/**
 * Hook: useLogAlertView
 * 
 * Registra quando um alerta foi visualizado (para auditoria)
 */
export function useLogAlertView() {
  return useMutation({
    mutationFn: async (data: {
      alertType: "anamnesis_conditional" | "allergy_persistent";
      patientId: number;
      alertId: number;
      screen: string;
    }) => {
      const response = await fetch("/api/alerts/log-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Falha ao registrar visualização");
      return response.json();
    },
  });
}
