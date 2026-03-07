import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { DollarSign, Plus, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function Financeiro() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const { data: transactions, isLoading, refetch } = trpc.financial.list.useQuery({});
  const { data: summary } = trpc.financial.getSummary.useQuery({
    from: firstDay.toISOString(),
    to: lastDay.toISOString(),
  });

  const createMutation = trpc.financial.create.useMutation({
    onSuccess: () => { toast.success("Transação registrada!"); refetch(); setShowCreate(false); },
    onError: (err) => toast.error(err.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: "receita" as "receita" | "despesa",
    category: "",
    description: "",
    amountInCents: 0,
    paymentMethod: "pix" as any,
    status: "pendente" as any,
    dueDate: "",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Módulo Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de receitas e despesas da clínica</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Transação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Transação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Método de Pagamento</Label>
                  <Select value={form.paymentMethod} onValueChange={v => setForm({ ...form, paymentMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: Procedimento, Aluguel, Material" /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={(form.amountInCents / 100).toFixed(2)} onChange={e => setForm({ ...form, amountInCents: Math.round(parseFloat(e.target.value) * 100) || 0 })} /></div>
              <div><Label>Data de Vencimento</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending} className="w-full">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Resumo do Mês */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-2 rounded-lg bg-green-100"><TrendingUp className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Receitas do Mês</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totalReceitas)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="p-2 rounded-lg bg-red-100"><TrendingDown className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas do Mês</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalDespesas)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className={`p-2 rounded-lg ${summary.saldo >= 0 ? "bg-blue-100" : "bg-red-100"}`}>
                <Wallet className={`h-5 w-5 ${summary.saldo >= 0 ? "text-blue-600" : "text-red-600"}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo do Mês</p>
                <p className={`text-xl font-bold ${summary.saldo >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatCurrency(summary.saldo)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista de Transações */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : !transactions || transactions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma transação registrada.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-left">Categoria</th>
                  <th className="p-3 text-left">Descrição</th>
                  <th className="p-3 text-left">Método</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-left">Data</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: any) => (
                  <tr key={t.id} className="border-b hover:bg-muted/20">
                    <td className="p-3">
                      {t.type === "receita" ? (
                        <div className="flex items-center gap-1 text-green-600"><ArrowUpRight className="h-3 w-3" />Receita</div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-600"><ArrowDownRight className="h-3 w-3" />Despesa</div>
                      )}
                    </td>
                    <td className="p-3">{t.category}</td>
                    <td className="p-3">{t.description}</td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{t.paymentMethod}</Badge></td>
                    <td className={`p-3 text-right font-medium ${t.type === "receita" ? "text-green-600" : "text-red-600"}`}>
                      {t.type === "receita" ? "+" : "-"}{formatCurrency(t.amountInCents)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={`text-xs ${
                        t.status === "pago" ? "bg-green-100 text-green-700" :
                        t.status === "pendente" ? "bg-yellow-100 text-yellow-700" :
                        t.status === "atrasado" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>{t.status}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
