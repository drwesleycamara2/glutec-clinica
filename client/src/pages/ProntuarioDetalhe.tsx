import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
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
} from "lucide-react";
import { AllergyAlert } from "@/components/AllergyAlert";
import { ExportProntuarioButton } from "@/components/ExportProntuario";
import { EvolucaoClinicaWorkspace } from "@/components/EvolucaoClinicaWorkspace";

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
    .filter(Boolean)
    .join("\n\n");
}

function summarizeText(text?: string | null, maxLength: number = 180) {
  const normalized = repairMojibake(text).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function repairMojibake(value?: string | null) {
  let text = String(value ?? "");
  if (!text) return "";
  if (!/ÃƒÆ’|Ãƒâ€š|Ãƒâ€™|Ãƒâ€œ|Ãƒâ€|Ãƒâ€¢|ÃƒÂ¯Ã‚Â¿Ã‚Â½|Ã¯Â¿Â½/.test(text)) return text;

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
            <Button size="sm" variant="outline" onClick={generateLink} disabled={createAnamnesisLinkMutation.isLoading} className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10">
              {createAnamnesisLinkMutation.isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}Gerar link para o paciente
            </Button>
            <Button size="sm" onClick={saveAnamnesis} disabled={createAnamnesisMutation.isLoading} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33] text-white">
              {createAnamnesisMutation.isLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Salvar anamnese
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {questions.map((question) => (
          <Card key={question.id} className="border-border/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">{repairMojibake(question.text)}</Label>
                  <p className="text-[11px] text-muted-foreground mt-1">Preenchimento obrigatório.</p>
                </div>
                <Badge variant="outline">Obrigatória</Badge>
              </div>

              {question.type === "text" ? (
                <Textarea
                  value={question.answer || ""}
                  onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}
                  rows={3}
                  className="resize-none"
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
                <div className="rounded-xl border border-[#C9A55B]/20 bg-amber-500/5 p-3">
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

export default function ProntuarioDetalhe() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const validTabs = ["historico", "anamnese", "evolucao", "atestados", "prescricoes", "orcamentos", "imagens", "anexos", "exames", "procedimentos"];
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "historico";
    const hashTab = window.location.hash.replace("#", "");
    return validTabs.includes(hashTab) ? hashTab : "historico";
  });

  const { data: patient, isLoading } = trpc.patients.getById.useQuery({ id: patientId });

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
  }, []);

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
        <ExportProntuarioButton patientId={patientId} patientName={patient.fullName} />
      </div>

      {/* Allergy Alert */}
      {patient.allergies && <AllergyAlert allergies={patient.allergies} patientName={patient.fullName} variant="banner" />}

      {/* LGPD notice */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <ShieldCheck className="h-3.5 w-3.5 text-[#C9A55B] shrink-0" />
        <p className="text-[10px] text-[#C9A55B]">Prontuário protegido pela LGPD. Todos os acessos são registrados.</p>
      </div>

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
          <TabsTrigger value="anamnese" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <ClipboardList className="h-3.5 w-3.5" />Anamnese
          </TabsTrigger>
          <TabsTrigger value="evolucao" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Activity className="h-3.5 w-3.5" />Evolução
          </TabsTrigger>
          <TabsTrigger value="atestados" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <FileText className="h-3.5 w-3.5" />Atestados / Docs
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
          <TabsTrigger value="anexos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Paperclip className="h-3.5 w-3.5" />Anexos
          </TabsTrigger>
          <TabsTrigger value="exames" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <FlaskConical className="h-3.5 w-3.5" />Exames
          </TabsTrigger>
          <TabsTrigger value="procedimentos" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <Package className="h-3.5 w-3.5" />Procedimentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="mt-4"><HistoricoTab patientId={patientId} /></TabsContent>
        <TabsContent value="anamnese" className="mt-4"><AnamneseTab patientId={patientId} /></TabsContent>
        <TabsContent value="evolucao" className="mt-4"><EvolucaoClinicaWorkspace patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="atestados" className="mt-4"><AtestadosTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="prescricoes" className="mt-4"><PrescricoesTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="orcamentos" className="mt-4"><OrcamentoTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="imagens" className="mt-4"><ImagensTab patientId={patientId} /></TabsContent>
        <TabsContent value="anexos" className="mt-4"><AnexosTab patientId={patientId} /></TabsContent>
        <TabsContent value="exames" className="mt-4"><ExamesTab patientId={patientId} /></TabsContent>
        <TabsContent value="procedimentos" className="mt-4"><ProcedimentosTab patientId={patientId} /></TabsContent>
      </Tabs>
    </div>
  );
}



