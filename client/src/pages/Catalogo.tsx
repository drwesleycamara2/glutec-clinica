import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, Plus, Settings, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function Catalogo() {
  const { data: procedures, isLoading, refetch } = trpc.catalog.listProcedures.useQuery();
  const { data: paymentPlans, refetch: refetchPlans } = trpc.catalog.listPaymentPlans.useQuery();

  const createProcMutation = trpc.catalog.createProcedure.useMutation({
    onSuccess: () => { toast.success("Procedimento criado!"); refetch(); setShowCreateProc(false); },
    onError: (err) => toast.error(err.message),
  });
  const createAreaMutation = trpc.catalog.createArea.useMutation({
    onSuccess: () => { toast.success("Área adicionada!"); refetch(); },
  });
  const upsertPriceMutation = trpc.catalog.upsertPricing.useMutation({
    onSuccess: () => { toast.success("Preço salvo!"); },
  });
  const createPlanMutation = trpc.catalog.createPaymentPlan.useMutation({
    onSuccess: () => { toast.success("Plano de pagamento criado!"); refetchPlans(); setShowCreatePlan(false); },
  });

  const [showCreateProc, setShowCreateProc] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showPricing, setShowPricing] = useState<number | null>(null);
  const [procForm, setProcForm] = useState({ name: "", category: "", description: "", estimatedSessionsMin: 1, estimatedSessionsMax: 3, sessionIntervalDays: 30 });
  const [areaName, setAreaName] = useState("");
  const [planForm, setPlanForm] = useState({ name: "", type: "a_vista" as any, discountPercent: "", maxInstallments: 1, interestRatePercent: "", description: "", sortOrder: 0 });

  // Pricing state
  const [priceProcId, setPriceProcId] = useState(0);
  const [priceAreaId, setPriceAreaId] = useState(0);
  const [priceComplexity, setPriceComplexity] = useState<"P" | "M" | "G">("P");
  const [priceValue, setPriceValue] = useState("");

  const { data: selectedProcDetail } = trpc.catalog.getProcedure.useQuery(
    { id: showPricing! },
    { enabled: !!showPricing }
  );

  const handleCreateProc = () => {
    if (!procForm.name.trim()) { toast.error("Nome é obrigatório."); return; }
    createProcMutation.mutate(procForm);
  };

  const handleAddArea = (procedureId: number) => {
    if (!areaName.trim()) return;
    createAreaMutation.mutate({ procedureId, areaName: areaName.trim() });
    setAreaName("");
  };

  const handleSavePrice = () => {
    if (!priceProcId || !priceAreaId || !priceValue) { toast.error("Preencha todos os campos."); return; }
    upsertPriceMutation.mutate({
      procedureId: priceProcId,
      areaId: priceAreaId,
      complexity: priceComplexity,
      priceInCents: Math.round(parseFloat(priceValue) * 100),
    });
  };

  const loadMiniLipoExample = () => {
    setProcForm({
      name: "Mini Lipo",
      category: "Cirurgia Estética",
      description: "Lipoaspiração de pequenas áreas com anestesia local",
      estimatedSessionsMin: 1,
      estimatedSessionsMax: 1,
      sessionIntervalDays: 0,
    });
    toast.success("Exemplo Mini Lipo carregado! Após criar, adicione as áreas: Abdome, Costas, Cintura, Outra.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            Catálogo de Procedimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure procedimentos, áreas, complexidades e preços para o motor de orçamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreatePlan(true)}>
            <DollarSign className="h-4 w-4 mr-2" />Planos de Pagamento
          </Button>
          <Dialog open={showCreateProc} onOpenChange={setShowCreateProc}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Procedimento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Procedimento</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={loadMiniLipoExample} className="w-full">Carregar Exemplo: Mini Lipo</Button>
                <div><Label>Nome *</Label><Input value={procForm.name} onChange={e => setProcForm({ ...procForm, name: e.target.value })} /></div>
                <div><Label>Categoria</Label><Input value={procForm.category} onChange={e => setProcForm({ ...procForm, category: e.target.value })} /></div>
                <div><Label>Descrição</Label><Input value={procForm.description} onChange={e => setProcForm({ ...procForm, description: e.target.value })} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Sessões Mín.</Label><Input type="number" value={procForm.estimatedSessionsMin} onChange={e => setProcForm({ ...procForm, estimatedSessionsMin: parseInt(e.target.value) || 1 })} /></div>
                  <div><Label>Sessões Máx.</Label><Input type="number" value={procForm.estimatedSessionsMax} onChange={e => setProcForm({ ...procForm, estimatedSessionsMax: parseInt(e.target.value) || 1 })} /></div>
                  <div><Label>Intervalo (dias)</Label><Input type="number" value={procForm.sessionIntervalDays} onChange={e => setProcForm({ ...procForm, sessionIntervalDays: parseInt(e.target.value) || 0 })} /></div>
                </div>
                <Button onClick={handleCreateProc} disabled={createProcMutation.isPending} className="w-full">Criar Procedimento</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Planos de Pagamento Dialog */}
      <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Planos de Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {paymentPlans && paymentPlans.length > 0 && (
              <div className="space-y-2">
                {paymentPlans.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    <div className="flex gap-2">
                      {p.discountPercent && parseFloat(p.discountPercent) > 0 && <Badge variant="secondary">-{p.discountPercent}%</Badge>}
                      {p.maxInstallments && p.maxInstallments > 1 && <Badge variant="outline">até {p.maxInstallments}x</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <hr />
            <p className="text-sm font-medium">Novo Plano de Pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Ex: PIX à vista" /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={planForm.type} onValueChange={v => setPlanForm({ ...planForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À Vista</SelectItem>
                    <SelectItem value="parcelado_sem_juros">Parcelado s/ Juros</SelectItem>
                    <SelectItem value="parcelado_com_juros">Parcelado c/ Juros</SelectItem>
                    <SelectItem value="financiamento">Financiamento</SelectItem>
                    <SelectItem value="pagamento_programado">Pagamento Programado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Desconto (%)</Label><Input value={planForm.discountPercent} onChange={e => setPlanForm({ ...planForm, discountPercent: e.target.value })} placeholder="Ex: 5" /></div>
              <div><Label>Máx. Parcelas</Label><Input type="number" value={planForm.maxInstallments} onChange={e => setPlanForm({ ...planForm, maxInstallments: parseInt(e.target.value) || 1 })} /></div>
              <div><Label>Taxa de Juros (%)</Label><Input value={planForm.interestRatePercent} onChange={e => setPlanForm({ ...planForm, interestRatePercent: e.target.value })} placeholder="Ex: 2.5" /></div>
              <div><Label>Descrição</Label><Input value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} /></div>
            </div>
            <Button onClick={() => createPlanMutation.mutate(planForm)} disabled={createPlanMutation.isPending} className="w-full">Criar Plano</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lista de Procedimentos */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : !procedures || procedures.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum procedimento cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {procedures.map((proc: any) => (
            <Card key={proc.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{proc.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{proc.category} | {proc.estimatedSessionsMin}-{proc.estimatedSessionsMax} sessões | Intervalo: {proc.sessionIntervalDays} dias</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowPricing(showPricing === proc.id ? null : proc.id)}>
                    <Settings className="h-3 w-3 mr-1" />Configurar Áreas e Preços
                  </Button>
                </div>
              </CardHeader>
              {showPricing === proc.id && selectedProcDetail && (
                <CardContent className="space-y-3 border-t pt-3">
                  {/* Áreas existentes */}
                  <div>
                    <p className="text-sm font-medium mb-2">Áreas cadastradas:</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {selectedProcDetail.areas?.map((a: any) => (
                        <Badge key={a.id} variant="secondary">{a.areaName}</Badge>
                      ))}
                      {(!selectedProcDetail.areas || selectedProcDetail.areas.length === 0) && (
                        <p className="text-xs text-muted-foreground">Nenhuma área cadastrada.</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input value={areaName} onChange={e => setAreaName(e.target.value)} placeholder="Nova área (ex: Abdome)" className="max-w-xs" />
                      <Button variant="outline" size="sm" onClick={() => handleAddArea(proc.id)}>Adicionar Área</Button>
                    </div>
                  </div>

                  {/* Tabela de Preços */}
                  {selectedProcDetail.areas && selectedProcDetail.areas.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Tabela de Preços:</p>
                      <table className="w-full text-sm border">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="p-2 text-left">Área</th>
                            <th className="p-2 text-center">P (Pequeno)</th>
                            <th className="p-2 text-center">M (Médio)</th>
                            <th className="p-2 text-center">G (Grande)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProcDetail.areas.map((area: any) => (
                            <tr key={area.id} className="border-t">
                              <td className="p-2 font-medium">{area.areaName}</td>
                              {(["P", "M", "G"] as const).map(complexity => {
                                const existing = selectedProcDetail.pricing?.find((p: any) => p.areaId === area.id && p.complexity === complexity);
                                return (
                                  <td key={complexity} className="p-2 text-center">
                                    {existing ? (
                                      <span className="text-primary font-medium">{formatCurrency(existing.priceInCents)}</span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">Não definido</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Definir preço */}
                      <div className="flex gap-2 mt-3 items-end">
                        <div>
                          <Label className="text-xs">Área</Label>
                          <Select value={priceAreaId.toString()} onValueChange={v => { setPriceAreaId(parseInt(v)); setPriceProcId(proc.id); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="Área" /></SelectTrigger>
                            <SelectContent>
                              {selectedProcDetail.areas.map((a: any) => (
                                <SelectItem key={a.id} value={a.id.toString()}>{a.areaName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Complexidade</Label>
                          <Select value={priceComplexity} onValueChange={v => setPriceComplexity(v as any)}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="P">P</SelectItem>
                              <SelectItem value="M">M</SelectItem>
                              <SelectItem value="G">G</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Valor (R$)</Label>
                          <Input value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="3500.00" className="w-32" type="number" step="0.01" />
                        </div>
                        <Button size="sm" onClick={handleSavePrice} disabled={upsertPriceMutation.isPending}>Salvar Preço</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
