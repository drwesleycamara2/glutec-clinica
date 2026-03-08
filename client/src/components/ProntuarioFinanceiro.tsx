import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, DollarSign, CheckCircle2, AlertCircle, FileText, CreditCard, Banknote } from "lucide-react";

interface FinancialSummary {
  totalValue: number;
  approvedValue: number;
  paidValue: number;
  balanceOpen: number;
}

interface Budget {
  id: number;
  description: string;
  value: number;
  status: "pendente" | "aprovado" | "rejeitado";
  createdAt: string;
}

interface Payment {
  id: number;
  method: "dinheiro" | "debito" | "credito" | "pix" | "multban" | "sicoob";
  value: number;
  date: string;
  status: "pendente" | "confirmado";
}

export function ProntuarioFinanceiro({ patientId }: { patientId: number }) {
  const [summary, setSummary] = useState<FinancialSummary>({
    totalValue: 0,
    approvedValue: 0,
    paidValue: 0,
    balanceOpen: 0,
  });

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showNewBudget, setShowNewBudget] = useState(false);
  const [showReceivePayment, setShowReceivePayment] = useState(false);
  const [newBudgetForm, setNewBudgetForm] = useState({ description: "", value: "" });
  const [receiveForm, setReceiveForm] = useState({
    method: "pix" as const,
    value: "",
    installments: "1",
  });

  const paymentMethods = [
    { value: "dinheiro", label: "Dinheiro" },
    { value: "debito", label: "Cartão Débito" },
    { value: "credito", label: "Cartão Crédito" },
    { value: "pix", label: "PIX" },
    { value: "multban", label: "Financiamento MULTBAN" },
    { value: "sicoob", label: "Financiamento SICOOB" },
  ];

  const handleNewBudget = () => {
    if (!newBudgetForm.description || !newBudgetForm.value) {
      toast.error("Preencha todos os campos");
      return;
    }

    const newBudget: Budget = {
      id: budgets.length + 1,
      description: newBudgetForm.description,
      value: parseFloat(newBudgetForm.value),
      status: "pendente",
      createdAt: new Date().toISOString().split("T")[0],
    };

    setBudgets([...budgets, newBudget]);
    setSummary({
      ...summary,
      totalValue: summary.totalValue + newBudget.value,
    });

    setNewBudgetForm({ description: "", value: "" });
    setShowNewBudget(false);
    toast.success("Orçamento criado com sucesso!");
  };

  const handleApproveBudget = (budgetId: number) => {
    const budget = budgets.find((b) => b.id === budgetId);
    if (budget) {
      const updatedBudgets = budgets.map((b) =>
        b.id === budgetId ? { ...b, status: "aprovado" as const } : b
      );
      setBudgets(updatedBudgets);
      setSummary({
        ...summary,
        approvedValue: summary.approvedValue + budget.value,
      });
      toast.success("Orçamento aprovado!");
    }
  };

  const handleReceivePayment = () => {
    if (!receiveForm.value) {
      toast.error("Digite o valor do pagamento");
      return;
    }

    const newPayment: Payment = {
      id: payments.length + 1,
      method: receiveForm.method,
      value: parseFloat(receiveForm.value),
      date: new Date().toISOString().split("T")[0],
      status: "confirmado",
    };

    setPayments([...payments, newPayment]);
    setSummary({
      ...summary,
      paidValue: summary.paidValue + newPayment.value,
      balanceOpen: Math.max(0, summary.approvedValue - (summary.paidValue + newPayment.value)),
    });

    setReceiveForm({ method: "pix", value: "", installments: "1" });
    setShowReceivePayment(false);
    toast.success("Pagamento registrado com sucesso!");
  };

  const getMethodLabel = (method: string) => {
    return paymentMethods.find((m) => m.value === method)?.label || method;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-green-700 mb-1">VALOR TOTAL</p>
              <p className="text-3xl font-bold text-green-600">
                R${summary.totalValue.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-blue-700 mb-1">VALOR APROVADO</p>
              <p className="text-3xl font-bold text-blue-600">
                R${summary.approvedValue.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-emerald-700 mb-1">VALOR PAGO</p>
              <p className="text-3xl font-bold text-emerald-600">
                R${summary.paidValue.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-amber-700 mb-1">SALDO EM ABERTO</p>
              <p className="text-3xl font-bold text-amber-600">
                R${summary.balanceOpen.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => setShowNewBudget(true)} className="btn-gold-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Novo Orçamento
        </Button>
        <Button onClick={() => setShowReceivePayment(true)} className="bg-green-600 hover:bg-green-700 text-white">
          <DollarSign className="h-4 w-4 mr-2" />
          Receber do Paciente
        </Button>
        <Button variant="outline" className="border-gray-300">
          <FileText className="h-4 w-4 mr-2" />
          Analisar Crédito
        </Button>
      </div>

      {/* Budgets Section */}
      <Card className="border-gray-300">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Orçamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Nenhum orçamento criado</p>
          ) : (
            <div className="space-y-3">
              {budgets.map((budget) => (
                <div
                  key={budget.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{budget.description}</p>
                    <p className="text-sm text-gray-600">{budget.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-gray-900">R${budget.value.toFixed(2)}</p>
                    <Badge
                      className={`${
                        budget.status === "aprovado"
                          ? "bg-green-100 text-green-700"
                          : budget.status === "rejeitado"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {budget.status}
                    </Badge>
                    {budget.status === "pendente" && (
                      <Button
                        size="sm"
                        onClick={() => handleApproveBudget(budget.id)}
                        className="btn-gold-gradient"
                      >
                        Aprovar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Section */}
      <Card className="border-gray-300">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Nenhum pagamento registrado</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-gray-600" />
                    <div>
                      <p className="font-semibold text-gray-900">{getMethodLabel(payment.method)}</p>
                      <p className="text-sm text-gray-600">{payment.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-gray-900">R${payment.value.toFixed(2)}</p>
                    <Badge className="bg-green-100 text-green-700">Confirmado</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices Section */}
      <Card className="border-gray-300">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg text-gray-900">Notas Fiscais</CardTitle>
          <Button className="btn-gold-gradient">
            <FileText className="h-4 w-4 mr-2" />
            Gerar Nota Avulsa
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-4">Nenhuma nota fiscal emitida</p>
        </CardContent>
      </Card>

      {/* Dialog: New Budget */}
      <Dialog open={showNewBudget} onOpenChange={setShowNewBudget}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Orçamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Descrição do Procedimento/Serviço</Label>
              <Input
                value={newBudgetForm.description}
                onChange={(e) =>
                  setNewBudgetForm({ ...newBudgetForm, description: e.target.value })
                }
                placeholder="Ex: Limpeza de pele com laser"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Valor (R$)</Label>
              <Input
                type="number"
                value={newBudgetForm.value}
                onChange={(e) => setNewBudgetForm({ ...newBudgetForm, value: e.target.value })}
                placeholder="0,00"
                className="border-gray-300 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewBudget(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleNewBudget} className="btn-gold-gradient">
              Criar Orçamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Receive Payment */}
      <Dialog open={showReceivePayment} onOpenChange={setShowReceivePayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receber Pagamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Forma de Pagamento</Label>
              <Select value={receiveForm.method} onValueChange={(v) => setReceiveForm({ ...receiveForm, method: v as any })}>
                <SelectTrigger className="border-gray-300 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Valor (R$)</Label>
              <Input
                type="number"
                value={receiveForm.value}
                onChange={(e) => setReceiveForm({ ...receiveForm, value: e.target.value })}
                placeholder="0,00"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Parcelamento</Label>
              <Input
                type="number"
                value={receiveForm.installments}
                onChange={(e) => setReceiveForm({ ...receiveForm, installments: e.target.value })}
                placeholder="1"
                className="border-gray-300 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReceivePayment(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleReceivePayment} className="btn-gold-gradient">
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
