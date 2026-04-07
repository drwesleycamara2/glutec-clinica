import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  ArrowLeft, Plus, FileText, Activity, Stethoscope, ClipboardList, Loader2,
  Calendar, User, ShieldCheck, FileDown, UserCheck, Copy, Link2, Paperclip,
  FlaskConical, Package, Save, Upload, Trash2, Search, CheckCircle2, History, FolderOpen, ImageIcon,
} from "lucide-react";
import { AllergyAlert } from "@/components/AllergyAlert";
import { ExportProntuarioButton } from "@/components/ExportProntuario";
import { EvolucaoClinicaTab } from "@/components/EvolucaoClinicaTab";
const DEFAULT_ANAMNESE_QUESTIONS = [
  { text: "Estado civil", type: "text", options: [] },
  { text: "Profissão *", type: "text", options: [] },
  { text: "Cidade e estado em que mora: *", type: "text", options: [] },
  { text: "Peso atual aproximado em Kg *", type: "text", options: [] },
  { text: "Sua estatura aproximada (em metros) *", type: "text", options: [] },
  { text: "Tem alergia a algum medicamento, alimento ou substância? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Se sim, qual alergia? *", type: "text", options: [] },
  { text: "É fumante? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Consome bebida alcoólica? *", type: "radio", options: ["Sim, muito e com frequência", "Bebo pouco, socialmente", "Não bebo"] },
  { text: "Usa alguma droga ilícita? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Se sim, qual droga? *", type: "text", options: [] },
  { text: "Usa algum tipo de hormônio? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Se sim, quais hormônios? *", type: "text", options: [] },
  { text: "Faz uso de anticoagulante? (ou AAS?) *", type: "radio", options: ["Sim", "Não"] },
  { text: "Toma vitamina D? Qual a dose e em que frequência? *", type: "text", options: [] },
  { text: "Faz uso de medicamentos regularmente? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Se sim, liste os medicamentos de uso regular: *", type: "text", options: [] },
  { text: "Selecione os problemas de saúde que tem atualmente *", type: "checkbox", options: ["Nenhum problema de saúde", "Diabetes", "Pressão alta", "Problemas no coração ou arritmias", "Problema nos rins ou no fígado", "Tumores", "Alterações psiquiátricas", "Outros problemas de saúde"] },
  { text: "Se marcou outros problemas de saúde, descreva: *", type: "text", options: [] },
  { text: "Teve gestações? Se sim, quando foi o último parto? *", type: "text", options: [] },
  { text: "Está grávida ou amamentando? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Usa método anticoncepcional? Qual? *", type: "text", options: [] },
  { text: "Já teve problemas de cicatrização, como queloides? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Já teve alguma reação ruim com anestesia? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Já teve alguma hemorragia? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Realiza atividade física regular? *", type: "radio", options: ["Sim, três ou mais vezes por semana", "Não realizo com frequência"] },
  { text: "Qual atividade física realiza? *", type: "text", options: [] },
  { text: "Você é muito sensível à dor? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Já teve trombose, embolia ou AVC? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Já teve ou trata arritmia cardíaca? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Tem ou já teve pedras nos rins? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Já realizou alguma cirurgia? *", type: "radio", options: ["Sim", "Não"] },
  { text: "Se sim, quais cirurgias realizou? *", type: "text", options: [] },
  { text: "Há algo que gostaria de informar ao médico?", type: "text", options: [] },
].map((question, index) => ({
  id: `default-${index + 1}`,
  answer: "",
  ...question,
})) as Array<{
  id: string;
  text: string;
  type: "text" | "radio" | "checkbox" | "select";
  options: string[];
  answer: string;
}>;

function buildHistorySummary(record: any) {
  return [
    record.chiefComplaint,
    record.historyOfPresentIllness,
    record.clinicalEvolution,
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

function groupDocumentsByType(documents: any[]) {
  const labels: Record<string, string> = {
    rg: "Documentos pessoais",
    cpf: "Documentos pessoais",
    convenio: "Documentos pessoais",
    termo: "Contratos e termos",
    exame_pdf: "Resultados de exames",
    exame_imagem: "Resultados de exames",
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

/* ═══════════════════════════════════════════════════════════════════════════
   ANAMNESE TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function AnamneseTab({ patientId }: { patientId: number }) {
  const { data: templates } = trpc.medicalRecords.listTemplates.useQuery();
  const [questions, setQuestions] = useState<Array<{
    id: string; text: string; type: "text" | "radio" | "checkbox" | "select"; options: string[]; answer: string;
  }>>(DEFAULT_ANAMNESE_QUESTIONS);

  const applyTemplate = (templateId: number) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;
    
    const sections = template.sections as any[];
    const newQuestions = sections.map((s, idx) => ({
      id: `temp-${idx}-${Date.now()}`,
      text: s.title,
      type: s.type || "text",
      options: s.options || [],
      answer: s.defaultValue || ""
    }));
    
    setQuestions(newQuestions);
    toast.success(`Modelo "${template.name}" aplicado!`);
  };
  const [newQ, setNewQ] = useState({ text: "", type: "radio" as const, options: "" });
  const [showAddQ, setShowAddQ] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [chaperone, setChaperone] = useState("");

  const addQuestion = () => {
    if (!newQ.text.trim()) return toast.error("Digite a pergunta.");
    const opts = newQ.type !== "text" ? newQ.options.split(",").map((o) => o.trim()).filter(Boolean) : [];
    if (newQ.type !== "text" && opts.length < 2) return toast.error("Adicione pelo menos 2 opções.");
    setQuestions([...questions, { id: Date.now().toString(), text: newQ.text, type: newQ.type, options: opts, answer: "" }]);
    setNewQ({ text: "", type: "radio", options: "" });
    setShowAddQ(false);
    toast.success("Pergunta adicionada!");
  };

  const updateAnswer = (id: string, answer: string) => {
    setQuestions(questions.map((q) => q.id === id ? { ...q, answer } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const generateLink = () => {
    const token = btoa(JSON.stringify({ patientId, questions: questions.map((q) => ({ text: q.text, type: q.type, options: q.options })) }));
    const link = `${window.location.origin}/anamnese-publica/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado! Envie ao paciente via WhatsApp.");
    setShowLink(false);
  };

  return (
    <div className="space-y-4">
      {/* Chaperone - CFM */}
      <Card className="border-[#C9A55B]/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-[#C9A55B]" />
            <Label className="text-xs font-semibold text-[#C9A55B] uppercase">Acompanhante / Chaperone (CFM) <span className="text-[#6B6B6B]">*</span></Label>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">Obrigatório: registre o(a) assistente que acompanhou o atendimento ou cirurgia dentro da sala.</p>
          <Input value={chaperone} onChange={(e) => setChaperone(e.target.value)} placeholder="Nome completo do(a) acompanhante/assistente" />
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex items-center gap-2 mr-2">
          <Label className="text-xs font-medium text-muted-foreground">Modelo:</Label>
          <Select onValueChange={(v) => applyTemplate(parseInt(v))}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Selecionar modelo..." />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
              ))}
              {templates?.length === 0 && <SelectItem value="0" disabled>Nenhum modelo cadastrado</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        <Button size="sm" variant="outline" onClick={() => setShowAddQ(true)} className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10">
          <Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar Pergunta
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowLink(true)} className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10">
          <Link2 className="h-3.5 w-3.5 mr-1.5" />Gerar Link p/ Paciente
        </Button>
        <Button size="sm" className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33] text-white">
          <Save className="h-3.5 w-3.5 mr-1.5" />Salvar Anamnese
        </Button>
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <Card key={q.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Label className="text-sm font-medium">{q.text}</Label>
                <button onClick={() => removeQuestion(q.id)} className="text-[#6B6B6B]/50 hover:text-[#6B6B6B] shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {q.type === "text" ? (
                <Textarea value={q.answer} onChange={(e) => updateAnswer(q.id, e.target.value)} className="resize-none" rows={2} placeholder="Digite aqui..." />
              ) : q.type === "radio" ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button key={opt} onClick={() => updateAnswer(q.id, opt)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${q.answer === opt ? "bg-amber-600 text-white border-amber-600" : "bg-muted/50 text-foreground border-border hover:border-amber-500/50"}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : q.type === "checkbox" ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const sel = (q.answer || "").split(";").includes(opt);
                    return (
                      <button key={opt} onClick={() => {
                        const cur = (q.answer || "").split(";").filter(Boolean);
                        updateAnswer(q.id, (sel ? cur.filter((c) => c !== opt) : [...cur, opt]).join(";"));
                      }} className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${sel ? "bg-amber-600 text-white border-amber-600" : "bg-muted/50 text-foreground border-border hover:border-amber-500/50"}`}>
                        {sel ? "✓ " : ""}{opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Select value={q.answer} onValueChange={(v) => updateAnswer(q.id, v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{q.options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAddQ} onOpenChange={setShowAddQ}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Pergunta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Pergunta</Label><Input value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} className="mt-1" placeholder="Ex: Grau de hipercromia" /></div>
            <div>
              <Label>Tipo de Resposta</Label>
              <Select value={newQ.type} onValueChange={(v: any) => setNewQ({ ...newQ, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="radio">Seleção única (radio)</SelectItem>
                  <SelectItem value="checkbox">Múltipla escolha</SelectItem>
                  <SelectItem value="select">Dropdown</SelectItem>
                  <SelectItem value="text">Texto livre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newQ.type !== "text" && (
              <div><Label>Opções (separadas por vírgula)</Label><Input value={newQ.options} onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} className="mt-1" placeholder="Severa, Moderada, Leve, Sem hipercromia" /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddQ(false)}>Cancelar</Button>
            <Button onClick={addQuestion} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar Link de Anamnese</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Um link será gerado para o paciente preencher a anamnese remotamente. Após o preenchimento, o paciente assina digitalmente e os dados são salvos no sistema.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLink(false)}>Cancelar</Button>
            <Button onClick={generateLink} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Copy className="h-4 w-4 mr-2" />Gerar e Copiar Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ATESTADOS / DECLARAÇÕES TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function AtestadosTab({ patientId, patientName }: { patientId: number; patientName: string }) {
  const [texto, setTexto] = useState("");
  const modelos = [
    { nome: "Atestado Médico (Padrão)", texto: `Atesto para os devidos fins que o(a) paciente ${patientName}, esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades por _____ dia(s), a partir de ${new Date().toLocaleDateString("pt-BR")}.\n\nCID: _____\n\n${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}\n\n_________________________\nDr. Wésley Câmara\nCRM: _____` },
    { nome: "Declaração de Comparecimento", texto: `Declaro para os devidos fins que o(a) paciente ${patientName} compareceu a esta clínica no dia ${new Date().toLocaleDateString("pt-BR")}, no horário de _____ às _____, para realização de consulta/procedimento médico.\n\n${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}\n\n_________________________\nDr. Wésley Câmara\nCRM: _____` },
    { nome: "Declaração de Aptidão", texto: `Declaro que o(a) paciente ${patientName}, após avaliação clínica realizada nesta data, encontra-se apto(a) para _____.\n\n${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}\n\n_________________________\nDr. Wésley Câmara\nCRM: _____` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10"><FileText className="h-3.5 w-3.5 mr-1.5" />Novo Atestado</Button>
        <Button size="sm" variant="outline" className="border-[#C9A55B]/30 text-[#C9A55B] hover:bg-[#C9A55B]/10"><FileText className="h-3.5 w-3.5 mr-1.5" />Nova Declaração</Button>
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Modelos Prontos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {modelos.map((m, i) => (
            <button key={i} onClick={() => setTexto(m.texto)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-[#C9A55B]/30 hover:bg-amber-500/5 transition-all text-xs">
              <span className="font-medium">{m.nome}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-[#C9A55B]" />Editor</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Selecione um modelo ou digite..." />
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar</Button>
            <Button size="sm" variant="outline"><FileDown className="h-3.5 w-3.5 mr-1.5" />Imprimir / PDF</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESCRIÇÕES TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function PrescricoesTab({ patientId }: { patientId: number }) {
  const [modo, setModo] = useState<"memed" | "livre">("livre");
  const [texto, setTexto] = useState("");
  const { data: templates } = trpc.prescriptions.listTemplates.useQuery();
  
  const saveTemplateMutation = trpc.prescriptions.createTemplate.useMutation({
    onSuccess: () => toast.success("Modelo salvo!"),
    onError: (err: any) => toast.error(err.message),
  });

  const staticModelos = [
    { nome: "Analgésico Padrão", texto: "1) Dipirona 500mg - Tomar 1 comprimido de 6/6 horas se dor.\n2) Paracetamol 750mg - Tomar 1 comprimido de 8/8 horas se dor persistir." },
    { nome: "Anti-inflamatório Pós-Procedimento", texto: "1) Nimesulida 100mg - Tomar 1 comprimido de 12/12 horas por 5 dias.\n2) Dipirona 1g - Tomar 1 comprimido de 6/6 horas se dor.\n3) Amoxicilina 500mg - Tomar 1 comprimido de 8/8 horas por 7 dias." },
    { nome: "Cuidados Pós-Lipo", texto: "1) Cefalexina 500mg - Tomar 1 comprimido de 6/6 horas por 7 dias.\n2) Tramadol 50mg - Tomar 1 comprimido de 8/8 horas se dor intensa.\n3) Bromoprida 10mg - Tomar 1 comprimido de 8/8 horas se náuseas.\n4) Enoxaparina 40mg - Aplicar 1 ampola SC 1x/dia por 7 dias." },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={modo === "livre" ? "default" : "outline"} onClick={() => setModo("livre")} className={modo === "livre" ? "bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]" : ""}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />Texto Livre
        </Button>
        <Button size="sm" variant={modo === "memed" ? "default" : "outline"} onClick={() => setModo("memed")} className={modo === "memed" ? "bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]" : ""}>
          <Stethoscope className="h-3.5 w-3.5 mr-1.5" />MEMED
        </Button>
      </div>
      {modo === "memed" ? (
        <Card className="border-[#C9A55B]/30 bg-blue-500/5">
          <CardContent className="p-6 text-center">
            <Stethoscope className="h-10 w-10 text-[#C9A55B] mx-auto mb-3" />
            <p className="text-sm font-medium">Integração MEMED</p>
            <p className="text-xs text-muted-foreground mt-1">Configure as credenciais MEMED na aba Empresa para ativar.</p>
            <Button size="sm" className="mt-4 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">Abrir MEMED</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Modelos de Prescrição</CardTitle>
              <Button size="xs" variant="ghost" onClick={() => {
                if (!texto) return toast.error("Digite a prescrição para salvar.");
                const name = prompt("Nome do modelo:");
                if (name) saveTemplateMutation.mutate({ name, content: texto, type: "simples" });
              }} className="h-6 text-[10px]">Salvar Atual como Modelo</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-40 overflow-y-auto">
              {templates?.map((t) => (
                <button key={t.id} onClick={() => setTexto(t.content)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-[#C9A55B]/30 hover:bg-amber-500/5 transition-all text-xs">
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
              {staticModelos.map((m, i) => (
                <button key={`static-${i}`} onClick={() => setTexto(m.texto)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-[#C9A55B]/30 hover:bg-amber-500/5 transition-all text-xs">
                  <span className="font-medium">{m.nome}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Digite a prescrição ou selecione um modelo..." />
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar Prescrição</Button>
                <Button size="sm" variant="outline"><FileDown className="h-3.5 w-3.5 mr-1.5" />Imprimir / PDF</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANEXOS TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function HistoricoTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = trpc.medicalRecords.getHistory.useQuery({ patientId });
  const records = data?.records ?? [];
  const appointments = data?.appointments ?? [];
  const documents = data?.documents ?? [];
  const photos = data?.photos ?? [];

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Agendamentos</p><p className="mt-2 text-2xl font-semibold">{appointments.length}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Atendimentos</p><p className="mt-2 text-2xl font-semibold">{records.length}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Anexos</p><p className="mt-2 text-2xl font-semibold">{documents.length}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Imagens</p><p className="mt-2 text-2xl font-semibold">{photos.length}</p></CardContent></Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Linha do tempo clínica</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {appointments.length === 0 && records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum histórico clínico importado foi encontrado para este paciente.</p>
          ) : (
            <>
              {appointments.map((appointment: any) => (
                <div key={`appointment-${appointment.id}`} className="rounded-xl border border-border/60 bg-background/60 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold">Agendamento em {new Date(appointment.scheduledAt).toLocaleString("pt-BR")}</p>
                      <p className="text-xs text-muted-foreground">Status: {appointment.status} {appointment.room ? `• Sala ${appointment.room}` : ""}</p>
                    </div>
                    <Badge variant="outline">{appointment.type}</Badge>
                  </div>
                  {appointment.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{appointment.notes}</p> : null}
                </div>
              ))}
              {records.map((record: any) => {
                const summary = buildHistorySummary(record);
                return (
                  <div key={`record-${record.id}`} className="rounded-xl border border-[#C9A55B]/20 bg-[#C9A55B]/6 p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold">Atendimento em {new Date(record.date || record.createdAt).toLocaleString("pt-BR")}</p>
                        <p className="text-xs text-muted-foreground">{record.doctorName || "Profissional não identificado"}</p>
                      </div>
                      {record.icdCode ? <Badge className="bg-[#C9A55B]/15 text-[#8A6526]">CID {record.icdCode}</Badge> : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{summary || "Sem resumo clínico estruturado no legado."}</p>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnexosTab({ patientId }: { patientId: number }) {
  const { data: documents, isLoading } = trpc.medicalRecords.getDocuments.useQuery({ patientId });
  const { data: photos } = trpc.photos.getByPatient.useQuery({ patientId });
  const groupedDocuments = useMemo(() => groupDocumentsByType(documents ?? []), [documents]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Anexos importados do legado</p>
          <p className="text-xs text-muted-foreground">Documentos, contratos, resultados de exames, imagens e vídeos vinculados ao paciente.</p>
        </div>
        <Button size="sm" className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload de arquivo</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {Object.keys(groupedDocuments).length === 0 ? (
            <Card className="border-border/50 border-dashed"><CardContent className="p-8 text-center"><FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-medium text-muted-foreground">Nenhum documento importado para este paciente.</p></CardContent></Card>
          ) : (
            Object.entries(groupedDocuments).map(([groupName, items]) => (
              <Card key={groupName} className="border-border/50">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><FolderOpen className="h-4 w-4 text-[#C9A55B]" />{groupName}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {items.map((document: any) => (
                    <a key={document.id} href={document.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:border-[#C9A55B]/40 hover:bg-[#C9A55B]/6">
                      <Paperclip className="h-4 w-4 text-[#C9A55B] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{document.title || document.name}</p>
                        <p className="text-[11px] text-muted-foreground">{document.description || document.type} • {new Date(document.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <FileDown className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card className="border-border/50">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ImageIcon className="h-4 w-4 text-[#C9A55B]" />Imagens e vídeos</CardTitle></CardHeader>
          <CardContent>
            {!photos || photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma imagem importada foi encontrada para este paciente.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.slice(0, 8).map((photo: any) => (
                  <a key={photo.id} href={photo.photoUrl} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-2xl border border-border/60 bg-background/60">
                    <div className="aspect-[4/5] bg-muted">
                      <img
                        src={photo.thumbnailUrl || photo.photoUrl}
                        alt={photo.description || "Imagem do paciente"}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="50%" y="50%" text-anchor="middle" fill="#8A6526" font-size="26" font-family="Arial">Imagem indisponível</text></svg>');
                        }}
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-xs font-medium">{photo.description || photo.category || "Imagem clínica"}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(photo.takenAt || photo.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXAMES TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function ExamesTab({ patientId }: { patientId: number }) {
  const [modo, setModo] = useState<"lista" | "livre">("lista");
  const [textoLivre, setTextoLivre] = useState("");
  const [searchTuss, setSearchTuss] = useState("");
  const [selectedExams, setSelectedExams] = useState<Array<{ code: string; name: string; urgency: string }>>([]);
  const [indicacao, setIndicacao] = useState("");
  const { data: templates } = trpc.examRequests.listTemplates.useQuery();

  const saveTemplateMutation = trpc.examRequests.createTemplate.useMutation({
    onSuccess: () => toast.success("Modelo salvo!"),
    onError: (err: any) => toast.error(err.message),
  });

  const examesTuss = [
    { code: "40301630", name: "Hemograma completo" },
    { code: "40302040", name: "Glicemia de jejum" },
    { code: "40301940", name: "Creatinina" },
    { code: "40302180", name: "TSH" },
    { code: "40302199", name: "T4 livre" },
    { code: "40301508", name: "Colesterol total" },
    { code: "40301770", name: "Triglicerídeos" },
    { code: "40301621", name: "TGO (AST)" },
    { code: "40301632", name: "TGP (ALT)" },
    { code: "40301974", name: "Ácido úrico" },
    { code: "40301150", name: "Coagulograma" },
    { code: "40301460", name: "Hemoglobina glicada" },
    { code: "40302067", name: "Vitamina D" },
    { code: "40302075", name: "Vitamina B12" },
    { code: "40301290", name: "Ferritina" },
    { code: "40301010", name: "Urina tipo I (EAS)" },
    { code: "40302016", name: "PSA total" },
    { code: "40301087", name: "Beta HCG" },
    { code: "40301117", name: "PCR (Proteína C Reativa)" },
    { code: "40301575", name: "VHS" },
  ];

  const filtered = examesTuss.filter((e) =>
    e.name.toLowerCase().includes(searchTuss.toLowerCase()) || e.code.includes(searchTuss)
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={modo === "lista" ? "default" : "outline"} onClick={() => setModo("lista")} className={modo === "lista" ? "bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]" : ""}>
          <Search className="h-3.5 w-3.5 mr-1.5" />Lista TUSS
        </Button>
        <Button size="sm" variant={modo === "livre" ? "default" : "outline"} onClick={() => setModo("livre")} className={modo === "livre" ? "bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]" : ""}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />Texto Livre
        </Button>
      </div>

      {modo === "lista" ? (
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Indicação Clínica</Label>
            <Input value={indicacao} onChange={(e) => setIndicacao(e.target.value)} placeholder="Motivo da solicitação dos exames" className="mt-1" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Buscar Exame (TUSS)</CardTitle></CardHeader>
              <CardContent>
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={searchTuss} onChange={(e) => setSearchTuss(e.target.value)} placeholder="Buscar por nome ou código..." className="pl-8 h-8 text-xs" />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {filtered.map((exam) => (
                    <button key={exam.code + exam.name} onClick={() => {
                      if (!selectedExams.find((e) => e.code === exam.code)) setSelectedExams([...selectedExams, { ...exam, urgency: "rotina" }]);
                    }} className="w-full text-left p-2 rounded-md hover:bg-[#C9A55B]/10 transition-colors text-xs flex items-center justify-between">
                      <span><span className="text-muted-foreground mr-2">{exam.code}</span>{exam.name}</span>
                      <Plus className="h-3 w-3 text-[#C9A55B]" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Selecionados ({selectedExams.length})</CardTitle></CardHeader>
              <CardContent>
                {selectedExams.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum exame selecionado.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedExams.map((exam) => (
                      <div key={exam.code} className="flex items-center gap-2 p-2 rounded-md border border-border/50">
                        <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{exam.name}</p><p className="text-[10px] text-muted-foreground">TUSS: {exam.code}</p></div>
                        <Select value={exam.urgency} onValueChange={(v) => setSelectedExams(selectedExams.map((e) => e.code === exam.code ? { ...e, urgency: v } : e))}>
                          <SelectTrigger className="w-24 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="rotina">Rotina</SelectItem><SelectItem value="urgente">Urgente</SelectItem></SelectContent>
                        </Select>
                        <button onClick={() => setSelectedExams(selectedExams.filter((e) => e.code !== exam.code))} className="text-[#6B6B6B] hover:text-[#8B8B8B]"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" className="w-full mt-3 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar Solicitação</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Modelos de Exames</CardTitle>
              <Button size="xs" variant="ghost" onClick={() => {
                if (!textoLivre) return toast.error("Digite os exames para salvar.");
                const name = prompt("Nome do modelo:");
                if (name) saveTemplateMutation.mutate({ name, content: textoLivre });
              }} className="h-6 text-[10px]">Salvar Atual como Modelo</Button>
            </CardHeader>
            <CardContent className="space-y-2 max-h-40 overflow-y-auto">
              {templates?.map((t) => (
                <button key={t.id} onClick={() => setTextoLivre(t.content)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-[#C9A55B]/30 hover:bg-amber-500/5 transition-all text-xs">
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
              {templates?.length === 0 && <p className="text-[10px] text-muted-foreground text-center">Nenhum modelo salvo.</p>}
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <Textarea value={textoLivre} onChange={(e) => setTextoLivre(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Solicito os seguintes exames laboratoriais..." />
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar</Button>
                <Button size="sm" variant="outline"><FileDown className="h-3.5 w-3.5 mr-1.5" />Imprimir / PDF</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROCEDIMENTOS TAB (com baixa automática no estoque)
   ═══════════════════════════════════════════════════════════════════════════ */

function ProcedimentosTab({ patientId }: { patientId: number }) {
  const [procedimento, setProcedimento] = useState("");
  const [insumos, setInsumos] = useState<Array<{ nome: string; qtdPadrao: number; qtdUsada: number }>>([]);

  const catalogo = [
    { nome: "Mini Lipo - Abdome", insumos: [
      { nome: "Lidocaína 2% c/ vaso", qtdPadrao: 3, qtdUsada: 3 },
      { nome: "Soro fisiológico 500ml", qtdPadrao: 2, qtdUsada: 2 },
      { nome: "Cânula de lipoaspiração 3mm", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Seringa 60ml", qtdPadrao: 4, qtdUsada: 4 },
      { nome: "Agulha 40x12", qtdPadrao: 5, qtdUsada: 5 },
      { nome: "Compressa de gaze", qtdPadrao: 10, qtdUsada: 10 },
    ]},
    { nome: "Bioestimulador - Sculptra", insumos: [
      { nome: "Sculptra (frasco)", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Lidocaína 2% s/ vaso", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Agulha 25G", qtdPadrao: 2, qtdUsada: 2 },
      { nome: "Cânula 22G", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Compressa de gaze", qtdPadrao: 5, qtdUsada: 5 },
    ]},
    { nome: "Toxina Botulínica", insumos: [
      { nome: "Botox 100U (frasco)", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Soro fisiológico 10ml", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Seringa 1ml", qtdPadrao: 2, qtdUsada: 2 },
      { nome: "Agulha 30G", qtdPadrao: 4, qtdUsada: 4 },
    ]},
    { nome: "Preenchimento com Ácido Hialurônico", insumos: [
      { nome: "Ácido Hialurônico (seringa)", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Agulha 27G", qtdPadrao: 2, qtdUsada: 2 },
      { nome: "Cânula 25G", qtdPadrao: 1, qtdUsada: 1 },
      { nome: "Compressa de gaze", qtdPadrao: 5, qtdUsada: 5 },
      { nome: "Clorexidina alcoólica", qtdPadrao: 1, qtdUsada: 1 },
    ]},
  ];

  const selectProc = (proc: typeof catalogo[0]) => {
    setProcedimento(proc.nome);
    setInsumos(proc.insumos.map((i) => ({ ...i })));
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Selecionar Procedimento</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {catalogo.map((proc, i) => (
            <button key={i} onClick={() => selectProc(proc)} className={`w-full text-left p-3 rounded-md border transition-all text-xs ${procedimento === proc.nome ? "border-amber-500 bg-[#C9A55B]/10" : "border-border/50 hover:border-[#C9A55B]/30"}`}>
              <span className="font-medium">{proc.nome}</span>
              <span className="text-muted-foreground ml-2">({proc.insumos.length} insumos)</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {insumos.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-[#C9A55B]" />Insumos - {procedimento}
              <Badge variant="outline" className="text-[10px] ml-auto">Baixa automática no estoque</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] text-muted-foreground mb-3">Ajuste as quantidades se necessário. Ao salvar, o estoque será atualizado automaticamente.</p>
            <div className="space-y-2">
              {insumos.map((insumo, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                  <span className="flex-1 text-xs font-medium">{insumo.nome}</span>
                  <span className="text-[10px] text-muted-foreground">Padrão: {insumo.qtdPadrao}</span>
                  <Input type="number" value={insumo.qtdUsada} onChange={(e) => {
                    const n = [...insumos]; n[i].qtdUsada = parseInt(e.target.value) || 0; setInsumos(n);
                  }} className="w-16 h-7 text-xs text-center" min={0} />
                </div>
              ))}
            </div>
            <Button size="sm" className="w-full mt-3 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Registrar Procedimento e Dar Baixa no Estoque
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ProntuarioDetalhe() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: patient, isLoading } = trpc.patients.getById.useQuery({ id: patientId });

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
      <Tabs defaultValue="historico" className="w-full">
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
        <TabsContent value="evolucao" className="mt-4"><EvolucaoClinicaTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="atestados" className="mt-4"><AtestadosTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="prescricoes" className="mt-4"><PrescricoesTab patientId={patientId} /></TabsContent>
        <TabsContent value="anexos" className="mt-4"><AnexosTab patientId={patientId} /></TabsContent>
        <TabsContent value="exames" className="mt-4"><ExamesTab patientId={patientId} /></TabsContent>
        <TabsContent value="procedimentos" className="mt-4"><ProcedimentosTab patientId={patientId} /></TabsContent>
      </Tabs>
    </div>
  );
}
