import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

interface AllergyAlertProps {
  allergies: string | null | undefined;
  patientName?: string;
  variant?: "banner" | "inline" | "modal";
  onDismiss?: () => void;
}

/**
 * Componente de Alerta de Alergias (Fase 16)
 * Exibe alertas visuais destacados quando o paciente possui alergias registradas.
 * Conformidade: Segurança do paciente e prevenção de eventos adversos.
 */
export function AllergyAlert({ allergies, patientName, variant = "banner", onDismiss }: AllergyAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!allergies || allergies.trim() === "" || allergies.toLowerCase() === "nenhuma" || allergies.toLowerCase() === "nega") {
    return null;
  }

  if (dismissed) return null;

  const allergyList = allergies
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-sm text-red-400 font-medium">
          Alergias: {allergyList.join(", ")}
        </span>
      </div>
    );
  }

  if (variant === "modal") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-background border-2 border-red-500 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <div className="bg-red-500 px-6 py-4 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-white" />
            <div>
              <h3 className="text-lg font-bold text-white">ALERTA DE ALERGIA</h3>
              {patientName && (
                <p className="text-red-100 text-sm">Paciente: {patientName}</p>
              )}
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-muted-foreground mb-3">
              Este paciente possui as seguintes alergias registradas:
            </p>
            <div className="space-y-2">
              {allergyList.map((allergy, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
                >
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-400">{allergy}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Verifique interações medicamentosas antes de prescrever qualquer medicamento.
            </p>
          </div>
          <div className="px-6 py-4 border-t flex justify-end">
            <button
              onClick={handleDismiss}
              className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Estou ciente - Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // variant === "banner" (default)
  return (
    <div className="relative flex items-start gap-3 px-4 py-3 bg-red-500/10 border-2 border-red-500/40 rounded-xl animate-pulse-slow">
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <ShieldAlert className="h-5 w-5 text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-red-500 uppercase tracking-wider">
            Alerta de Alergia
          </span>
          {patientName && (
            <span className="text-xs text-red-400">({patientName})</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allergyList.map((allergy, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-semibold border border-red-500/30"
            >
              <AlertTriangle className="h-3 w-3" />
              {allergy}
            </span>
          ))}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 hover:bg-red-500/20 rounded-lg transition-colors"
        >
          <X className="h-4 w-4 text-red-400" />
        </button>
      )}
    </div>
  );
}

/**
 * Hook para verificar interação de alergias com medicamento
 */
export function checkAllergyInteraction(
  allergies: string | null | undefined,
  medication: string
): { hasInteraction: boolean; matchedAllergies: string[] } {
  if (!allergies || !medication) return { hasInteraction: false, matchedAllergies: [] };

  const allergyList = allergies
    .toLowerCase()
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const medLower = medication.toLowerCase();

  // Mapeamento básico de alergias comuns e medicamentos relacionados
  const allergyMedMap: Record<string, string[]> = {
    "dipirona": ["dipirona", "metamizol", "novalgina", "anador"],
    "aas": ["aas", "aspirina", "ácido acetilsalicílico", "acido acetilsalicilico"],
    "penicilina": ["penicilina", "amoxicilina", "ampicilina", "penicilina g", "penicilina v"],
    "sulfa": ["sulfametoxazol", "sulfadiazina", "sulfa", "bactrim"],
    "ibuprofeno": ["ibuprofeno", "advil", "alivium", "motrin"],
    "aine": ["ibuprofeno", "diclofenaco", "naproxeno", "piroxicam", "meloxicam", "cetoprofeno"],
    "latex": ["latex", "látex"],
    "iodo": ["iodo", "povidona", "pvpi", "iodopovidona"],
    "contraste": ["contraste", "iodado"],
    "cefalosporina": ["cefalexina", "ceftriaxona", "cefazolina", "cefuroxima"],
    "eritromicina": ["eritromicina", "azitromicina", "claritromicina"],
    "lidocaina": ["lidocaína", "lidocaina", "xilocaína", "xilocaina"],
  };

  const matchedAllergies: string[] = [];

  for (const allergy of allergyList) {
    // Verificação direta
    if (medLower.includes(allergy) || allergy.includes(medLower)) {
      matchedAllergies.push(allergy);
      continue;
    }

    // Verificação por mapeamento
    for (const [allergyKey, relatedMeds] of Object.entries(allergyMedMap)) {
      if (allergy.includes(allergyKey)) {
        for (const med of relatedMeds) {
          if (medLower.includes(med)) {
            matchedAllergies.push(`${allergy} (relacionado: ${med})`);
            break;
          }
        }
      }
    }
  }

  return {
    hasInteraction: matchedAllergies.length > 0,
    matchedAllergies: [...new Set(matchedAllergies)],
  };
}

/**
 * Componente de alerta ao prescrever medicamento com interação
 */
export function PrescriptionAllergyWarning({
  allergies,
  medication,
  onConfirm,
  onCancel,
}: {
  allergies: string | null | undefined;
  medication: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { hasInteraction, matchedAllergies } = checkAllergyInteraction(allergies, medication);

  if (!hasInteraction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border-2 border-red-500 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-white animate-bounce" />
          <div>
            <h3 className="text-lg font-bold text-white">INTERACAO MEDICAMENTOSA</h3>
            <p className="text-red-100 text-sm">Possível reação alérgica detectada</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-3">
            O medicamento <strong className="text-foreground">{medication}</strong> pode causar
            reação alérgica neste paciente:
          </p>
          <div className="space-y-2 mb-4">
            {matchedAllergies.map((allergy, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/15 border border-red-500/30 rounded-lg"
              >
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-sm font-semibold text-red-400">{allergy}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-red-400 font-medium">
            Prosseguir com esta prescrição é de inteira responsabilidade do médico prescritor.
          </p>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-medium text-sm transition-colors"
          >
            Cancelar Prescrição
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Prescrever Mesmo Assim
          </button>
        </div>
      </div>
    </div>
  );
}
