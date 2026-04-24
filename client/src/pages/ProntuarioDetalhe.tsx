import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import type { ChangeEvent, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  SYSTEM_ANAMNESIS_TEMPLATES,
  buildAnamnesisAnswersMap,
  cloneAnamnesisQuestions,
  mapTemplateSectionsToQuestions,
  serializeAnamnesisQuestions,
  shouldShowFollowUp,
  validateAnamnesisQuestions,
  type AnamnesisQuestion,
  type AnamnesisTemplate,
} from "@/lib/anamnesis";
import {
  ArrowLeft, Plus, FileText, Activity, Stethoscope, ClipboardList, Loader2,
  Calendar, User, ShieldCheck, FileDown, UserCheck, Copy, Link2, Paperclip,
  FlaskConical, Package, Save, Upload, Trash2, Search, CheckCircle2, History, FolderOpen, ImageIcon,
  ScrollText, Pencil, ExternalLink, Receipt, Video, Layers3, ClipboardPlus, Printer,
} from "lucide-react";
import { PatientEditDialog } from "@/components/PatientEditDialog";
import { AllergyAlert } from "@/components/AllergyAlert";
import { ExportProntuarioButton } from "@/components/ExportProntuario";
import { EvolucaoClinicaWorkspace } from "@/components/EvolucaoClinicaWorkspace";
import { RichTextEditor } from "@/components/RichTextEditor";
import { generatePremiumPdf } from "@/components/PdfExporter";
import { WhatsAppSendButton } from "@/components/WhatsAppSendButton";
import { SignatureCertillionButton } from "@/components/SignatureCertillionButton";
import { useAuth } from "@/_core/hooks/useAuth";

function buildHistorySummary(record: any) {
  return [
    record.chiefComplaint,
    record.anamnesis,
    record.historyOfPresentIllness,
    record.clinicalEvolution,
    record.evolution,
    record.plan,
    record.treatmentPlan,
    record.pastMedicalHistory,
    record.familyHistory,
    record.socialHistory,
    record.currentMedications,
    record.allergies,
    record.physicalExam,
    record.diagnosis,
  ]
    .map((value) => formatImportedText(value))
    .filter(Boolean)
    .join("\n\n");
}

function summarizeText(text?: string | null, maxLength: number = 180) {
  const normalized = formatImportedText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function repairMojibake(value?: string | null) {
  let text = String(value ?? "");
  if (!text) return "";
  if (!(/[\u00c3\u00c2\uFFFD]/.test(text) || /\u00e2[\u0080-\u00bf]/.test(text))) return text;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const bytes = Uint8Array.from(Array.from(text).map((char) => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (!decoded || decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }

  return text.replace(/\uFFFD/g, "").trim();
}

function decodeHtmlEntities(value: string) {
  const entities: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    ccedil: "c", Ccedil: "C", aacute: "a", eacute: "e", iacute: "i", oacute: "o", uacute: "u",
    agrave: "a", egrave: "e", atilde: "a", otilde: "o", acirc: "a", ecirc: "e", ocirc: "o",
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, entity) => entities[entity] ?? match);
}

function formatImportedText(value?: string | null) {
  let text = repairMojibake(value);
  if (!text) return "";

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getThreeLinePreview(value: string) {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 3 && value.length <= 360) return { preview: value, truncated: false };
  if (lines.length > 3) return { preview: lines.slice(0, 3).join("\n"), truncated: true };
  return { preview: value.slice(0, 360).trimEnd() + "...", truncated: true };
}

function groupDocumentsByType(documents: any[]) {
  const labels: Record<string, string> = {
    rg: "Documentos pessoais",
    cpf: "Documentos pessoais",
    convenio: "Documentos pessoais",
    termo: "Contratos e termos",
    contrato: "Contratos e termos",
    exame_pdf: "Resultados de exames",
    exame_imagem: "Resultados de exames",
    solicitacao_exames: "Resultados de exames",
    evolucao_pdf: "Atendimentos anteriores",
    prescricao: "Prescrições e solicitações",
    video: "Vídeos",
    outro: "Outros anexos",
  };

  return documents.reduce<Record<string, any[]>>((acc, document) => {
    const key = labels[document.type] || "Outros anexos";
    if (!acc[key]) acc[key] = [];
    acc[key].push(document);
    return acc;
  }, {});
}

const DEFAULT_ATTACHMENT_FOLDERS = ["Documentos pessoais", "Resultados de exames"];

const DOCUMENT_TYPE_OPTIONS = [
  { value: "atestado", label: "Atestado" },
  { value: "declaracao", label: "Declaração" },
  { value: "rg", label: "Documento pessoal" },
  { value: "cpf", label: "CPF / identificação" },
  { value: "convenio", label: "Convênio / carteirinha" },
  { value: "exame_pdf", label: "Resultado de exame" },
  { value: "solicitacao_exames", label: "Solicitação de exames" },
  { value: "laudo", label: "Laudo / relatório" },
  { value: "contrato", label: "Contrato" },
  { value: "termo", label: "Termo de consentimento" },
  { value: "outro", label: "Outro documento" },
] as const;

function getAttachmentFolderLabel(document: any) {
  if (document?.folderLabel) return repairMojibake(document.folderLabel);

  const type = String(document?.type ?? "").toLowerCase();
  if (["rg", "cpf", "convenio"].includes(type)) return "Documentos pessoais";
  if (["exame_pdf", "exame_imagem", "solicitacao_exames", "laudo"].includes(type)) return "Resultados de exames";
  if (["contrato", "termo"].includes(type)) return "Contratos e termos";
  return "Outros anexos";
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function textToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "documento-clinico";
}

function normalizeTemplateSearchText(value?: string | null) {
  return repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

type ClinicalDocumentType = "atestado" | "declaracao" | "laudo" | "solicitacao_exames";

const CLINICAL_DOCUMENT_METADATA_PREFIX = "__GLUTEC_CLINICAL_DOC__:";
const CLINICAL_DOCUMENT_TYPE_LABELS: Record<ClinicalDocumentType, string> = {
  atestado: "Atestado",
  declaracao: "Declaração",
  laudo: "Laudo / relatório",
  solicitacao_exames: "Solicitação de exames",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value?: string | null) {
  const normalized = formatImportedText(value);
  if (!normalized) return "<p></p>";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildClinicalDocumentMetadata(content: string, documentType: ClinicalDocumentType) {
  return `${CLINICAL_DOCUMENT_METADATA_PREFIX}${JSON.stringify({
    documentType,
    templateGroup: documentType === "declaracao" ? "declaracao" : documentType === "solicitacao_exames" ? "solicitacao_exames" : "atestado",
    summary: summarizeText(content, 220),
    content,
  })}`;
}

function normalizeClinicalDocumentType(value?: string | null): ClinicalDocumentType {
  const normalized = normalizeTemplateSearchText(value);
  if (normalized.includes("declar")) return "declaracao";
  if (normalized.includes("solicitacao") || normalized.includes("pedido de exame") || normalized.includes("exame")) return "solicitacao_exames";
  if (normalized.includes("laudo")) return "laudo";
  return "atestado";
}

function isClinicalDocumentTemplate(template: any) {
  const group = String(template?.group ?? "").toLowerCase();
  if (["atestado", "declaracao", "solicitacao_exames"].includes(group)) return true;

  const haystack = normalizeTemplateSearchText(
    [template?.name, template?.specialty, template?.description].filter(Boolean).join(" "),
  );
  return haystack.includes("atestado") || haystack.includes("declar") || haystack.includes("laudo") || haystack.includes("exame");
}

function inferClinicalDocumentType(template: any): ClinicalDocumentType {
  const group = String(template?.group ?? "").toLowerCase();
  if (group === "declaracao") return "declaracao";
  if (group === "solicitacao_exames") return "solicitacao_exames";
  if (group === "atestado") return "atestado";
  return normalizeClinicalDocumentType([template?.name, template?.specialty, template?.description].filter(Boolean).join(" "));
}

function getClinicalDocumentTemplateGroup(type: ClinicalDocumentType) {
  if (type === "declaracao") return "declaracao";
  if (type === "solicitacao_exames") return "solicitacao_exames";
  return "atestado";
}

function applyDocumentPlaceholders(content: string, patientName: string) {
  const today = new Date().toLocaleDateString("pt-BR");
  return content
    .replace(/\[NOME_PACIENTE\]/g, patientName)
    .replace(/\{NOME_PACIENTE\}/g, patientName)
    .replace(/\[PACIENTE\]/g, patientName)
    .replace(/\{PACIENTE\}/g, patientName)
    .replace(/\[DATA_ATUAL\]/g, today)
    .replace(/\{DATA_ATUAL\}/g, today);
}

function templateToClinicalDocumentHtml(template: any, patientName: string) {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const sectionContent = sections
    .map((section: any) => {
      if (typeof section?.content === "string" && section.content.trim()) return section.content.trim();
      if (typeof section?.text === "string" && section.text.trim()) return section.text.trim();
      const fields = Array.isArray(section?.fields) ? section.fields : [];
      return fields.map((field: any) => field?.label).filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const content = applyDocumentPlaceholders(sectionContent || String(template?.content ?? ""), patientName);
  if (!content.trim()) {
    return buildDefaultClinicalDocumentHtml("atestado", patientName);
  }

  return /<\/?[a-z][\s\S]*>/i.test(content) ? content : plainTextToHtml(content);
}

function buildDefaultClinicalDocumentHtml(type: ClinicalDocumentType, patientName: string) {
  const today = new Date().toLocaleDateString("pt-BR");
  if (type === "declaracao") {
    return [`<p><strong>DECLARAÇÃO</strong></p>`, `<p></p>`, `<p>Declaro, para os devidos fins, que ${patientName} esteve em atendimento em ${today}.</p>`].join("");
  }
  if (type === "solicitacao_exames") {
    return [`<p><strong>SOLICITAÇÃO DE EXAMES</strong></p>`, `<p></p>`, `<p>Paciente: ${patientName}</p>`, `<p>Data: ${today}</p>`, `<p></p>`, `<p>Solicito a realização dos seguintes exames:</p>`].join("");
  }
  if (type === "laudo") {
    return [`<p><strong>LAUDO / RELATÓRIO</strong></p>`, `<p></p>`, `<p>Paciente: ${patientName}</p>`, `<p>Data: ${today}</p>`, `<p></p>`].join("");
  }
  return [`<p><strong>ATESTADO MÉDICO</strong></p>`, `<p></p>`, `<p>Paciente: ${patientName}</p>`, `<p>Data: ${today}</p>`, `<p></p>`, `<p>Atesto, para os devidos fins, que ${patientName} esteve em atendimento nesta data.</p>`].join("");
}

function isTextualClinicalDocument(document: any) {
  const mimeType = String(document?.mimeType ?? "").toLowerCase();
  const fileUrl = String(document?.fileUrl ?? "");
  return Boolean(String(document?.content ?? "").trim()) || mimeType.includes("text/plain") || mimeType.includes("text/html") || /\.(txt|html?)$/i.test(fileUrl);
}

function isSecretaryOnlyEvolutionRecord(record: any) {
  return Boolean(record?.isSecretaryRecord) || (
    String(record?.secretaryNotes || "").trim().length > 0 &&
    String(record?.clinicalNotes || "").trim().length === 0 &&
    String(record?.icdCode || "").trim().length === 0 &&
    String(record?.audioTranscription || "").trim().length === 0
  );
}

function HistoricoTab({ patientId }: { patientId: number }) {
  const { user } = useAuth();
  const isReceptionist = user?.role === "recepcionista" || user?.role === "secretaria";
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Record<string, boolean>>({});
  const { data: evolutions, isLoading } = trpc.clinicalEvolution.getByPatient.useQuery({ patientId });
  const visibleEvolutions = useMemo(
    () =>
      (evolutions ?? []).filter((record: any) =>
        isReceptionist ? isSecretaryOnlyEvolutionRecord(record) : !isSecretaryOnlyEvolutionRecord(record),
      ),
    [evolutions, isReceptionist],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  if (visibleEvolutions.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center">
          <History className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {isReceptionist
              ? "Nenhum registro administrativo seu foi encontrado neste prontuário ainda."
              : "Nenhum atendimento clínico registrado neste prontuário ainda."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {visibleEvolutions.map((ev: any) => {
        const baseDate = ev.startedAt || ev.createdAt;
        const date = baseDate
          ? new Date(baseDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
          : "—";
        const attendanceLabel =
          ev.attendanceType === "online" ? "Online" :
          ev.attendanceType === "presencial" ? "Presencial" : null;
        const isLegacy = ev.isLegacy === true;
        const displayId = isLegacy ? (ev.legacyRecordId ?? Math.abs(ev.id)) : ev.id;
        const historyKey = (isLegacy ? "legacy" : "ev") + "-" + ev.id;
        const clinicalText = formatImportedText(ev.clinicalNotes);
        const secretaryText = formatImportedText(ev.secretaryNotes);
        const audioText = formatImportedText(ev.audioTranscription);
        const mainText = isReceptionist ? secretaryText : clinicalText;
        const isExpanded = Boolean(expandedHistoryItems[historyKey]);
        const preview = getThreeLinePreview(mainText || "");
        const displayedText = isExpanded ? mainText : preview.preview;
        const relatedExams = Array.isArray(ev.relatedExams) ? ev.relatedExams : [];
        const relatedPrescriptions = Array.isArray(ev.relatedPrescriptions) ? ev.relatedPrescriptions : [];
        const relatedDocuments = Array.isArray(ev.relatedDocuments) ? ev.relatedDocuments : [];

        return (
          <Card key={historyKey} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#C9A55B]" />
                  <span className="text-sm font-semibold text-foreground">
                    {isReceptionist ? `Registro #${displayId}` : `Evolução #${displayId}`}
                  </span>
                  {attendanceLabel && !isReceptionist && (
                    <Badge variant="outline" className="text-[10px]">{attendanceLabel}</Badge>
                  )}
                  {isLegacy && (
                    <Badge variant="secondary" className="text-[10px]">
                      {formatImportedText(ev.legacySourceLabel) || "Importado"}
                    </Badge>
                  )}
                  {ev.status && <Badge variant="outline" className="text-[10px]">{repairMojibake(ev.status)}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>

              {isReceptionist ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Registro administrativo</p>
                  <p className="text-sm whitespace-pre-wrap">{displayedText || "Sem registro administrativo neste atendimento."}</p>
                  {preview.truncated ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 py-1 text-xs"
                      onClick={() => setExpandedHistoryItems((current) => ({ ...current, [historyKey]: !isExpanded }))}
                    >
                      {isExpanded ? "Ver menos" : "Ver mais"}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  {clinicalText && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Notas clinicas</p>
                      <p className="text-sm whitespace-pre-wrap">{displayedText}</p>
                      {preview.truncated ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto px-0 py-1 text-xs"
                          onClick={() => setExpandedHistoryItems((current) => ({ ...current, [historyKey]: !isExpanded }))}
                        >
                          {isExpanded ? "Ver menos" : "Ver mais"}
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {audioText && (
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Transcricao de audio</p>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{audioText}</p>
                    </div>
                  )}
                  {(relatedExams.length > 0 || relatedPrescriptions.length > 0 || relatedDocuments.length > 0) ? (
                    <div className="mb-2 rounded-lg border border-border/50 bg-muted/20 p-2">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Solicitacoes e documentos vinculados</p>
                      <div className="flex flex-wrap gap-1.5">
                        {relatedExams.map((exam: any) => (
                          <Badge key={"exam-" + exam.id} variant="outline" className="text-[10px]">Exame: {summarizeText(exam.content || exam.exams, 70)}</Badge>
                        ))}
                        {relatedPrescriptions.map((rx: any) => (
                          <Badge key={"rx-" + rx.id} variant="outline" className="text-[10px]">Prescricao: {summarizeText(rx.content || rx.type, 70)}</Badge>
                        ))}
                        {relatedDocuments.map((doc: any) => (
                          <Badge key={"doc-" + doc.id} variant="outline" className="text-[10px]">{repairMojibake(doc.type || "Doc")}: {summarizeText(doc.name || doc.description, 70)}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {ev.icdCode && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">CID-10</p>
                      <Badge variant="outline" className="text-xs">{ev.icdCode}{ev.icdDescription ? ` — ${ev.icdDescription}` : ""}</Badge>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SecretariaTab({ patientId }: { patientId: number }) {
  const { data: evolutions, isLoading } = trpc.clinicalEvolution.getByPatient.useQuery({ patientId });
  const records = useMemo(
    () => (evolutions ?? []).filter((record: any) => isSecretaryOnlyEvolutionRecord(record)),
    [evolutions],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center">
          <UserCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum registro administrativo da secretaria foi encontrado para este paciente.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record: any) => {
        const baseDate = record.startedAt || record.createdAt;
        const date = baseDate
          ? new Date(baseDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
          : "—";

        return (
          <Card key={`secretaria-${record.id}`} className="border-border/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-[#C9A55B]" />
                  <span className="text-sm font-semibold text-foreground">Registro da secret&aacute;ria</span>
                  {record.status && <Badge variant="outline" className="text-[10px]">{record.status}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>

              <p className="text-sm whitespace-pre-wrap text-foreground">
                {record.secretaryNotes?.trim() || "Sem conteúdo registrado."}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AnamneseTab({ patientId }: { patientId: number }) {
  const { data: templates } = trpc.medicalRecords.listTemplates.useQuery();
  const { data: savedAnamneses, refetch: refetchAnamneses } = trpc.anamneses.listByPatient.useQuery({ patientId });
  const createAnamnesisMutation = trpc.anamneses.create.useMutation({
    onSuccess: () => {
      toast.success("Anamnese salva com sucesso.");
      void refetchAnamneses();
    },
    onError: (error: any) => toast.error(error?.message || "Não foi possível salvar a anamnese."),
  });
  const createAnamnesisLinkMutation = trpc.anamnesisShare.createLink.useMutation();

  const customTemplates = useMemo<AnamnesisTemplate[]>(() => {
    return (templates ?? [])
      .map((template: any) => ({
        id: `custom-${template.id}`,
        name: template.name,
        description: template.description || template.specialty || "Modelo personalizado",
        questions: mapTemplateSectionsToQuestions(template),
      }))
      .filter((template) => template.questions.length > 0);
  }, [templates]);

  const availableTemplates = useMemo(() => {
    const names = new Set<string>();
    const combined = [...SYSTEM_ANAMNESIS_TEMPLATES, ...customTemplates].filter((template) => {
      const normalized = template.name.trim().toLowerCase();
      if (names.has(normalized)) return false;
      names.add(normalized);
      return true;
    });
    return combined;
  }, [customTemplates]);

  const defaultTemplate = availableTemplates[0] ?? SYSTEM_ANAMNESIS_TEMPLATES[0];
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplate?.id || "anamnesis-feminina-padrao");
  const [anamnesisTitle, setAnamnesisTitle] = useState(defaultTemplate?.name || "Anamnese feminina padrão");
  const [anamnesisDate, setAnamnesisDate] = useState(new Date().toISOString().slice(0, 10));
  const [questions, setQuestions] = useState<AnamnesisQuestion[]>(cloneAnamnesisQuestions(defaultTemplate?.questions || SYSTEM_ANAMNESIS_TEMPLATES[0].questions));
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);

  useEffect(() => {
    const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) || defaultTemplate;
    if (!selectedTemplate) return;
    setAnamnesisTitle(selectedTemplate.name);
    setQuestions(cloneAnamnesisQuestions(selectedTemplate.questions));
  }, [selectedTemplateId, availableTemplates]);

  const resetNewAnamnesis = (templateId?: string) => {
    const selectedTemplate = availableTemplates.find((template) => template.id === (templateId || defaultTemplate?.id)) || defaultTemplate;
    if (!selectedTemplate) return;
    setSelectedTemplateId(selectedTemplate.id);
    setAnamnesisTitle(selectedTemplate.name);
    setAnamnesisDate(new Date().toISOString().slice(0, 10));
    setQuestions(cloneAnamnesisQuestions(selectedTemplate.questions));
    toast.success("Nova anamnese preparada.");
  };

  const updateQuestion = (id: string, updates: Partial<AnamnesisQuestion>) => {
    setQuestions((current) => current.map((question) => (question.id === id ? { ...question, ...updates } : question)));
  };

  const saveAnamnesis = async () => {
    if (!anamnesisTitle.trim()) {
      toast.error("Informe o nome da anamnese.");
      return;
    }

    const validationError = validateAnamnesisQuestions(questions);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId);
    await createAnamnesisMutation.mutateAsync({
      patientId,
      title: anamnesisTitle.trim(),
      templateName: selectedTemplate?.name || anamnesisTitle.trim(),
      anamnesisDate,
      questions: serializeAnamnesisQuestions(questions),
      answers: buildAnamnesisAnswersMap(questions),
    });
  };

  const generateLink = async () => {
    if (!anamnesisTitle.trim()) {
      toast.error("Informe o nome da anamnese antes de gerar o link.");
      return;
    }

    try {
      const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId);
      const result = await createAnamnesisLinkMutation.mutateAsync({
        patientId,
        title: anamnesisTitle.trim(),
        templateName: selectedTemplate?.name || anamnesisTitle.trim(),
        anamnesisDate,
        expiresInDays: 14,
        questions: serializeAnamnesisQuestions(questions),
      });

      await navigator.clipboard.writeText(result.shareUrl);
      toast.success("Link curto copiado. Ao enviar pelo WhatsApp, a mensagem mostrará a identidade visual da clínica.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o link da anamnese.");
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-[#C9A55B]/25 bg-gradient-to-br from-[#C9A55B]/10 via-transparent to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nova anamnese</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Nome da anamnese</Label>
              <Input value={anamnesisTitle} onChange={(event) => setAnamnesisTitle(event.target.value)} placeholder="Ex: Anamnese feminina padrão" />
            </div>
            <div className="space-y-2">
              <Label>Data da anamnese</Label>
              <Input type="date" value={anamnesisDate} onChange={(event) => setAnamnesisDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Modelo disponível</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {availableTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => resetNewAnamnesis()} className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10">
              <Plus className="h-3.5 w-3.5 mr-1.5" />Gerar nova anamnese
            </Button>
            <Button size="sm" variant="outline" onClick={generateLink} disabled={createAnamnesisLinkMutation.isPending} className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10">
              {createAnamnesisLinkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}Gerar link para o paciente
            </Button>
            <Button size="sm" onClick={saveAnamnesis} disabled={createAnamnesisMutation.isPending} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33] text-white">
              {createAnamnesisMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Salvar anamnese
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {questions.map((question) => (
          <Card key={question.id} className="border-border/50">
            <CardContent className="space-y-2.5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">{repairMojibake(question.text)}</Label>
                </div>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Obrigatoria</Badge>
              </div>

              {question.type === "text" ? (
                <Textarea
                  value={question.answer || ""}
                  onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}
                  rows={2}
                  className="resize-none text-sm"
                  placeholder={question.placeholder || "Digite aqui..."}
                />
              ) : null}

              {question.type === "radio" ? (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const active = (question.answer || "") === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateQuestion(question.id, { answer: option, followUpAnswer: active ? question.followUpAnswer : "" })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${active ? "bg-amber-600 text-white border-amber-600" : "bg-muted/50 text-foreground border-border hover:border-amber-500/50"}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {question.type === "checkbox" ? (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => {
                    const selected = (question.answer || "").split(";").includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          const current = (question.answer || "").split(";").filter(Boolean);
                          const next = selected ? current.filter((item) => item !== option) : [...current, option];
                          updateQuestion(question.id, { answer: next.join(";") });
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${selected ? "bg-amber-600 text-white border-amber-600" : "bg-muted/50 text-foreground border-border hover:border-amber-500/50"}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {question.type === "select" ? (
                <Select value={question.answer || ""} onValueChange={(value) => updateQuestion(question.id, { answer: value })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{question.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                </Select>
              ) : null}

              {shouldShowFollowUp(question) && question.followUp ? (
                <div className="rounded-lg border border-[#C9A55B]/20 bg-amber-500/5 p-2.5">
                  <Label className="text-xs font-medium text-[#8A6526]">{question.followUp.prompt}</Label>
                  <Input
                    className="mt-2"
                    value={question.followUpAnswer || ""}
                    onChange={(event) => updateQuestion(question.id, { followUpAnswer: event.target.value })}
                    placeholder={question.followUp.placeholder || "Descreva aqui"}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Anamneses já registradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!savedAnamneses?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma anamnese registrada neste prontuário ainda.</p>
          ) : savedAnamneses.map((record: any) => {
            const isOpen = expandedRecordId === record.id;
            const dateLabel = new Date(record.anamnesisDate || record.submittedAt || record.createdAt).toLocaleString("pt-BR");
            return (
              <div key={record.id} className="rounded-xl border border-border/50 p-3">
                <button type="button" onClick={() => setExpandedRecordId(isOpen ? null : record.id)} className="w-full text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{repairMojibake(record.title) || "Anamnese sem nome"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{dateLabel}{record.templateName ? ` · Modelo: ${repairMojibake(record.templateName)}` : ""}</p>
                    </div>
                    <Badge variant="outline">{record.source === "share" ? "Paciente" : "Clínica"}</Badge>
                  </div>
                </button>
                {isOpen ? (
                  <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
                    {record.visibilityRestricted ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                        Respostas disponíveis apenas para a equipe clínica autorizada. Este perfil pode acompanhar apenas se a anamnese já foi preenchida.
                      </div>
                    ) : (
                      (record.questions || []).map((question: any, index: number) => {
                        const answer = record.answers?.[question.text] || "Não informado";
                        const followUpAnswer = record.answers?.[`${question.text}::__complemento`] || "";
                        return (
                          <div key={`${record.id}-${index}`} className="rounded-lg bg-muted/30 p-3">
                            <p className="text-sm font-medium">{repairMojibake(question.text)}</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{repairMojibake(answer)}</p>
                            {followUpAnswer ? <p className="mt-2 text-sm"><span className="font-medium">Complemento:</span> {repairMojibake(followUpAnswer)}</p> : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function TabHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function DocumentUploadPanel({
  patientId,
  defaultFolderLabel,
  allowedTypes,
  title = "Inserir arquivo",
  description = "Envie arquivos PDF, imagens ou documentos para este prontuário.",
}: {
  patientId: number;
  defaultFolderLabel?: string;
  allowedTypes?: string[];
  title?: string;
  description?: string;
}) {
  const clinicQuery = trpc.clinic.get.useQuery();
  const utils = trpc.useUtils();
  const [descriptionValue, setDescriptionValue] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const availableTypeOptions = DOCUMENT_TYPE_OPTIONS.filter((option) =>
    !allowedTypes || allowedTypes.includes(option.value),
  );
  const [selectedType, setSelectedType] = useState(availableTypeOptions[0]?.value ?? "outro");
  const [selectedFolder, setSelectedFolder] = useState(defaultFolderLabel ?? DEFAULT_ATTACHMENT_FOLDERS[0]);

  const availableFolders = useMemo(() => {
    const configured = Array.isArray(clinicQuery.data?.patientAttachmentFolders)
      ? clinicQuery.data.patientAttachmentFolders
      : DEFAULT_ATTACHMENT_FOLDERS;
    const merged = [...DEFAULT_ATTACHMENT_FOLDERS, ...configured, defaultFolderLabel || ""]
      .map((item) => repairMojibake(item).trim())
      .filter(Boolean);
    return Array.from(new Set(merged));
  }, [clinicQuery.data?.patientAttachmentFolders, defaultFolderLabel]);

  useEffect(() => {
    if (!availableFolders.length) return;
    if (!selectedFolder || !availableFolders.includes(selectedFolder)) {
      setSelectedFolder(defaultFolderLabel && availableFolders.includes(defaultFolderLabel) ? defaultFolderLabel : availableFolders[0]);
    }
  }, [availableFolders, defaultFolderLabel, selectedFolder]);

  const uploadMutation = trpc.medicalRecords.uploadDocument.useMutation({
    onSuccess: async () => {
      toast.success("Arquivo anexado com sucesso.");
      setDescriptionValue("");
      setInputKey((current) => current + 1);
      await utils.medicalRecords.getDocuments.invalidate({ patientId });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível anexar o arquivo.");
    },
  });

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    try {
      for (const file of files) {
        const base64 = await fileToBase64(file);
        await uploadMutation.mutateAsync({
          patientId,
          type: selectedType,
          folderLabel: selectedFolder || defaultFolderLabel,
          description: descriptionValue || undefined,
          name: file.name,
          originalFileName: file.name,
          base64,
          mimeType: file.type || "application/octet-stream",
        });
      }
    } finally {
      event.currentTarget.value = "";
    }
  };

  return (
    <Card className="border-border/50">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Pasta</Label>
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a pasta" />
              </SelectTrigger>
              <SelectContent>
                {availableFolders.map((folder) => (
                  <SelectItem key={folder} value={folder}>{folder}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo do arquivo</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o tipo" />
              </SelectTrigger>
              <SelectContent>
                {availableTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={descriptionValue}
              onChange={(event) => setDescriptionValue(event.target.value)}
              placeholder="Ex.: RG frente, laudo pós-operatório"
            />
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-[#C9A55B]/30 bg-[#C9A55B]/5 p-3">
          <Label htmlFor={`upload-document-${patientId}-${inputKey}`} className="mb-2 block text-xs font-medium text-muted-foreground">
            Selecione um ou mais arquivos
          </Label>
          <Input
            key={inputKey}
            id={`upload-document-${patientId}-${inputKey}`}
            type="file"
            multiple
            onChange={handleFilesSelected}
            disabled={uploadMutation.isPending}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Após selecionar, o envio é feito automaticamente para a pasta escolhida.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AtestadosTab({ patientId, patientName, patientPhone }: { patientId: number; patientName: string; patientPhone?: string | null }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [documentType, setDocumentType] = useState<ClinicalDocumentType>("atestado");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [activeDocumentId, setActiveDocumentId] = useState<number | null>(null);
  const [loadingDocumentId, setLoadingDocumentId] = useState<number | null>(null);

  const { data: documents, isLoading } = trpc.medicalRecords.getDocuments.useQuery({ patientId });
  const { data: templates, isLoading: templatesLoading } = trpc.templates.list.useQuery(undefined, {
    enabled: showTemplateDialog || showEditor,
  });

  const uploadTextDocumentMutation = trpc.medicalRecords.uploadDocument.useMutation({
    onSuccess: async (savedDocument: any) => {
      await utils.medicalRecords.getDocuments.invalidate({ patientId });
      if (savedDocument?.id) {
        setActiveDocumentId(Number(savedDocument.id));
      }
      toast.success(activeDocumentId ? "Nova versão salva no prontuário." : "Documento salvo no prontuário.");
      setShowEditor(true);
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar o documento."),
  });

  const relevantDocuments = useMemo(
    () => ((documents as any[]) || []).filter((doc) => ["atestado", "declaracao", "laudo", "solicitacao_exames"].includes(String(doc.type || "").toLowerCase())),
    [documents],
  );

  const availableTemplates = useMemo(
    () => ((templates as any[]) || []).filter(isClinicalDocumentTemplate),
    [templates],
  );

  const openBlankEditor = (nextType: ClinicalDocumentType = "atestado") => {
    setDocumentType(nextType);
    setDocumentTitle(`${CLINICAL_DOCUMENT_TYPE_LABELS[nextType]} - ${patientName}`);
    setDocumentContent(buildDefaultClinicalDocumentHtml(nextType, patientName));
    setActiveDocumentId(null);
    setShowEditor(true);
  };

  const openTemplateManager = () => {
    const params = new URLSearchParams({
      group: getClinicalDocumentTemplateGroup(documentType),
      returnTo: `/prontuarios/${patientId}`,
    });
    navigate(`/templates?${params.toString()}`);
  };

  const applyTemplate = (template: any) => {
    const nextType = inferClinicalDocumentType(template);
    setDocumentType(nextType);
    setDocumentTitle(`${repairMojibake(template?.name || CLINICAL_DOCUMENT_TYPE_LABELS[nextType])} - ${patientName}`);
    setDocumentContent(templateToClinicalDocumentHtml(template, patientName));
    setActiveDocumentId(null);
    setShowTemplateDialog(false);
    setShowEditor(true);
  };

  const resolveDocumentContent = async (document: any) => {
    if (String(document?.content ?? "").trim()) return String(document.content);
    if (!isTextualClinicalDocument(document) || !document?.fileUrl) return "";
    const response = await fetch(document.fileUrl);
    if (!response.ok) throw new Error("Não foi possível abrir o documento salvo.");
    const text = await response.text();
    return /<\/?[a-z][\s\S]*>/i.test(text) || String(document?.mimeType ?? "").toLowerCase().includes("html")
      ? text
      : plainTextToHtml(text);
  };

  const handleOpenSavedDocument = async (document: any) => {
    setLoadingDocumentId(Number(document.id));
    try {
      const content = await resolveDocumentContent(document);
      if (!content) {
        if (document?.fileUrl) {
          window.open(document.fileUrl, "_blank", "noopener,noreferrer");
          return;
        }
        toast.error("Este documento não possui um conteúdo textual para abrir no editor.");
        return;
      }

      setDocumentType(normalizeClinicalDocumentType(document?.type));
      setDocumentTitle(repairMojibake(document?.name || document?.fileName || "Documento clínico"));
      setDocumentContent(content);
      setActiveDocumentId(Number(document.id));
      setShowEditor(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível abrir o documento.");
    } finally {
      setLoadingDocumentId(null);
    }
  };

  const handlePrintDocument = async (title = documentTitle, contentToPrint = documentContent, type = documentType) => {
    if (!formatImportedText(contentToPrint)) {
      toast.error("Digite ou carregue um documento antes de gerar o PDF.");
      return;
    }

    try {
      await generatePremiumPdf({
        filename: `${sanitizeFileName(title || CLINICAL_DOCUMENT_TYPE_LABELS[type])}.pdf`,
        title: CLINICAL_DOCUMENT_TYPE_LABELS[type],
        subtitle: `Paciente: ${patientName}`,
        content: contentToPrint,
        includeWatermark: true,
      });
    } catch {
      toast.error("Não foi possível gerar o PDF deste documento.");
    }
  };

  const handlePrintSavedDocument = async (document: any) => {
    try {
      const content = await resolveDocumentContent(document);
      if (content) {
        await handlePrintDocument(
          repairMojibake(document?.name || document?.fileName || "Documento clínico"),
          content,
          normalizeClinicalDocumentType(document?.type),
        );
        return;
      }
      if (document?.fileUrl) {
        window.open(document.fileUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("Não foi possível gerar o PDF deste documento.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o PDF deste documento.");
    }
  };

  const saveTextDocument = () => {
    const content = documentContent.trim();
    if (!formatImportedText(content)) {
      toast.error("Digite o conteúdo do documento antes de salvar.");
      return;
    }

    const fallbackTitle = `${CLINICAL_DOCUMENT_TYPE_LABELS[documentType]} - ${patientName}`;
    const title = documentTitle.trim() || fallbackTitle;

    uploadTextDocumentMutation.mutate({
      patientId,
      type: documentType,
      folderLabel: documentType === "solicitacao_exames" ? "Resultados de exames" : "Documentos clínicos",
      name: title,
      description: buildClinicalDocumentMetadata(content, documentType),
      base64: textToBase64(content),
      mimeType: "text/html;charset=utf-8",
      originalFileName: `${sanitizeFileName(title)}.html`,
    });
  };

  return (
    <div className="space-y-4">
      <TabHeader
        title="Atestados e documentos clínicos"
        description="Crie documentos em editor rico, aplique modelos por grupo e acesse o histórico salvo do prontuário."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => openBlankEditor("atestado")}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Criar novo
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowTemplateDialog(true)}>
              <ClipboardPlus className="mr-1.5 h-3.5 w-3.5" />
              Usar modelo
            </Button>
            <Button size="sm" variant="outline" onClick={openTemplateManager}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Criar modelo
            </Button>
          </>
        }
      />

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modelos de documentos clínicos</DialogTitle>
          </DialogHeader>

          {templatesLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#C9A55B]" /></div>
          ) : availableTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-6 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum modelo disponível neste momento.</p>
              <Button type="button" variant="outline" className="mt-4" onClick={openTemplateManager}>Gerenciar modelos</Button>
            </div>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {availableTemplates.map((template: any) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="w-full rounded-lg border border-border/70 bg-background p-4 text-left transition hover:border-[#C9A55B]/60 hover:bg-[#C9A55B]/5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-[#C9A55B]" />
                    <span className="text-sm font-semibold">{repairMojibake(template.name)}</span>
                    <Badge variant="outline" className="text-[10px]">{repairMojibake(template.groupLabel || template.specialty || "Modelo")}</Badge>
                  </div>
                  {template.description ? <p className="mt-2 text-xs text-muted-foreground">{repairMojibake(template.description)}</p> : null}
                </button>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowTemplateDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showEditor ? (
        <Card className="border-[#C9A55B]/20 bg-[#C9A55B]/5">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-[#C9A55B]" />Documento clínico</span>
              {activeDocumentId ? <Badge variant="outline">Documento salvo #{activeDocumentId}</Badge> : <Badge variant="secondary">Novo documento</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={documentType} onValueChange={(value) => setDocumentType(value as ClinicalDocumentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atestado">Atestado</SelectItem>
                    <SelectItem value="declaracao">Declaração</SelectItem>
                    <SelectItem value="solicitacao_exames">Solicitação de exames</SelectItem>
                    <SelectItem value="laudo">Laudo / relatório</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Ex.: Atestado de comparecimento" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conteúdo do documento</Label>
              <RichTextEditor
                value={documentContent}
                onChange={setDocumentContent}
                placeholder="Digite aqui o texto do documento..."
                minHeight="320px"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
              <span>{activeDocumentId ? "Você pode reabrir, assinar, baixar em PDF e enviar este documento pelo prontuário." : "Salve primeiro para habilitar assinatura digital e envio por WhatsApp."}</span>
              <span>{formatImportedText(documentContent).length} caracteres visíveis</span>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEditor(false)} disabled={uploadTextDocumentMutation.isPending}>Fechar</Button>
              <Button type="button" variant="outline" onClick={() => void handlePrintDocument()}>
                <Printer className="mr-2 h-4 w-4" />
                Salvar em PDF / imprimir
              </Button>
              <Button type="button" className="btn-glossy-gold" onClick={saveTextDocument} disabled={uploadTextDocumentMutation.isPending}>
                {uploadTextDocumentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {activeDocumentId ? "Salvar nova versão" : "Salvar no prontuário"}
              </Button>
              {activeDocumentId ? (
                <WhatsAppSendButton
                  documentType="atestado"
                  documentId={activeDocumentId}
                  defaultPhone={patientPhone ?? ""}
                  documentLabel={CLINICAL_DOCUMENT_TYPE_LABELS[documentType]}
                />
              ) : null}
            </div>

            {activeDocumentId && (user as any)?.cloudSignatureCpf ? (
              <SignatureCertillionButton
                documentType="atestado"
                documentId={activeDocumentId}
                documentAlias={`${documentTitle || CLINICAL_DOCUMENT_TYPE_LABELS[documentType]} — ${patientName}`}
                documentContent={documentContent}
                signerCpf={(user as any).cloudSignatureCpf}
                onSigned={() => { void utils.medicalRecords.getDocuments.invalidate({ patientId }); }}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <DocumentUploadPanel
        patientId={patientId}
        defaultFolderLabel="Documentos clínicos"
        allowedTypes={["atestado", "declaracao", "laudo", "solicitacao_exames", "outro"]}
        title="Anexar atestado, declaração, laudo ou solicitação"
        description="Use este envio para adicionar PDFs, scans ou arquivos clínicos já prontos ao prontuário."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" /></div>
      ) : relevantDocuments.length === 0 ? (
        <Card className="border-border/50"><CardContent className="py-12 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">Nenhum documento clínico registrado para este paciente.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {relevantDocuments.map((document: any) => {
            const canOpenInEditor = isTextualClinicalDocument(document);
            return (
              <Card key={document.id} className="border-border/50">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-4 w-4 text-[#C9A55B]" />
                        <span className="text-sm font-semibold">{repairMojibake(document.name || document.fileName || "Documento clínico")}</span>
                        <Badge variant="outline" className="text-[10px]">{CLINICAL_DOCUMENT_TYPE_LABELS[normalizeClinicalDocumentType(document.type)]}</Badge>
                        {document.signatureValidationCode ? <Badge variant="secondary" className="text-[10px]">Assinado</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{document.createdAt ? new Date(document.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem data"}</p>
                      {document.description ? <p className="text-sm text-muted-foreground">{formatImportedText(document.description)}</p> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canOpenInEditor ? (
                      <Button size="sm" variant="outline" onClick={() => void handleOpenSavedDocument(document)} disabled={loadingDocumentId === Number(document.id)}>
                        {loadingDocumentId === Number(document.id) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Pencil className="mr-1.5 h-3.5 w-3.5" />}
                        Abrir no editor
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => void handlePrintSavedDocument(document)}>
                      <Printer className="mr-1.5 h-3.5 w-3.5" />
                      Salvar em PDF / imprimir
                    </Button>
                    {document.fileUrl ? (
                      <a href={document.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline"><FileDown className="mr-1.5 h-3.5 w-3.5" />Abrir arquivo</Button>
                      </a>
                    ) : null}
                    <WhatsAppSendButton
                      documentType="atestado"
                      documentId={Number(document.id)}
                      defaultPhone={patientPhone ?? ""}
                      documentLabel={CLINICAL_DOCUMENT_TYPE_LABELS[normalizeClinicalDocumentType(document.type)]}
                    />
                    {canOpenInEditor && (user as any)?.cloudSignatureCpf ? (
                      <SignatureCertillionButton
                        documentType="atestado"
                        documentId={Number(document.id)}
                        documentAlias={`${repairMojibake(document.name || document.fileName || "Documento clínico")} — ${patientName}`}
                        documentContent={String(document.content || "")}
                        signerCpf={(user as any).cloudSignatureCpf}
                        onSigned={() => { void utils.medicalRecords.getDocuments.invalidate({ patientId }); }}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   PrescricoesTab — lists prescriptions for patient
   ───────────────────────────────────────────────── */
function PrescricoesTab({ patientId, patientName: _pn }: { patientId: number; patientName: string }) {
  const [, navigate] = useLocation();
  const { data: prescriptions, isLoading } = trpc.prescriptions.getByPatient.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabHeader
        title="Prescrições do paciente"
        description="Veja o histórico completo e abra a central de prescrições já com este paciente selecionado para criar novas receitas ou carregar modelos."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => navigate(`/prescricoes?patientId=${patientId}&create=1`)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova prescrição
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/prescricoes?patientId=${patientId}`)}>
              <ClipboardPlus className="mr-1.5 h-3.5 w-3.5" />
              Modelos e histórico
            </Button>
          </>
        }
      />

      {!prescriptions || prescriptions.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Stethoscope className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma prescrição registrada para este paciente.</p>
          </CardContent>
        </Card>
      ) : prescriptions.map((rx: any) => (
        <Card key={rx.id} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-[#C9A55B]" />
                <span className="text-sm font-semibold">Prescrição #{rx.id}</span>
                <Badge variant="outline" className="text-[10px]">{rx.type || "simples"}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {rx.createdAt ? new Date(rx.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
              </span>
            </div>
            <div
              className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: rx.content || "<p>Sem conteúdo registrado.</p>" }}
            />
            {rx.observations && <p className="mt-2 text-xs italic text-muted-foreground">{rx.observations}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   OrcamentoTab — links to budget page with patient context
   ───────────────────────────────────────────────── */
function OrcamentoTab({ patientId, patientName: _pn }: { patientId: number; patientName: string }) {
  const [, navigate] = useLocation();
  const { data: budgets, isLoading } = trpc.budgets.getByPatient.useQuery({ patientId });

  return (
    <div className="space-y-4">
      <TabHeader
        title="Orçamentos do paciente"
        description="Acompanhe o histórico, receba do paciente na central financeira do orçamento e siga para recibo e NFS-e quando o pagamento for confirmado."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => navigate(`/orcamentos?patientId=${patientId}&create=1`)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Criar orçamento
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/orcamentos?patientId=${patientId}`)}>
              <Receipt className="mr-1.5 h-3.5 w-3.5" />
              Recebimento, recibo e NFS-e
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
        </div>
      ) : !budgets || budgets.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum orçamento registrado para este paciente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget: any) => (
            <Card key={budget.id} className="border-border/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-[#C9A55B]" />
                    <span className="text-sm font-semibold">Orçamento #{budget.id}</span>
                    <Badge variant="outline" className="text-[10px]">{repairMojibake(budget.status || "rascunho")}</Badge>
                    {budget.latestNfse?.status ? (
                      <Badge variant="secondary" className="text-[10px]">
                        NFS-e: {repairMojibake(budget.latestNfse.status)}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {budget.date ? new Date(`${budget.date}T12:00:00`).toLocaleDateString("pt-BR") : "Sem data"}
                  </span>
                </div>

                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  <p><span className="font-medium text-foreground">Título:</span> {budget.title || "Plano personalizado"}</p>
                  <p><span className="font-medium text-foreground">Valor:</span> {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(budget.totalInCents || 0) / 100)}</p>
                </div>

                {Array.isArray(budget.items) && budget.items.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {budget.items.slice(0, 5).map((item: any, index: number) => (
                      <Badge key={`${budget.id}-${index}`} variant="outline">{item.procedureName || item.areaName || "Procedimento"}</Badge>
                    ))}
                  </div>
                ) : null}

                {budget.notes ? (
                  <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {repairMojibake(budget.notes)}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/orcamentos?patientId=${patientId}`)}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Abrir orçamento
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/orcamentos?patientId=${patientId}`)}>
                    <Receipt className="mr-1.5 h-3.5 w-3.5" />
                    Receber / emitir nota
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   ImagensTab — patient photos
   ───────────────────────────────────────────────── */
function ImagensTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: photos, isLoading } = trpc.photos.getByPatient.useQuery({ patientId });
  const { data: folders = [] } = trpc.photoGallery.getFolders.useQuery({ patientId });
  const { data: uploadLinks = [] } = trpc.photoGallery.listUploadLinks.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabHeader
        title="Imagens e vídeos do paciente"
        description="Abra a galeria principal já filtrada para este paciente, envie novas mídias e organize tudo por data, categoria ou pasta clínica."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => navigate(`/fotos?patientId=${patientId}`)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Anexar fotos e vídeos
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/fotos?patientId=${patientId}`)}>
              <Layers3 className="mr-1.5 h-3.5 w-3.5" />
              Organizar por datas e tipo
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Mídias registradas</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{photos?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pastas clínicas</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{folders.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Links ativos para envio</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{uploadLinks.length}</p>
          </CardContent>
        </Card>
      </div>

      {!photos || photos.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma imagem registrada para este paciente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.slice(0, 8).map((photo: any) => (
            <Card key={photo.id} className="border-border/50 overflow-hidden">
              <div className="aspect-square bg-muted/30 flex items-center justify-center">
                {(photo.photoUrl || photo.url) ? (
                  photo.mediaType === "video" ? (
                    <video src={photo.photoUrl || photo.url} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={photo.photoUrl || photo.url} alt={photo.description || "Imagem"} className="w-full h-full object-cover" />
                  )
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                )}
              </div>
              <CardContent className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {photo.mediaType === "video" ? <Video className="mr-1 h-3 w-3" /> : null}
                    {repairMojibake(photo.category || "mídia")}
                  </Badge>
                </div>
                {photo.description ? <p className="text-xs text-muted-foreground truncate">{repairMojibake(photo.description)}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   AnexosTab — patient attachments / documents
   ───────────────────────────────────────────────── */
function AnexosTab({ patientId }: { patientId: number }) {
  const { data: clinicSettings } = trpc.clinic.get.useQuery();
  const { data: documents, isLoading } = trpc.medicalRecords.getDocuments.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  const documentsList = (documents as any[]) || [];
  const configuredFolders = Array.isArray(clinicSettings?.patientAttachmentFolders) && clinicSettings.patientAttachmentFolders.length > 0
    ? clinicSettings.patientAttachmentFolders
    : DEFAULT_ATTACHMENT_FOLDERS;
  const grouped = documentsList.reduce<Record<string, any[]>>((acc, document) => {
    const key = getAttachmentFolderLabel(document);
    if (!acc[key]) acc[key] = [];
    acc[key].push(document);
    return acc;
  }, {});
  const visibleFolders = Array.from(new Set([...DEFAULT_ATTACHMENT_FOLDERS, ...configuredFolders, ...Object.keys(grouped)]));

  return (
    <div className="space-y-4">
      <TabHeader
        title="Anexos gerais do paciente"
        description="Organize documentos em pastas padrão da clínica. Você pode criar novas pastas em Configurações e elas aparecerão aqui para todos os pacientes."
        actions={
          <Button size="sm" variant="outline" onClick={() => (window.location.href = "/configuracoes")}>
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Configurar pastas
          </Button>
        }
      />

      <DocumentUploadPanel
        patientId={patientId}
        defaultFolderLabel={visibleFolders[0] || DEFAULT_ATTACHMENT_FOLDERS[0]}
        allowedTypes={["rg", "cpf", "convenio", "exame_pdf", "laudo", "outro"]}
        title="Enviar documentos para o prontuário"
        description="Selecione a pasta correta e o tipo do documento. As pastas padrão ficam disponíveis para todos os pacientes."
      />

      {documentsList.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Paperclip className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum anexo registrado para este paciente.</p>
          </CardContent>
        </Card>
      ) : null}

      {visibleFolders.map((category) => (
        <Card key={category} className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#C9A55B]" />
              {category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(grouped[category] || []).length === 0 ? (
              <p className="text-xs italic text-muted-foreground">Nenhum arquivo nesta pasta ainda.</p>
            ) : (
              (grouped[category] || []).map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name || doc.fileName || "Documento"}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {doc.createdAt && (
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                        <Badge variant="outline" className="text-[10px]">{repairMojibake(doc.type || "anexo")}</Badge>
                      </div>
                      {doc.description ? <p className="text-xs text-muted-foreground truncate">{formatImportedText(doc.description)}</p> : null}
                    </div>
                  </div>
                  {doc.fileUrl ? (
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   ContratosTab — lista contratos e termos assinados
   (inclui os importados do Prontuario Verde via sourceSystem)
   ───────────────────────────────────────────────── */
function ContratosTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: documents, isLoading } = trpc.medicalRecords.getDocuments.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  const contratosTermos = ((documents as any[]) || []).filter((d) =>
    d.type === "contrato" || d.type === "termo"
  );

  const contratos = contratosTermos.filter((d) => d.type === "contrato");
  const termos = contratosTermos.filter((d) => d.type === "termo");

  const renderList = (items: any[], emptyLabel: string) => (
    items.length === 0 ? (
      <p className="text-xs text-muted-foreground italic px-1">{emptyLabel}</p>
    ) : (
      <div className="space-y-2">
        {items.map((doc: any) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ScrollText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {doc.name || doc.fileName || "Documento"}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {doc.createdAt && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  {doc.sourceSystem === "prontuario_verde" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Importado · Verde</Badge>
                  )}
                  {doc.sourceSystem === "onedoctor" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">Importado · OnDoctor</Badge>
                  )}
                  {doc.description && (
                    <span className="text-[10px] text-muted-foreground truncate">{formatImportedText(doc.description)}</span>
                  )}
                </div>
              </div>
            </div>
            {(doc.url || doc.fileUrl) && (
              <a href={doc.url || doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <FileDown className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-4">
      <TabHeader
        title="Contratos e termos"
        description="Aqui aparecem os contratos importados do Prontuário Verde e também novos arquivos que forem anexados para este paciente."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => navigate("/assinaturas")}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Abrir assinaturas
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/assinaturas")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Novo contrato
            </Button>
          </>
        }
      />

      <DocumentUploadPanel
        patientId={patientId}
        defaultFolderLabel="Contratos e termos"
        allowedTypes={["contrato", "termo"]}
        title="Anexar contrato ou termo assinado"
        description="Use este envio para acrescentar contratos, consentimentos e termos que já estejam prontos em PDF ou imagem."
      />

      {contratosTermos.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <ScrollText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Nenhum contrato ou termo registrado para este paciente.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-[#C9A55B]" />
            Contratos <span className="text-xs text-muted-foreground font-normal">({contratos.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderList(contratos, "Nenhum contrato registrado.")}
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-[#C9A55B]" />
            Termos <span className="text-xs text-muted-foreground font-normal">({termos.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderList(termos, "Nenhum termo registrado.")}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   ExamesTab — exam requests for patient
   ───────────────────────────────────────────────── */
function ExamesTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: exams, isLoading } = trpc.examRequests.getByPatient.useQuery({ patientId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TabHeader
        title="Solicitações de exames"
        description="Consulte o histórico completo e abra a central de exames com este paciente já selecionado para criar novas solicitações ou carregar modelos editáveis."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => navigate(`/exames?patientId=${patientId}&create=1`)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova solicitação
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/exames?patientId=${patientId}`)}>
              <ClipboardPlus className="mr-1.5 h-3.5 w-3.5" />
              Modelos de exames
            </Button>
          </>
        }
      />

      {!exams || exams.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <FlaskConical className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma solicitação de exame registrada para este paciente.</p>
          </CardContent>
        </Card>
      ) : exams.map((exam: any) => (
        <Card key={exam.id} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-[#C9A55B]" />
                <span className="text-sm font-semibold">Solicitação #{exam.id}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {exam.createdAt ? new Date(exam.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
              </span>
            </div>
            {exam.content && (
              <div
                className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: exam.content }}
              />
            )}
            {exam.exams && Array.isArray(exam.exams) && exam.exams.length > 0 && (
              <div className="mt-2 space-y-1">
                {exam.exams.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A55B]" />
                    <span>{e.name || String(e)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProcedimentosTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: budgets } = trpc.budgets.getByPatient.useQuery({ patientId });

  const procedureItems = useMemo(() => {
    return (budgets ?? []).flatMap((budget: any) =>
      Array.isArray(budget.items)
        ? budget.items.map((item: any) => ({
            budgetId: budget.id,
            status: budget.status,
            date: budget.date,
            procedureName: item.procedureName || "Procedimento",
            areaName: item.areaName || "",
            quantity: item.quantity || 1,
          }))
        : [],
    );
  }, [budgets]);

  return (
    <div className="space-y-4">
      <TabHeader
        title="Procedimentos e planos terapêuticos"
        description="Os procedimentos planejados nos orçamentos do paciente aparecem aqui para facilitar a visão do tratamento."
        actions={
          <Button size="sm" variant="outline" onClick={() => navigate(`/orcamentos?patientId=${patientId}&create=1`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Planejar procedimento
          </Button>
        }
      />

      {procedureItems.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum procedimento planejado encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {procedureItems.map((item: any, index: number) => (
            <Card key={`${item.budgetId}-${item.procedureName}-${index}`} className="border-border/50">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Package className="h-4 w-4 text-[#C9A55B]" />
                    <span className="text-sm font-semibold">{item.procedureName}</span>
                    {item.areaName ? <Badge variant="outline" className="text-[10px]">{item.areaName}</Badge> : null}
                    <Badge variant="secondary" className="text-[10px]">Qtd. {item.quantity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Orçamento #{item.budgetId} · {item.date ? new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR") : "Sem data"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{repairMojibake(item.status || "rascunho")}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendamentosTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: appointments, isLoading } = trpc.appointments.getByPatient.useQuery({ patientId });

  return (
    <div className="space-y-4">
      <TabHeader
        title="Agendamentos do paciente"
        description="Visualize consultas anteriores e futuras deste paciente, com horário, profissional e observações."
        actions={
          <Button size="sm" variant="outline" onClick={() => navigate("/agenda")}>
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Abrir agenda
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
        </div>
      ) : !appointments || appointments.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado para este paciente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment: any) => (
            <Card key={appointment.id} className="border-border/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#C9A55B]" />
                    <span className="text-sm font-semibold">
                      {new Date(appointment.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{repairMojibake(appointment.status || "agendada")}</Badge>
                  </div>
                  {appointment.room ? <Badge variant="secondary" className="text-[10px]">{repairMojibake(appointment.room)}</Badge> : null}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  <p><span className="font-medium text-foreground">Tipo:</span> {repairMojibake(appointment.type || "Consulta")}</p>
                  <p><span className="font-medium text-foreground">Profissional:</span> {repairMojibake(appointment.doctorName || "Não informado")}</p>
                </div>
                {appointment.notes ? (
                  <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {formatImportedText(appointment.notes)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function GaleriaTab({ patientId }: { patientId: number }) {
  const [, navigate] = useLocation();
  const { data: photos = [] } = trpc.photos.getByPatient.useQuery({ patientId });
  const { data: folders = [] } = trpc.photoGallery.getFolders.useQuery({ patientId });

  return (
    <div className="space-y-4">
      <TabHeader
        title="Galeria comparativa do paciente"
        description="Abra a galeria principal para comparar até quatro fotos ou vídeos lado a lado, usar filtros de pasta e enviar links seguros."
        actions={
          <Button size="sm" variant="outline" onClick={() => navigate(`/fotos?patientId=${patientId}`)}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Abrir galeria principal
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Mídias disponíveis</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{photos.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pastas temáticas</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{folders.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Comparação</p>
            <p className="mt-2 text-sm text-muted-foreground">A galeria principal permite comparar até 4 mídias lado a lado.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="py-10 text-center">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Use o botão acima para abrir a galeria completa do sistema já focada neste paciente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProntuarioDetalhe() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isReceptionist = user?.role === "recepcionista" || user?.role === "secretaria";
  const validTabs = useMemo(
    () =>
      isReceptionist
        ? ["historico", "evolucao"]
        : [
            "historico",
            "anamnese",
            "evolucao",
            "secretaria",
            "atestados",
            "contratos",
            "prescricoes",
            "orcamentos",
            "imagens",
            "galeria",
            "anexos",
            "exames",
            "procedimentos",
            "agendamentos",
          ],
    [isReceptionist],
  );
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "historico";
    const hashTab = window.location.hash.replace("#", "");
    return validTabs.includes(hashTab) ? hashTab : "historico";
  });

  const { data: patient, isLoading, refetch: refetchPatient } = trpc.patients.getById.useQuery({ id: patientId });
  const { data: evolutionIndex } = trpc.clinicalEvolution.getByPatient.useQuery({ patientId }, { enabled: !isReceptionist });
  const [editPatientOpen, setEditPatientOpen] = useState(false);
  const secretaryRecords = useMemo(
    () => (evolutionIndex ?? []).filter((record: any) => isSecretaryOnlyEvolutionRecord(record)),
    [evolutionIndex],
  );
  const latestSecretaryRecord = secretaryRecords[0] ?? null;

  useEffect(() => {
    const syncTabFromHash = () => {
      const hashTab = window.location.hash.replace("#", "");
      if (validTabs.includes(hashTab)) {
        setActiveTab(hashTab);
      }
    };

    window.addEventListener("hashchange", syncTabFromHash);
    syncTabFromHash();
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, [validTabs]);

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" /></div>;
  if (!patient) return <div className="text-center py-16 text-muted-foreground">Paciente não encontrado.</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/prontuarios")}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{patient.fullName}</h1>
            <Badge variant="outline" className="text-[10px] shrink-0">PEP · CFM 1821/2007</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {patient.cpf && `CPF: ${patient.cpf}`}
            {patient.birthDate && ` | Nasc: ${new Date(patient.birthDate).toLocaleDateString("pt-BR")}`}
            {patient.phone && ` | Tel: ${patient.phone}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditPatientOpen(true)} title="Editar cadastro do paciente">
          <Pencil className="h-4 w-4 mr-1" />
          Editar cadastro
        </Button>
        {!isReceptionist && <ExportProntuarioButton patientId={patientId} patientName={patient.fullName} />}
      </div>

      <PatientEditDialog
        patientId={editPatientOpen ? patientId : null}
        onClose={() => setEditPatientOpen(false)}
        onSaved={() => refetchPatient()}
        onDeleted={() => setLocation("/prontuarios")}
      />

      {/* Allergy Alert */}
      {patient.allergies && <AllergyAlert allergies={patient.allergies} patientName={patient.fullName} variant="banner" />}

      {/* LGPD notice */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <ShieldCheck className="h-3.5 w-3.5 text-[#C9A55B] shrink-0" />
        <p className="text-[10px] text-[#C9A55B]">Prontuário protegido pela LGPD. Todos os acessos são registrados.</p>
      </div>

      {!isReceptionist && latestSecretaryRecord && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/40 bg-amber-50/70 p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900">Há registros da secretaria neste prontuário.</p>
            <p className="text-xs text-amber-800">
              Último registro em{" "}
              {new Date(latestSecretaryRecord.startedAt || latestSecretaryRecord.createdAt).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
              . Clique para visualizar em aba separada.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-amber-400/50 text-amber-900 hover:bg-amber-100"
            onClick={() => {
              setActiveTab("secretaria");
              if (typeof window !== "undefined") {
                window.history.replaceState(null, "", `${window.location.pathname}#secretaria`);
              }
            }}
          >
            Ver registros da secret&aacute;ria
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `${window.location.pathname}#${value}`);
          }
        }}
        className="w-full"
      >
        <TabsList className="w-full justify-start flex-wrap bg-muted/50 h-auto p-1 gap-0.5">
          <TabsTrigger value="historico" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <History className="h-3.5 w-3.5" />Histórico
          </TabsTrigger>
          <TabsTrigger value="evolucao" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Activity className="h-3.5 w-3.5" />Evolução
          </TabsTrigger>
          {!isReceptionist && (
            <>
              <TabsTrigger value="anamnese" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <ClipboardList className="h-3.5 w-3.5" />Anamnese
              </TabsTrigger>
              <TabsTrigger value="secretaria" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <UserCheck className="h-3.5 w-3.5" />Secret&aacute;ria
              </TabsTrigger>
              <TabsTrigger value="atestados" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <FileText className="h-3.5 w-3.5" />Atestados / Docs
              </TabsTrigger>
              <TabsTrigger value="contratos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <ScrollText className="h-3.5 w-3.5" />Contratos / Termos
              </TabsTrigger>
              <TabsTrigger value="prescricoes" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <Stethoscope className="h-3.5 w-3.5" />Prescrições
              </TabsTrigger>
              <TabsTrigger value="orcamentos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <FileText className="h-3.5 w-3.5" />Orçamento
              </TabsTrigger>
              <TabsTrigger value="imagens" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <ImageIcon className="h-3.5 w-3.5" />Imagens
              </TabsTrigger>
              <TabsTrigger value="galeria" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <Layers3 className="h-3.5 w-3.5" />Galeria
              </TabsTrigger>
              <TabsTrigger value="anexos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <Paperclip className="h-3.5 w-3.5" />Anexos
              </TabsTrigger>
              <TabsTrigger value="exames" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <FlaskConical className="h-3.5 w-3.5" />Exames
              </TabsTrigger>
              <TabsTrigger value="procedimentos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <Package className="h-3.5 w-3.5" />Procedimentos
              </TabsTrigger>
              <TabsTrigger value="agendamentos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
                <Calendar className="h-3.5 w-3.5" />Agendamentos
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="historico" className="mt-4"><HistoricoTab patientId={patientId} /></TabsContent>
        <TabsContent value="evolucao" className="mt-4"><EvolucaoClinicaWorkspace patientId={patientId} patientName={patient.fullName} /></TabsContent>
        {!isReceptionist && (
          <>
            <TabsContent value="anamnese" className="mt-4"><AnamneseTab patientId={patientId} /></TabsContent>
            <TabsContent value="secretaria" className="mt-4"><SecretariaTab patientId={patientId} /></TabsContent>
            <TabsContent value="atestados" className="mt-4"><AtestadosTab patientId={patientId} patientName={patient.fullName} patientPhone={patient.phone} /></TabsContent>
            <TabsContent value="contratos" className="mt-4"><ContratosTab patientId={patientId} /></TabsContent>
            <TabsContent value="prescricoes" className="mt-4"><PrescricoesTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
            <TabsContent value="orcamentos" className="mt-4"><OrcamentoTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
            <TabsContent value="imagens" className="mt-4"><ImagensTab patientId={patientId} /></TabsContent>
            <TabsContent value="galeria" className="mt-4"><GaleriaTab patientId={patientId} /></TabsContent>
            <TabsContent value="anexos" className="mt-4"><AnexosTab patientId={patientId} /></TabsContent>
            <TabsContent value="exames" className="mt-4"><ExamesTab patientId={patientId} /></TabsContent>
            <TabsContent value="procedimentos" className="mt-4"><ProcedimentosTab patientId={patientId} /></TabsContent>
            <TabsContent value="agendamentos" className="mt-4"><AgendamentosTab patientId={patientId} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
