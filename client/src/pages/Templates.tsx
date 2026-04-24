
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileStack, FolderOpen, PencilLine, Plus, Save, ScrollText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TemplateGroup = "anamnese" | "evolucao" | "atestado" | "declaracao" | "prescricao" | "solicitacao_exames";

const TEMPLATE_GROUPS: Array<{ value: TemplateGroup; label: string; description: string }> = [
  { value: "anamnese", label: "Anamnese", description: "Modelos de anamnese e formulários clínicos." },
  { value: "evolucao", label: "Evolução", description: "Modelos para consultas, retornos e evolução clínica." },
  { value: "atestado", label: "Atestado médico", description: "Atestados médicos e documentos semelhantes." },
  { value: "declaracao", label: "Declaração", description: "Declarações de comparecimento e documentos administrativos." },
  { value: "prescricao", label: "Prescrição", description: "Modelos de receituário simples, antimicrobiano e controle especial." },
  { value: "solicitacao_exames", label: "Solicitação de exames", description: "Pedidos de exames e guias de solicitação." },
];

const GROUP_LABELS = Object.fromEntries(TEMPLATE_GROUPS.map(group => [group.value, group.label])) as Record<TemplateGroup, string>;

function repairMojibake(value?: string | null) {
  let text = String(value ?? "");
  if (!text) return "";
  if (!(/[\u00c3\u00c2\uFFFD]/.test(text) || /\u00e2[\u0080-\u00bf]/.test(text))) return text;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const bytes = Uint8Array.from(Array.from(text).map(char => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (!decoded || decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }

  return text.replace(/\uFFFD/g, "").trim();
}

function normalizeGroup(value?: string | null): TemplateGroup {
  const normalized = repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (normalized.includes("anamn")) return "anamnese";
  if (normalized.includes("evolu") || normalized.includes("consulta") || normalized.includes("prontuario")) return "evolucao";
  if (normalized.includes("declar")) return "declaracao";
  if (normalized.includes("prescr")) return "prescricao";
  if (normalized.includes("solicitacao") || normalized.includes("pedido de exame") || normalized.includes("exame")) return "solicitacao_exames";
  return "atestado";
}

function stripHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTemplateContent(template: any) {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const content = sections
    .map((section: any) => {
      if (typeof section?.content === "string" && section.content.trim()) return section.content;
      if (typeof section?.text === "string" && section.text.trim()) return section.text;
      const fields = Array.isArray(section?.fields) ? section.fields : [];
      return fields.map((field: any) => field?.label).filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  return content || String(template?.content ?? "");
}

function buildSections(group: TemplateGroup, content: string) {
  return [
    {
      title: GROUP_LABELS[group],
      type: "richtext",
      content,
      fields: [],
    },
  ];
}

function buildDefaultContent(group: TemplateGroup) {
  switch (group) {
    case "anamnese":
      return [
        "<p><strong>Queixa principal:</strong></p>",
        "<p></p>",
        "<p><strong>História atual:</strong></p>",
        "<p></p>",
        "<p><strong>Antecedentes:</strong></p>",
        "<p></p>",
      ].join("");
    case "evolucao":
      return [
        "<p><strong>Queixa principal:</strong></p>",
        "<p></p>",
        "<p><strong>Exame físico:</strong></p>",
        "<p></p>",
        "<p><strong>Conduta:</strong></p>",
        "<p></p>",
      ].join("");
    case "declaracao":
      return [
        "<p><strong>DECLARAÇÃO</strong></p>",
        "<p></p>",
        "<p>Declaro, para os devidos fins, que [PACIENTE] esteve em atendimento nesta data.</p>",
      ].join("");
    case "prescricao":
      return [
        "<p><strong>USO ORAL</strong></p>",
        "<p></p>",
        "<p>1. Medicamento / dose / posologia</p>",
      ].join("");
    case "solicitacao_exames":
      return [
        "<p><strong>SOLICITAÇÃO DE EXAMES</strong></p>",
        "<p></p>",
        "<p>Solicito a realização dos seguintes exames:</p>",
        "<p></p>",
      ].join("");
    case "atestado":
    default:
      return [
        "<p><strong>ATESTADO MÉDICO</strong></p>",
        "<p></p>",
        "<p>Atesto, para os devidos fins, que [PACIENTE] esteve em atendimento nesta data.</p>",
      ].join("");
  }
}

export default function Templates() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialGroup = normalizeGroup(searchParams.get("group") || "atestado");
  const returnTo = searchParams.get("returnTo") || "";

  const { data: templates, isLoading } = trpc.templates.list.useQuery();
  const createMutation = trpc.templates.create.useMutation({
    onSuccess: async () => {
      toast.success("Modelo salvo com sucesso.");
      await utils.templates.list.invalidate();
    },
    onError: err => toast.error(err.message || "Não foi possível salvar o modelo."),
  });
  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: async () => {
      toast.success("Modelo atualizado com sucesso.");
      await utils.templates.list.invalidate();
    },
    onError: err => toast.error(err.message || "Não foi possível atualizar o modelo."),
  });
  const deleteMutation = trpc.templates.remove.useMutation({
    onSuccess: async () => {
      toast.success("Modelo excluído.");
      await utils.templates.list.invalidate();
    },
    onError: err => toast.error(err.message || "Não foi possível excluir o modelo."),
  });

  const [selectedGroup, setSelectedGroup] = useState<TemplateGroup>(initialGroup);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    group: initialGroup,
    description: "",
    content: buildDefaultContent(initialGroup),
  });

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");

    return (templates ?? [])
      .map((template: any) => ({
        ...template,
        group: normalizeGroup(template?.group || template?.specialty || template?.name),
      }))
      .filter((template: any) => template.group === selectedGroup)
      .filter((template: any) => {
        if (!normalizedSearch) return true;
        const haystack = [template?.name, template?.description, template?.content]
          .map(value => stripHtml(repairMojibake(value)))
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("pt-BR");
        return haystack.includes(normalizedSearch);
      })
      .sort((a: any, b: any) => repairMojibake(a.name).localeCompare(repairMojibake(b.name), "pt-BR"));
  }, [search, selectedGroup, templates]);

  useEffect(() => {
    setForm(current => {
      if (current.group === selectedGroup && current.name && selectedTemplateId !== null) return current;
      return {
        name: current.group === selectedGroup && current.name ? current.name : "",
        group: selectedGroup,
        description: current.group === selectedGroup && current.description ? current.description : "",
        content: current.group === selectedGroup && current.content ? current.content : buildDefaultContent(selectedGroup),
      };
    });

    if (selectedTemplateId !== null) {
      const selected = (templates ?? []).find((template: any) => Number(template.id) === selectedTemplateId);
      if (selected && normalizeGroup(selected?.group || selected?.specialty || selected?.name) !== selectedGroup) {
        setSelectedTemplateId(null);
      }
    }
  }, [selectedGroup, selectedTemplateId, templates]);

  const startNewTemplate = (group: TemplateGroup = selectedGroup) => {
    setSelectedTemplateId(null);
    setSelectedGroup(group);
    setForm({
      name: "",
      group,
      description: "",
      content: buildDefaultContent(group),
    });
  };

  const handleSelectTemplate = (template: any) => {
    const group = normalizeGroup(template?.group || template?.specialty || template?.name);
    setSelectedTemplateId(Number(template.id));
    setSelectedGroup(group);
    setForm({
      name: repairMojibake(template?.name),
      group,
      description: repairMojibake(template?.description),
      content: extractTemplateContent(template) || buildDefaultContent(group),
    });
  };

  const handleSave = () => {
    const name = form.name.trim();
    const content = form.content.trim();
    if (!name) {
      toast.error("Informe um nome para o modelo.");
      return;
    }
    if (!stripHtml(content)) {
      toast.error("Digite o conteúdo do modelo antes de salvar.");
      return;
    }

    const payload = {
      name,
      group: form.group,
      specialty: GROUP_LABELS[form.group],
      description: form.description.trim() || undefined,
      sections: buildSections(form.group, content),
    };

    if (selectedTemplateId) {
      updateMutation.mutate({ id: selectedTemplateId, ...payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const handleDelete = () => {
    if (!selectedTemplateId) return;
    if (!window.confirm(`Excluir o modelo \"${form.name || "sem nome"}\"? Esta ação não poderá ser desfeita.`)) {
      return;
    }
    deleteMutation.mutate({ id: selectedTemplateId }, {
      onSuccess: () => {
        startNewTemplate(form.group);
      },
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const selectedGroupMeta = TEMPLATE_GROUPS.find(group => group.value === selectedGroup) ?? TEMPLATE_GROUPS[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileStack className="h-6 w-6 text-primary" />
            Modelos clínicos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Organize modelos de anamnese, evolução, atestados, declarações, prescrições e solicitações de exames em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {returnTo ? (
            <Button variant="outline" onClick={() => setLocation(returnTo)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => startNewTemplate(selectedGroup)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo modelo
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/60">
          <CardHeader className="space-y-4">
            <div className="space-y-1">
              <CardTitle className="text-base">Biblioteca de modelos</CardTitle>
              <p className="text-sm text-muted-foreground">{selectedGroupMeta.description}</p>
            </div>

            <div className="space-y-2">
              <Label>Grupo</Label>
              <Select value={selectedGroup} onValueChange={(value: TemplateGroup) => setSelectedGroup(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_GROUPS.map(group => (
                    <SelectItem key={group.value} value={group.value}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Pesquisar modelo"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Carregando modelos...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
                <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum modelo salvo neste grupo.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTemplates.map((template: any) => {
                  const preview = stripHtml(extractTemplateContent(template));
                  const isSelected = Number(template.id) === selectedTemplateId;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full rounded-lg border p-4 text-left transition ${
                        isSelected
                          ? "border-[#C9A55B] bg-[#C9A55B]/10 shadow-sm"
                          : "border-border/60 bg-background hover:border-[#C9A55B]/50 hover:bg-[#C9A55B]/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{repairMojibake(template.name) || "Modelo sem nome"}</p>
                          <Badge variant="outline" className="mt-2 text-[10px]">
                            {GROUP_LABELS[normalizeGroup(template?.group || template?.specialty || template?.name)]}
                          </Badge>
                        </div>
                        {template.isDefault ? <Badge variant="secondary">Padrão</Badge> : null}
                      </div>
                      {template.description ? (
                        <p className="mt-3 text-xs text-muted-foreground">{repairMojibake(template.description)}</p>
                      ) : null}
                      {preview ? (
                        <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{preview}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScrollText className="h-4 w-4 text-[#C9A55B]" />
                  {selectedTemplateId ? "Editar modelo" : "Criar modelo"}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Monte o texto do modelo, ajuste quando quiser e salve no grupo correto.
                </p>
              </div>
              <Badge variant="outline">{GROUP_LABELS[form.group]}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do modelo</Label>
                <Input
                  value={form.name}
                  onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Atestado de comparecimento"
                />
              </div>
              <div className="space-y-2">
                <Label>Grupo do modelo</Label>
                <Select
                  value={form.group}
                  onValueChange={(value: TemplateGroup) => {
                    setSelectedGroup(value);
                    setForm(current => ({
                      ...current,
                      group: value,
                      content: selectedTemplateId ? current.content : buildDefaultContent(value),
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_GROUPS.map(group => (
                      <SelectItem key={group.value} value={group.value}>
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observação interna</Label>
              <Input
                value={form.description}
                onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                placeholder="Ex.: usar em consulta de retorno"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <RichTextEditor
              value={form.content}
              onChange={content => setForm(current => ({ ...current, content }))}
              placeholder="Digite o conteúdo do modelo..."
              minHeight="420px"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <PencilLine className="h-3.5 w-3.5" />
                {selectedTemplateId ? "Você está editando um modelo já salvo." : "Este conteúdo será salvo como um novo modelo."}
              </div>
              <div>{stripHtml(form.content).length} caracteres no texto</div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {selectedTemplateId ? (
                <Button type="button" variant="outline" onClick={() => startNewTemplate(form.group)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo modelo
                </Button>
              ) : null}
              {selectedTemplateId ? (
                <Button type="button" variant="outline" onClick={handleDelete} disabled={deleteMutation.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              ) : null}
              <Button type="button" className="btn-glossy-gold" onClick={handleSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvando..." : selectedTemplateId ? "Atualizar modelo" : "Salvar modelo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
