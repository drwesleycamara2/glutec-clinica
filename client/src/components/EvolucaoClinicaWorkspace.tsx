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
  Eye,
  FileDown,
  History,
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
  attendanceType: "presencial" | "online" | "";
  icd10: Icd10Code | null;
  clinicalNotes: string;
  secretaryNotes: string;
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

const CLEAN_DEFAULT_CLINICAL_NOTES_TEMPLATE = [
  "<p><strong>Queixa principal:</strong></p>",
  "<p></p>",
  "<p><strong>História atual e pregressa:</strong></p>",
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
  attendanceType: "",
  icd10: null,
  clinicalNotes: CLEAN_DEFAULT_CLINICAL_NOTES_TEMPLATE,
  secretaryNotes: "",
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

function decodeHtmlEntities(value: string) {
  let content = String(value ?? "");
  if (!content) return "";

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = content;
    content = textarea.value;
  } else {
    const entities: Record<string, string> = {
      nbsp: " ",
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      ndash: "-",
      mdash: "-",
      hellip: "...",
    };
    content = content
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&([a-zA-Z]+);/g, (match, entity) => entities[entity] ?? match);
  }

  return content;
}

function repairTextArtifacts(value?: string | null) {
  let content = String(value ?? "");
  if (!content) return "";

  if (/[\u00c3\u00c2\uFFFD]/.test(content) || /\u00e2[\u0080-\u00bf]/.test(content)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const bytes = Uint8Array.from(Array.from(content).map((char) => char.charCodeAt(0) & 0xff));
        const decoded = new TextDecoder("utf-8").decode(bytes);
        if (!decoded || decoded === content) break;
        content = decoded;
      } catch {
        break;
      }
    }
  }

  return content.replace(/\uFFFD/g, "");
}

function clinicalTextFromHtml(value?: string | null) {
  const content = repairTextArtifacts(decodeHtmlEntities(String(value ?? "")));
  if (!content) return "";

  return content
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(value: string) {
  return clinicalTextFromHtml(value).replace(/\s+/g, " ").trim();
}

/**
 * Para registros importados (Prontuário Verde / OnDoctor) o conteúdo da
 * mesma anamnese/atendimento foi gravado duas vezes em seções diferentes
 * — ex.: "**Anamnese / História**" + "**Evolução**" com o MESMO texto
 * abaixo. Aqui detectamos seções com conteúdo idêntico e mantemos só a
 * primeira ocorrência (preservando todos os cabeçalhos quando os blocos
 * forem distintos).
 *
 * Suporta cabeçalhos no estilo Markdown bold "**Seção**" ou linhas
 * terminadas em ":".
 */
function dedupeRepeatedSections(text: string): string {
  if (!text || !text.includes("\n")) return text;
  const lines = text.split("\n");
  // Identifica linhas que parecem cabeçalhos: **bold**, "Seção:" sozinha
  // (curta) ou MAIÚSCULAS curtas.
  const isHeader = (line: string) => {
    const t = line.trim();
    if (!t) return false;
    if (/^\*\*[^*]+\*\*\s*$/.test(t)) return true;
    if (t.length <= 60 && /^[A-Za-zÁ-ú][A-Za-zÁ-ú0-9 /\-]+:?\s*$/.test(t) && /[A-Z]/.test(t[0])) {
      return true;
    }
    return false;
  };

  type Section = { header: string | null; bodyLines: string[] };
  const sections: Section[] = [];
  let current: Section = { header: null, bodyLines: [] };
  for (const line of lines) {
    if (isHeader(line)) {
      if (current.header || current.bodyLines.length) sections.push(current);
      current = { header: line, bodyLines: [] };
    } else {
      current.bodyLines.push(line);
    }
  }
  if (current.header || current.bodyLines.length) sections.push(current);

  if (sections.length <= 1) return text;

  const seenBodies = new Set<string>();
  const kept: Section[] = [];
  for (const section of sections) {
    const fingerprint = section.bodyLines
      .join("\n")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("pt-BR");
    if (!fingerprint) {
      kept.push(section);
      continue;
    }
    if (seenBodies.has(fingerprint)) continue; // duplicata: ignora
    seenBodies.add(fingerprint);
    kept.push(section);
  }

  if (kept.length === sections.length) return text; // nada mudou

  return kept
    .map((section) => {
      if (section.header && section.bodyLines.length) {
        return `${section.header}\n${section.bodyLines.join("\n")}`;
      }
      return section.header ?? section.bodyLines.join("\n");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return repairTextArtifacts(String(value));
  return date.toLocaleString("pt-BR");
}

function getEvolutionRecordKey(record: any) {
  return `${record?.isLegacy ? "legacy" : "ev"}-${record?.id ?? "unknown"}`;
}

const SIGNATURE_PROVIDER_LABELS: Record<string, string> = {
  certificado_local_a1: "A1 local / arquivo",
  d4sign_icp: "D4Sign ICP-Brasil",
  vidaas: "VIDaaS",
  bird: "Bird ID",
  gov: "gov.br",
};

function getSignatureMethodLabel(record: any) {
  const method = String(record?.signatureMethod ?? "");
  if (method === "icp_brasil_a3") return "ICP-Brasil A3";
  if (method === "icp_brasil_a1") return "ICP-Brasil A1";
  if (method === "eletronica") return "Assinatura eletrônica";

  const provider = String(record?.signatureProvider ?? "").toLowerCase();
  if (["vidaas", "bird", "gov"].includes(provider)) return "ICP-Brasil A3";
  if (provider.includes("a1") || provider.includes("d4sign") || provider.includes("certificado")) return "ICP-Brasil A1";
  return "Certificado digital";
}

function getSignatureDetails(record: any, fallbackSigner: string) {
  const isSigned = String(record?.status ?? "") === "assinado" || Boolean(record?.signedAt || record?.signatureValidationCode || record?.signatureHash);
  if (!isSigned) return null;

  const provider = String(record?.signatureProvider ?? "").trim();
  const providerLabel = SIGNATURE_PROVIDER_LABELS[provider] || provider || "Não informado";
  const certificateLabel = repairTextArtifacts(record?.signatureCertificateLabel || record?.certificateLabel || "").trim();

  return {
    signedAt: formatDateTime(record?.signedAt),
    signerName: repairTextArtifacts(record?.signedByDoctorName || record?.signedByName || record?.doctorName || fallbackSigner || "Profissional não identificado"),
    method: getSignatureMethodLabel(record),
    provider: providerLabel,
    certificateLabel: certificateLabel || "Certificado não informado",
    validationCode: repairTextArtifacts(record?.signatureValidationCode || record?.signatureHash || "").trim(),
    sessionId: repairTextArtifacts(record?.signatureSessionId || record?.d4signDocumentKey || "").trim(),
  };
}

function buildSignatureDetailsHtml(signature: NonNullable<ReturnType<typeof getSignatureDetails>>) {
  return `
    <div style="margin-top:20px;padding:12px;border:1px solid #16a34a;border-radius:8px;background:#f0fdf4;font-size:11px;color:#14532d;">
      <h3 style="font-size:13px;margin:0 0 8px 0;color:#166534;">Assinatura digital</h3>
      <p style="margin:0 0 4px 0;"><strong>Assinado em:</strong> ${escapeHtml(signature.signedAt)}</p>
      <p style="margin:0 0 4px 0;"><strong>Assinante:</strong> ${escapeHtml(signature.signerName)}</p>
      <p style="margin:0 0 4px 0;"><strong>Método:</strong> ${escapeHtml(signature.method)}</p>
      <p style="margin:0 0 4px 0;"><strong>Provedor:</strong> ${escapeHtml(signature.provider)}</p>
      <p style="margin:0 0 4px 0;"><strong>Certificado:</strong> ${escapeHtml(signature.certificateLabel)}</p>
      ${signature.validationCode ? `<p style="margin:0 0 4px 0;word-break:break-all;"><strong>Código de validação:</strong> ${escapeHtml(signature.validationCode)}</p>` : ""}
      ${signature.sessionId ? `<p style="margin:0;word-break:break-all;"><strong>Sessão/documento:</strong> ${escapeHtml(signature.sessionId)}</p>` : ""}
    </div>
  `;
}
function buildValidationCode(id?: number) {
  return `GLUTEC-${id ?? "DOC"}-${Date.now().toString(36).toUpperCase()}`;
}

function isSecretaryOnlyRecord(record: any) {
  return Boolean(record?.isSecretaryRecord) || (
    String(record?.secretaryNotes || "").trim().length > 0 &&
    String(record?.clinicalNotes || "").trim().length === 0 &&
    String(record?.icdCode || "").trim().length === 0 &&
    String(record?.audioTranscription || "").trim().length === 0
  );
}

function canPersistDraft(form: EvolutionFormState, startedSessionAt: string) {
  // So persistimos rascunho/notificacao apos o usuario clicar em "Iniciar atendimento"
  // (ou ao abrir um registro existente). Se ele apenas navegar para a tela e sair,
  // nenhum rastro deve ser salvo.
  if (form.id) return true;
  if (form.secretaryNotes.trim().length > 0) return true;
  if (!startedSessionAt) return false;
  return Boolean(form.icd10) || stripHtml(form.clinicalNotes).length > 0 || form.audioTranscription.trim().length > 0 || Boolean(form.attendanceType);
}

interface Props {
  patientId: number;
  patientName: string;
}

export function EvolucaoClinicaWorkspace({ patientId, patientName }: Props) {
  const { user } = useAuth();
  const isReceptionist = user?.role === "recepcionista" || user?.role === "secretaria";
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
  // Auditoria de edição pós-finalização
  const [editingLockedStatus, setEditingLockedStatus] = useState<null | "finalizado" | "assinado">(null);
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<null | "rascunho" | "finalizado">(null);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [editJustificationText, setEditJustificationText] = useState("");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyForEvolutionId, setHistoryForEvolutionId] = useState<number | null>(null);
  const [expandedEvolutionKey, setExpandedEvolutionKey] = useState<string | null>(null);
  const [signatureDetailsKey, setSignatureDetailsKey] = useState<string | null>(null);

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
  const updateSecretaryNotesMutation = trpc.clinicalEvolution.updateSecretaryNotes.useMutation({
    onSuccess: async (result) => {
      if (result?.id) {
        setForm((current) => ({ ...current, id: result.id }));
      }
      await evolutionQuery.refetch();
      toast.success("Observações da secretaria salvas.");
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
  const editHistoryQuery = trpc.clinicalEvolution.getEditHistory.useQuery(
    { evolutionId: historyForEvolutionId ?? 0 },
    { enabled: historyDialogOpen && Boolean(historyForEvolutionId && historyForEvolutionId > 0) },
  );
  const incorporateTranscriptionMutation = trpc.clinicalEvolution.incorporateTranscription.useMutation({
    onError: (error) => toast.error(error.message),
  });

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
    const shouldPersist = canPersistDraft(form, startedSessionAt);

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
  }, [draftStorageKey, form, patientId, patientName, startedSessionAt]);

  useEffect(() => {
    return () => {
      if (!canPersistDraft(form, startedSessionAt)) {
        // Usuario abriu e saiu sem iniciar atendimento: limpa qualquer rascunho
        // e metadados de notificacao que possam existir para nao deixar rastro.
        if (!form.id) {
          localStorage.removeItem(draftStorageKey);
          clearClinicalDraftMeta(patientId);
        }
        return;
      }
      localStorage.setItem(draftStorageKey, JSON.stringify(form));
      writeClinicalDraftMeta({
        patientId,
        patientName,
        path: getClinicalDraftPath(patientId),
        updatedAt: new Date().toISOString(),
        status: form.id ? "rascunho" : "em_andamento",
      });
    };
  }, [draftStorageKey, form, patientId, patientName, startedSessionAt]);

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

  const visibleSavedEvolutions = useMemo(() => {
    const all = (evolutionQuery.data ?? []).filter((record: any) => !isSecretaryOnlyRecord(record));
    // Deduplica registros importados que vieram repetidos da migração (ex.: o
    // mesmo atendimento criado duas vezes pelo importer ou presente nas tabelas
    // legacy + clinical_evolution). Chave: (data/hora truncada ao minuto +
    // fingerprint dos primeiros caracteres da nota clínica). Mantém o mais
    // novo (id maior) e prioriza o que tem mais conteúdo.
    const dedupeKey = (record: any) => {
      const ts = new Date(record.startedAt ?? record.createdAt ?? 0).getTime();
      const minute = ts ? Math.floor(ts / 60000) : 0;
      const fingerprint = stripHtml(record.clinicalNotes ?? record.anamnesis ?? record.evolution ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200)
        .toLocaleLowerCase("pt-BR");
      return `${minute}:${fingerprint}`;
    };
    const score = (record: any) =>
      stripHtml(record.clinicalNotes ?? "").length +
      stripHtml(record.anamnesis ?? "").length +
      stripHtml(record.evolution ?? "").length;
    const groups = new Map<string, any>();
    for (const rec of all) {
      const k = dedupeKey(rec);
      if (!k.split(":")[1]) {
        groups.set(`${k}-${rec.id}`, rec); // sem fingerprint útil → não dedupe
        continue;
      }
      const existing = groups.get(k);
      if (!existing) {
        groups.set(k, rec);
        continue;
      }
      // Prefere o que tem mais conteúdo; em empate, o id mais alto (mais novo).
      if (score(rec) > score(existing) || (score(rec) === score(existing) && Number(rec.id) > Number(existing.id))) {
        groups.set(k, rec);
      }
    }
    return Array.from(groups.values()).sort((left: any, right: any) => {
      const l = new Date(left.startedAt ?? left.createdAt ?? 0).getTime();
      const r = new Date(right.startedAt ?? right.createdAt ?? 0).getTime();
      return r - l;
    });
  }, [evolutionQuery.data]);

  const buildPayload = (status: "rascunho" | "finalizado") => {
    if (!form.attendanceType) {
      throw new Error("Selecione o tipo de atendimento: Presencial ou Online.");
    }
    if (status === "finalizado" && !form.icd10) {
      throw new Error("Selecione um CID-10 para finalizar a consulta.");
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
      attendanceType: form.attendanceType as "presencial" | "online",
      icdCode: form.icd10?.code ?? "",
      icdDescription: form.icd10?.description ?? "",
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

  const handleSave = async (opts?: { justification?: string }) => {
    try {
      const payload = buildPayload("rascunho");
      if (form.id) {
        // Se editando evolução finalizada/assinada, exige justificativa
        if (editingLockedStatus && !opts?.justification) {
          setPendingSaveAction("rascunho");
          setEditJustificationText("");
          setJustificationDialogOpen(true);
          return;
        }
        await updateMutation.mutateAsync({
          id: form.id,
          ...payload,
          editJustification: opts?.justification,
        });
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

  const handleSaveSecretaryNotes = async (opts?: { justification?: string }) => {
    const trimmedNotes = form.secretaryNotes.trim();
    if (!trimmedNotes) {
      toast.error("Preencha as observações da secretaria antes de salvar.");
      return;
    }

    try {
      if (form.id && editingLockedStatus && !opts?.justification) {
        setPendingSaveAction("rascunho");
        setEditJustificationText("");
        setJustificationDialogOpen(true);
        return;
      }

      const result = await updateSecretaryNotesMutation.mutateAsync({
        id: form.id,
        patientId,
        secretaryNotes: trimmedNotes,
        editJustification: opts?.justification,
      });

      if (result?.id) {
        setForm((current) => ({ ...current, id: result.id }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as observações da secretaria.");
    }
  };

  useEffect(() => {
    const handleAutosave = async () => {
      if (!canPersistDraft(form, startedSessionAt)) return;
      localStorage.setItem(draftStorageKey, JSON.stringify(form));
      writeClinicalDraftMeta({
        patientId,
        patientName,
        path: getClinicalDraftPath(patientId),
        updatedAt: new Date().toISOString(),
        status: form.id ? "rascunho" : "em_andamento",
      });

      try {
        if (isReceptionist) {
          await handleSaveSecretaryNotes();
        } else {
          await handleSave();
        }
      } catch {
        // keep local draft even if network save fails
      }
    };

    window.addEventListener(CLINICAL_DRAFT_AUTOSAVE_EVENT, handleAutosave as EventListener);
    return () => window.removeEventListener(CLINICAL_DRAFT_AUTOSAVE_EVENT, handleAutosave as EventListener);
  }, [draftStorageKey, form, isReceptionist, patientId, patientName, startedSessionAt]);

  const handleFinalize = async (opts?: { justification?: string }) => {
    try {
      const payload = buildPayload("finalizado");
      if (form.id) {
        if (editingLockedStatus && !opts?.justification) {
          setPendingSaveAction("finalizado");
          setEditJustificationText("");
          setJustificationDialogOpen(true);
          return;
        }
        await updateMutation.mutateAsync({
          id: form.id,
          ...payload,
          editJustification: opts?.justification,
        });
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
      setEditingLockedStatus(null);
      toast.success("Consulta finalizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar a consulta.");
    }
  };

  const confirmJustificationAndSubmit = async () => {
    const justification = editJustificationText.trim();
    if (justification.length < 10) {
      toast.error("A justificativa precisa ter no mínimo 10 caracteres.");
      return;
    }
    setJustificationDialogOpen(false);
    if (pendingSaveAction === "finalizado") {
      await handleFinalize({ justification });
    } else {
      if (isReceptionist) {
        await handleSaveSecretaryNotes({ justification });
      } else {
        await handleSave({ justification });
      }
    }
    setPendingSaveAction(null);
    setEditJustificationText("");
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

  const handleSaveTranscriptionDraft = () => {
    if (!form.audioTranscription.trim()) {
      toast.error("Nenhuma transcrição disponível para manter separada.");
      return;
    }
    toast.success("Transcrição mantida separadamente. Ela ficará disponível para salvar junto com o atendimento.");
  };

  const handleIncorporateTranscription = async () => {
    if (!form.audioTranscription.trim()) {
      toast.error("Transcreva o áudio antes de incorporar à evolução clínica.");
      return;
    }

    const currentNotes = stripHtml(form.clinicalNotes);
    const templateNotes = stripHtml(CLEAN_DEFAULT_CLINICAL_NOTES_TEMPLATE);
    const hasExistingClinicalContent = currentNotes.length > 0 && currentNotes !== templateNotes;

    if (hasExistingClinicalContent) {
      const confirmed = window.confirm(
        "A incorporação inteligente vai reorganizar o texto atual da evolução clínica a partir da transcrição. Deseja continuar?",
      );
      if (!confirmed) return;
    }

    const result = await incorporateTranscriptionMutation.mutateAsync({
      transcription: form.audioTranscription,
    });

    setForm((current) => ({
      ...current,
      audioTranscription: result.refinedTranscript || current.audioTranscription,
      clinicalNotes: result.clinicalNotesHtml || current.clinicalNotes,
    }));
    toast.success("Transcrição incorporada à evolução clínica em linguagem médica.");
  };

  const handleSelectEvolution = (record: any) => {
    setSelectedEvolution(record);
    setStartedSessionAt(record.startedAt ? toDateTimeInputValue(new Date(record.startedAt)) : "");
    setForm({
      id: record.id,
      attendanceType: (record.attendanceType === "presencial" || record.attendanceType === "online") ? record.attendanceType : "",
      icd10: record.icdCode ? { id: record.id, code: record.icdCode, description: record.icdDescription } : null,
      clinicalNotes: record.clinicalNotes || CLEAN_DEFAULT_CLINICAL_NOTES_TEMPLATE,
      secretaryNotes: record.secretaryNotes || "",
      audioTranscription: record.audioTranscription || "",
      assistantUserId: record.assistantUserId ? String(record.assistantUserId) : "",
      assistantName: record.assistantName || "",
      startedAt: record.startedAt ? toDateTimeInputValue(new Date(record.startedAt)) : "",
      endedAt: record.endedAt ? toDateTimeInputValue(new Date(record.endedAt)) : "",
      isRetroactive: Boolean(record.isRetroactive),
      retroactiveJustification: record.retroactiveJustification || "",
    });
    // Se a evolução já estava finalizada/assinada, qualquer salvar daqui pra
    // frente vai exigir justificativa (auditada em clinical_evolution_edit_log).
    const locked = record.status === "finalizado" || record.status === "assinado";
    setEditingLockedStatus(locked ? record.status : null);
    if (locked) {
      toast.warning("Esta consulta já foi finalizada. Toda edição exige justificativa e será registrada em auditoria.");
    } else {
      toast.info("Atendimento carregado para edição.");
    }
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

    const signatureDetails = getSignatureDetails(selectedEvolution, professionalName);
    const signatureMethodForPdf: D4SignatureLog["signatureMethod"] = signatureDetails?.method.includes("A3")
      ? "icp_brasil_a3"
      : signatureDetails?.method.includes("A1")
        ? "icp_brasil_a1"
        : "eletronica";
    const signatureLogs: D4SignatureLog[] = signatureDetails
      ? [
          {
            uuid: `evolucao-${selectedEvolution.id}`,
            signerName: signatureDetails.signerName,
            signerEmail: (user as any)?.email || "contato@drwesleycamara.com.br",
            signedAt: signatureDetails.signedAt,
            status: "assinado",
            signatureMethod: signatureMethodForPdf,
            signatureHash: signatureDetails.validationCode || undefined,
            certificateInfo: {
              subject: signatureDetails.certificateLabel !== "Certificado não informado" ? signatureDetails.certificateLabel : signatureDetails.signerName,
              issuer: signatureDetails.provider,
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
      details: typeof log.details === "string" ? repairTextArtifacts(log.details) : undefined,
    }));

    const clinicalNotesText = clinicalTextFromHtml(selectedEvolution.clinicalNotes || "") || "Sem evolução clínica registrada.";
    const secretaryNotesText = clinicalTextFromHtml(selectedEvolution.secretaryNotes || "");
    const audioTranscriptionText = clinicalTextFromHtml(selectedEvolution.audioTranscription || "");
    const relatedExams = Array.isArray(selectedEvolution.relatedExams) ? selectedEvolution.relatedExams : [];
    const relatedPrescriptions = Array.isArray(selectedEvolution.relatedPrescriptions) ? selectedEvolution.relatedPrescriptions : [];
    const relatedDocuments = Array.isArray(selectedEvolution.relatedDocuments) ? selectedEvolution.relatedDocuments : [];

    const content = `
      <div style="font-family: Montserrat, sans-serif;">
        <div style="margin-bottom: 18px;">
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Paciente:</strong> ${escapeHtml(patientName)}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Profissional:</strong> ${escapeHtml(selectedEvolution.signedByDoctorName || selectedEvolution.doctorName || professionalName)}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Acompanhou no atendimento:</strong> ${escapeHtml(selectedEvolution.assistantName || "Ninguém")}</p>
          <p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Período:</strong> ${escapeHtml(formatDateTime(selectedEvolution.startedAt))} até ${escapeHtml(formatDateTime(selectedEvolution.endedAt))}</p>
          <p style="margin: 0; font-size: 14px;"><strong>CID-10:</strong> ${escapeHtml(selectedEvolution.icdCode || "-")} - ${escapeHtml(selectedEvolution.icdDescription || "")}</p>
        </div>
        ${selectedEvolution.retroactiveJustification ? `
          <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #d4a853; border-radius: 8px;">
            <strong>Atendimento retroativo:</strong> ${escapeHtml(clinicalTextFromHtml(selectedEvolution.retroactiveJustification))}
          </div>
        ` : ""}
        <div style="white-space: pre-wrap; font-size: 12px; line-height: 1.65;">${escapeHtml(clinicalNotesText)}</div>
        ${secretaryNotesText ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 14px; margin: 0 0 8px 0;">Observações da secretaria</h3>
            <p style="white-space: pre-wrap; font-size: 12px; margin: 0;">${escapeHtml(secretaryNotesText)}</p>
          </div>
        ` : ""}
        ${audioTranscriptionText ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 14px; margin: 0 0 8px 0;">Transcrição de áudio</h3>
            <p style="white-space: pre-wrap; font-size: 12px; margin: 0;">${escapeHtml(audioTranscriptionText)}</p>
          </div>
        ` : ""}
        ${(relatedExams.length || relatedPrescriptions.length || relatedDocuments.length) ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 14px; margin: 0 0 8px 0;">Registros vinculados ao atendimento</h3>
            ${relatedExams.map((item: any) => `<p style="margin:0 0 6px 0;"><strong>Exame solicitado:</strong> ${escapeHtml(clinicalTextFromHtml(item.content || item.exams || "Solicitação registrada."))}</p>`).join("")}
            ${relatedPrescriptions.map((item: any) => `<p style="margin:0 0 6px 0;"><strong>Prescrição:</strong> ${escapeHtml(clinicalTextFromHtml(item.content || "Prescrição registrada."))}</p>`).join("")}
            ${relatedDocuments.map((item: any) => `<p style="margin:0 0 6px 0;"><strong>${escapeHtml(item.type || "Documento")}:</strong> ${escapeHtml(clinicalTextFromHtml(item.name || item.description || "Documento registrado."))}</p>`).join("")}
          </div>
        ` : ""}
        ${signatureDetails ? buildSignatureDetailsHtml(signatureDetails) : ""}
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

  if (isReceptionist) {
    const records = (evolutionQuery.data ?? [])
      .slice()
      .sort((left: any, right: any) => {
        const l = new Date(left.startedAt ?? left.createdAt ?? 0).getTime();
        const r = new Date(right.startedAt ?? right.createdAt ?? 0).getTime();
        return r - l;
      });

    return (
      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Registro administrativo da secretaria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este perfil registra apenas anotações administrativas. Evoluções médicas, anamneses e anexos clínicos permanecem protegidos.
            </p>

            <div className="space-y-2">
              <Label>Registro administrativo</Label>
              <Textarea
                value={form.secretaryNotes}
                onChange={(event) => setForm((current) => ({ ...current, secretaryNotes: event.target.value }))}
                placeholder="Ex.: paciente ligou alterado, pediu retorno, informou pendência financeira ou deixou recado para a equipe."
                rows={8}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedEvolution(null);
                  setEditingLockedStatus(null);
                  setStartedSessionAt("");
                  setForm(emptyForm());
                }}
              >
                Novo registro da secretaria
              </Button>
              <Button type="button" onClick={() => handleSaveSecretaryNotes()} disabled={updateSecretaryNotesMutation.isPending}>
                {updateSecretaryNotesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar registro
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Meus registros administrativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro administrativo disponível ainda para este paciente.</p>
            ) : (
              records.map((record: any) => {
                const isLegacy = record.isLegacy === true;
                return (
                  <div key={`${isLegacy ? "legacy" : "ev"}-${record.id}`} className="rounded-2xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{record.status || "rascunho"}</Badge>
                          {isLegacy && <Badge variant="secondary">{record.legacySourceLabel || "Importado"}</Badge>}
                        </div>
                        <p className="text-sm font-medium">
                          {record.startedAt ? new Date(record.startedAt).toLocaleString("pt-BR") : (record.createdAt ? new Date(record.createdAt).toLocaleString("pt-BR") : "—")}
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {record.secretaryNotes?.trim() || "Sem registro administrativo neste atendimento."}
                        </p>
                      </div>
                      {!isLegacy && (
                        <Button size="sm" variant="outline" onClick={() => handleSelectEvolution(record)}>
                          Editar registro
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (false && isReceptionist) {
    const records = (evolutionQuery.data ?? [])
      .slice()
      .sort((left: any, right: any) => {
        const l = new Date(left.startedAt ?? left.createdAt ?? 0).getTime();
        const r = new Date(right.startedAt ?? right.createdAt ?? 0).getTime();
        return r - l;
      });

    return (
      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Observações da secretaria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este perfil registra apenas observações administrativas. O conteúdo clínico e os anexos médicos ficam protegidos.
            </p>

            <div className="space-y-2">
              <Label>Observações da secretaria</Label>
              <Textarea
                value={form.secretaryNotes}
                onChange={(event) => setForm((current) => ({ ...current, secretaryNotes: event.target.value }))}
                placeholder="Ex.: paciente solicitou retorno, confirmou presença, informou pendência financeira ou trouxe recado para a equipe médica."
                rows={8}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedEvolution(null);
                  setEditingLockedStatus(null);
                  setStartedSessionAt("");
                  setForm(emptyForm());
                }}
              >
                Novo registro da secretaria
              </Button>
              <Button type="button" onClick={() => handleSaveSecretaryNotes()} disabled={updateSecretaryNotesMutation.isPending}>
                {updateSecretaryNotesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar observações
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Registros disponíveis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro disponível ainda para este paciente.</p>
            ) : (
              records.map((record: any) => {
                const isLegacy = record.isLegacy === true;
                return (
                  <div key={`${isLegacy ? "legacy" : "ev"}-${record.id}`} className="rounded-2xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{record.status || "rascunho"}</Badge>
                          {isLegacy && <Badge variant="secondary">{record.legacySourceLabel || "Importado"}</Badge>}
                        </div>
                        <p className="text-sm font-medium">
                          {record.startedAt ? new Date(record.startedAt).toLocaleString("pt-BR") : (record.createdAt ? new Date(record.createdAt).toLocaleString("pt-BR") : "—")}
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {record.secretaryNotes?.trim() || "Sem observações da secretaria neste registro."}
                        </p>
                      </div>
                      {!isLegacy && (
                        <Button size="sm" variant="outline" onClick={() => handleSelectEvolution(record)}>
                          Editar observações
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {/* Tipo de atendimento - seleção obrigatória */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Tipo de atendimento <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm((c) => ({ ...c, attendanceType: "presencial" }))}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                  form.attendanceType === "presencial"
                    ? "border-[#C9A55B] bg-[#C9A55B]/10 text-[#8A6526]"
                    : "border-border/50 text-muted-foreground hover:border-[#C9A55B]/50"
                }`}
              >
                Presencial
              </button>
              <button
                type="button"
                onClick={() => setForm((c) => ({ ...c, attendanceType: "online" }))}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                  form.attendanceType === "online"
                    ? "border-[#C9A55B] bg-[#C9A55B]/10 text-[#8A6526]"
                    : "border-border/50 text-muted-foreground hover:border-[#C9A55B]/50"
                }`}
              >
                Online / Teleconsulta
              </button>
            </div>
            {!form.attendanceType && (
              <p className="text-xs text-red-500">Selecione o tipo de atendimento para continuar.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleStart} variant="outline" className="border-[#C9A55B]/30 text-[#8A6526]">
              <PlayCircle className="mr-2 h-4 w-4" />
              Iniciar atendimento
            </Button>
            <p className="text-xs text-muted-foreground">
              Os botões de <strong>Salvar</strong> e <strong>Finalizar consulta</strong> ficam abaixo, ao final da ficha de evolução.
            </p>
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
        <CardContent className="space-y-4">
          <AudioRecorder
            medicalRecordId={form.id}
            showTranscriptionEditor={false}
            onTranscriptionComplete={(text) =>
              setForm((current) => ({
                ...current,
                audioTranscription: [current.audioTranscription, text].filter(Boolean).join("\n\n"),
              }))
            }
          />

          <div className="space-y-2 border-t border-border/40 pt-4">
            <Label>Transcrição de áudio</Label>
            <Textarea
              value={form.audioTranscription}
              onChange={(event) => setForm((current) => ({ ...current, audioTranscription: event.target.value }))}
              rows={7}
              placeholder="A transcrição revisada em português do Brasil aparecerá aqui e poderá ser editada antes de salvar ou incorporar."
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleSaveTranscriptionDraft}>
                <Save className="mr-2 h-4 w-4" />
                Salvar transcrição
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleIncorporateTranscription()}
                disabled={incorporateTranscriptionMutation.isPending}
                className="border-[#C9A55B]/30 text-[#8A6526]"
              >
                {incorporateTranscriptionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenTool className="mr-2 h-4 w-4" />}
                Incorporar à evolução clínica
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Evolução clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Modelo de evolução</Label>
            <Select onValueChange={handleApplyTemplate}>
              <SelectTrigger className="max-w-md">
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

          <div className="space-y-2">
            <Label>Notas clínicas e exame físico</Label>
            <RichTextEditor
              value={form.clinicalNotes}
              onChange={(value) => setForm((current) => ({ ...current, clinicalNotes: value }))}
              placeholder="Queixa principal, história atual e pregressa, exame físico, hipótese diagnóstica, conduta e observações."
              minHeight="280px"
            />
          </div>

          {false && (
            <>

          <div className="space-y-2">
            <Label>Observações da secretaria</Label>
            <Textarea
              value={form.secretaryNotes}
              onChange={(event) => setForm((current) => ({ ...current, secretaryNotes: event.target.value }))}
              rows={4}
              placeholder="Espaço compartilhado para recados administrativos, retornos e pendências registradas pela secretaria."
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

          {/* CID-10 agora fica ABAIXO da evolução, conforme regra clínica */}
            </>
          )}

          <div className="space-y-2 pt-2 border-t border-border/40">
            <Label>CID-10 (obrigatório apenas ao finalizar)</Label>
            <Icd10Search
              selectedCode={form.icd10}
              onSelect={(value) => setForm((current) => ({ ...current, icd10: value?.code ? value : null }))}
            />
          </div>

          {/* Botões de Salvar / Finalizar no fim da ficha */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-border/40">
            <Button type="button" onClick={() => handleSave()} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFinalizeConfirmOpen(true)}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="border-emerald-600/30 text-emerald-700"
            >
              <StopCircle className="mr-2 h-4 w-4" />
              Finalizar consulta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Atendimentos salvos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleSavedEvolutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendimento salvo ainda para este paciente.</p>
          ) : (
            visibleSavedEvolutions.map((record: any) => {
              const isLegacy = record.isLegacy === true;
              const displayId = isLegacy ? (record.legacyRecordId ?? Math.abs(record.id)) : record.id;
              const recordKey = getEvolutionRecordKey(record);
              const isExpanded = expandedEvolutionKey === recordKey;
              const signatureDetails = getSignatureDetails(record, professionalName);
              const showSignatureDetails = signatureDetailsKey === recordKey;
              const clinicalSummary = stripHtml(record.clinicalNotes || "").slice(0, 260) || "Sem resumo clínico.";
              const clinicalFullText =
                dedupeRepeatedSections(clinicalTextFromHtml(record.clinicalNotes || "")) ||
                "Sem evolução clínica registrada.";
              const secretaryNotesText = clinicalTextFromHtml(record.secretaryNotes || "");
              const audioTranscriptionText = clinicalTextFromHtml(record.audioTranscription || "");
              const relatedExams = Array.isArray(record.relatedExams) ? record.relatedExams : [];
              const relatedPrescriptions = Array.isArray(record.relatedPrescriptions) ? record.relatedPrescriptions : [];
              const relatedDocuments = Array.isArray(record.relatedDocuments) ? record.relatedDocuments : [];

              return (
                <div key={recordKey} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{record.icdCode || "Sem CID"}</Badge>
                        <Badge variant="outline">{record.status || "finalizado"}</Badge>
                        {record.signatureProvider && (
                          <Badge variant="outline">{SIGNATURE_PROVIDER_LABELS[String(record.signatureProvider)] || record.signatureProvider}</Badge>
                        )}
                        {isLegacy && (
                          <Badge variant="secondary">
                            {record.legacySourceLabel || "Importado"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">
                        #{displayId} - {formatDateTime(record.startedAt || record.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Atendido por {repairTextArtifacts(record.doctorName || professionalName)} - Acompanhamento: {repairTextArtifacts(record.assistantName || "Ninguém")}
                      </p>
                      <p className="text-xs text-muted-foreground">{clinicalSummary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isLegacy && (
                        <Button size="sm" variant="outline" onClick={() => handleSelectEvolution(record)}>
                          Continuar
                        </Button>
                      )}
                      {!isLegacy && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setHistoryForEvolutionId(record.id);
                            setHistoryDialogOpen(true);
                          }}
                        >
                          <History className="mr-1.5 h-3.5 w-3.5" />
                          Histórico
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { setSelectedEvolution(record); setExportDialogOpen(true); }}>
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                        Exportar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExpandedEvolutionKey(isExpanded ? null : recordKey);
                          if (!isExpanded) setSignatureDetailsKey(null);
                        }}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        {isExpanded ? "Ocultar" : "Visualizar"}
                      </Button>
                      {!isLegacy && record.status !== "assinado" && (
                        <Button size="sm" onClick={() => handleOpenSignature(record)}>
                          <PenTool className="mr-1.5 h-3.5 w-3.5" />
                          Assinar
                        </Button>
                      )}
                      {!isLegacy && record.status === "assinado" && signatureDetails && (
                        <button
                          type="button"
                          onClick={() => setSignatureDetailsKey(showSignatureDetails ? null : recordKey)}
                          className="inline-flex h-8 items-center rounded-md bg-emerald-100 px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200"
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Assinado
                        </button>
                      )}
                    </div>
                  </div>

                  {signatureDetails && showSignatureDetails && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
                      <p className="font-semibold text-emerald-800">Detalhes da assinatura digital</p>
                      <p>Assinado em: {signatureDetails.signedAt}</p>
                      <p>Assinante: {signatureDetails.signerName}</p>
                      <p>Método: {signatureDetails.method}</p>
                      <p>Provedor: {signatureDetails.provider}</p>
                      <p>Certificado: {signatureDetails.certificateLabel}</p>
                      {signatureDetails.validationCode ? <p className="break-all">Código de validação: {signatureDetails.validationCode}</p> : null}
                      {signatureDetails.sessionId ? <p className="break-all">Sessão/documento: {signatureDetails.sessionId}</p> : null}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t border-border/50 pt-4">
                      <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <span className="block font-medium text-foreground">Período</span>
                          {formatDateTime(record.startedAt || record.createdAt)} até {formatDateTime(record.endedAt)}
                        </div>
                        <div>
                          <span className="block font-medium text-foreground">Profissional</span>
                          {repairTextArtifacts(record.doctorName || professionalName)}
                        </div>
                        <div>
                          <span className="block font-medium text-foreground">Tipo</span>
                          {repairTextArtifacts(record.attendanceType || "Não informado")}
                        </div>
                        <div>
                          <span className="block font-medium text-foreground">CID-10</span>
                          {record.icdCode || "Sem CID"} {record.icdDescription ? `- ${repairTextArtifacts(record.icdDescription)}` : ""}
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-foreground">Ficha de atendimento completa</h4>
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                          {clinicalFullText}
                        </div>
                      </div>

                      {secretaryNotesText && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Observações da secretaria</h4>
                          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                            {secretaryNotesText}
                          </div>
                        </div>
                      )}

                      {audioTranscriptionText && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Transcrição de áudio</h4>
                          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
                            {audioTranscriptionText}
                          </div>
                        </div>
                      )}

                      {(relatedExams.length > 0 || relatedPrescriptions.length > 0 || relatedDocuments.length > 0) && (
                        <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Registros vinculados</h4>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            {relatedExams.map((item: any) => (
                              <p key={`exam-${item.id}`}><span className="font-medium text-foreground">Exame solicitado:</span> {clinicalTextFromHtml(item.content || item.exams || "Solicitação registrada.")}</p>
                            ))}
                            {relatedPrescriptions.map((item: any) => (
                              <p key={`prescription-${item.id}`}><span className="font-medium text-foreground">Prescrição:</span> {clinicalTextFromHtml(item.content || "Prescrição registrada.")}</p>
                            ))}
                            {relatedDocuments.map((item: any) => (
                              <p key={`document-${item.id}`}><span className="font-medium text-foreground">{repairTextArtifacts(item.type || "Documento")}:</span> {clinicalTextFromHtml(item.name || item.description || "Documento registrado.")}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {signatureDetails && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
                          <p className="font-semibold text-emerald-800">Assinatura digital</p>
                          <p>Assinado em: {signatureDetails.signedAt}</p>
                          <p>Assinante: {signatureDetails.signerName}</p>
                          <p>Método: {signatureDetails.method}</p>
                          <p>Provedor: {signatureDetails.provider}</p>
                          <p>Certificado: {signatureDetails.certificateLabel}</p>
                          {signatureDetails.validationCode ? <p className="break-all">Código de validação: {signatureDetails.validationCode}</p> : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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

      {/* Dialogo de confirmacao antes de finalizar o atendimento */}
      <Dialog open={finalizeConfirmOpen} onOpenChange={setFinalizeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar atendimento?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Confirme para encerrar este atendimento.</p>
            <p>Depois disso ele ficará registrado como concluído no histórico do paciente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeConfirmOpen(false)}>
              Voltar
            </Button>
            <Button
              onClick={async () => {
                setFinalizeConfirmOpen(false);
                await handleFinalize();
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="border-emerald-600/30 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogo de justificativa para edicao de consulta finalizada/assinada */}
      <Dialog
        open={justificationDialogOpen}
        onOpenChange={(open) => {
          setJustificationDialogOpen(open);
          if (!open) {
            setPendingSaveAction(null);
            setEditJustificationText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justificar edição de consulta finalizada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta consulta já está {editingLockedStatus === "assinado" ? "assinada" : "finalizada"}.
              Para fins de auditoria, descreva o motivo da edição. Tudo será registrado (quem,
              quando, o que mudou e a justificativa) e ficará disponível para consulta posterior.
            </p>
            <Textarea
              value={editJustificationText}
              onChange={(e) => setEditJustificationText(e.target.value)}
              placeholder="Ex.: Correção de CID erroneamente informado; acréscimo de informação relatada pelo paciente após a consulta..."
              rows={5}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo de 10 caracteres. A versão anterior e a nova serão gravadas no log de auditoria.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustificationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmJustificationAndSubmit}
              disabled={editJustificationText.trim().length < 10 || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar e {pendingSaveAction === "finalizado" ? "finalizar" : "salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de histórico de edições auditáveis */}
      <Dialog
        open={historyDialogOpen}
        onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open) setHistoryForEvolutionId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de edições auditáveis</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {editHistoryQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando histórico...</p>
            ) : !editHistoryQuery.data || editHistoryQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma edição registrada após a finalização desta consulta.
              </p>
            ) : (
              editHistoryQuery.data.map((log: any) => (
                <div key={log.id} className="rounded-xl border border-border/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="font-medium">
                      {log.editedByUserName}
                      {log.editedByUserRole ? ` (${log.editedByUserRole})` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.editedAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Status: {log.previousStatus || "—"} → {log.newStatus || "—"}
                  </div>
                  <p className="text-sm whitespace-pre-wrap mb-2">
                    <span className="font-semibold">Justificativa:</span> {log.justification}
                  </p>
                  {Array.isArray(log.changedFields) && log.changedFields.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Campos alterados: {log.changedFields.join(", ")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
