import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { WhatsAppSendButton } from "@/components/WhatsAppSendButton";
import {
  Plus, Search, FileText, Pill, Stethoscope, Award, Send, Download,
  Bold, Italic, Underline, List, Save, Eye, Printer, PenTool, Trash2,
  Copy, ChevronLeft, Clock, CheckCircle2, AlertCircle, XCircle
} from "lucide-react";

type DocumentType = "prescricao" | "exame" | "atestado" | "declaracao";

interface Document {
  id: number;
  title: string;
  type: DocumentType;
  content: string;
  status: "rascunho" | "finalizado" | "enviado_assinatura" | "assinado" | "cancelado";
  patientName: string;
  patientId: number;
  d4signKey?: string;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: number;
  name: string;
  content: string;
  type: DocumentType;
  isDefault?: boolean;
}

// ─── Modelos Pré-Prontos ────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 1, name: "Prescrição Simples", type: "prescricao", isDefault: true,
    content: `PRESCRIÇÃO MÉDICA

Paciente: [NOME_PACIENTE]
Data: [DATA_ATUAL]

USO INTERNO:

1) _________________________________
   Tomar _____ comprimido(s), _____ vez(es) ao dia, por _____ dias.

2) _________________________________
   Tomar _____ comprimido(s), _____ vez(es) ao dia, por _____ dias.

ORIENTAÇÕES GERAIS:
- Retornar em caso de piora dos sintomas
- Manter hidratação adequada

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000`
  },
  {
    id: 2, name: "Prescrição Estética", type: "prescricao", isDefault: true,
    content: `PRESCRIÇÃO MÉDICA - PÓS-PROCEDIMENTO

Paciente: [NOME_PACIENTE]
Data: [DATA_ATUAL]
Procedimento realizado: _________________________________

USO EXTERNO:

1) Pomada de Arnica Montana 10%
   Aplicar na região tratada, 3x ao dia, por 7 dias.

2) Creme cicatrizante (Cicaplast ou similar)
   Aplicar 2x ao dia após higienização, por 15 dias.

USO INTERNO:

1) Paracetamol 750mg
   Tomar 1 comprimido a cada 6 horas, se dor. Por até 5 dias.

2) Bromelina 250mg
   Tomar 1 cápsula, 3x ao dia, por 10 dias (anti-edema).

ORIENTAÇÕES PÓS-PROCEDIMENTO:
- Usar cinta compressiva conforme orientado
- Evitar exposição solar na área por 30 dias
- Não realizar atividades físicas intensas por 15 dias
- Manter repouso relativo nas primeiras 48 horas
- Retornar para revisão em 7 dias

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000`
  },
  {
    id: 3, name: "Pedido de Exame Padrão", type: "exame", isDefault: true,
    content: `SOLICITAÇÃO DE EXAMES

Paciente: [NOME_PACIENTE]
Data: [DATA_ATUAL]

EXAMES SOLICITADOS:

1) Hemograma completo
2) Glicemia de jejum
3) Coagulograma (TP, TTPa, INR)
4) Ureia e Creatinina
5) TGO e TGP
6) _________________________________

INDICAÇÃO CLÍNICA:
_________________________________

OBSERVAÇÕES:
- Jejum de 8 a 12 horas para coleta
- Trazer resultados na próxima consulta

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000`
  },
  {
    id: 4, name: "Exames Pré-Operatórios", type: "exame", isDefault: true,
    content: `SOLICITAÇÃO DE EXAMES PRÉ-OPERATÓRIOS

Paciente: [NOME_PACIENTE]
Data: [DATA_ATUAL]
Procedimento programado: _________________________________

EXAMES LABORATORIAIS:
1) Hemograma completo
2) Coagulograma (TP, TTPa, INR, Plaquetas)
3) Glicemia de jejum
4) Ureia e Creatinina
5) Sódio e Potássio
6) TGO e TGP
7) Tipagem sanguínea (ABO/Rh)

EXAMES COMPLEMENTARES:
8) Eletrocardiograma com laudo
9) Risco cirúrgico cardiológico
10) Raio-X de tórax PA e Perfil

INDICAÇÃO CLÍNICA:
Avaliação pré-operatória para procedimento estético.

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000`
  },
  {
    id: 5, name: "Atestado de Comparecimento", type: "atestado", isDefault: true,
    content: `ATESTADO DE COMPARECIMENTO

Atesto para os devidos fins que o(a) Sr(a). [NOME_PACIENTE], portador(a) do CPF [CPF_PACIENTE], compareceu a esta clínica no dia [DATA_ATUAL], no período das ___:___ às ___:___, para consulta médica.

[CIDADE], [DATA_ATUAL].

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000
Clínica Glutée`
  },
  {
    id: 6, name: "Atestado Médico (Afastamento)", type: "atestado", isDefault: true,
    content: `ATESTADO MÉDICO

Atesto para os devidos fins que o(a) Sr(a). [NOME_PACIENTE], portador(a) do CPF [CPF_PACIENTE], encontra-se sob meus cuidados médicos, necessitando de afastamento de suas atividades laborais por _____ dia(s), a partir de [DATA_ATUAL].

CID-10: ___________

[CIDADE], [DATA_ATUAL].

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000
Clínica Glutée`
  },
  {
    id: 7, name: "Declaração de Aptidão", type: "declaracao", isDefault: true,
    content: `DECLARAÇÃO DE APTIDÃO PARA PROCEDIMENTO

Declaro que o(a) paciente [NOME_PACIENTE], portador(a) do CPF [CPF_PACIENTE], após avaliação clínica e análise dos exames complementares, encontra-se APTO(A) para a realização do procedimento de _________________________________.

Foram avaliados:
- Exames laboratoriais pré-operatórios: normais
- Risco cirúrgico cardiológico: baixo risco
- Ausência de contraindicações clínicas

O(A) paciente foi devidamente informado(a) sobre os riscos, benefícios e alternativas ao procedimento proposto, conforme Termo de Consentimento Livre e Esclarecido assinado.

[CIDADE], [DATA_ATUAL].

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000
Clínica Glutée`
  },
  {
    id: 8, name: "Declaração Genérica", type: "declaracao", isDefault: true,
    content: `DECLARAÇÃO

Eu, Dr. Wésley de Sousa Câmara, CRM-SP 000000, declaro para os devidos fins que:

_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________

[CIDADE], [DATA_ATUAL].

____________________________________
Dr. Wésley de Sousa Câmara
CRM-SP 000000
Clínica Glutée`
  },
];

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_DOCUMENTS: Document[] = [
  {
    id: 1, title: "Prescrição Pós-Lipo - Maria Santos", type: "prescricao",
    content: "Prescrição médica...", status: "assinado",
    patientName: "Maria Santos", patientId: 1,
    d4signKey: "abc123", createdAt: "2026-03-08", updatedAt: "2026-03-08"
  },
  {
    id: 2, title: "Hemograma - João Silva", type: "exame",
    content: "Solicitação de exames...", status: "finalizado",
    patientName: "João Silva", patientId: 2,
    createdAt: "2026-03-09", updatedAt: "2026-03-09"
  },
];

// ─── Componente Principal ───────────────────────────────────────────────────

export default function Documentos() {
  const [activeTab, setActiveTab] = useState<DocumentType>("prescricao");
  const [documents, setDocuments] = useState<Document[]>(MOCK_DOCUMENTS);
  const [templates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Partial<Document> | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorPatient, setEditorPatient] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // D4Sign state
  const [showD4SignDialog, setShowD4SignDialog] = useState(false);
  const [d4signEmail, setD4signEmail] = useState("");
  const [d4signSafe, setD4signSafe] = useState("");
  const [sendingToD4Sign, setSendingToD4Sign] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);

  const filteredDocuments = documents.filter((doc) => {
    const matchesType = doc.type === activeTab;
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "todos" || doc.status === filterStatus;
    return matchesType && matchesSearch && matchesStatus;
  });

  const filteredTemplates = templates.filter((t) => t.type === activeTab);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleNewDocument = (template?: Template) => {
    const today = new Date().toLocaleDateString("pt-BR");
    let content = template?.content || "";
    content = content.replace(/\[DATA_ATUAL\]/g, today);
    content = content.replace(/\[CIDADE\]/g, "Mogi Guaçu - SP");

    setEditorTitle("");
    setEditorContent(content);
    setEditorPatient("");
    setEditingDoc({ type: activeTab, status: "rascunho" });
    setIsEditing(true);
  };

  const handleEditDocument = (doc: Document) => {
    setEditorTitle(doc.title);
    setEditorContent(doc.content);
    setEditorPatient(doc.patientName);
    setEditingDoc(doc);
    setIsEditing(true);
  };

  const handleSaveDocument = () => {
    if (!editorTitle.trim()) {
      toast.error("Digite um título para o documento");
      return;
    }

    const now = new Date().toISOString().split("T")[0];

    if (editingDoc?.id) {
      // Atualizar existente
      setDocuments(docs => docs.map(d =>
        d.id === editingDoc.id
          ? { ...d, title: editorTitle, content: editorContent, updatedAt: now }
          : d
      ));
      toast.success("Documento atualizado!");
    } else {
      // Criar novo
      const newDoc: Document = {
        id: Date.now(),
        title: editorTitle,
        type: activeTab,
        content: editorContent,
        status: "rascunho",
        patientName: editorPatient || "Paciente não informado",
        patientId: 0,
        createdAt: now,
        updatedAt: now,
      };
      setDocuments(docs => [...docs, newDoc]);
      setEditingDoc(newDoc);
      toast.success("Documento criado!");
    }
  };

  const handleFinalizeDocument = () => {
    if (!editingDoc?.id) {
      handleSaveDocument();
    }
    setDocuments(docs => docs.map(d =>
      d.id === (editingDoc?.id || 0)
        ? { ...d, status: "finalizado" as const }
        : d
    ));
    toast.success("Documento finalizado! Pronto para assinatura.");
  };

  const handleSendToD4Sign = async () => {
    if (!d4signEmail.trim()) {
      toast.error("Informe o e-mail do signatário");
      return;
    }
    setSendingToD4Sign(true);

    // Simular envio (em produção, chamaria o tRPC signatures.sendForSignature)
    setTimeout(() => {
      setDocuments(docs => docs.map(d =>
        d.id === (editingDoc?.id || 0)
          ? { ...d, status: "enviado_assinatura" as const, d4signKey: `d4s_${Date.now()}` }
          : d
      ));
      setSendingToD4Sign(false);
      setShowD4SignDialog(false);
      toast.success("Documento enviado para assinatura via D4Sign!");
    }, 2000);
  };

  const applyFormatting = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editorContent.substring(start, end);
    const newContent = editorContent.substring(0, start) + before + selectedText + after + editorContent.substring(end);
    setEditorContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${editorTitle}</title>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.6; margin: 40px; color: #000; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #d4a853; padding-bottom: 15px; }
            .header h1 { font-size: 18px; color: #333; margin: 0; }
            .header p { font-size: 12px; color: #666; margin: 2px 0; }
            .content { white-space: pre-wrap; margin-top: 20px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
            @media print { body { margin: 20mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>CLÍNICA GLUTÉE</h1>
            <p>Dr. Wésley de Sousa Câmara - CRM-SP 000000</p>
            <p>Medicina Estética</p>
          </div>
          <div class="content">${editorContent.replace(/\n/g, "<br>")}</div>
          <div class="footer">
            <p>Clínica Glutée - Mogi Guaçu/SP</p>
            <p>Documento gerado eletronicamente em ${new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // ─── Status Helpers ───────────────────────────────────────────────────────

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "rascunho": return { color: "bg-gray-100 text-gray-700 border-gray-300", icon: <Clock className="h-3 w-3" />, label: "Rascunho" };
      case "finalizado": return { color: "bg-[#C9A55B]/10 text-[#8A6526] border-[#C9A55B]/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "Finalizado" };
      case "enviado_assinatura": return { color: "bg-amber-100 text-amber-700 border-amber-300", icon: <Send className="h-3 w-3" />, label: "Aguardando Assinatura" };
      case "assinado": return { color: "bg-[#C9A55B]/15 text-[#6B5B2A] border-[#C9A55B]/30", icon: <PenTool className="h-3 w-3" />, label: "Assinado" };
      case "cancelado": return { color: "bg-[#2F2F2F]/10 text-[#2F2F2F] border-[#6B6B6B]/30", icon: <XCircle className="h-3 w-3" />, label: "Cancelado" };
      default: return { color: "bg-gray-100 text-gray-700 border-gray-300", icon: null, label: status };
    }
  };

  const getTypeConfig = (type: DocumentType) => {
    switch (type) {
      case "prescricao": return { icon: <Pill className="h-4 w-4" />, label: "Prescrições", singular: "Prescrição" };
      case "exame": return { icon: <Stethoscope className="h-4 w-4" />, label: "Exames", singular: "Pedido de Exame" };
      case "atestado": return { icon: <Award className="h-4 w-4" />, label: "Atestados", singular: "Atestado" };
      case "declaracao": return { icon: <FileText className="h-4 w-4" />, label: "Declarações", singular: "Declaração" };
    }
  };

  // ─── Render: Editor ───────────────────────────────────────────────────────

  if (isEditing) {
    const typeConfig = getTypeConfig(activeTab);
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
        {/* Header do Editor */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsEditing(false)} className="border-gray-300">
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {typeConfig.icon} {editingDoc?.id ? "Editar" : "Nova"} {typeConfig.singular}
              </h2>
              {editingDoc?.status && (
                <Badge className={`text-xs mt-1 ${getStatusConfig(editingDoc.status).color}`}>
                  {getStatusConfig(editingDoc.status).label}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePrint} className="border-gray-300">
              <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
            </Button>
            {editingDoc?.id ? (
              <WhatsAppSendButton
                documentType="atestado"
                documentId={editingDoc.id}
              />
            ) : null}
            <Button variant="outline" onClick={() => setShowPreview(true)} className="border-gray-300">
              <Eye className="h-4 w-4 mr-2" /> Visualizar
            </Button>
            {editingDoc?.status !== "assinado" && (
              <>
                <Button variant="outline" onClick={() => setShowD4SignDialog(true)} className="border-amber-400 text-amber-700 hover:bg-amber-50">
                  <PenTool className="h-4 w-4 mr-2" /> Enviar p/ D4Sign
                </Button>
                <Button onClick={handleFinalizeDocument} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33] text-white">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar
                </Button>
                <Button onClick={handleSaveDocument} className="btn-gold-gradient">
                  <Save className="h-4 w-4 mr-2" /> Salvar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Campos do Documento */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-semibold text-gray-700 mb-1 block">Título do Documento *</Label>
            <Input
              value={editorTitle}
              onChange={(e) => setEditorTitle(e.target.value)}
              placeholder={`Ex: ${typeConfig.singular} - Nome do Paciente`}
              className="border-gray-300"
            />
          </div>
          <div>
            <Label className="text-sm font-semibold text-gray-700 mb-1 block">Paciente</Label>
            <Input
              value={editorPatient}
              onChange={(e) => setEditorPatient(e.target.value)}
              placeholder="Nome do paciente"
              className="border-gray-300"
            />
          </div>
        </div>

        {/* Carregar Modelo */}
        {filteredTemplates.length > 0 && (
          <div>
            <Label className="text-sm font-semibold text-gray-700 mb-1 block">Carregar Modelo Pronto</Label>
            <div className="flex gap-2 flex-wrap">
              {filteredTemplates.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleNewDocument(t)}
                  className="border-gray-300 text-sm"
                >
                  <Copy className="h-3 w-3 mr-1" /> {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar de Formatação */}
        <div className="flex gap-1 p-2 bg-gray-100 rounded-lg border border-gray-300 flex-wrap items-center">
          <Button size="sm" variant="ghost" onClick={() => applyFormatting("**", "**")} title="Negrito" className="hover:bg-gray-200">
            <Bold className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => applyFormatting("_", "_")} title="Itálico" className="hover:bg-gray-200">
            <Italic className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => applyFormatting("<u>", "</u>")} title="Sublinhado" className="hover:bg-gray-200">
            <Underline className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <Button size="sm" variant="ghost" onClick={() => applyFormatting("• ")} title="Marcador" className="hover:bg-gray-200">
            <List className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">{editorContent.length} caracteres | {editorContent.split("\n").length} linhas</span>
        </div>

        {/* Editor de Texto */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder="Digite o conteúdo do documento aqui..."
            className="h-full border-gray-300 font-mono text-sm resize-none"
          />
        </div>

        {/* Dialog: Enviar para D4Sign */}
        <Dialog open={showD4SignDialog} onOpenChange={setShowD4SignDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-amber-600" />
                Enviar para Assinatura Digital (D4Sign)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                O documento será enviado para o D4Sign. O signatário receberá um e-mail com o link para assinar eletronicamente.
              </div>
              <div>
                <Label className="text-sm font-semibold">Cofre D4Sign</Label>
                <Select value={d4signSafe} onValueChange={setD4signSafe}>
                  <SelectTrigger className="border-gray-300 mt-1">
                    <SelectValue placeholder="Selecione o cofre..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="e9a2f92f-6e01-43d7-8830-01979cb21cfd">Contratos Pacientes padrão</SelectItem>
                    <SelectItem value="4f0472f9-fe0c-446b-88c7-5a463b3414b5">Termos de Consentimento Dr Wésley</SelectItem>
                    <SelectItem value="5287ea3b-602f-4434-a577-866f09879e35">Cópia de prontuário médico</SelectItem>
                    <SelectItem value="1b2c284d-536a-47b8-8c15-fb6336d73678">Adendos contratuais</SelectItem>
                    <SelectItem value="f7c3e322-a9d6-4c3b-a5e2-7e08d260fbb5">Distratos</SelectItem>
                    <SelectItem value="cb3e7aa4-11cb-4448-8b8a-072f3a6fd6bd">Documentos de terceiros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-semibold">E-mail do Signatário *</Label>
                <Input
                  value={d4signEmail}
                  onChange={(e) => setD4signEmail(e.target.value)}
                  placeholder="paciente@email.com"
                  type="email"
                  className="border-gray-300 mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowD4SignDialog(false)} className="border-gray-300">
                Cancelar
              </Button>
              <Button onClick={handleSendToD4Sign} disabled={sendingToD4Sign} className="btn-gold-gradient">
                {sendingToD4Sign ? (
                  <><span className="animate-spin mr-2">&#9696;</span> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Enviar para Assinatura</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Preview */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Visualização do Documento</DialogTitle>
            </DialogHeader>
            <div className="border border-gray-300 rounded-lg p-8 bg-white">
              <div className="text-center mb-6 pb-4 border-b-2 border-amber-500">
                <h3 className="text-lg font-bold text-gray-900">CLÍNICA GLUTÉE</h3>
                <p className="text-sm text-gray-600">Dr. Wésley de Sousa Câmara - CRM-SP 000000</p>
                <p className="text-sm text-gray-600">Medicina Estética</p>
              </div>
              <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-gray-800">
                {editorContent}
              </div>
              <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
                <p>Clínica Glutée - Mogi Guaçu/SP</p>
                <p>Documento gerado eletronicamente em {new Date().toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Render: Lista de Documentos ──────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentType)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="prescricao" className="flex gap-2">
            <Pill className="h-4 w-4" /> Prescrições
          </TabsTrigger>
          <TabsTrigger value="exame" className="flex gap-2">
            <Stethoscope className="h-4 w-4" /> Exames
          </TabsTrigger>
          <TabsTrigger value="atestado" className="flex gap-2">
            <Award className="h-4 w-4" /> Atestados
          </TabsTrigger>
          <TabsTrigger value="declaracao" className="flex gap-2">
            <FileText className="h-4 w-4" /> Declarações
          </TabsTrigger>
        </TabsList>

        {(["prescricao", "exame", "atestado", "declaracao"] as DocumentType[]).map((docType) => (
          <TabsContent key={docType} value={docType} className="flex-1 flex flex-col gap-4">
            {/* Filtros */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-sm font-semibold text-gray-700 mb-1 block">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por título ou paciente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-gray-300"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700 mb-1 block">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="border-gray-300 w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                    <SelectItem value="enviado_assinatura">Aguardando Assinatura</SelectItem>
                    <SelectItem value="assinado">Assinado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => handleNewDocument()} className="btn-gold-gradient">
                <Plus className="h-4 w-4 mr-2" /> Novo {getTypeConfig(docType).singular}
              </Button>
            </div>

            {/* Lista de Documentos */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-gray-300 bg-white">
              {filteredDocuments.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    {getTypeConfig(docType).icon}
                    <p className="mt-2">Nenhum documento encontrado</p>
                    <p className="text-sm">Clique em "Novo" para criar</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredDocuments.map((doc) => {
                    const statusConfig = getStatusConfig(doc.status);
                    return (
                      <div
                        key={doc.id}
                        onClick={() => handleEditDocument(doc)}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {getTypeConfig(doc.type).icon}
                            <h3 className="font-semibold text-gray-900">{doc.title}</h3>
                          </div>
                          <p className="text-sm text-gray-600">{doc.patientName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{doc.createdAt}</span>
                          <Badge className={`text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                            {statusConfig.icon} {statusConfig.label}
                          </Badge>
                          {doc.d4signKey && (
                            <Badge className="text-xs bg-amber-50 text-amber-700 border border-amber-200">
                              <PenTool className="h-3 w-3 mr-1" /> D4Sign
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modelos Disponíveis */}
            {filteredTemplates.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-300 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Modelos Prontos (clique para usar)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {filteredTemplates.map((template) => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:shadow-lg hover:border-amber-400 transition-all border-gray-300"
                      onClick={() => handleNewDocument(template)}
                    >
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Copy className="h-3 w-3 text-amber-600" />
                          {template.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <p className="text-xs text-gray-600 line-clamp-2">{template.content.substring(0, 80)}...</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
