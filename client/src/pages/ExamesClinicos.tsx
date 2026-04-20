import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { AllergyAlert } from "@/components/AllergyAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, FlaskConical, Loader2, Plus, Search, Sparkles, X } from "lucide-react";

type SelectedExam = {
  code: string;
  name: string;
  description?: string;
  urgency: "rotina" | "urgente" | "emergencia";
};

const URGENCY_LABELS: Record<SelectedExam["urgency"], string> = {
  rotina: "Rotina",
  urgente: "Urgente",
  emergencia: "Emergência",
};

function buildExamRequestContent(exams: SelectedExam[], freeText: string) {
  const catalogSection = exams.map((exam) => `- [${exam.code}] ${exam.name} (${URGENCY_LABELS[exam.urgency]})`).join("\n");
  return [catalogSection, freeText.trim()].filter(Boolean).join("\n\n");
}

export default function ExamesClinicos() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [searchTuss, setSearchTuss] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [specialty, setSpecialty] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [observations, setObservations] = useState("");
  const [freeText, setFreeText] = useState("");
  const [selectedExams, setSelectedExams] = useState<SelectedExam[]>([]);

  const canCreate = ["admin", "medico"].includes((user as any)?.role ?? "user");

  const { data: patientMatches } = trpc.patients.list.useQuery(
    { query: patientSearch || undefined, limit: 12 },
    { enabled: patientSearch.trim().length >= 2 },
  );

  const { data: patient } = trpc.patients.getById.useQuery(
    { id: selectedPatientId ?? 0 },
    { enabled: !!selectedPatientId },
  );

  const { data: examRequests, isLoading: examRequestsLoading, refetch } = trpc.examRequests.getByPatient.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: !!selectedPatientId },
  );

  const { data: templates } = trpc.examRequests.listTemplates.useQuery(undefined, {
    enabled: showCreate,
  });

  const { data: tussResults, isFetching: searchingTuss } = trpc.catalog.searchTuss.useQuery(
    { query: searchTuss || undefined, limit: 60 },
    { enabled: showCreate && searchTuss.trim().length >= 2 },
  );

  const createMutation = trpc.examRequests.create.useMutation({
    onSuccess: async () => {
      toast.success("Pedido de exames salvo.");
      setShowCreate(false);
      setSearchTuss("");
      setShowTemplates(false);
      setSpecialty("");
      setClinicalIndication("");
      setObservations("");
      setFreeText("");
      setSelectedExams([]);
      await refetch();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const saveTemplateMutation = trpc.examRequests.createTemplate.useMutation({
    onSuccess: () => toast.success("Modelo salvo."),
    onError: (error: any) => toast.error(error.message),
  });

  const groupedRequests = useMemo(() => examRequests ?? [], [examRequests]);
  const contentPreview = buildExamRequestContent(selectedExams, freeText);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedPatientId = params.get("patientId");
    const shouldCreate = params.get("create") === "1";

    if (linkedPatientId && /^\d+$/.test(linkedPatientId)) {
      setSelectedPatientId(Number(linkedPatientId));
      if (shouldCreate && canCreate) {
        setShowCreate(true);
      }
    }
  }, [canCreate]);

  useEffect(() => {
    if (patient?.fullName || patient?.name) {
      setSelectedPatientLabel(patient.fullName ?? patient.name ?? "");
    }
  }, [patient]);

  const addExam = (exam: { code: string; name: string; description?: string }) => {
    if (selectedExams.some((item) => item.code === exam.code)) return;
    setSelectedExams((current) => [...current, { ...exam, urgency: "rotina" }]);
  };

  const removeExam = (code: string) => {
    setSelectedExams((current) => current.filter((item) => item.code !== code));
  };

  const updateExamUrgency = (code: string, urgency: SelectedExam["urgency"]) => {
    setSelectedExams((current) => current.map((item) => (item.code === code ? { ...item, urgency } : item)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos de exames</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pesquisa por nome ou código TUSS e histórico dos pedidos já emitidos.
          </p>
        </div>
        {canCreate ? (
          <Button variant="premium" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Novo pedido
          </Button>
        ) : null}
      </div>

      <Card className="card-premium border-border/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Paciente</Label>
            <div className="relative">
              <Input
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Busque por nome do paciente"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {patientSearch.trim().length >= 2 && (patientMatches?.length ?? 0) > 0 ? (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl">
                  {patientMatches?.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                      onClick={() => {
                        setSelectedPatientId(match.id);
                        setSelectedPatientLabel(match.fullName ?? match.name ?? "");
                        setPatientSearch("");
                      }}
                    >
                      <span className="font-medium text-foreground">{match.fullName ?? match.name}</span>
                      <span className="text-xs text-muted-foreground">ID {match.id}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedPatientId
                ? `Paciente selecionado: ${selectedPatientLabel || `ID ${selectedPatientId}`}`
                : "Selecione um paciente para listar e criar pedidos."}
            </p>
          </div>

          {selectedPatientId ? (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPatientId(null);
                setSelectedPatientLabel("");
                setPatientSearch("");
              }}
            >
              Limpar seleção
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {patient?.allergies ? (
        <AllergyAlert allergies={patient.allergies} patientName={patient.fullName} variant="banner" />
      ) : null}

      {!selectedPatientId ? (
        <Card className="card-premium border-dashed border-[#C9A55B]/25">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/35" />
            <p className="text-sm font-semibold text-foreground">Nenhum paciente selecionado</p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Escolha um paciente para consultar pedidos anteriores, imprimir PDFs e gerar novas solicitações com TUSS.
            </p>
          </CardContent>
        </Card>
      ) : examRequestsLoading ? (
        <Card className="card-premium border-border/70">
          <CardContent className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
          </CardContent>
        </Card>
      ) : groupedRequests.length === 0 ? (
        <Card className="card-premium border-dashed border-[#C9A55B]/25">
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <Sparkles className="mb-4 h-12 w-12 text-muted-foreground/35" />
            <p className="text-sm font-semibold text-foreground">Nenhum pedido encontrado</p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Esse paciente ainda não possui pedidos cadastrados no sistema atual.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedRequests.map((request: any) => (
            <Card key={request.id} className="card-premium border-border/70">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">Pedido de exames</CardTitle>
                      {request.specialty ? <Badge variant="outline">{request.specialty}</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  {request.pdfUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={request.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {request.clinicalIndication ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Indicação clínica:</span> {request.clinicalIndication}
                  </p>
                ) : null}
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {request.content || "Sem conteúdo textual disponível."}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo pedido de exames</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-2 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Especialidade</Label>
                  <Input
                    value={specialty}
                    onChange={(event) => setSpecialty(event.target.value)}
                    placeholder="Ex.: Cirurgia plástica"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Indicação clínica</Label>
                  <Input
                    value={clinicalIndication}
                    onChange={(event) => setClinicalIndication(event.target.value)}
                    placeholder="Motivo da solicitação"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Busca TUSS oficial</p>
                    <p className="text-xs text-muted-foreground">
                      Catálogo oficial TUSS 22 com 5.964 itens importados da versão 202601.
                    </p>
                  </div>
                  <Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">
                    Nome ou código
                  </Badge>
                </div>
                <div className="relative">
                  <Input
                    value={searchTuss}
                    onChange={(event) => setSearchTuss(event.target.value)}
                    placeholder="Digite 2 ou mais caracteres para buscar"
                  />
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {searchTuss.trim().length < 2 ? (
                    <p className="text-sm text-muted-foreground">Comece a digitar para pesquisar a tabela TUSS.</p>
                  ) : searchingTuss ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Buscando catálogo oficial...
                    </div>
                  ) : (
                    tussResults?.map((exam) => (
                      <button
                        key={exam.code}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3 text-left transition-colors hover:border-[#C9A55B]/40 hover:bg-[#C9A55B]/6"
                        onClick={() => addExam(exam)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{exam.name}</p>
                          <p className="text-xs text-muted-foreground">TUSS {exam.code}</p>
                        </div>
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A55B]" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Observações adicionais</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplates((value) => !value)}>
                      Modelos
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!contentPreview.trim()) {
                          toast.error("Monte o pedido antes de salvar como modelo.");
                          return;
                        }
                        const name = prompt("Nome do modelo:");
                        if (name) {
                          saveTemplateMutation.mutate({ name, content: contentPreview, specialty: specialty || undefined });
                        }
                      }}
                    >
                      Salvar modelo
                    </Button>
                  </div>
                </div>
                {showTemplates ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {templates?.length ? templates.map((template) => (
                      <Button
                        key={template.id}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setFreeText(template.content ?? "");
                          if (template.specialty) {
                            setSpecialty(template.specialty);
                          }
                          setShowTemplates(false);
                        }}
                      >
                        {template.name}
                      </Button>
                    )) : (
                      <p className="text-xs text-muted-foreground">Nenhum modelo cadastrado ainda.</p>
                    )}
                  </div>
                ) : null}
                <Textarea
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                  placeholder="Adicione orientações, preparo, observações de coleta ou detalhes complementares."
                  rows={6}
                />
                <Textarea
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  placeholder="Observações internas para a clínica"
                  rows={3}
                  className="mt-3"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Selecionados ({selectedExams.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedExams.length ? (
                    <p className="text-sm text-muted-foreground">Nenhum exame selecionado ainda.</p>
                  ) : selectedExams.map((exam) => (
                    <div key={exam.code} className="rounded-2xl border border-border/60 bg-background/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{exam.name}</p>
                          <p className="text-xs text-muted-foreground">TUSS {exam.code}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => removeExam(exam.code)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Select value={exam.urgency} onValueChange={(value: SelectedExam["urgency"]) => updateExamUrgency(exam.code, value)}>
                        <SelectTrigger className="mt-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rotina">Rotina</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                          <SelectItem value="emergencia">Emergência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Prévia do pedido</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap break-words rounded-2xl border border-border/60 bg-background/60 p-4 text-xs leading-6 text-muted-foreground">
                    {contentPreview || "Monte o pedido para visualizar a prévia aqui."}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              variant="premium"
              disabled={createMutation.isPending || !selectedPatientId || !contentPreview.trim()}
              onClick={() => {
                if (!selectedPatientId) {
                  toast.error("Selecione um paciente antes de criar o pedido.");
                  return;
                }
                if (!contentPreview.trim()) {
                  toast.error("Adicione exames ou um texto livre antes de salvar.");
                  return;
                }

                createMutation.mutate({
                  patientId: selectedPatientId,
                  specialty: specialty || undefined,
                  clinicalIndication: clinicalIndication || undefined,
                  observations: observations || undefined,
                  content: contentPreview,
                });
              }}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
