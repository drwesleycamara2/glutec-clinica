import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertDisplay, AllergyAlert, Alert as AlertType } from "./AlertDisplay";
import { useLogAlertView } from "@/hooks/usePatientAlerts";

interface PatientAlertProviderProps {
  patientId: number;
  userId: number;
  screen: "dashboard" | "prontuario" | "evolucao" | "resumo";
  children: React.ReactNode;
}

/**
 * PatientAlertProvider
 * 
 * Componente wrapper que:
 * 1. Busca alertas do paciente (anamnese + alergias)
 * 2. Filtra alertas para a tela atual
 * 3. Exibe alertas de forma proeminente
 * 4. Registra visualizações para auditoria
 * 
 * Uso:
 * <PatientAlertProvider patientId={123} userId={456} screen="dashboard">
 *   <DashboardContent />
 * </PatientAlertProvider>
 */
export function PatientAlertProvider({
  patientId,
  userId,
  screen,
  children,
}: PatientAlertProviderProps) {
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const logAlertView = useLogAlertView();

  // Buscar alertas de anamnese
  const { data: anamnesisAlertsData } = useQuery({
    queryKey: ["patient-anamnesis-alerts", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/alerts/patient/${patientId}/anamnesis`);
      if (!response.ok) throw new Error("Falha ao buscar alertas");
      return response.json();
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Buscar alergias
  const { data: allergiesData } = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/alerts/patient/${patientId}/allergies`);
      if (!response.ok) throw new Error("Falha ao buscar alergias");
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Filtrar alertas para a tela atual
  const visibleAlerts = React.useMemo(() => {
    const alerts: AlertType[] = [];

    // Adicionar alertas de anamnese que devem aparecer nesta tela
    if (anamnesisAlertsData) {
      anamnesisAlertsData.forEach((alert: any) => {
        if (
          alert.displayScreens.includes(screen) &&
          !dismissedAlerts.includes(`anamnesis-${alert.id}`)
        ) {
          alerts.push({
            id: `anamnesis-${alert.id}`,
            type: "anamnesis_conditional",
            title: alert.alertTitle || "Alerta de Anamnese",
            message: alert.alertMessage,
            severity: alert.severity,
            dismissible: true,
            onDismiss: () => handleDismissAlert(alert.id, "anamnesis_conditional"),
          });

          // Registrar visualização
          logAlertView.mutate({
            alertType: "anamnesis_conditional",
            patientId,
            alertId: alert.id,
            screen,
          });
        }
      });
    }

    return alerts;
  }, [anamnesisAlertsData, screen, dismissedAlerts, patientId]);

  // Preparar dados de alergias para exibição
  const allergiesForDisplay = React.useMemo(() => {
    if (!allergiesData) return [];
    return allergiesData.map((allergy: any) => ({
      allergen: allergy.allergen,
      severity: allergy.severity,
      reactionType: allergy.reactionType,
    }));
  }, [allergiesData]);

  // Registrar visualização de alergias
  useEffect(() => {
    if (allergiesForDisplay.length > 0) {
      logAlertView.mutate({
        alertType: "allergy_persistent",
        patientId,
        alertId: patientId, // Usar patientId como referência
        screen,
      });
    }
  }, [allergiesForDisplay, patientId, screen]);

  const handleDismissAlert = (alertId: number, alertType: string) => {
    setDismissedAlerts((prev) => [...prev, `${alertType}-${alertId}`]);

    // Chamar API para registrar descarte
    fetch("/api/alerts/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId, alertType }),
    }).catch(console.error);
  };

  return (
    <div className="relative">
      {/* Alertas de Anamnese */}
      {visibleAlerts.length > 0 && (
        <AlertDisplay alerts={visibleAlerts} position="inline" className="mb-4" />
      )}

      {/* Alertas de Alergias (sempre visível se houver) */}
      {allergiesForDisplay.length > 0 && (
        <div className="mb-4">
          <AllergyAlert allergies={allergiesForDisplay} compact={false} />
        </div>
      )}

      {/* Conteúdo da página */}
      {children}
    </div>
  );
}

/**
 * usePatientAlertsContext
 * Hook para acessar alertas em componentes filhos (opcional)
 */
export function usePatientAlertsContext() {
  const context = React.useContext(PatientAlertsContext);
  if (!context) {
    throw new Error("usePatientAlertsContext deve ser usado dentro de PatientAlertProvider");
  }
  return context;
}

interface PatientAlertsContextType {
  patientId: number;
  screen: "dashboard" | "prontuario" | "evolucao" | "resumo";
  alerts: AlertType[];
  allergies: any[];
}

const PatientAlertsContext = React.createContext<PatientAlertsContextType | null>(null);
