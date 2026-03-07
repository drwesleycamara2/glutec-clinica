import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, Plus, AlertTriangle, ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Estoque() {
  const { data: products, isLoading, refetch } = trpc.inventory.listProducts.useQuery();
  const { data: lowStock } = trpc.inventory.getLowStock.useQuery();

  const createProductMutation = trpc.inventory.createProduct.useMutation({
    onSuccess: () => { toast.success("Produto cadastrado!"); refetch(); setShowCreate(false); },
    onError: (err) => toast.error(err.message),
  });
  const createMovementMutation = trpc.inventory.createMovement.useMutation({
    onSuccess: () => { toast.success("Movimentação registrada!"); refetch(); setShowMovement(false); },
    onError: (err) => toast.error(err.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", sku: "", category: "", description: "", unit: "unidade", currentStock: 0, minimumStock: 5, costPriceInCents: 0, supplierName: "", supplierContact: "" });
  const [movForm, setMovForm] = useState({ type: "entrada" as "entrada" | "saida" | "ajuste", quantity: 1, reason: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            Controle de Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de insumos e materiais da clínica</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Produto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar Produto</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                <div><Label>Unidade</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
                <div><Label>Estoque Inicial</Label><Input type="number" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Estoque Mínimo</Label><Input type="number" value={form.minimumStock} onChange={e => setForm({ ...form, minimumStock: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={(form.costPriceInCents / 100).toFixed(2)} onChange={e => setForm({ ...form, costPriceInCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} /></div>
                <div><Label>Fornecedor</Label><Input value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} /></div>
              </div>
              <Button onClick={() => createProductMutation.mutate(form)} disabled={createProductMutation.isPending} className="w-full">Cadastrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alerta de Estoque Baixo */}
      {lowStock && lowStock.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 text-sm">Estoque Baixo!</p>
              <p className="text-xs text-yellow-700">
                {lowStock.map((p: any) => `${p.name} (${p.currentStock}/${p.minimumStock})`).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Produtos */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : !products || products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p: any) => {
            const isLow = p.currentStock <= p.minimumStock;
            return (
              <Card key={p.id} className={isLow ? "border-yellow-300" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{p.name}</CardTitle>
                    {isLow && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.category} | {p.sku}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold">{p.currentStock}</p>
                      <p className="text-xs text-muted-foreground">Mínimo: {p.minimumStock}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedProductId(p.id); setShowMovement(true); }}
                    >
                      Movimentar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Movimentação Dialog */}
      <Dialog open={showMovement} onOpenChange={setShowMovement}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={movForm.type} onValueChange={v => setMovForm({ ...movForm, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada"><div className="flex items-center gap-2"><ArrowDown className="h-3 w-3 text-green-600" />Entrada</div></SelectItem>
                  <SelectItem value="saida"><div className="flex items-center gap-2"><ArrowUp className="h-3 w-3 text-red-600" />Saída</div></SelectItem>
                  <SelectItem value="ajuste"><div className="flex items-center gap-2"><RotateCcw className="h-3 w-3 text-blue-600" />Ajuste</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantidade</Label><Input type="number" min={1} value={movForm.quantity} onChange={e => setMovForm({ ...movForm, quantity: parseInt(e.target.value) || 1 })} /></div>
            <div><Label>Motivo</Label><Input value={movForm.reason} onChange={e => setMovForm({ ...movForm, reason: e.target.value })} placeholder="Motivo da movimentação" /></div>
            <Button
              onClick={() => { if (selectedProductId) createMovementMutation.mutate({ productId: selectedProductId, ...movForm }); }}
              disabled={createMovementMutation.isPending}
              className="w-full"
            >
              Registrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
