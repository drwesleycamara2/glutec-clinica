import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Package, Plus, Search, AlertTriangle, Loader2, Save, Edit2, Trash2,
  TrendingDown, Calendar, DollarSign, ArrowDown, ArrowUp, RotateCcw,
} from "lucide-react";

const CATEGORIES = [
  "Anestésicos", "Cânulas", "Seringas e Agulhas", "Fios de Sutura",
  "Bioestimuladores", "Toxina Botulínica", "Ácido Hialurônico",
  "Medicamentos", "Materiais Descartáveis", "Soluções", "Outros",
];

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function daysUntilExpiry(date: string | null | undefined) {
  if (!date) return 9999;
  const diff = new Date(date).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Estoque() {
  const { data: products, isLoading, refetch } = trpc.inventory.listProducts.useQuery();
  const { data: lowStockItems } = trpc.inventory.getLowStock.useQuery();

  const createProductMutation = trpc.inventory.createProduct.useMutation({
    onSuccess: () => { toast.success("Produto cadastrado!"); refetch(); setShowCreate(false); resetForm(); },
    onError: (err: any) => toast.error(err.message),
  });
  const createMovementMutation = trpc.inventory.createMovement.useMutation({
    onSuccess: () => { toast.success("Movimentação registrada!"); refetch(); setShowMovement(false); },
    onError: (err: any) => toast.error(err.message),
  });

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAlert, setFilterAlert] = useState<"all" | "low" | "expiring">("all");
  const [sortBy, setSortBy] = useState<"name" | "quantity" | "expiry">("name");
  const [showCreate, setShowCreate] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    name: "", sku: "", brand: "", size: "", category: "Outros",
    description: "", unit: "unidade", currentStock: 0, minimumStock: 5,
    costPriceInCents: 0, supplierName: "", supplierContact: "",
    expirationDate: "",
  });
  const [movForm, setMovForm] = useState({ type: "entrada" as "entrada" | "saida" | "ajuste", quantity: 1, reason: "" });

  const resetForm = () => setForm({
    name: "", sku: "", brand: "", size: "", category: "Outros",
    description: "", unit: "unidade", currentStock: 0, minimumStock: 5,
    costPriceInCents: 0, supplierName: "", supplierContact: "",
    expirationDate: "",
  });

  // Stats
  const stats = useMemo(() => {
    if (!products) return { total: 0, lowCount: 0, expiringCount: 0, totalValue: 0 };
    const low = products.filter((p: any) => p.currentStock <= p.minimumStock);
    const expiring = products.filter((p: any) => {
      const d = daysUntilExpiry(p.expirationDate);
      return d <= 90 && d > 0;
    });
    const totalValue = products.reduce((sum: number, p: any) => sum + (p.costPriceInCents * p.currentStock), 0);
    return { total: products.length, lowCount: low.length, expiringCount: expiring.length, totalValue };
  }, [products]);

  // Filter & sort
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = [...products] as any[];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(s) || (p.brand || "").toLowerCase().includes(s) || (p.supplierName || "").toLowerCase().includes(s) || (p.sku || "").includes(s));
    }
    if (filterCategory !== "all") result = result.filter((p) => p.category === filterCategory);
    if (filterAlert === "low") result = result.filter((p) => p.currentStock <= p.minimumStock);
    if (filterAlert === "expiring") result = result.filter((p) => daysUntilExpiry(p.expirationDate) <= 90);

    result.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "quantity") return a.currentStock - b.currentStock;
      return daysUntilExpiry(a.expirationDate) - daysUntilExpiry(b.expirationDate);
    });
    return result;
  }, [products, search, filterCategory, filterAlert, sortBy]);

  const openEdit = (p: any) => {
    setEditMode(true);
    setForm({
      name: p.name, sku: p.sku || "", brand: p.brand || "", size: p.size || "",
      category: p.category || "Outros", description: p.description || "",
      unit: p.unit || "unidade", currentStock: p.currentStock,
      minimumStock: p.minimumStock, costPriceInCents: p.costPriceInCents,
      supplierName: p.supplierName || "", supplierContact: p.supplierContact || "",
      expirationDate: p.expirationDate || "",
    });
    setSelectedProductId(p.id);
    setShowCreate(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Controle de Estoque</h1>
          <p className="text-sm text-muted-foreground mt-1">{stats.total} produto(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => { setEditMode(false); resetForm(); setShowCreate(true); }} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
          <Plus className="h-4 w-4 mr-2" />Novo Produto
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-[#C9A55B]" /><span className="text-xs text-muted-foreground">Total de Itens</span></div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-[#C9A55B]" /><span className="text-xs text-muted-foreground">Valor em Estoque</span></div>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 ${stats.lowCount > 0 ? "border-[#6B6B6B]/50 bg-[#6B6B6B]/5" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-[#6B6B6B]" /><span className="text-xs text-muted-foreground">Estoque Baixo</span></div>
            <p className={`text-2xl font-bold ${stats.lowCount > 0 ? "text-[#6B6B6B]" : ""}`}>{stats.lowCount}</p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 ${stats.expiringCount > 0 ? "border-[#C9A55B]/50 bg-[#C9A55B]/5" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Calendar className="h-4 w-4 text-[#C9A55B]" /><span className="text-xs text-muted-foreground">Vencendo em 90 dias</span></div>
            <p className={`text-2xl font-bold ${stats.expiringCount > 0 ? "text-[#C9A55B]" : ""}`}>{stats.expiringCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alert banner */}
      {lowStockItems && lowStockItems.length > 0 && (
        <Card className="border-[#6B6B6B]/50 bg-[#6B6B6B]/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[#6B6B6B] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#6B6B6B]">Atenção: Produtos com estoque abaixo do mínimo!</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {lowStockItems.map((item: any) => (
                    <Badge key={item.id} className="bg-[#6B6B6B]/10 text-[#6B6B6B] border-[#6B6B6B]/30 text-xs cursor-pointer hover:bg-[#6B6B6B]/50/20" onClick={() => openEdit(item)}>
                      {item.name} ({item.currentStock}/{item.minimumStock})
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-[#6B6B6B]/70 mt-2">Clique em um produto para editar ou providenciar reposição.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por produto, marca ou fornecedor..." className="pl-10" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAlert} onValueChange={(v: any) => setFilterAlert(v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Filtrar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="low">Estoque baixo</SelectItem>
            <SelectItem value="expiring">Vencendo em breve</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome</SelectItem>
            <SelectItem value="quantity">Quantidade</SelectItem>
            <SelectItem value="expiry">Validade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" /></div>
      ) : !products || products.length === 0 ? (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Produto</th>
                  <th className="px-3 py-2.5 text-left font-medium">Marca</th>
                  <th className="px-3 py-2.5 text-left font-medium">Tamanho</th>
                  <th className="px-3 py-2.5 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-2.5 text-right font-medium">Preço Compra</th>
                  <th className="px-3 py-2.5 text-center font-medium">Qtd</th>
                  <th className="px-3 py-2.5 text-center font-medium">Mín.</th>
                  <th className="px-3 py-2.5 text-left font-medium">Validade</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((item: any) => {
                  const isLow = item.currentStock <= item.minimumStock;
                  const daysExp = daysUntilExpiry(item.expirationDate);
                  const isExpiring = daysExp <= 90 && daysExp > 0;
                  const isExpired = daysExp <= 0;

                  return (
                    <tr key={item.id} className={`border-t border-border/30 text-sm transition-colors ${isLow ? "bg-[#6B6B6B]/5" : isExpired ? "bg-[#C9A55B]/5" : "hover:bg-muted/30"}`}>
                      <td className="px-3 py-2.5">
                        <div><p className="font-medium text-xs">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.category} {item.sku ? `| ${item.sku}` : ""}</p></div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{item.brand || "—"}</td>
                      <td className="px-3 py-2.5 text-xs">{item.size || item.unit || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.supplierName || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-mono">{formatCurrency(item.costPriceInCents)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold ${isLow ? "text-[#6B6B6B]" : ""}`}>{item.currentStock}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{item.minimumStock}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.expirationDate ? (
                          <span className={isExpired ? "text-[#6B6B6B] font-medium" : isExpiring ? "text-[#C9A55B]" : "text-muted-foreground"}>
                            {new Date(item.expirationDate).toLocaleDateString("pt-BR")}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isExpired ? (
                          <Badge className="bg-[#6B6B6B]/10 text-[#6B6B6B] border-[#6B6B6B]/30 text-[10px]">Vencido</Badge>
                        ) : isLow ? (
                          <Badge className="bg-[#6B6B6B]/10 text-[#6B6B6B] border-[#6B6B6B]/30 text-[10px]">Repor!</Badge>
                        ) : isExpiring ? (
                          <Badge className="bg-[#C9A55B]/10 text-[#C9A55B] border-[#C9A55B]/30 text-[10px]">Vencendo</Badge>
                        ) : (
                          <Badge className="bg-[#C9A55B]/10 text-[#C9A55B] border-emerald-500/30 text-[10px]">OK</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setSelectedProductId(item.id); setShowMovement(true); }} className="p-1 rounded hover:bg-[#C9A55B]/10" title="Movimentar">
                            <RotateCcw className="h-3.5 w-3.5 text-[#C9A55B]" />
                          </button>
                          <button onClick={() => openEdit(item)} className="p-1 rounded hover:bg-muted" title="Editar">
                            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => { setShowCreate(v); if (!v) { setEditMode(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#C9A55B]" />{editMode ? "Editar Produto" : "Novo Produto no Estoque"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Nome do Produto <span className="text-[#6B6B6B]">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Lidocaína 2% c/ vaso" className="mt-1" />
              </div>
              <div>
                <Label>Marca</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex: Hipolabor" className="mt-1" />
              </div>
              <div>
                <Label>Tamanho / Apresentação</Label>
                <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="Ex: 20ml, 100U" className="mt-1" />
              </div>
              <div>
                <Label>SKU / Código</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Código interno" className="mt-1" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="Nome do fornecedor" className="mt-1" />
              </div>
              <div>
                <Label>Contato Fornecedor</Label>
                <Input value={form.supplierContact} onChange={(e) => setForm({ ...form, supplierContact: e.target.value })} placeholder="Telefone ou e-mail" className="mt-1" />
              </div>
              <div>
                <Label>Preço de Compra (R$)</Label>
                <Input type="number" step="0.01" value={(form.costPriceInCents / 100).toFixed(2)} onChange={(e) => setForm({ ...form, costPriceInCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label>Validade</Label>
                <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Quantidade em Estoque <span className="text-[#6B6B6B]">*</span></Label>
                <Input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: parseInt(e.target.value) || 0 })} placeholder="0" className="mt-1" />
              </div>
              <div>
                <Label>Estoque Mínimo (alerta)</Label>
                <Input type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: parseInt(e.target.value) || 0 })} placeholder="5" className="mt-1" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Notificação quando atingir este mínimo.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditMode(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => createProductMutation.mutate(form)} disabled={createProductMutation.isPending} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
              {createProductMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />{editMode ? "Salvar Alterações" : "Adicionar ao Estoque"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={movForm.type} onValueChange={(v: any) => setMovForm({ ...movForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada"><div className="flex items-center gap-2"><ArrowDown className="h-3 w-3 text-[#C9A55B]" />Entrada</div></SelectItem>
                  <SelectItem value="saida"><div className="flex items-center gap-2"><ArrowUp className="h-3 w-3 text-[#6B6B6B]" />Saída</div></SelectItem>
                  <SelectItem value="ajuste"><div className="flex items-center gap-2"><RotateCcw className="h-3 w-3 text-[#C9A55B]" />Ajuste</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min={1} value={movForm.quantity} onChange={(e) => setMovForm({ ...movForm, quantity: parseInt(e.target.value) || 1 })} className="mt-1" /></div>
            <div><Label>Motivo</Label><Input value={movForm.reason} onChange={(e) => setMovForm({ ...movForm, reason: e.target.value })} placeholder="Motivo da movimentação" className="mt-1" /></div>
            <Button onClick={() => { if (selectedProductId) createMovementMutation.mutate({ productId: selectedProductId, ...movForm }); }} disabled={createMovementMutation.isPending} className="w-full bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
              {createMovementMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Registrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
