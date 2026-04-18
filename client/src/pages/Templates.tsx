import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FileStack, Plus, Trash2, GripVertical, Copy, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type FieldType = "text" | "textarea" | "radio" | "select" | "multi_select" | "checkbox" | "number" | "date";

interface TemplateField {
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

interface TemplateSection {
  title: string;
  fields: TemplateField[];
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  radio: "Seleção única (radio)",
  select: "Dropdown (select)",
  multi_select: "Seleção múltipla",
  checkbox: "Checkbox (sim/não)",
  number: "Número",
  date: "Data",
};

export default function Templates() {
  const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();
  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => { toast.success("Template criado com sucesso!"); refetch(); setShowCreate(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.templates.remove.useMutation({
    onSuccess: () => { toast.success("Modelo excluído."); refetch(); setPreviewTemplate(null); },
    onError: (err) => toast.error(err.message || "Não foi possível excluir o modelo."),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [form, setForm] = useState({ name: "", specialty: "", description: "" });
  const [sections, setSections] = useState<TemplateSection[]>([
    { title: "Anamnese", fields: [] },
  ]);

  const resetForm = () => {
    setForm({ name: "", specialty: "", description: "" });
    setSections([{ title: "Anamnese", fields: [] }]);
  };

  const addSection = () => {
    setSections([...sections, { title: `Seção ${sections.length + 1}`, fields: [] }]);
  };

  const removeSection = (idx: number) => {
    setSections(sections.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    const s = [...sections];
    s[idx] = { ...s[idx], title };
    setSections(s);
  };

  const addField = (sectionIdx: number) => {
    const s = [...sections];
    s[sectionIdx].fields.push({ label: "", type: "text", options: [], required: false });
    setSections(s);
  };

  const removeField = (sectionIdx: number, fieldIdx: number) => {
    const s = [...sections];
    s[sectionIdx].fields = s[sectionIdx].fields.filter((_, i) => i !== fieldIdx);
    setSections(s);
  };

  const updateField = (sectionIdx: number, fieldIdx: number, updates: Partial<TemplateField>) => {
    const s = [...sections];
    s[sectionIdx].fields[fieldIdx] = { ...s[sectionIdx].fields[fieldIdx], ...updates };
    setSections(s);
  };

  const handleCreate = () => {
    if (!form.name.trim()) { toast.error("Nome do template é obrigatório."); return; }
    if (sections.some(s => s.fields.length === 0)) { toast.error("Todas as seções devem ter pelo menos um campo."); return; }
    createMutation.mutate({ ...form, sections });
  };

  // Pré-carregar template de exemplo: Exame Físico Genital Feminino (CFM)
  const loadExampleTemplate = () => {
    setForm({ name: "Exame Físico Genital Feminino", specialty: "Estética Íntima", description: "Template para exame físico genital feminino conforme protocolo CFM. Requer chaperone obrigatório." });
    setSections([
      {
        title: "Anamnese",
        fields: [
          { label: "Queixa Principal", type: "textarea", required: true, placeholder: "Descreva a queixa principal da paciente" },
          { label: "Histórico de Procedimentos Anteriores", type: "textarea", required: false, placeholder: "Procedimentos estéticos anteriores na região" },
          { label: "Uso de Medicamentos", type: "textarea", required: false, placeholder: "Medicamentos em uso" },
          { label: "Alergias", type: "text", required: true, placeholder: "Alergias conhecidas" },
        ],
      },
      {
        title: "Exame Físico",
        fields: [
          { label: "Hipercromia", type: "radio", options: ["Severa", "Moderada", "Leve", "Sem hipercromia"], required: true },
          { label: "Flacidez", type: "radio", options: ["Severa", "Moderada", "Leve", "Sem flacidez"], required: true },
          { label: "Assimetria Labial", type: "radio", options: ["Severa", "Moderada", "Leve", "Sem assimetria"], required: true },
          { label: "Ressecamento", type: "radio", options: ["Severo", "Moderado", "Leve", "Sem ressecamento"], required: true },
          { label: "Áreas Afetadas", type: "multi_select", options: ["Grandes lábios", "Pequenos lábios", "Monte de Vênus", "Região perianal", "Virilha"], required: true },
          { label: "Observações Adicionais", type: "textarea", required: false, placeholder: "Observações do exame físico" },
        ],
      },
      {
        title: "Conduta",
        fields: [
          { label: "Procedimento Indicado", type: "select", options: ["Peeling íntimo", "Laser CO2", "Radiofrequência", "Preenchimento", "Ninfoplastia", "Outro"], required: true },
          { label: "Número de Sessões Estimado", type: "number", required: false, placeholder: "Ex: 3" },
          { label: "Intervalo entre Sessões (dias)", type: "number", required: false, placeholder: "Ex: 30" },
          { label: "Plano de Tratamento", type: "textarea", required: true, placeholder: "Descreva o plano de tratamento completo" },
        ],
      },
    ]);
    toast.success("Template de exemplo carregado! Ajuste conforme necessário.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileStack className="h-6 w-6 text-primary" />
            Templates de Prontuário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modelos pré-prontos para preenchimento rápido (radio buttons, dropdowns, seleção múltipla)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadExampleTemplate}>
            <Copy className="h-4 w-4 mr-2" />
            Carregar Exemplo CFM
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Template de Prontuário</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Nome do Template *</Label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Exame Físico Genital Feminino" />
                  </div>
                  <div>
                    <Label>Especialidade</Label>
                    <Input value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Ex: Estética Íntima" />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descrição breve" />
                  </div>
                </div>

                {/* Seções */}
                {sections.map((section, sIdx) => (
                  <Card key={sIdx} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Input value={section.title} onChange={e => updateSectionTitle(sIdx, e.target.value)} className="font-semibold text-base border-0 p-0 h-auto focus-visible:ring-0" />
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => addField(sIdx)}><Plus className="h-3 w-3" /></Button>
                          {sections.length > 1 && <Button variant="ghost" size="sm" onClick={() => removeSection(sIdx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {section.fields.map((field, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2 p-3 rounded-lg bg-muted/40">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                            <Input value={field.label} onChange={e => updateField(sIdx, fIdx, { label: e.target.value })} placeholder="Nome do campo" />
                            <Select value={field.type} onValueChange={(v: FieldType) => updateField(sIdx, fIdx, { type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {["radio", "select", "multi_select"].includes(field.type) && (
                              <Input
                                value={(field.options ?? []).join(", ")}
                                onChange={e => updateField(sIdx, fIdx, { options: e.target.value.split(",").map(o => o.trim()).filter(Boolean) })}
                                placeholder="Opções (separadas por vírgula)"
                                className="md:col-span-2"
                              />
                            )}
                            {!["radio", "select", "multi_select"].includes(field.type) && (
                              <Input value={field.placeholder ?? ""} onChange={e => updateField(sIdx, fIdx, { placeholder: e.target.value })} placeholder="Placeholder" />
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              <input type="checkbox" checked={field.required ?? false} onChange={e => updateField(sIdx, fIdx, { required: e.target.checked })} className="rounded" />
                              Obrig.
                            </label>
                            <Button variant="ghost" size="sm" onClick={() => removeField(sIdx, fIdx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </div>
                      ))}
                      {section.fields.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Clique em + para adicionar campos a esta seção.</p>
                      )}
                    </CardContent>
                  </Card>
                ))}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={addSection}><Plus className="h-4 w-4 mr-2" />Adicionar Seção</Button>
                  <div className="flex-1" />
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Template"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Lista de Templates */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><p className="text-muted-foreground">Carregando templates...</p></div>
      ) : !templates || templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileStack className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum template criado ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Crie templates para agilizar o preenchimento de prontuários.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t: any) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow cursor-pointer relative group" onClick={() => setPreviewTemplate(t)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    {t.isDefault && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Excluir o modelo "${t.name}"? Esta ação não poderá ser desfeita.`)) {
                          deleteMutation.mutate({ id: Number(t.id) });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      title="Excluir modelo"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {t.specialty && <p className="text-xs text-muted-foreground">{t.specialty}</p>}
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{t.description ?? "Sem descrição"}</p>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="outline" className="text-xs">{(t.sections as any[])?.length ?? 0} seções</Badge>
                  <Badge variant="outline" className="text-xs">
                    {(t.sections as any[])?.reduce((acc: number, s: any) => acc + (s.fields?.length ?? 0), 0) ?? 0} campos
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Preview: {previewTemplate.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(previewTemplate.sections as TemplateSection[])?.map((section, sIdx) => (
                <Card key={sIdx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {section.fields.map((field, fIdx) => (
                      <div key={fIdx}>
                        <Label className="text-sm">{field.label} {field.required && <span className="text-destructive">*</span>}</Label>
                        {field.type === "text" && <Input placeholder={field.placeholder} disabled />}
                        {field.type === "textarea" && <Textarea placeholder={field.placeholder} disabled />}
                        {field.type === "number" && <Input type="number" placeholder={field.placeholder} disabled />}
                        {field.type === "date" && <Input type="date" disabled />}
                        {field.type === "checkbox" && (
                          <div className="flex items-center gap-2 mt-1">
                            <input type="checkbox" disabled className="rounded" />
                            <span className="text-sm text-muted-foreground">{field.label}</span>
                          </div>
                        )}
                        {field.type === "radio" && (
                          <div className="flex flex-wrap gap-3 mt-1">
                            {field.options?.map(opt => (
                              <label key={opt} className="flex items-center gap-1.5 text-sm">
                                <input type="radio" name={`preview-${sIdx}-${fIdx}`} disabled className="accent-primary" />
                                {opt}
                              </label>
                            ))}
                          </div>
                        )}
                        {field.type === "select" && (
                          <Select disabled>
                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>
                              {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {field.type === "multi_select" && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {field.options?.map(opt => (
                              <label key={opt} className="flex items-center gap-1.5 text-sm">
                                <input type="checkbox" disabled className="rounded" />
                                {opt}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
