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
  FlaskConical, Package, Save, Upload, Trash2, Search, CheckCircle2,
} from "lucide-react";
import { AllergyAlert } from "@/components/AllergyAlert";
import { ExportProntuarioButton } from "@/components/ExportProntuario";

/* ═══════════════════════════════════════════════════════════════════════════
   ANAMNESE TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function AnamneseTab({ patientId }: { patientId: number }) {
  const { data: templates } = trpc.medicalRecords.listTemplates.useQuery();
  const [questions, setQuestions] = useState<Array<{
    id: string; text: string; type: "text" | "radio" | "checkbox" | "select"; options: string[]; answer: string;
  }>>([
    { id: "1", text: "Queixa principal", type: "text", options: [], answer: "" },
    { id: "2", text: "Há quanto tempo apresenta os sintomas?", type: "radio", options: ["Menos de 1 semana", "1-4 semanas", "1-6 meses", "Mais de 6 meses"], answer: "" },
    { id: "3", text: "Já realizou algum procedimento estético antes?", type: "radio", options: ["Sim", "Não"], answer: "" },
    { id: "4", text: "Possui alergias conhecidas?", type: "radio", options: ["Sim", "Não"], answer: "" },
    { id: "5", text: "Medicamentos em uso", type: "text", options: [], answer: "" },
    { id: "6", text: "Antecedentes cirúrgicos", type: "text", options: [], answer: "" },
    { id: "7", text: "Antecedentes familiares", type: "text", options: [], answer: "" },
    { id: "8", text: "Tabagismo", type: "radio", options: ["Nunca", "Ex-fumante", "Fumante atual"], answer: "" },
    { id: "9", text: "Etilismo", type: "radio", options: ["Nunca", "Social", "Frequente"], answer: "" },
    { id: "10", text: "Hipercromia (Exame Físico Genital Feminino)", type: "radio", options: ["Severa", "Moderada", "Leve", "Sem hipercromia"], answer: "" },
  ]);

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
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-amber-400" />
            <Label className="text-xs font-semibold text-amber-400 uppercase">Acompanhante / Chaperone (CFM) <span className="text-red-400">*</span></Label>
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

        <Button size="sm" variant="outline" onClick={() => setShowAddQ(true)} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
          <Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar Pergunta
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowLink(true)} className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
          <Link2 className="h-3.5 w-3.5 mr-1.5" />Gerar Link p/ Paciente
        </Button>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
          <Save className="h-3.5 w-3.5 mr-1.5" />Salvar Anamnese
        </Button>
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <Card key={q.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Label className="text-sm font-medium">{q.text}</Label>
                <button onClick={() => removeQuestion(q.id)} className="text-red-400/50 hover:text-red-400 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
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
            <Button onClick={addQuestion} className="bg-amber-600 hover:bg-amber-700">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLink} onOpenChange={setShowLink}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar Link de Anamnese</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Um link será gerado para o paciente preencher a anamnese remotamente. Após o preenchimento, o paciente assina digitalmente e os dados são salvos no sistema.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLink(false)}>Cancelar</Button>
            <Button onClick={generateLink} className="bg-amber-600 hover:bg-amber-700"><Copy className="h-4 w-4 mr-2" />Gerar e Copiar Link</Button>
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
        <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"><FileText className="h-3.5 w-3.5 mr-1.5" />Novo Atestado</Button>
        <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"><FileText className="h-3.5 w-3.5 mr-1.5" />Nova Declaração</Button>
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Modelos Prontos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {modelos.map((m, i) => (
            <button key={i} onClick={() => setTexto(m.texto)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-xs">
              <span className="font-medium">{m.nome}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-amber-400" />Editor</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Selecione um modelo ou digite..." />
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar</Button>
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
        <Button size="sm" variant={modo === "livre" ? "default" : "outline"} onClick={() => setModo("livre")} className={modo === "livre" ? "bg-amber-600 hover:bg-amber-700" : ""}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />Texto Livre
        </Button>
        <Button size="sm" variant={modo === "memed" ? "default" : "outline"} onClick={() => setModo("memed")} className={modo === "memed" ? "bg-blue-600 hover:bg-blue-700" : ""}>
          <Stethoscope className="h-3.5 w-3.5 mr-1.5" />MEMED
        </Button>
      </div>
      {modo === "memed" ? (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-6 text-center">
            <Stethoscope className="h-10 w-10 text-blue-400 mx-auto mb-3" />
            <p className="text-sm font-medium">Integração MEMED</p>
            <p className="text-xs text-muted-foreground mt-1">Configure as credenciais MEMED na aba Empresa para ativar.</p>
            <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">Abrir MEMED</Button>
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
                <button key={t.id} onClick={() => setTexto(t.content)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-xs">
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
              {staticModelos.map((m, i) => (
                <button key={`static-${i}`} onClick={() => setTexto(m.texto)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-xs">
                  <span className="font-medium">{m.nome}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[200px] font-mono text-sm" placeholder="Digite a prescrição ou selecione um modelo..." />
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar Prescrição</Button>
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

function AnexosTab({ patientId }: { patientId: number }) {
  const [anexos, setAnexos] = useState<Array<{ id: string; nome: string; tipo: string; data: string }>>([]);

  return (
    <div className="space-y-4">
      <Button size="sm" className="bg-amber-600 hover:bg-amber-700"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload de Arquivo</Button>
      <Card className="border-border/50 border-dashed">
        <CardContent className="p-8 text-center">
          <Upload className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Arraste arquivos aqui ou clique para enviar</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Documentos, prints, resultados de exames (PDF, JPG, PNG, DOCX)</p>
        </CardContent>
      </Card>
      {anexos.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum anexo adicionado ainda.</p>
      ) : (
        <div className="space-y-2">
          {anexos.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-md border border-border/50 hover:border-amber-500/30">
              <Paperclip className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{a.nome}</p><p className="text-[10px] text-muted-foreground">{a.tipo} - {a.data}</p></div>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
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
        <Button size="sm" variant={modo === "lista" ? "default" : "outline"} onClick={() => setModo("lista")} className={modo === "lista" ? "bg-amber-600 hover:bg-amber-700" : ""}>
          <Search className="h-3.5 w-3.5 mr-1.5" />Lista TUSS
        </Button>
        <Button size="sm" variant={modo === "livre" ? "default" : "outline"} onClick={() => setModo("livre")} className={modo === "livre" ? "bg-amber-600 hover:bg-amber-700" : ""}>
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
                    }} className="w-full text-left p-2 rounded-md hover:bg-amber-500/10 transition-colors text-xs flex items-center justify-between">
                      <span><span className="text-muted-foreground mr-2">{exam.code}</span>{exam.name}</span>
                      <Plus className="h-3 w-3 text-amber-400" />
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
                        <button onClick={() => setSelectedExams(selectedExams.filter((e) => e.code !== exam.code))} className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" className="w-full mt-3 bg-amber-600 hover:bg-amber-700"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar Solicitação</Button>
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
                <button key={t.id} onClick={() => setTextoLivre(t.content)} className="w-full text-left p-2.5 rounded-md border border-border/50 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-xs">
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
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700"><Save className="h-3.5 w-3.5 mr-1.5" />Salvar</Button>
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
            <button key={i} onClick={() => selectProc(proc)} className={`w-full text-left p-3 rounded-md border transition-all text-xs ${procedimento === proc.nome ? "border-amber-500 bg-amber-500/10" : "border-border/50 hover:border-amber-500/30"}`}>
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
              <Package className="h-4 w-4 text-amber-400" />Insumos - {procedimento}
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
            <Button size="sm" className="w-full mt-3 bg-amber-600 hover:bg-amber-700">
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

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>;
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
        <ShieldCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <p className="text-[10px] text-blue-400">Prontuário protegido pela LGPD. Todos os acessos são registrados.</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="anamnese" className="w-full">
        <TabsList className="w-full justify-start flex-wrap bg-muted/50 h-auto p-1 gap-0.5">
          <TabsTrigger value="anamnese" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white">
            <ClipboardList className="h-3.5 w-3.5" />Anamnese
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

        <TabsContent value="anamnese" className="mt-4"><AnamneseTab patientId={patientId} /></TabsContent>
        <TabsContent value="atestados" className="mt-4"><AtestadosTab patientId={patientId} patientName={patient.fullName} /></TabsContent>
        <TabsContent value="prescricoes" className="mt-4"><PrescricoesTab patientId={patientId} /></TabsContent>
        <TabsContent value="anexos" className="mt-4"><AnexosTab patientId={patientId} /></TabsContent>
        <TabsContent value="exames" className="mt-4"><ExamesTab patientId={patientId} /></TabsContent>
        <TabsContent value="procedimentos" className="mt-4"><ProcedimentosTab patientId={patientId} /></TabsContent>
      </Tabs>
    </div>
  );
}
