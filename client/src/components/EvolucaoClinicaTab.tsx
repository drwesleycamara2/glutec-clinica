import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Icd10Search } from "@/components/Icd10Search";
import { AudioRecorder } from "@/components/AudioRecorder";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Calendar, User, Loader2, Plus, Trash2, FileDown, PenTool, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { generatePremiumPdf, D4SignatureLog, AuditLog } from "@/components/PdfExporter";
import { generateAuditLogsForAppointment } from "@/utils/auditLogGenerator";

interface Evolucao {
  id?: number;
  icd10: { id: number; code: string; description: string } | null;
  clinicalNotes: string;
  audioTranscription: string;
  date: string;
  professional: string;
  signatureStatus?: "pendente" | "assinado";
  signedAt?: string;
  signedByName?: string;
}

interface EvolucaoClinicaTabProps {
  patientId: number;
  patientName: string;
}

export function EvolucaoClinicaTab({ patientId, patientName }: EvolucaoClinicaTabProps) {
  const draftStorageKey = useMemo(() => `glutec:evolucao-draft:${patientId}`, [patientId]);
  const [evolucoes, setEvolucoes] = useState<Evolucao[]>([]);
  const [currentEvolucao, setCurrentEvolucao] = useState<Evolucao>({
    icd10: null,
    clinicalNotes: "",
    audioTranscription: "",
    date: new Date().toISOString().split("T")[0],
    professional: "Dr. Médico",
    signatureStatus: "pendente",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signaturePassword, setSignaturePassword] = useState("");
  const [selectedEvolucaoForSignature, setSelectedEvolucaoForSignature] = useState<Evolucao | null>(null);

  useEffect(() => {
    const savedDraft = localStorage.getItem(draftStorageKey);
    if (!savedDraft) return;

    try {
      const parsed = JSON.parse(savedDraft) as Evolucao;
      setCurrentEvolucao((current) => ({ ...current, ...parsed }));
      setLastAutoSaveAt(new Date().toISOString());
      toast.info("Rascunho automático recuperado.");
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const hasContent =
      Boolean(currentEvolucao.icd10) ||
      currentEvolucao.clinicalNotes.trim().length > 0 ||
      currentEvolucao.audioTranscription.trim().length > 0;

    if (!hasContent) {
      localStorage.removeItem(draftStorageKey);
      setLastAutoSaveAt(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      localStorage.setItem(draftStorageKey, JSON.stringify(currentEvolucao));
      setLastAutoSaveAt(new Date().toISOString());
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [currentEvolucao, draftStorageKey]);

  const handleSave = async () => {
    if (!currentEvolucao.icd10) {
      toast.error("Selecione um CID-10");
      return;
    }

    if (!currentEvolucao.clinicalNotes.trim() && !currentEvolucao.audioTranscription.trim()) {
      toast.error("Adicione notas clínicas ou transcrição de áudio");
      return;
    }

    setIsSaving(true);

    try {
      // Simular salvamento no banco de dados
      const newEvolucao: Evolucao = {
        ...currentEvolucao,
        id: Date.now(),
      };

      setEvolucoes([newEvolucao, ...evolucoes]);
      toast.success("Evolução clínica salva com sucesso");

      // Resetar formulário
      setCurrentEvolucao({
        icd10: null,
        clinicalNotes: "",
        audioTranscription: "",
        date: new Date().toISOString().split("T")[0],
        professional: "Dr. Médico",
        signatureStatus: "pendente",
      });
      localStorage.removeItem(draftStorageKey);
      setLastAutoSaveAt(null);
    } catch (error) {
      console.error("Error saving evolucao:", error);
      toast.error("Erro ao salvar evolução clínica");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignature = (evolucao: Evolucao) => {
    setSelectedEvolucaoForSignature(evolucao);
    setShowSignatureDialog(true);
  };

  const confirmSignature = async () => {
    if (!signaturePassword.trim()) {
      toast.error("Digite a senha para confirmar a assinatura");
      return;
    }

    try {
      // Simular assinatura digital
      if (selectedEvolucaoForSignature) {
        const updatedEvolucoes = evolucoes.map((e) =>
          e.id === selectedEvolucaoForSignature.id
            ? {
                ...e,
                signatureStatus: "assinado" as const,
                signedAt: new Date().toISOString(),
                signedByName: currentEvolucao.professional,
              }
            : e
        );
        setEvolucoes(updatedEvolucoes);
        toast.success("Evolução clínica assinada digitalmente com sucesso");
        setShowSignatureDialog(false);
        setSignaturePassword("");
      }
    } catch (error) {
      console.error("Error signing evolucao:", error);
      toast.error("Erro ao assinar evolução clínica");
    }
  };

  const handleDeleteEvolucao = (id?: number) => {
    if (!id) return;
    setEvolucoes(evolucoes.filter((e) => e.id !== id));
    toast.success("Evolução clínica removida");
  };

  const handleExportEvolucao = async (evolucao: Evolucao) => {
    try {
      const content = `
        <div style="font-family: Montserrat, sans-serif;">
          <div style="margin-bottom: 20px;">
            <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 10px 0;">Evolução Clínica</h2>
            <p style="margin: 0; font-size: 14px;"><strong>Paciente:</strong> ${patientName}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${new Date(evolucao.date).toLocaleDateString("pt-BR")}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Profissional:</strong> ${evolucao.professional}</p>
          </div>

          <div style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
            <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Classificação (CID-10)</h3>
            <p style="margin: 0; font-size: 12px;"><strong>${evolucao.icd10?.code}</strong> - ${evolucao.icd10?.description}</p>
          </div>

          ${evolucao.clinicalNotes ? `
            <div style="margin-top: 15px; border-top: 1px solid #e0e0e0; padding-top: 15px;">
              <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Notas Clínicas</h3>
              <p style="margin: 0; font-size: 12px; white-space: pre-wrap;">${evolucao.clinicalNotes}</p>
            </div>
          ` : ""}

          ${evolucao.audioTranscription ? `
            <div style="margin-top: 15px; border-top: 1px solid #e0e0e0; padding-top: 15px;">
              <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Transcrição de Áudio</h3>
              <p style="margin: 0; font-size: 12px; white-space: pre-wrap;">${evolucao.audioTranscription}</p>
            </div>
          ` : ""}

          ${evolucao.signatureStatus === "assinado" ? `
            <div style="margin-top: 15px; border-top: 1px solid #e0e0e0; padding-top: 15px;">
              <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Assinatura Digital</h3>
              <p style="margin: 0; font-size: 12px;"><strong>Assinado por:</strong> ${evolucao.signedByName}</p>
              <p style="margin: 5px 0; font-size: 12px;"><strong>Data/Hora:</strong> ${new Date(evolucao.signedAt || "").toLocaleString("pt-BR")}</p>
            </div>
          ` : ""}
        </div>
      `;

      // Gerar logs de auditoria
      const auditLogs = generateAuditLogsForAppointment(
        "Evolução Clínica",
        patientName,
        evolucao.professional
      );

      // Preparar dados de assinatura se disponível
      let d4signSignatures: D4SignatureLog[] = [];
      if (evolucao.signatureStatus === "assinado" && evolucao.signedAt) {
        d4signSignatures = [
          {
            uuid: `sig_${evolucao.id}_${Date.now()}`,
            signerName: evolucao.signedByName || "Profissional",
            signerEmail: "profissional@glutee.com.br",
            signedAt: new Date(evolucao.signedAt).toLocaleString("pt-BR"),
            status: "assinado",
            signatureMethod: "eletronica",
            signatureHash: `hash_${Math.random().toString(36).slice(2, 15)}`,
            certificateInfo: {
              subject: evolucao.signedByName || "Profissional",
              issuer: "Clínica Glutée",
              validFrom: new Date().toISOString(),
              validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        ];
      }

      await generatePremiumPdf({
        filename: `evolucao_${patientName.replace(/\s+/g, "_")}_${evolucao.id}.pdf`,
        title: "Evolução Clínica",
        subtitle: `Paciente: ${patientName} | CID-10: ${evolucao.icd10?.code}`,
        content,
        isDarkMode: false,
        includeWatermark: true,
        d4signSignatures,
        auditLogs,
        includeAuditReport: true,
      });

      toast.success("Evolução clínica exportada com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar evolução:", error);
      toast.error("Erro ao exportar evolução clínica");
    }
  };

  return (
    <div className="space-y-6">
      {/* Nova Evolução */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-400" />
            Nova Evolução Clínica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CID-10 Selection */}
          <div>
            <Label className="text-xs font-medium">Classificação (CID-10) <span className="text-red-400">*</span></Label>
            <div className="mt-2">
              <Icd10Search
                onSelect={(code) =>
                  setCurrentEvolucao({ ...currentEvolucao, icd10: code })
                }
                selectedCode={currentEvolucao.icd10}
                showFavorites={true}
              />
            </div>
          </div>

          {/* Audio Recording */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">Atendimento por voz</Label>
              <span className="text-[11px] text-muted-foreground">
                {lastAutoSaveAt
                  ? `Rascunho salvo automaticamente às ${new Date(lastAutoSaveAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "O texto é salvo automaticamente como rascunho."}
              </span>
            </div>
            <AudioRecorder
              onTranscriptionComplete={(transcription) =>
                setCurrentEvolucao({
                  ...currentEvolucao,
                  audioTranscription: transcription,
                })
              }
            />
          </div>

          {/* Clinical Notes */}
          <div>
            <Label htmlFor="clinical-notes" className="text-xs font-medium">
              Notas Clínicas
            </Label>
            <Textarea
              id="clinical-notes"
              placeholder="Digite as observações clínicas, achados do exame físico, conduta, etc."
              value={currentEvolucao.clinicalNotes}
              onChange={(e) =>
                setCurrentEvolucao({
                  ...currentEvolucao,
                  clinicalNotes: e.target.value,
                })
              }
              className="mt-2 resize-none"
              rows={6}
            />
          </div>

          {/* Transcription Display */}
          {currentEvolucao.audioTranscription && (
            <div>
              <Label htmlFor="transcription" className="text-xs font-medium">
                Transcrição de Áudio
              </Label>
              <Textarea
                id="transcription"
                placeholder="Transcrição do áudio gravado"
                value={currentEvolucao.audioTranscription}
                onChange={(e) =>
                  setCurrentEvolucao({
                    ...currentEvolucao,
                    audioTranscription: e.target.value,
                  })
                }
                className="mt-2 resize-none bg-blue-50 dark:bg-blue-950/20"
                rows={4}
              />
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date" className="text-xs font-medium">
                Data
              </Label>
              <Input
                id="date"
                type="date"
                value={currentEvolucao.date}
                onChange={(e) =>
                  setCurrentEvolucao({
                    ...currentEvolucao,
                    date: e.target.value,
                  })
                }
                className="mt-2 h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="professional" className="text-xs font-medium">
                Profissional
              </Label>
              <Input
                id="professional"
                value={currentEvolucao.professional}
                onChange={(e) =>
                  setCurrentEvolucao({
                    ...currentEvolucao,
                    professional: e.target.value,
                  })
                }
                className="mt-2 h-8 text-xs"
              />
            </div>
          </div>

          {/* Summary */}
          {currentEvolucao.icd10 && (
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Resumo da Evolução
                  </p>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-1">
                      {currentEvolucao.icd10.code}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        {currentEvolucao.icd10.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {currentEvolucao.clinicalNotes.length > 0 &&
                          `${currentEvolucao.clinicalNotes.length} caracteres em notas clínicas`}
                        {currentEvolucao.audioTranscription.length > 0 &&
                          ` • ${currentEvolucao.audioTranscription.split(" ").length} palavras em transcrição`}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Evolução
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Evoluções */}
      {evolucoes.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-400" />
              Histórico de Evoluções ({evolucoes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {evolucoes.map((evolucao) => (
              <div
                key={evolucao.id}
                className="p-4 rounded-lg border border-border/50 hover:border-amber-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {evolucao.icd10?.code}
                      </Badge>
                      {evolucao.signatureStatus === "assinado" && (
                        <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Assinado
                        </Badge>
                      )}
                      {evolucao.signatureStatus === "pendente" && (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          Pendente Assinatura
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-2">
                      {evolucao.icd10?.description}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteEvolucao(evolucao.id)}
                      className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Notas Clínicas */}
                {evolucao.clinicalNotes && (
                  <div className="mb-3 p-3 bg-muted/30 rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Notas Clínicas
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {evolucao.clinicalNotes}
                    </p>
                  </div>
                )}

                {/* Transcrição */}
                {evolucao.audioTranscription && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200/50 dark:border-blue-900/50">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                      Transcrição de Áudio
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {evolucao.audioTranscription}
                    </p>
                  </div>
                )}

                {/* Metadata */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(evolucao.date).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {evolucao.professional}
                    </span>
                  </div>
                  {evolucao.signedAt && (
                    <span className="text-green-600 dark:text-green-400">
                      Assinado em {new Date(evolucao.signedAt).toLocaleDateString("pt-BR")} por {evolucao.signedByName}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {evolucao.signatureStatus === "pendente" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSignature(evolucao)}
                      className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10 text-xs"
                    >
                      <PenTool className="h-3 w-3 mr-1" />
                      Assinar Digitalmente
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportEvolucao(evolucao)}
                    className="text-xs"
                  >
                    <FileDown className="h-3 w-3 mr-1" />
                    Exportar PDF
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Signature Dialog */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar Evolução Clínica Digitalmente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Você está assinando a evolução clínica do paciente <strong>{patientName}</strong> com CID-10 <strong>{selectedEvolucaoForSignature?.icd10?.code}</strong>.
              </p>
            </div>
            <div>
              <Label htmlFor="signature-password" className="text-sm">
                Senha de Confirmação
              </Label>
              <Input
                id="signature-password"
                type="password"
                value={signaturePassword}
                onChange={(e) => setSignaturePassword(e.target.value)}
                placeholder="Digite sua senha para confirmar"
                className="mt-2"
              />
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200/50 dark:border-amber-900/50">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ⚠️ Esta ação é irreversível e será registrada no histórico de auditoria.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSignatureDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmSignature}
              className="bg-green-600 hover:bg-green-700"
            >
              <PenTool className="h-4 w-4 mr-2" />
              Confirmar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

