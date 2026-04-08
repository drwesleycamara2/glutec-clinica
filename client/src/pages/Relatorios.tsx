import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  BarChart2, Users, Calendar, TrendingUp, Loader2, DollarSign,
  FileDown, Package, HeartPulse, Activity, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const COLORS = ["#d4a853", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function Relatorios() {
  const [period, setPeriod] = useState("30");
  const [activeTab, setActiveTab] = useState("geral");

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - parseInt(period));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);

  const { data: stats, isLoading: statsLoading } = trpc.admin.getDashboardStats.useQuery();
  const { data: appointmentStats, isLoading: apptLoading } = trpc.admin.getAppointmentStats.useQuery(dateRange);
  const { data: financialSummary } = trpc.financial.getSummary.useQuery(dateRange);
  const { data: lowStock } = trpc.inventory.getLowStock.useQuery();
  const { data: crmList } = trpc.crm.list.useQuery({ limit: 100 });
  const { data: budgetList } = trpc.budgets.list.useQuery({ limit: 100 });

  // Computed metrics
  const budgetMetrics = useMemo(() => {
    if (!budgetList) return { total: 0, approved: 0, pending: 0, conversionRate: 0, totalValue: 0 };
    const approved = budgetList.filter((b: any) => b.status === "aprovado").length;
    const emitted = budgetList.filter((b: any) => b.status === "emitido").length;
    const totalValue = budgetList.reduce((sum: number, b: any) => sum + (b.finalTotalInCents ?? 0), 0);
    return {
      total: budgetList.length,
      approved,
      pending: emitted,
      conversionRate: budgetList.length > 0 ? Math.round((approved / budgetList.length) * 100) : 0,
      totalValue,
    };
  }, [budgetList]);

  const crmMetrics = useMemo(() => {
    if (!crmList) return { total: 0, converted: 0, pending: 0, conversionRate: 0 };
    const converted = crmList.filter((c: any) => c.status === "realizado").length;
    const pending = crmList.filter((c: any) => c.status === "indicado").length;
    return {
      total: crmList.length,
      converted,
      pending,
      conversionRate: crmList.length > 0 ? Math.round((converted / crmList.length) * 100) : 0,
    };
  }, [crmList]);

  if (statsLoading || apptLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios e Estatísticas</h1>
          <p className="text-sm text-muted-foreground mt-1">Análises completas da Clínica Glutée</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/relatorios/prontuario">Relatório do prontuário</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/relatorios/portabilidade">Portabilidade de dados</Link>
          </Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Pacientes", value: stats?.totalPatients ?? 0, icon: Users, color: "text-[#C9A55B]", bg: "bg-[#C9A55B]/10" },
          { label: "Consultas Hoje", value: stats?.todayAppointments ?? 0, icon: Calendar, color: "text-[#C9A55B]", bg: "bg-[#C9A55B]/10" },
          { label: "Médicos Ativos", value: stats?.totalDoctors ?? 0, icon: Activity, color: "text-[#8A6526]", bg: "bg-[#8A6526]/10" },
          { label: "Orçamentos", value: budgetMetrics.pending, icon: DollarSign, color: "text-[#C9A55B]", bg: "bg-[#C9A55B]/10", suffix: " pendentes" },
          { label: "Estoque Baixo", value: lowStock?.length ?? 0, icon: Package, color: "text-[#6B6B6B]", bg: "bg-[#6B6B6B]/10" },
          { label: "Indicações CRM", value: crmMetrics.pending, icon: HeartPulse, color: "text-[#C9A55B]", bg: "bg-[#C9A55B]/10", suffix: " abertas" },
        ].map(({ label, value, icon: Icon, color, bg, suffix }) => (
          <Card key={label} className="border shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>
              <p className="text-xl font-bold">{value}{suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs de Relatórios */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="orcamentos">Orçamentos</TabsTrigger>
          <TabsTrigger value="crm">CRM</TabsTrigger>
        </TabsList>

        {/* Tab: Geral */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Consultas por Médico</CardTitle>
              </CardHeader>
              <CardContent>
                {!appointmentStats || appointmentStats.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">Nenhum dado disponível para o período.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={appointmentStats.map((s: any) => ({ name: `Dr. #${s.doctorId}`, total: s.count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#d4a853" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Status das Consultas</CardTitle>
              </CardHeader>
              <CardContent>
                {!appointmentStats || appointmentStats.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const statusMap: Record<string, number> = {};
                          appointmentStats.forEach((s: any) => {
                            statusMap[s.status] = (statusMap[s.status] ?? 0) + s.count;
                          });
                          return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
                        })()}
                        cx="50%" cy="50%" outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {Object.keys({}).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabela detalhada */}
          {appointmentStats && appointmentStats.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Detalhamento por Profissional e Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Médico</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentStats.map((s: any, idx: number) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-3 font-medium">Dr. #{s.doctorId}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline" className="text-xs">{s.status}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-bold">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Financeiro */}
        <TabsContent value="financeiro" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border shadow-sm border-[#C9A55B]/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpRight className="h-5 w-5 text-[#C9A55B]" />
                  <span className="text-sm text-muted-foreground">Receitas</span>
                </div>
                <p className="text-2xl font-bold text-[#C9A55B]">
                  {formatCurrency(financialSummary?.totalReceitas ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownRight className="h-5 w-5 text-[#6B6B6B]" />
                  <span className="text-sm text-muted-foreground">Despesas</span>
                </div>
                <p className="text-2xl font-bold text-[#6B6B6B]">
                  {formatCurrency(financialSummary?.totalDespesas ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">Saldo</span>
                </div>
                <p className={`text-2xl font-bold ${(financialSummary?.saldo ?? 0) >= 0 ? "text-[#C9A55B]" : "text-[#6B6B6B]"}`}>
                  {formatCurrency(financialSummary?.saldo ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Resumo Financeiro do Período</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Período: últimos {period} dias. Dados baseados em transações com status "pago".
                Para detalhes completos, acesse o módulo Financeiro.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Orçamentos */}
        <TabsContent value="orcamentos" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold">{budgetMetrics.total}</p>
                <p className="text-xs text-muted-foreground mt-1">Total de Orçamentos</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[#C9A55B]">{budgetMetrics.approved}</p>
                <p className="text-xs text-muted-foreground mt-1">Aprovados</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[#C9A55B]">{budgetMetrics.pending}</p>
                <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary">{budgetMetrics.conversionRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">Taxa de Conversão</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm">
                <strong>Valor total em orçamentos:</strong>{" "}
                <span className="text-lg font-bold text-primary">{formatCurrency(budgetMetrics.totalValue)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Soma de todos os orçamentos emitidos no período. Conforme Art. 40 do CDC, cada orçamento tem validade de 10 dias.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: CRM */}
        <TabsContent value="crm" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold">{crmMetrics.total}</p>
                <p className="text-xs text-muted-foreground mt-1">Total de Indicações</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[#C9A55B]">{crmMetrics.converted}</p>
                <p className="text-xs text-muted-foreground mt-1">Realizadas</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-[#C9A55B]">{crmMetrics.pending}</p>
                <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-primary">{crmMetrics.conversionRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">Taxa de Conversão</p>
              </CardContent>
            </Card>
          </div>

          {lowStock && lowStock.length > 0 && (
            <Card className="border shadow-sm border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#6B6B6B]">Alerta: Produtos com Estoque Baixo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {lowStock.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-[#6B6B6B]/5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.category ?? "Sem categoria"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#6B6B6B]">{p.currentStock} un</p>
                        <p className="text-xs text-muted-foreground">Mín: {p.minimumStock}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
