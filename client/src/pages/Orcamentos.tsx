import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { patientDisplayName } from "@/lib/patientDisplay";
import {
  Calculator,
  Check,
  CreditCard,
  DollarSign,
  FileDown,
  FileText,
  Mail,
  Plus,
  Receipt,
  Send,
  Trash2,
  AlertTriangle,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppSendButton } from "@/components/WhatsAppSendButton";

interface BudgetItemDraft {
  procedureId: number;
  procedureName: string;
  areaId: number;
  areaName: string;
  complexity: "P" | "M" | "G";
  unitPriceInCents: number;
  quantity: number;
}

const COMPLEXITY_LABELS: Record<string, string> = {
  P: "Pequeno (P)",
  M: "Medio (M)",
  G: "Grande (G)",
};

const BUDGET_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

const BUDGET_STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  enviado: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  aprovado: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  recusado: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  cancelado: "bg-zinc-200 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

const NFSE_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho fiscal",
  aguardando: "Aguardando emissão",
  autorizada: "NFS-e autorizada",
  erro: "Falha na emissão",
  cancelada: "Cancelada",
  substituida: "Substituída",
};

const NFSE_STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  aguardando: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  autorizada: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  erro: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  cancelada: "bg-zinc-200 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  substituida: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  boleto: "Boleto",
  transferencia: "Transferencia bancaria",
  financiamento: "Financiamento",
  outro: "Outro",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildPaymentLabel(method: string, details?: string | null) {
  const base = PAYMENT_LABELS[method] ?? method.replace(/_/g, " ");
  return details?.trim() ? `${base} ${details.trim()}` : base;
}

export default function Orcamentos() {
  const { data: budgetsList, isLoading: loadingBudgets, refetch } =
    trpc.budgets.list.useQuery(undefined as any);
  const { data: procedures } = trpc.catalog.listProcedures.useQuery();
  const { data: paymentPlans } = trpc.catalog.listPaymentPlans.useQuery();
  const { data: fiscalSettings } = trpc.fiscal.get.useQuery();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 5000 });

  const [showCreate, setShowCreate] = useState(false);
  const [showNfseDialog, setShowNfseDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [items, setItems] = useState<BudgetItemDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [competenceDate, setCompetenceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [fiscalEnvironment, setFiscalEnvironment] = useState<
    "homologacao" | "producao"
  >("homologacao");
  const [selectedProcedureId, setSelectedProcedureId] = useState<number | null>(
    null,
  );
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedPatientId = params.get("patientId");
    const shouldCreate = params.get("create") === "1";

    if (linkedPatientId && /^\d+$/.test(linkedPatientId)) {
      setPatientId(linkedPatientId);
      if (shouldCreate) {
        setShowCreate(true);
      }
    }
  }, []);
  const [selectedComplexity, setSelectedComplexity] = useState<
    "P" | "M" | "G" | null
  >(null);

  const { data: procedureAreas } = trpc.catalog.getAreas.useQuery(
    { procedureId: selectedProcedureId! },
    { enabled: !!selectedProcedureId },
  );
  const { data: priceData } = trpc.catalog.getPrice.useQuery(
    {
      procedureId: selectedProcedureId!,
      areaId: selectedAreaId!,
      complexity: selectedComplexity!,
    },
    { enabled: !!selectedProcedureId && !!selectedAreaId && !!selectedComplexity },
  );

  const createMutation = trpc.budgets.create.useMutation({
    onSuccess: () => {
      toast.success("Orçamento criado com sucesso.");
      refetch();
      setShowCreate(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const emitMutation = trpc.budgets.emit.useMutation({
    onSuccess: () => {
      toast.success("Orçamento enviado para aprovação.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.budgets.approve.useMutation({
    onSuccess: () => {
      toast.success("Orçamento aprovado.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const emitNfseMutation = trpc.budgets.emitNfse.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "NFS-e processada com sucesso.");
      refetch();
      setShowNfseDialog(false);
      setSelectedBudget(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const filteredPatients = useMemo(() => {
    const normalized = patientSearch.trim().toLowerCase();
    if (!patients || !normalized) return [];

    return patients
      .filter((patient: any) => {
        const name = String(patient.name ?? "").toLowerCase();
        const cpf = String(patient.cpf ?? "");
        return name.includes(normalized) || cpf.includes(normalized);
      })
      .slice(0, 8);
  }, [patients, patientSearch]);

  const selectedPatient = useMemo(
    () => patients?.find((patient: any) => Number(patient.id) === Number(patientId)),
    [patients, patientId],
  );

  const totalInCents = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPriceInCents * item.quantity, 0),
    [items],
  );

  const fiscalReady = Boolean(
    fiscalSettings?.cnpj &&
      fiscalSettings?.codigoTributacaoNacional &&
      fiscalSettings?.descricaoServicoPadrao &&
      fiscalSettings?.certificadoConfigurado,
  );

  function resetForm() {
    setPatientId("");
    setPatientSearch("");
    setClinicalNotes("");
    setItems([]);
    setSelectedProcedureId(null);
    setSelectedAreaId(null);
    setSelectedComplexity(null);
  }

  function selectPatient(patient: any) {
    setPatientId(String(patient.id));
    setPatientSearch(patientDisplayName(patient));
  }

  function addItem() {
    if (!selectedProcedureId || !selectedAreaId || !selectedComplexity) {
      toast.error("Selecione procedimento, area e complexidade.");
      return;
    }

    const procedure = procedures?.find(
      (entry: any) => Number(entry.id) === Number(selectedProcedureId),
    );
    const area = procedureAreas?.find(
      (entry: any) => Number(entry.id) === Number(selectedAreaId),
    );
    const price = Number(priceData?.priceInCents || 0);

    if (!procedure || !area || !price) {
      toast.error("Não foi possível resolver o valor deste procedimento.");
      return;
    }

    setItems((current) => [
      ...current,
      {
        procedureId: selectedProcedureId,
        procedureName: procedure.name,
        areaId: selectedAreaId,
        areaName: area.areaName,
        complexity: selectedComplexity,
        unitPriceInCents: price,
        quantity: 1,
      },
    ]);

    setSelectedAreaId(null);
    setSelectedComplexity(null);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleCreate() {
    if (!patientId || items.length === 0) {
      toast.error("Informe o paciente e adicione pelo menos um procedimento.");
      return;
    }

    createMutation.mutate({
      patientId: Number(patientId),
      clinicalNotes,
      items: items.map((item) => ({
        procedureId: item.procedureId,
        areaId: item.areaId,
        complexity: item.complexity,
        quantity: item.quantity,
      })),
    });
  }

  function openBudgetNfseDialog(budget: any) {
    setSelectedBudget(budget);
    setPaymentMethod(budget?.latestNfse?.formaPagamento || "pix");
    setPaymentDetails(budget?.latestNfse?.detalhesPagamento || "");
    setCompetenceDate(budget?.date || new Date().toISOString().slice(0, 10));
    setFiscalEnvironment(
      budget?.latestNfse?.ambiente ||
        (fiscalSettings?.ambiente === "producao" ? "producao" : "homologacao"),
    );
    setShowNfseDialog(true);
  }

  function handleEmitBudgetNfse() {
    if (!selectedBudget) return;

    emitNfseMutation.mutate({
      budgetId: selectedBudget.id,
      formaPagamento: paymentMethod as any,
      detalhesPagamento: paymentDetails || undefined,
      dataCompetencia: competenceDate,
      ambiente: fiscalEnvironment,
    });
  }

  function getInvoiceLink(budget: any) {
    return budget?.latestNfse?.pdfUrl || budget?.latestNfse?.linkNfse || "";
  }

  function openInvoiceLink(budget: any) {
    const link = getInvoiceLink(budget);
    if (!link) {
      toast.error("A nota ainda não possui link disponível.");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  }

  function sendInvoiceByWhatsapp(budget: any) {
    const link = getInvoiceLink(budget);
    const phone = digitsOnly(budget?.patientPhone);

    if (!link) {
      toast.error("A nota ainda não possui link disponível.");
      return;
    }

    if (!phone) {
      toast.error("O paciente não possui telefone cadastrado.");
      return;
    }

    const waPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const text = encodeURIComponent(
      `Olá, ${budget.patientName}. Segue sua NFS-e: ${link}`,
    );

    window.open(`https://wa.me/${waPhone}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function sendInvoiceByEmail(budget: any) {
    const link = getInvoiceLink(budget);
    const email = String(budget?.patientEmail ?? "").trim();

    if (!link) {
      toast.error("A nota ainda não possui link disponível.");
      return;
    }

    if (!email) {
      toast.error("O paciente não possui e-mail cadastrado.");
      return;
    }

    const subject = encodeURIComponent("Sua NFS-e - Glutec");
    const body = encodeURIComponent(
      `Olá, ${budget.patientName}.\n\nSegue o link da sua nota fiscal de serviço:\n${link}\n\nAtenciosamente,\nGlutec`,
    );

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Calculator className="h-6 w-6 text-primary" />
            Motor de Orçamentos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orçamentos com aprovação, integração fiscal e acompanhamento da NFS-e.
          </p>
        </div>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo orçamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar orçamento</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Paciente</Label>
                  <Input
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="Busque por nome ou CPF"
                  />
                  {filteredPatients.length > 0 && (
                    <div className="rounded-lg border bg-background p-1">
                      {filteredPatients.map((patient: any) => (
                        <button
                          key={patient.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => selectPatient(patient)}
                        >
                          <span>{patientDisplayName(patient)}</span>
                          <span className="text-xs text-muted-foreground">
                            {patient.cpf || `ID ${patient.id}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedPatient && (
                    <p className="text-xs text-muted-foreground">
                      Selecionado: {patientDisplayName(selectedPatient)} {selectedPatient.cpf ? `- ${selectedPatient.cpf}` : ""}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Observacoes clinicas</Label>
                  <Input
                    value={clinicalNotes}
                    onChange={(event) => setClinicalNotes(event.target.value)}
                    placeholder="Observacoes do atendimento ou do plano"
                  />
                </div>
              </div>

              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Selecao em cascata de procedimento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Procedimento</Label>
                      <Select
                        value={selectedProcedureId ? String(selectedProcedureId) : undefined}
                        onValueChange={(value) => {
                          setSelectedProcedureId(Number(value));
                          setSelectedAreaId(null);
                          setSelectedComplexity(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {procedures?.map((procedure: any) => (
                            <SelectItem key={procedure.id} value={String(procedure.id)}>
                              {procedure.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Area</Label>
                      <Select
                        value={selectedAreaId ? String(selectedAreaId) : undefined}
                        onValueChange={(value) => {
                          setSelectedAreaId(Number(value));
                          setSelectedComplexity(null);
                        }}
                        disabled={!selectedProcedureId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              selectedProcedureId
                                ? "Selecione a area"
                                : "Escolha o procedimento antes"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {procedureAreas?.map((area: any) => (
                            <SelectItem key={area.id} value={String(area.id)}>
                              {area.areaName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Complexidade</Label>
                      <Select
                        value={selectedComplexity ?? undefined}
                        onValueChange={(value) =>
                          setSelectedComplexity(value as "P" | "M" | "G")
                        }
                        disabled={!selectedAreaId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              selectedAreaId ? "P / M / G" : "Selecione a area antes"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="P">Pequeno (P)</SelectItem>
                          <SelectItem value="M">Medio (M)</SelectItem>
                          <SelectItem value="G">Grande (G)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <Button
                        className="w-full"
                        onClick={addItem}
                        disabled={!selectedProcedureId || !selectedAreaId || !selectedComplexity}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                        {priceData ? (
                          <span className="ml-2 text-xs">
                            {formatCurrency(Number(priceData.priceInCents || 0))}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {items.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Itens do orçamento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2">Procedimento</th>
                            <th className="pb-2">Area</th>
                            <th className="pb-2">Complexidade</th>
                            <th className="pb-2 text-right">Valor unitario</th>
                            <th className="pb-2 text-center">Qtd</th>
                            <th className="pb-2 text-right">Subtotal</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => (
                            <tr key={`${item.procedureId}-${item.areaId}-${index}`} className="border-b">
                              <td className="py-2 font-medium">{item.procedureName}</td>
                              <td className="py-2">{item.areaName}</td>
                              <td className="py-2">
                                <Badge variant="outline">
                                  {COMPLEXITY_LABELS[item.complexity]}
                                </Badge>
                              </td>
                              <td className="py-2 text-right">
                                {formatCurrency(item.unitPriceInCents)}
                              </td>
                              <td className="py-2 text-center">
                                <Input
                                  type="number"
                                  min={1}
                                  className="mx-auto w-16 text-center"
                                  value={item.quantity}
                                  onChange={(event) => {
                                    const quantity = Math.max(
                                      1,
                                      Number(event.target.value || 1),
                                    );
                                    setItems((current) =>
                                      current.map((currentItem, currentIndex) =>
                                        currentIndex === index
                                          ? { ...currentItem, quantity }
                                          : currentItem,
                                      ),
                                    );
                                  }}
                                />
                              </td>
                              <td className="py-2 text-right font-semibold">
                                {formatCurrency(item.unitPriceInCents * item.quantity)}
                              </td>
                              <td className="py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeItem(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end">
                      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Total do investimento
                        </p>
                        <p className="text-xl font-semibold text-primary">
                          {formatCurrency(totalInCents)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {items.length > 0 && paymentPlans && paymentPlans.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Condicoes de pagamento disponiveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      {paymentPlans.map((plan: any) => {
                        const discount = Number(plan.discountPercent || 0);
                        const interest = Number(plan.interestRatePercent || 0);
                        const finalValue =
                          discount > 0
                            ? totalInCents * (1 - discount / 100)
                            : interest > 0
                              ? totalInCents * (1 + interest / 100)
                              : totalInCents;

                        return (
                          <div key={plan.id} className="rounded-lg border bg-muted/30 p-3">
                            <p className="font-medium">{plan.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {plan.description}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-primary">
                              {formatCurrency(Math.round(finalValue))}
                            </p>
                            {plan.maxInstallments && plan.maxInstallments > 1 ? (
                              <p className="text-xs text-muted-foreground">
                                ate {plan.maxInstallments}x de{" "}
                                {formatCurrency(
                                  Math.round(finalValue / Number(plan.maxInstallments)),
                                )}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreate(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || items.length === 0}
                >
                  {createMutation.isPending
                    ? "Criando..."
                    : `Criar orçamento (${formatCurrency(totalInCents)})`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!fiscalReady ? (
        <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-300" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                A configuração fiscal ainda precisa de confirmação final.
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                A emissão do orçamento pode seguir, mas a NFS-e só deve ir para produção
                depois de confirmar certificado, dados do prestador e parâmetros municipais.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={showNfseDialog} onOpenChange={setShowNfseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e do orçamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="border-primary/20">
              <CardContent className="space-y-2 pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Orcamento
                    </p>
                    <p className="font-semibold">
                      #{selectedBudget?.id} - {selectedBudget?.patientName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Valor
                    </p>
                    <p className="font-semibold text-primary">
                      {formatCurrency(Number(selectedBudget?.totalInCents || 0))}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Descrição padrão: {fiscalSettings?.descricaoServicoPadrao || "Referente a procedimentos médicos ambulatoriais."}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Detalhes da forma de pagamento</Label>
                <Input
                  value={paymentDetails}
                  onChange={(event) => setPaymentDetails(event.target.value)}
                  placeholder="Ex.: parcelado em 3x, via Multibank"
                />
              </div>

              <div className="space-y-2">
                <Label>Data de competência</Label>
                <Input
                  type="date"
                  value={competenceDate}
                  onChange={(event) => setCompetenceDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Ambiente fiscal</Label>
                <Select
                  value={fiscalEnvironment}
                  onValueChange={(value) =>
                    setFiscalEnvironment(value as "homologacao" | "producao")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4 text-primary" />
                  Prévia da descrição fiscal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{fiscalSettings?.descricaoServicoPadrao || "Referente a procedimentos médicos ambulatoriais."}</p>
                <p>
                  Forma de Pagamento: {buildPaymentLabel(paymentMethod, paymentDetails)}
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {fiscalSettings?.textoLegalFixo ||
                    "Não sujeito à retenção da seguridade social, conforme art. 31 da Lei 8.212/91, OS/INSS 209/99, IN/INSS-DC 100/03 e IN 971/09, art. 120, inciso III. Os serviços acima descritos foram prestados pessoalmente pelo(s) sócio(s) e sem o concurso de empregados ou outros contribuintes individuais."}
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNfseDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEmitBudgetNfse} disabled={emitNfseMutation.isPending}>
                {emitNfseMutation.isPending ? "Emitindo..." : "Emitir NFS-e"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {loadingBudgets ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-muted-foreground">Carregando orçamentos...</p>
        </div>
      ) : !budgetsList || budgetsList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calculator className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nenhum orçamento criado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {budgetsList.map((budget: any) => {
            const latestNfse = budget.latestNfse;
            const hasAuthorizedNfse = latestNfse?.status === "autorizada";
            const hasNfseError = latestNfse?.status === "erro";
            const hasPendingNfse =
              latestNfse?.status === "rascunho" || latestNfse?.status === "aguardando";
            const canRequestNfse =
              budget.status === "aprovado" && latestNfse?.status !== "autorizada";

            return (
              <Card key={budget.id} className="overflow-hidden border shadow-sm">
                <CardContent className="space-y-4 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-5 w-5 text-primary/70" />
                        <h3 className="text-lg font-semibold">Orçamento #{budget.id}</h3>
                        <Badge className={BUDGET_STATUS_COLORS[budget.status] ?? ""}>
                          {BUDGET_STATUS_LABELS[budget.status] ?? budget.status}
                        </Badge>
                        {latestNfse ? (
                          <Badge className={NFSE_STATUS_COLORS[latestNfse.status] ?? ""}>
                            {NFSE_STATUS_LABELS[latestNfse.status] ?? latestNfse.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sem NFS-e</Badge>
                        )}
                      </div>

                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        <p>
                          <span className="font-medium text-foreground">Paciente:</span>{" "}
                          {budget.patientName}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Data:</span>{" "}
                          {budget.date
                            ? new Date(`${budget.date}T12:00:00`).toLocaleDateString("pt-BR")
                            : "-"}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Titulo:</span>{" "}
                          {budget.title || "Plano personalizado"}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Valor:</span>{" "}
                          {formatCurrency(Number(budget.totalInCents || 0))}
                        </p>
                      </div>

                      {Array.isArray(budget.items) && budget.items.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {budget.items.slice(0, 4).map((item: any, index: number) => (
                            <Badge key={`${budget.id}-${index}`} variant="outline">
                              {item.procedureName} - {item.areaName}
                            </Badge>
                          ))}
                          {budget.items.length > 4 ? (
                            <Badge variant="outline">+{budget.items.length - 4} itens</Badge>
                          ) : null}
                        </div>
                      ) : null}

                      {budget.notes ? (
                        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          {budget.notes}
                        </p>
                      ) : null}

                      {hasNfseError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-950/50 dark:bg-rose-950/20 dark:text-rose-200">
                          <p className="font-medium">Falha na emissão da NFS-e</p>
                          <p>{latestNfse?.erroMensagem || "A API nacional retornou um erro."}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-[260px] flex-col gap-2">
                      {budget.status === "rascunho" ? (
                        <Button
                          variant="outline"
                          onClick={() => emitMutation.mutate({ budgetId: budget.id })}
                          disabled={emitMutation.isPending}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Enviar para aprovacao
                        </Button>
                      ) : null}

                      <WhatsAppSendButton
                        documentType="orcamento"
                        documentId={budget.id}
                        defaultPhone={budget.patientPhone ?? ""}
                        label="Enviar Orçamento via WhatsApp"
                      />

                      {budget.status === "enviado" ? (
                        <Button
                          onClick={() => approveMutation.mutate({ budgetId: budget.id })}
                          disabled={approveMutation.isPending}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Aprovar orcamento
                        </Button>
                      ) : null}

                      {canRequestNfse ? (
                        <Button
                          className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                          onClick={() => openBudgetNfseDialog(budget)}
                        >
                          <Receipt className="mr-2 h-4 w-4" />
                          {hasPendingNfse ? "Reprocessar NFS-e" : "Emitir NFS-e"}
                        </Button>
                      ) : null}

                      {hasAuthorizedNfse ? (
                        <Button
                          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
                          onClick={() => openInvoiceLink(budget)}
                        >
                          <Receipt className="mr-2 h-4 w-4" />
                          NFS-e emitida
                        </Button>
                      ) : null}

                      {hasAuthorizedNfse ? (
                        <>
                          <Button variant="outline" onClick={() => openInvoiceLink(budget)}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Baixar nota
                          </Button>
                          <WhatsAppSendButton
                            documentType="nfse"
                            documentId={budget.latestNfse?.id ?? 0}
                            defaultPhone={budget.patientPhone ?? ""}
                            label="Enviar NFS-e via WhatsApp"
                          />
                          <Button variant="outline" onClick={() => sendInvoiceByEmail(budget)}>
                            <Mail className="mr-2 h-4 w-4" />
                            Enviar por e-mail
                          </Button>
                        </>
                      ) : null}
                    </div>
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

