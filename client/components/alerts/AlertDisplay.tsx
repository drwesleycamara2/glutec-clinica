import React from "react";
import { AlertCircle, AlertTriangle, Info, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Alert {
  id: string;
  type: "anamnesis_conditional" | "allergy_persistent";
  title: string;
  message: string;
  severity: "informativo" | "atencao" | "critico";
  dismissible?: boolean;
  onDismiss?: (id: string) => void;
}

interface AlertDisplayProps {
  alerts: Alert[];
  position?: "top" | "side" | "inline";
  className?: string;
}

const SEVERITY_STYLES = {
  informativo: {
    container: "bg-blue-50 border-blue-200 border-l-4",
    icon: "text-blue-600",
    title: "text-blue-900",
    message: "text-blue-800",
    button: "hover:bg-blue-100",
  },
  atencao: {
    container: "bg-yellow-50 border-yellow-200 border-l-4",
    icon: "text-yellow-600",
    title: "text-yellow-900",
    message: "text-yellow-800",
    button: "hover:bg-yellow-100",
  },
  critico: {
    container: "bg-red-50 border-red-200 border-l-4",
    icon: "text-red-600",
    title: "text-red-900",
    message: "text-red-800",
    button: "hover:bg-red-100",
  },
};

const SEVERITY_ICONS = {
  informativo: <Info className="w-5 h-5" />,
  atencao: <AlertTriangle className="w-5 h-5" />,
  critico: <AlertCircle className="w-5 h-5" />,
};

/**
 * AlertDisplay
 * Componente para exibir alertas de forma proeminente em diferentes posições
 * 
 * Uso:
 * <AlertDisplay
 *   alerts={[
 *     {
 *       id: "alert-1",
 *       type: "allergy_persistent",
 *       title: "Alergia Crítica",
 *       message: "Paciente é alérgico a Penicilina",
 *       severity: "critico",
 *       dismissible: false,
 *     }
 *   ]}
 *   position="top"
 * />
 */
export function AlertDisplay({ alerts, position = "inline", className }: AlertDisplayProps) {
  if (alerts.length === 0) return null;

  const positionClasses = {
    top: "fixed top-0 left-0 right-0 z-50 p-4 space-y-2",
    side: "fixed right-0 top-20 z-50 w-96 p-4 space-y-2 max-h-[80vh] overflow-y-auto",
    inline: "space-y-2",
  };

  return (
    <div className={cn(positionClasses[position], className)}>
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </div>
  );
}

interface AlertItemProps {
  alert: Alert;
}

function AlertItem({ alert }: AlertItemProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  const styles = SEVERITY_STYLES[alert.severity];
  const icon = SEVERITY_ICONS[alert.severity];

  const handleDismiss = () => {
    setDismissed(true);
    alert.onDismiss?.(alert.id);
  };

  return (
    <div className={cn("rounded-lg p-4 flex gap-4", styles.container)}>
      {/* Ícone */}
      <div className={cn("flex-shrink-0 mt-0.5", styles.icon)}>{icon}</div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {alert.title && <h3 className={cn("font-semibold text-sm", styles.title)}>{alert.title}</h3>}
        <p className={cn("text-sm mt-1", styles.message)}>{alert.message}</p>
      </div>

      {/* Botão de Fechar */}
      {alert.dismissible && (
        <Button
          variant="ghost"
          size="sm"
          className={cn("flex-shrink-0", styles.button)}
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * AllergyAlert
 * Componente especializado para exibir alergias de forma contínua e proeminente
 * 
 * Uso:
 * <AllergyAlert
 *   allergies={[
 *     { allergen: "Penicilina", severity: "grave", reactionType: "Anafilaxia" },
 *     { allergen: "Amendoim", severity: "moderada", reactionType: "Urticária" }
 *   ]}
 * />
 */
interface Allergy {
  allergen: string;
  severity: "leve" | "moderada" | "grave" | "desconhecida";
  reactionType?: string;
}

interface AllergyAlertProps {
  allergies: Allergy[];
  compact?: boolean;
}

export function AllergyAlert({ allergies, compact = false }: AllergyAlertProps) {
  if (allergies.length === 0) return null;

  const severityMap: Record<string, "informativo" | "atencao" | "critico"> = {
    leve: "informativo",
    moderada: "atencao",
    grave: "critico",
    desconhecida: "atencao",
  };

  // Determinar a severidade máxima
  const maxSeverity = allergies.reduce((max, allergy) => {
    const current = severityMap[allergy.severity];
    const severityOrder = { informativo: 0, atencao: 1, critico: 2 };
    return severityOrder[current] > severityOrder[max] ? current : max;
  }, "informativo" as "informativo" | "atencao" | "critico");

  const styles = SEVERITY_STYLES[maxSeverity];

  if (compact) {
    return (
      <div className={cn("rounded-lg p-3 flex gap-3 items-center", styles.container)}>
        <div className={cn("flex-shrink-0", styles.icon)}>
          <Bell className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-sm", styles.title)}>
            {allergies.length === 1
              ? `Alergia: ${allergies[0].allergen}`
              : `${allergies.length} Alergias Registradas`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg p-4", styles.container)}>
      <div className="flex gap-3 mb-3">
        <div className={cn("flex-shrink-0 mt-0.5", styles.icon)}>
          <AlertCircle className="w-5 h-5" />
        </div>
        <h3 className={cn("font-bold text-base", styles.title)}>
          ⚠️ Alergias do Paciente
        </h3>
      </div>

      <div className="ml-8 space-y-2">
        {allergies.map((allergy, idx) => (
          <div key={idx} className={cn("p-2 rounded border-l-2", styles.container)}>
            <p className={cn("font-semibold text-sm", styles.title)}>{allergy.allergen}</p>
            {allergy.reactionType && (
              <p className={cn("text-xs mt-1", styles.message)}>
                Reação: {allergy.reactionType}
              </p>
            )}
            <p className={cn("text-xs mt-1", styles.message)}>
              Severidade: {allergy.severity.charAt(0).toUpperCase() + allergy.severity.slice(1)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * AlertBanner
 * Banner fixo no topo da página para alertas críticos
 */
interface AlertBannerProps {
  alert: Alert;
  onClose: () => void;
}

export function AlertBanner({ alert, onClose }: AlertBannerProps) {
  const styles = SEVERITY_STYLES[alert.severity];
  const icon = SEVERITY_ICONS[alert.severity];

  return (
    <div className={cn("w-full py-3 px-4 flex gap-4 items-center justify-between", styles.container)}>
      <div className="flex gap-4 items-start flex-1">
        <div className={cn("flex-shrink-0 mt-0.5", styles.icon)}>{icon}</div>
        <div className="flex-1">
          {alert.title && <h3 className={cn("font-semibold", styles.title)}>{alert.title}</h3>}
          <p className={cn("text-sm", styles.message)}>{alert.message}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClose} className={styles.button}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
