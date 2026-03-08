import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bold, Italic, Underline, List, Save, Download, FileText, Trash2 } from "lucide-react";

interface DocumentEditorProps {
  title?: string;
  content?: string;
  type: "prescricao" | "exame" | "atestado";
  onSave?: (content: string, title: string) => void;
  templates?: Array<{ id: number; name: string; content: string }>;
  onLoadTemplate?: (templateId: number) => void;
}

export function DocumentEditor({
  title = "",
  content = "",
  type,
  onSave,
  templates = [],
  onLoadTemplate,
}: DocumentEditorProps) {
  const [docTitle, setDocTitle] = useState(title);
  const [docContent, setDocContent] = useState(content);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormatting = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = docContent.substring(start, end);
    const newContent =
      docContent.substring(0, start) +
      before +
      selectedText +
      after +
      docContent.substring(end);

    setDocContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const handleLoadTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id.toString() === templateId);
    if (template) {
      setDocContent(template.content);
      onLoadTemplate?.(template.id);
    }
  };

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      toast.error("Digite um nome para o modelo");
      return;
    }
    // Aqui você chamaria a API para salvar o modelo
    toast.success(`Modelo "${templateName}" salvo com sucesso!`);
    setShowSaveTemplate(false);
    setTemplateName("");
  };

  const handleSave = () => {
    if (!docTitle.trim()) {
      toast.error("Digite um título para o documento");
      return;
    }
    onSave?.(docContent, docTitle);
    toast.success("Documento salvo com sucesso!");
  };

  const getTypeLabel = () => {
    switch (type) {
      case "prescricao":
        return "Prescrição";
      case "exame":
        return "Pedido de Exame";
      case "atestado":
        return "Atestado";
      default:
        return "Documento";
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 bg-white rounded-lg border border-gray-300 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{getTypeLabel()}</h2>
          <p className="text-sm text-gray-600">Edite o documento em texto livre</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-gray-300">
            <Download className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
          <Button onClick={handleSave} className="btn-gold-gradient">
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
        </div>
      </div>

      {/* Título */}
      <div>
        <Label className="text-sm font-semibold text-gray-700 mb-1 block">Título do Documento</Label>
        <Input
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          placeholder="Ex: Prescrição - João Silva"
          className="border-gray-300"
        />
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div>
          <Label className="text-sm font-semibold text-gray-700 mb-1 block">Carregar Modelo</Label>
          <Select value={selectedTemplate} onValueChange={handleLoadTemplate}>
            <SelectTrigger className="border-gray-300">
              <SelectValue placeholder="Selecione um modelo..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id.toString()}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-1 p-2 bg-gray-100 rounded-lg border border-gray-300 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => applyFormatting("**", "**")}
          title="Negrito"
          className="hover:bg-gray-200"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => applyFormatting("_", "_")}
          title="Itálico"
          className="hover:bg-gray-200"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => applyFormatting("<u>", "</u>")}
          title="Sublinhado"
          className="hover:bg-gray-200"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <div className="w-px bg-gray-300 mx-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => applyFormatting("• ")}
          title="Marcador"
          className="hover:bg-gray-200"
        >
          <List className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowSaveTemplate(true)}
          title="Salvar como Modelo"
          className="hover:bg-gray-200"
        >
          <FileText className="h-4 w-4 mr-1" />
          Salvar Modelo
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <Label className="text-sm font-semibold text-gray-700 mb-1">Conteúdo</Label>
        <Textarea
          ref={textareaRef}
          value={docContent}
          onChange={(e) => setDocContent(e.target.value)}
          placeholder="Digite o conteúdo do documento aqui..."
          className="flex-1 border-gray-300 font-mono text-sm resize-none"
        />
      </div>

      {/* Info */}
      <div className="text-xs text-gray-600 flex justify-between">
        <span>{docContent.length} caracteres</span>
        <span>{docContent.split("\n").length} linhas</span>
      </div>

      {/* Dialog para salvar modelo */}
      <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar como Modelo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Nome do Modelo</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ex: Prescrição Padrão"
                className="border-gray-300 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveTemplate(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveAsTemplate} className="btn-gold-gradient">
              Salvar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
