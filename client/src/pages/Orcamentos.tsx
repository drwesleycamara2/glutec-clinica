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
import { Calculator, Plus, Trash2, FileText, Check, X, DollarSign, CreditCard, Clock } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

interface BudgetItemDraft {
  procedureId: number;
  procedureName: string;
  areaId: number;
  areaName: string;
  complexity: "P" | "M" | "G";
  unitPriceInCents: number;
  quantity: number;
}

const COMPLEXITY_LABELS: Record<string, string> = { P: "Pequeno (P)", M: "Médio (M)", G: "Grande (G)" };

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function Orcamentos() {
  const { data: budgetsList, isLoading: loadingBudgets, refetch } = trpc.budgets.list.useQuery({});
  const { data: procedures } = trpc.catalog.listProcedures.useQuery();
  const { data: paymentPlans } = trpc.catalog.listPaymentPlans.useQuery();

  const createMutation = trpc.budgets.create.useMutation({
    onSuccess: () => { toast.success("Orçamento criado com sucesso!"); refetch(); setShowCreate(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const emitMutation = trpc.budgets.emit.useMutation({
    onSuccess: () => { toast.success("Orçamento emitido!"); refetch(); },
  });
  const approveMutation = trpc.budgets.approve.useMutation({
    onSuccess: () => { toast.success("Orçamento aprovado!"); refetch(); },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [patientId, setPatientId] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [items, setItems] = useState<BudgetItemDraft[]>([]);

  // Cascata state
  const [selectedProcedureId, setSelectedProcedureId] = useState<number | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [selectedComplexity, setSelectedComplexity] = useState<"P" | "M" | "G" | null>(null);

  const { data: procedureAreas } = trpc.catalog.getAreas.useQuery(
    { procedureId: selectedProcedureId! },
    { enabled: !!selectedProcedureId }
  );
  const { data: priceData } = trpc.catalog.getPrice.useQuery(
    { procedureId: selectedProcedureId!, areaId: selectedAreaId!, complexity: selectedComplexity! },
    { enabled: !!selectedProcedureId && !!selectedAreaId && !!selectedComplexity }
  );

  const resetForm = () => {
    setPatientId("");
    setClinicalNotes("");
    setItems([]);
    setSelectedProcedureId(null);
    setSelectedAreaId(null);
    setSelectedComplexity(null);
  };

  const addItem = () => {
    if (!selectedProcedureId || !selectedAreaId || !selectedComplexity) {
      toast.error("Selecione procedimento, área e complexidade.");
      return;
    }
    const proc = procedures?.find((p: any) => p.id === selectedProcedureId);
    const area = procedureAreas?.find((a: any) => a.id === selectedAreaId);
    const price = priceData?.priceInCents ?? 0;

    if (!proc || !area) return;

    setItems([...items, {
      procedureId: selectedProcedureId,
      procedureName: proc.name,
      areaId: selectedAreaId,
      areaName: area.areaName,
      complexity: selectedComplexity,
      unitPriceInCents: price,
      quantity: 1,
    }]);

    // Reset cascata para próximo item
    setSelectedAreaId(null);
    setSelectedComplexity(null);
    toast.success(`${proc.name} - ${area.areaName} (${selectedComplexity}) adicionado!`);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const totalInCents = useMemo(() => items.reduce((sum, i) => sum + i.unitPriceInCents * i.quantity, 0), [items]);

  const handleCreate = () => {
    if (!patientId || items.length === 0) {
      toast.error("Informe o paciente e adicione pelo menos um procedimento.");
      return;
    }
    createMutation.mutate({ patientId: parseInt(patientId), clinicalNotes, items });
  };

  const STATUS_COLORS: Record<string, string> = {
    rascunho: "bg-gray-100 text-gray-700",
    emitido: "bg-[#C9A55B]/10 text-[#8A6526]",
    aprovado: "bg-[#C9A55B]/15 text-[#6B5B2A]",
    rejeitado: "bg-[#2F2F2F]/10 text-[#2F2F2F]",
    expirado: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Motor de Orçamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Orçamentos com cascata condicional, auto-soma e protocolo terapêutico (CDC Art. 40)
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Orçamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Orçamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Paciente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ID do Paciente *</Label>
                  <Input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="ID do paciente" type="number" />
                </div>
                <div>
                  <Label>Notas Clínicas</Label>
                  <Input value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} placeholder="Observações clínicas" />
                </div>
              </div>

              {/* Cascata: Procedimento > Área > Complexidade */}
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Seleção em Cascata (Procedimento → Área → Complexidade)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {/* Nível 1: Procedimento */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Nível 1 - Procedimento</Label>
                      <Select
                        value={selectedProcedureId?.toString() ?? ""}
                        onValueChange={v => { setSelectedProcedureId(parseInt(v)); setSelectedAreaId(null); setSelectedComplexity(null); }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {procedures?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Nível 2: Área */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Nível 2 - Área</Label>
                      <Select
                        value={selectedAreaId?.toString() ?? ""}
                        onValueChange={v => { setSelectedAreaId(parseInt(v)); setSelectedComplexity(null); }}
                        disabled={!selectedProcedureId}
                      >
                        <SelectTrigger><SelectValue placeholder={selectedProcedureId ? "Selecione a área..." : "Selecione o procedimento primeiro"} /></SelectTrigger>
                        <SelectContent>
                          {procedureAreas?.map((a: any) => (
                            <SelectItem key={a.id} value={a.id.toString()}>{a.areaName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Nível 3: Complexidade */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Nível 3 - Complexidade</Label>
                      <Select
                        value={selectedComplexity ?? ""}
                        onValueChange={v => setSelectedComplexity(v as "P" | "M" | "G")}
                        disabled={!selectedAreaId}
                      >
                        <SelectTrigger><SelectValue placeholder={selectedAreaId ? "P / M / G" : "Selecione a área primeiro"} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="P">Pequeno (P)</SelectItem>
                          <SelectItem value="M">Médio (M)</SelectItem>
                          <SelectItem value="G">Grande (G)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <Button onClick={addItem} disabled={!selectedProcedureId || !selectedAreaId || !selectedComplexity} className="w-full">
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                        {priceData && <span className="ml-1 text-xs">({formatCurrency(priceData.priceInCents)})</span>}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Itens do Orçamento */}
              {items.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Itens do Orçamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2">Procedimento</th>
                          <th className="pb-2">Área</th>
                          <th className="pb-2">Tamanho</th>
                          <th className="pb-2 text-right">Valor Unit.</th>
                          <th className="pb-2 text-center">Qtd</th>
                          <th className="pb-2 text-right">Subtotal</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 font-medium">{item.procedureName}</td>
                            <td className="py-2">{item.areaName}</td>
                            <td className="py-2"><Badge variant="outline">{item.complexity}</Badge></td>
                            <td className="py-2 text-right">{formatCurrency(item.unitPriceInCents)}</td>
                            <td className="py-2 text-center">
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={e => {
                                  const newItems = [...items];
                                  newItems[idx] = { ...newItems[idx], quantity: parseInt(e.target.value) || 1 };
                                  setItems(newItems);
                                }}
                                className="w-16 text-center mx-auto"
                              />
                            </td>
                            <td className="py-2 text-right font-semibold">{formatCurrency(item.unitPriceInCents * item.quantity)}</td>
                            <td className="py-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td colSpan={5} className="py-3 text-right text-base">TOTAL DO INVESTIMENTO:</td>
                          <td className="py-3 text-right text-base text-primary">{formatCurrency(totalInCents)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Condições de Pagamento (preview) */}
              {items.length > 0 && paymentPlans && paymentPlans.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Condições de Pagamento Disponíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {paymentPlans.map((plan: any) => {
                        const discount = plan.discountPercent ? parseFloat(plan.discountPercent) : 0;
                        const interest = plan.interestRatePercent ? parseFloat(plan.interestRatePercent) : 0;
                        const finalValue = discount > 0
                          ? totalInCents * (1 - discount / 100)
                          : interest > 0
                            ? totalInCents * (1 + interest / 100)
                            : totalInCents;
                        return (
                          <div key={plan.id} className="p-3 rounded-lg border bg-muted/30">
                            <p className="font-medium text-sm">{plan.name}</p>
                            <p className="text-xs text-muted-foreground">{plan.description}</p>
                            <p className="text-sm font-semibold mt-1 text-primary">
                              {formatCurrency(finalValue)}
                              {discount > 0 && <span className="text-[#8A6526] ml-1">(-{discount}%)</span>}
                              {interest > 0 && <span className="text-[#6B6B6B] ml-1">(+{interest}% juros)</span>}
                            </p>
                            {plan.maxInstallments && plan.maxInstallments > 1 && (
                              <p className="text-xs text-muted-foreground">
                                até {plan.maxInstallments}x de {formatCurrency(finalValue / plan.maxInstallments)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || items.length === 0}>
                  {createMutation.isPending ? "Criando..." : `Criar Orçamento (${formatCurrency(totalInCents)})`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de Orçamentos */}
      {loadingBudgets ? (
        <div className="flex items-center justify-center h-32"><p className="text-muted-foreground">Carregando...</p></div>
      ) : !budgetsList || budgetsList.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calculator className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum orçamento criado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgetsList.map((b: any) => (
            <Card key={b.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <FileText className="h-8 w-8 text-primary/50" />
                  <div>
                    <p className="font-medium">Orçamento #{b.id}</p>
                    <p className="text-xs text-muted-foreground">Paciente #{b.patientId} | Criado em {new Date(b.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-primary">{formatCurrency(b.totalInCents)}</p>
                  <Badge className={STATUS_COLORS[b.status] ?? ""}>{b.status}</Badge>
                  <div className="flex gap-1">
                    {b.status === "rascunho" && (
                      <Button size="sm" variant="outline" onClick={() => emitMutation.mutate({ id: b.id })}>
                        Emitir
                      </Button>
                    )}
                    {b.status === "emitido" && (
                      <>
                        <Button size="sm" variant="default" onClick={() => approveMutation.mutate({ id: b.id })}>
                          <Check className="h-3 w-3 mr-1" />Aprovar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
