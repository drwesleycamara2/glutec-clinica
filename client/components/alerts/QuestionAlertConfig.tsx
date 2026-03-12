import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, Bell } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface QuestionAlertConfigProps {
  questionId: string;
  questionText: string;
  questionOptions: string[]; // Opções de resposta (ex: ["Sim", "Não"])
  onSave: (config: AlertConfiguration) => void;
  initialConfig?: AlertConfiguration;
}

export interface AlertConfiguration {
  triggerResponses: string[];
  alertMessage: string;
  alertTitle?: string;
  severity: "informativo" | "atencao" | "critico";
  displayScreens: ("dashboard" | "prontuario" | "evolucao" | "resumo")[];
}

const AVAILABLE_SCREENS = [
  { id: "dashboard", label: "Dashboard de Atendimento", description: "Tela principal de atendimento" },
  { id: "prontuario", label: "Prontuário Detalhado", description: "Visualização completa do prontuário" },
  { id: "evolucao", label: "Evolução do Paciente", description: "Tela de registrar evolução" },
  { id: "resumo", label: "Resumo do Paciente", description: "Resumo rápido do paciente" },
];

const SEVERITY_OPTIONS = [
  { value: "informativo", label: "Informativo", color: "bg-blue-100 border-blue-300" },
  { value: "atencao", label: "Atenção", color: "bg-yellow-100 border-yellow-300" },
  { value: "critico", label: "Crítico", color: "bg-red-100 border-red-300" },
];

export function QuestionAlertConfig({
  questionId,
  questionText,
  questionOptions,
  onSave,
  initialConfig,
}: QuestionAlertConfigProps) {
  const [open, setOpen] = useState(false);
  const [triggerResponses, setTriggerResponses] = useState<string[]>(
    initialConfig?.triggerResponses || []
  );
  const [alertTitle, setAlertTitle] = useState(initialConfig?.alertTitle || "");
  const [alertMessage, setAlertMessage] = useState(initialConfig?.alertMessage || "");
  const [severity, setSeverity] = useState<"informativo" | "atencao" | "critico">(
    initialConfig?.severity || "atencao"
  );
  const [displayScreens, setDisplayScreens] = useState<string[]>(
    initialConfig?.displayScreens || []
  );

  const handleToggleResponse = (response: string) => {
    setTriggerResponses((prev) =>
      prev.includes(response)
        ? prev.filter((r) => r !== response)
        : [...prev, response]
    );
  };

  const handleToggleScreen = (screenId: string) => {
    setDisplayScreens((prev) =>
      prev.includes(screenId)
        ? prev.filter((s) => s !== screenId)
        : [...prev, screenId]
    );
  };

  const handleSave = () => {
    if (triggerResponses.length === 0) {
      alert("Selecione pelo menos uma resposta gatilho");
      return;
    }
    if (!alertMessage.trim()) {
      alert("Insira uma mensagem de alerta");
      return;
    }
    if (displayScreens.length === 0) {
      alert("Selecione pelo menos uma tela para exibição");
      return;
    }

    onSave({
      triggerResponses,
      alertMessage,
      alertTitle: alertTitle || undefined,
      severity,
      displayScreens: displayScreens as ("dashboard" | "prontuario" | "evolucao" | "resumo")[],
    });

    setOpen(false);
  };

  const isConfigured = triggerResponses.length > 0 && alertMessage.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isConfigured ? "default" : "outline"}
          size="sm"
          className="gap-2"
          title={isConfigured ? "Alerta configurado" : "Configurar alerta"}
        >
          <Bell className="w-4 h-4" />
          {isConfigured ? "Alerta Ativo" : "Configurar Alerta"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Alerta para Pergunta</DialogTitle>
          <DialogDescription>
            <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="font-semibold text-gray-900">{questionText}</p>
              <p className="text-sm text-gray-600 mt-1">ID: {questionId}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Seção 1: Selecionar Respostas Gatilho */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">1. Selecione a(s) Resposta(s) que Acionam o Alerta</Label>
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded border border-gray-200">
              {questionOptions.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`response-${option}`}
                    checked={triggerResponses.includes(option)}
                    onCheckedChange={() => handleToggleResponse(option)}
                  />
                  <Label htmlFor={`response-${option}`} className="font-normal cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {triggerResponses.length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Selecione pelo menos uma resposta</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Seção 2: Configurar Mensagem do Alerta */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">2. Mensagem do Alerta</Label>
            <div className="space-y-2">
              <div>
                <Label htmlFor="alert-title" className="text-sm">
                  Título (opcional)
                </Label>
                <Input
                  id="alert-title"
                  placeholder="Ex: Atenção - Fumante"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="alert-message" className="text-sm">
                  Mensagem *
                </Label>
                <textarea
                  id="alert-message"
                  placeholder="Ex: Paciente fuma. Atenção para problemas respiratórios e contraindicações de medicamentos."
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                  className="w-full h-24 p-2 border rounded text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Nível de Severidade */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">3. Nível de Severidade</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className={`p-3 rounded border ${SEVERITY_OPTIONS.find((o) => o.value === severity)?.color}`}>
              <p className="text-sm font-semibold">
                Pré-visualização: {alertTitle || "Alerta"} - {alertMessage}
              </p>
            </div>
          </div>

          {/* Seção 4: Telas de Exibição */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">4. Em Quais Telas Exibir o Alerta?</Label>
            <div className="space-y-2">
              {AVAILABLE_SCREENS.map((screen) => (
                <div
                  key={screen.id}
                  className="flex items-start space-x-3 p-3 border rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleToggleScreen(screen.id)}
                >
                  <Checkbox
                    checked={displayScreens.includes(screen.id)}
                    onCheckedChange={() => handleToggleScreen(screen.id)}
                  />
                  <div className="flex-1">
                    <Label className="font-semibold text-sm cursor-pointer">{screen.label}</Label>
                    <p className="text-xs text-gray-600">{screen.description}</p>
                  </div>
                </div>
              ))}
            </div>
            {displayScreens.length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Selecione pelo menos uma tela</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Bell className="w-4 h-4" />
            Salvar Configuração
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
