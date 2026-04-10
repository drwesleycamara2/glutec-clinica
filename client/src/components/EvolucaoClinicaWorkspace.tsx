import { useEffect, useMemo, useState } from "react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { Icd10Search } from "@/components/Icd10Search";
import { RichTextEditor } from "@/components/RichTextEditor";
import { generatePremiumPdf, type AuditLog, type D4SignatureLog } from "@/components/PdfExporter";
import {
  CLINICAL_DRAFT_AUTOSAVE_EVENT,
  clearClinicalDraftMeta,
  getClinicalDraftPath,
  writeClinicalDraftMeta,
} from "@/lib/clinicalSession";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock3,
  FileDown,
  Loader2,
  PenTool,
  PlayCircle,
  Save,
  ShieldCheck,
  StopCircle,
} from "lucide-react";

type Icd10Code = {
  id: number;
  code: string;
  description: string;
};

type EvolutionFormState = {
  id?: number;
  icd10: Icd10Code | null;
  clinicalNotes: string;
  audioTranscription: string;
  assistantUserId: string;
  assistantName: string;
  startedAt: string;
  endedAt: string;
  isRetroactive: boolean;
  retroactiveJustification: string;
};

const SIGNATURE_METHODS = [
  { value: "icp_brasil_a1", label: "Certificado A1" },
  { value: "icp_brasil_a3", label: "Certificado A3" },
];

const SIGNATURE_PROVIDERS = {
  icp_brasil_a1: [
    { value: "certificado_local_a1", label: "A1 local / arquivo" },
    { value: "d4sign_icp", label: "D4Sign ICP-Brasil" },
  ],
  icp_brasil_a3: [
    { value: "vidaas", label: "Vidaas" },
    { value: "bird", label: "Bird ID" },
    { value: "gov", label: "gov.br" },
    { value: "d4sign_icp", label: "D4Sign ICP-Brasil" },
  ],
} as const;

const DEFAULT_CLINICAL_NOTES_TEMPLATE = [
  "<p><strong>Queixa principal:</strong></p>",
  "<p></p>",
  "<p><strong>História Atual e Pregressa:</strong></p>",
  "<p></p>",
  "<p><strong>Exame físico:</strong></p>",
  "<p></p>",
  "<p><strong>Hipótese diagnóstica:</strong></p>",
  "<p></p>",
  "<p><strong>Conduta:</strong></p>",
  "<p></p>",
  "<p><strong>Observações:</strong></p>",
  "<p></p>",
].join("");

const emptyForm = (): EvolutionFormState => ({
  icd10: null,
  clinicalNotes: DEFAULT_CLINICAL_NOTES_TEMPLATE,
  audioTranscription: "",
  assistantUserId: "",
  assistantName: "",
  startedAt: "",
  endedAt: "",
  isRetroactive: false,
  retroactiveJustification: "",
});

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatElapsed(startedAt?: string, endedAt?: string) {
  if (!startedAt) return "00:00:00";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "00:00:00";
  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildValidationCode(id?: number) {
  return `GLUTEC-${id ?? "DOC"}-${Date.now().toString(36).toUpperCase()}`;
}

function canPersistDraft(form: EvolutionFormState) {
  return Boolean(form.id) || Boolean(form.icd10) || stripHtml(form.clinicalNotes).length > 0 || form.audioTranscription.trim().length > 0;
}

interface Props {
  patientId: number;
  patientName: string;
}

export function EvolucaoClinicaWorkspace({ patientId, patientName }: Props) {
  const { user } = useAuth();
  const draftStorageKey = useMemo(() => `glutec:evolucao-clinica:${patientId}`, [patientId]);
  const [form, setForm] = useState<EvolutionFormState>(emptyForm);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedEvolution, setSelectedEvolution] = useState<any | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<"icp_brasil_a1" | "icp_brasil_a3">("icp_brasil_a1");
  const [signatureProvider, setSignatureProvider] = useState("certificado_local_a1");
  const [signatureCertificateLabel, setSignatureCertificateLabel] = useState("");
  const [includeAuditReport, setIncludeAuditReport] = useState(true);
  const [startedSessionAt, setStartedSessionAt] = useState("");
  const [elapsed, setElapsed] = useState("00:00:00");

  const evolutionQuery = trpc.clinicalEvolution.getByPatient.useQuery({ patientId });
  const assistantsQuery = trpc.clinicalEvolution.listAssistants.useQuery();
  const templatesQuery = trpc.medicalRecords.listTemplates.useQuery();
  const createMutation = trpc.clinicalEvolution.create.useMutation({
    onSuccess: (result) => {
      setForm((current) => ({ ...current, id: result?.id ?? current.id }));
      evolutionQuery.refetch();
      toast.success("Atendimento salvo em rascunho.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.clinicalEvolution.update.useMutation({
    onSuccess: () => {
      evolutionQuery.refetch();
      toast.success("Atendimento atualizado.");
    },
    onError: (error) => toast.error(error.message),
  });
  const signMutation = trpc.clinicalEvolution.sign.useMutation({
    onSuccess: async () => {
      setSignatureDialogOpen(false);
      setSelectedEvolution(null);
      await evolutionQuery.refetch();
      toast.success("Documento marcado como assinado.");
    },
    onError: (error) => toast.error(error.message),
  });
  const auditQuery = trpc.clinicalEvolution.getSignatureAuditLog.useQuery(
    { evolutionId: selectedEvolution?.id ?? 0 },
    { enabled: exportDialogOpen && Boolean(selectedEvolution?.id) },
  );

  useEffect(() => {
    const savedDraft = localStorage.getItem(draftStorageKey);
    if (!savedDraft) return;
    try {
      const parsed = JSON.parse(savedDraft) as EvolutionFormState;
      setForm((current) => ({ ...current, ...parsed }));
      if (parsed.startedAt) {
        setStartedSessionAt(parsed.startedAt);
      }
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const shouldPersist = canPersistDraft(form);

    if (!shouldPersist) {
      localStorage.removeItem(draftStorageKey);
      clearClinicalDraftMeta(patientId);
      return;
    }

    const timeout = window.setTimeout(() => {
      localStorage.setItem(draftStorageKey, JSON.stringify(form));
      writeClinicalDraftMeta({
        patientId,
        patientName,
        path: getClinicalDraftPath(patientId),
        updatedAt: new Date().toISOString(),
        status: form.id ? "rascunho" : "em_andamento",
      });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draftStorageKey, form, patientId, patientName]);

  useEffect(() => {
    return () => {
      if (!canPersistDraft(form)) return;
      localStorage.setItem(draftStorageKey, JSON.stringify(form));
      writeClinicalDraftMeta({
        patientId,
        patientName,
        path: getClinicalDraftPath(patientId),
        updatedAt: new Date().toISOString(),
        status: form.id ? "rascunho" : "em_andamento",
      });
    };
  }, [draftStorageKey, form, patientId, patientName]);

  useEffect(() => {
    if (!startedSessionAt || form.isRetroactive || form.endedAt) {
      setElapsed(formatElapsed(startedSessionAt, form.endedAt));
      return;
    }

    setElapsed(formatElapsed(startedSessionAt));
    const interval = window.setInterval(() => {
      setElapsed(formatElapsed(startedSessionAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [form.endedAt, form.isRetroactive, startedSessionAt]);

  const professionalName = (user as any)?.name || "Dr. Wesley Câmara";
  const assistantOptions = (assistantsQuery.data ?? []).map((item: any) => ({
    id: String(item.id),
    name: item.name || item.email || `Usuário ${item.id}`,
    role: item.role,
  }));
  const templates = (templatesQuery.data ?? []).filter((template: any) => {
    const specialty = String(template.specialty ?? "").toLowerCase();
    return !specialty || specialty.includes("evolu") || specialty.includes("prontu") || specialty.includes("consulta");
  });

  const buildPayload = (status: "rascunho" | "finalizado") => {
    if (!form.icd10) {
      throw new Error("Selecione um CID-10.");
    }
    const clinicalNotesText = stripHtml(form.clinicalNotes);
    if (!clinicalNotesText && !form.audioTranscription.trim()) {
      throw new Error("Preencha a evolução clínica ou a transcrição de áudio.");
    }
    if (!startedSessionAt && !form.startedAt && !form.isRetroactive) {
      throw new Error("Clique em Iniciar atendimento antes de salvar.");
    }
    if (form.isRetroactive && !form.retroactiveJustification.trim()) {
      throw new Error("Informe a justificativa do atendimento retroativo.");
    }
    if (!form.assistantName.trim()) {
      throw new Error('Informe quem acompanhou ou auxiliou no atendimento. Se estava sozinho, preencha "Ninguém".');
    }

    const startedAt = form.isRetroactive
      ? form.startedAt
      : startedSessionAt || form.startedAt || toDateTimeInputValue(new Date());
    const endedAt = status === "finalizado"
      ? form.endedAt || toDateTimeInputValue(new Date())
      : form.endedAt || "";

    return {
      icdCode: form.icd10.code,
      icdDescription: form.icd10.description,
      clinicalNotes: form.clinicalNotes,
      assistantName: form.assistantName.trim(),
      assistantUserId: form.assistantUserId ? Number(form.assistantUserId) : undefined,
      audioTranscription: form.audioTranscription || undefined,
      startedAt,
      endedAt: endedAt || undefined,
      finalizedAt: status === "finalizado" ? endedAt || toDateTimeInputValue(new Date()) : undefined,
      isRetroactive: form.isRetroactive,
      retroactiveJustification: form.retroactiveJustification || undefined,
      status,
    };
  };

  const handleStart = () => {
    const now = toDateTimeInputValue(new Date());
    setStartedSessionAt(now);
    setForm((current) => ({ ...current, startedAt: current.startedAt || now }));
    toast.success("Atendimento iniciado.");
  };

  const handleSave = async () => {
    try {
      const payload = buildPayload("rascunho");
      if (form.id) {
        await updateMutation.mutateAsync({ id: form.id, ...payload });
      } else {
        const result = await createMutation.mutateAsync({
          patientId,
          ...payload,
        });
        setForm((current) => ({ ...current, id: result?.id ?? current.id }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o atendimento.");
    }
  };

  useEffect(() => {
    const handleAutosave = async () => {
      if (!canPersistDraft(form)) return;
      localStorage.setItem(draftStorageKey, JSON.stringify(form));
      writeClinicalDraftMeta({
        patientId,
        patientName,
        path: getClinicalDraftPath(patientId),
        updatedAt: new Date().toISOString(),
        status: form.id ? "rascunho" : "em_andamento",
      });

      try {
        await handleSave();
      } catch {
        // keep local draft even if network save fails
      }
    };

    window.addEventListener(CLINICAL_DRAFT_AUTOSAVE_EVENT, handleAutosave as EventListener);
    return () => window.removeEventListener(CLINICAL_DRAFT_AUTOSAVE_EVENT, handleAutosave as EventListener);
  }, [draftStorageKey, form, patientId, patientName]);

  const handleFinalize = async () => {
    const confirmed = window.confirm("Finalizar a consulta agora? Depois disso ela ficará registrada como concluída.");
    if (!confirmed) return;

    try {
      const payload = buildPayload("finalizado");
      if (form.id) {
        await updateMutation.mutateAsync({ id: form.id, ...payload });
      } else {
        const result = await createMutation.mutateAsync({
          patientId,
          ...payload,
        });
        setForm((current) => ({ ...current, id: result?.id ?? current.id }));
      }

      localStorage.removeItem(draftStorageKey);
      clearClinicalDraftMeta(patientId);
      setSelectedEvolution(null);
      setStartedSessionAt("");
      setForm(emptyForm());
      toast.success("Consulta finalizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar a consulta.");
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find((item: any) => String(item.id) === templateId);
    if (!template) return;

    const sections = Array.isArray(template.sections) ? template.sections : [];
    const content = sections
      .map((section: any) => {
        const title = section.title ? `<h3>${section.title}</h3>` : "";
        const richContent = section.content ? `<div>${section.content}</div>` : "";
        const fields = Array.isArray(section.fields)
          ? `<ul>${section.fields
              .map((field: any) => {
                const options = Array.isArray(field.options) && field.options.length > 0
                  ? ` (${field.options.map((option: string) => `( ) ${option}`).join("  ")})`
                  : "";
                return `<li><strong>${field.label}</strong>${options}</li>`;
              })
              .join("")}</ul>`
          : "";
        return `${title}${richContent}${fields}`;
      })
      .join("");

    setForm((current) => ({
      ...current,
      clinicalNotes: content || current.clinicalNotes,
    }));
    toast.success(`Modelo "${template.name}" carregado.`);
  };

  const handleSelectEvolution = (record: any) => {
    setSelectedEvolution(record);
    setStartedSessionAt(record.startedAt ? toDateTimeInputValue(new Date(record.startedAt)) : "");
    setForm({
      id: record.id,
      icd10: record.icdCode ? { id: record.id, code: record.icdCode, description: record.icdDescription } : null,
      clinicalNotes: record.clinicalNotes || "",
      audioTranscription: record.audioTranscription || "",
      assistantUserId: record.assistantUserId ? String(record.assistantUserId) : "",
      assistantName: record.assistantName || "",
      startedAt: record.startedAt ? toDateTimeInputValue(new Date(record.startedAt)) : "",
      endedAt: record.endedAt ? toDateTimeInputValue(new Date(record.endedAt)) : "",
      isRetroactive: Boolean(record.isRetroactive),
      retroactiveJustification: record.retroactiveJustification || "",
    });
    toast.info("Atendimento carregado para edição.");
  };

  const handleOpenSignature = (record: any) => {
    setSelectedEvolution(record);
    setSignatureMethod("icp_brasil_a1");
    setSignatureProvider("certificado_local_a1");
    setSignatureCertificateLabel("");
    setSignatureDialogOpen(true);
  };

  const handleSign = async () => {
    if (!selectedEvolution?.id) return;
    const validationCode = buildValidationCode(selectedEvolution.id);

    await signMutation.mutateAsync({
      id: selectedEvolution.id,
      signatureMethod,
      signatureProvider,
      signatureCertificateLabel: signatureCertificateLabel || undefined,
      signatureValidationCode: validationCode,
    });
  };

  const handleExport = async () => {
    if (!selectedEvolution) return;

    const signatureLogs: D4SignatureLog[] =
      selectedEvolution.status === "assinado"
        ? [
            {
              uuid: `evolucao-${selectedEvolution.id}`,
              signerName: selectedEvolution.signedByDoctorName || selectedEvolution.doctorName || professionalName,
              signerEmail: (user as any)?.email || "contato@drwesleycamara.com.br",
              signedAt: selectedEvolution.signedAt
                ? new Date(selectedEvolution.signedAt).toLocaleString("pt-BR")
                : new Date().toLocaleString("pt-BR"),
              status: "assinado",
              signatureMethod:
                selectedEvolution.signatureMethod === "icp_brasil_a3"
                  ? "icp_brasil_a3"
                  : "icp_brasil_a1",
              signatureHash: selectedEvolution.signatureValidationCode || buildValidationCode(selectedEvolution.id),
              certificateInfo: {
                subject: selectedEvolution.signedByDoctorName || selectedEvolution.doctorName || professionalName,
                issuer: selectedEvolution.signatureProvider || "ICP-Brasil",
              },
            },
          ]
        : [];

    const auditLogs: AuditLog[] = (auditQuery.data ?? []).map((log: any) => ({
      id: String(log.id),
      action: log.action,
      timestamp: new Date(log.signatureTimestamp || log.createdAt).toLocaleString("pt-BR"),
      userId: String(log.doctorId),
      userName: log.doctorName,
      ipAddress: log.ipAddress || undefined,
      details: typeof log.details === "string" ? log.details : undefined,
    }));

    const content = `
      <div style="font-family: Montserrat, sans-serif;">
        <div style="margin-bottom: 18px;">
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Paciente:</strong> ${patientName}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Profissional:</strong> ${selectedEvolution.signedByDoctorName || selectedEvolution.doctorName || professionalName}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Acompanhou no atendimento:</strong> ${selectedEvolution.assistantName || "Ninguém"}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Período:</strong> ${selectedEvolution.startedAt ? new Date(selectedEvolution.startedAt).toLocaleString("pt-BR") : "-"} até ${selectedEvolution.endedAt ? new Date(selectedEvolution.endedAt).toLocaleString("pt-BR") : "-"}</p>
          <p style="margin: 0; font-size: 14px;"><strong>CID-10:</strong> ${selectedEvolution.icdCode || "-"} - ${selectedEvolution.icdDescription || ""}</p>
        </div>
        ${selectedEvolution.retroactiveJustification ? `
          <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #d4a853; border-radius: 8px;">
            <strong>Atendimento retroativo:</strong> ${selectedEvolution.retroactiveJustification}
          </div>
        ` : ""}
        <div>${selectedEvolution.clinicalNotes || "<p>Sem evolução clínica registrada.</p>"}</div>
        ${selectedEvolution.audioTranscription ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 14px; margin: 0 0 8px 0;">Transcrição de áudio</h3>
            <p style="white-space: pre-wrap; font-size: 12px; margin: 0;">${selectedEvolution.audioTranscription}</p>
          </div>
        ` : ""}
        ${signatureLogs.length > 0 ? `
          <div style="margin-top: 20px; font-size: 11px; color: #555;">
            Documento assinado digitalmente com metadados de validação registrados no sistema.
          </div>
        ` : ""}
      </div>
    `;

    await generatePremiumPdf({
      filename: `evolucao_${patientName.replace(/\s+/g, "_")}_${selectedEvolution.id}.pdf`,
      title: "Evolução Clínica",
      subtitle: `Paciente: ${patientName}`,
      content,
      includeWatermark: true,
      d4signSignatures: signatureLogs,
      auditLogs,
      includeAuditReport,
    });

    setExportDialogOpen(false);
    toast.success("PDF exportado com sucesso.");
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#C9A55B]/25">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3 text-sm">
            <span>Fluxo de Atendimento</span>
            <Badge variant="outline" className="border-[#C9A55B]/30 text-[#8A6526]">
              <Clock3 className="mr-1 h-3.5 w-3.5" />
              {elapsed}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleStart} variant="outline" className="border-[#C9A55B]/30 text-[#8A6526]">
              <PlayCircle className="mr-2 h-4 w-4" />
              Iniciar atendimento
            </Button>
            <Button type="button" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleFinalize}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="border-emerald-600/30 text-emerald-700"
            >
              <StopCircle className="mr-2 h-4 w-4" />
              Finalizar consulta
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Profissional responsável</Label>
              <Input value={professionalName} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Profissional cadastrado que acompanhou</Label>
              <Select
                value={form.assistantUserId || "manual"}
                onValueChange={(value) => {
                  if (value === "manual") {
                    setForm((current) => ({ ...current, assistantUserId: "" }));
                    return;
                  }

                  const selectedAssistant = assistantOptions.find((item) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    assistantUserId: value,
                    assistantName: selectedAssistant?.name || current.assistantName,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um profissional cadastrado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Digitar manualmente</SelectItem>
                  {assistantOptions.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quem acompanhou ou auxiliou no atendimento</Label>
            <Input
              value={form.assistantName}
              onChange={(event) => setForm((current) => ({ ...current, assistantName: event.target.value }))}
              placeholder='Digite o nome ou informe "Ninguém"'
            />
            <p className="text-xs text-muted-foreground">
              Este campo é obrigatório para salvar e finalizar a consulta.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Data/hora de início</Label>
              <Input
                type="datetime-local"
                value={form.startedAt}
                onChange={(event) => setForm((current) => ({ ...current, startedAt: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Data/hora de término</Label>
              <Input
                type="datetime-local"
                value={form.endedAt}
                onChange={(event) => setForm((current) => ({ ...current, endedAt: event.target.value }))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.isRetroactive}
              onChange={(event) => setForm((current) => ({ ...current, isRetroactive: event.target.checked }))}
            />
            Registrar atendimento com data ou horário retroativo
          </label>

          {form.isRetroactive && (
            <div className="space-y-2">
              <Label>Justificativa obrigatória</Label>
              <Textarea
                value={form.retroactiveJustification}
                onChange={(event) => setForm((current) => ({ ...current, retroactiveJustification: event.target.value }))}
                placeholder="Explique por que este atendimento está sendo lançado retroativamente."
                rows={3}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Atendimento por voz</CardTitle>
        </CardHeader>
        <CardContent>
          <AudioRecorder
            medicalRecordId={form.id}
            onTranscriptionComplete={(text) =>
              setForm((current) => ({
                ...current,
                audioTranscription: [current.audioTranscription, text].filter(Boolean).join("\n\n"),
              }))
            }
          />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Evolução clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label>CID-10</Label>
              <Icd10Search
                selectedCode={form.icd10}
                onSelect={(value) => setForm((current) => ({ ...current, icd10: value?.code ? value : null }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo de evolução</Label>
              <Select onValueChange={handleApplyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Carregar modelo clínico" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                  {templates.length === 0 && (
                    <SelectItem value="sem-modelos" disabled>
                      Nenhum modelo cadastrado
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas clínicas e exame físico</Label>
            <RichTextEditor
              value={form.clinicalNotes}
              onChange={(value) => setForm((current) => ({ ...current, clinicalNotes: value }))}
              placeholder="Queixa principal, história atual e pregressa, exame físico, hipótese diagnóstica, conduta e observações."
              minHeight="280px"
            />
          </div>

          <div className="space-y-2">
            <Label>Transcrição de áudio</Label>
            <Textarea
              value={form.audioTranscription}
              onChange={(event) => setForm((current) => ({ ...current, audioTranscription: event.target.value }))}
              rows={5}
              placeholder="A transcrição aparecerá aqui e pode ser editada antes de salvar."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Atendimentos salvos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(evolutionQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendimento salvo ainda para este paciente.</p>
          ) : (
            (evolutionQuery.data ?? [])
              .slice()
              .sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
              .map((record: any) => (
                <div key={record.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{record.icdCode || "Sem CID"}</Badge>
                        <Badge variant="outline">{record.status}</Badge>
                        {record.signatureProvider && <Badge variant="outline">{record.signatureProvider}</Badge>}
                      </div>
                      <p className="text-sm font-medium">
                        {record.startedAt ? new Date(record.startedAt).toLocaleString("pt-BR") : new Date(record.createdAt).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Atendido por {record.doctorName || professionalName} • Acompanhamento: {record.assistantName || "Ninguém"}
                      </p>
                      <p className="text-xs text-muted-foreground">{stripHtml(record.clinicalNotes || "").slice(0, 220) || "Sem resumo clínico."}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleSelectEvolution(record)}>
                        Continuar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedEvolution(record); setExportDialogOpen(true); }}>
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                        Exportar
                      </Button>
                      {record.status !== "assinado" && (
                        <Button size="sm" onClick={() => handleOpenSignature(record)}>
                          <PenTool className="mr-1.5 h-3.5 w-3.5" />
                          Assinar
                        </Button>
                      )}
                      {record.status === "assinado" && (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Assinado
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinar com certificado digital</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de certificado</Label>
              <Select
                value={signatureMethod}
                onValueChange={(value: "icp_brasil_a1" | "icp_brasil_a3") => {
                  setSignatureMethod(value);
                  const nextProvider = SIGNATURE_PROVIDERS[value][0]?.value ?? "";
                  setSignatureProvider(nextProvider);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNATURE_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Provedor / canal de assinatura</Label>
              <Select value={signatureProvider} onValueChange={setSignatureProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNATURE_PROVIDERS[signatureMethod].map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Identificação do certificado</Label>
              <Input
                value={signatureCertificateLabel}
                onChange={(event) => setSignatureCertificateLabel(event.target.value)}
                placeholder="Ex.: Wesley Câmara - e-CPF / CRM"
              />
            </div>

            <div className="rounded-xl border border-[#C9A55B]/20 bg-[#C9A55B]/5 p-3 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-medium text-[#8A6526]">
                <ShieldCheck className="h-4 w-4" />
                Registro de assinatura
              </div>
              O sistema registrará método, provedor, horário, profissional, código de validação e trilha de auditoria para exportação do PDF.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSign} disabled={signMutation.isPending}>
              {signMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar atendimento em PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAuditReport}
                onChange={(event) => setIncludeAuditReport(event.target.checked)}
              />
              Incluir relatório de auditoria e validação no final do PDF
            </label>
            <p className="text-xs text-muted-foreground">
              Para evolução clínica, você pode escolher se deseja levar a trilha de auditoria no documento exportado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport}>
              Exportar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

