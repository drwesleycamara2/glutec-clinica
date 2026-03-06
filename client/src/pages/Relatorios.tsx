import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { BarChart2, Users, Calendar, TrendingUp, Loader2 } from "lucide-react";

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function Relatorios() {
  const [period, setPeriod] = useState("30");

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - parseInt(period));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);

  const { data: stats, isLoading: statsLoading } = trpc.admin.getDashboardStats.useQuery();
  const { data: appointmentStats, isLoading: apptLoading } = trpc.admin.getAppointmentStats.useQuery(dateRange);

  const pieData = useMemo(() => {
    if (!appointmentStats) return [];
    return appointmentStats.map((s: any) => ({ name: s.doctorName ?? `Dr. #${s.doctorId}`, value: s.total }));
  }, [appointmentStats]);

  if (statsLoading || apptLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Estatísticas e análises da clínica</p>
        </div>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Pacientes", value: stats?.totalPatients ?? 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Consultas Hoje", value: stats?.todayAppointments ?? 0, icon: Calendar, color: "text-green-600", bg: "bg-green-50" },
          { label: "Assinaturas Pendentes", value: stats?.pendingSignatures ?? 0, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Total de Médicos", value: stats?.totalDoctors ?? 0, icon: BarChart2, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Consultas por Médico</CardTitle>
          </CardHeader>
          <CardContent>
            {!appointmentStats || appointmentStats.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum dado disponível para o período.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={appointmentStats.map((s: any) => ({ name: s.doctorName ?? `Dr. #${s.doctorId}`, total: s.total }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Distribuição por Médico</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum dado disponível para o período.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de consultas por médico */}
      {appointmentStats && appointmentStats.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Detalhamento por Profissional</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {appointmentStats.map((s: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                      {(s.doctorName ?? "D").charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.doctorName ?? `Dr. #${s.doctorId}`}</p>
                      {s.specialty && <p className="text-xs text-muted-foreground">{s.specialty}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{s.total}</p>
                    <p className="text-xs text-muted-foreground">consultas</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
