import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileSignature,
  MessageSquare,
  Package,
  Stethoscope,
  Users,
  AlertTriangle,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { useLocation } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_atendimento: "Em Atendimento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  falta: "Falta",
};

const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-[#C9A55B]/10 text-[#8A6526]",
  confirmada: "bg-[#C9A55B]/15 text-[#6B5B2A]",
  em_atendimento: "bg-[#F1D791]/30 text-[#8A6526]",
  concluida: "bg-gray-100 text-gray-700",
  cancelada: "bg-[#2F2F2F]/10 text-[#2F2F2F]",
  falta: "bg-[#E8D29B]/30 text-[#8A6526]",
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function formatUserGreeting(user: any) {
  if (!user?.name) return "Usuário";
  
  const nameParts = user.name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
  
  // Determinar o título baseado no cargo/profissão
  let title = "";
  const role = (user?.role ?? "").toLowerCase();
  const profession = (user?.profession ?? "").toLowerCase();
  
  // Se for o Dr. Wésley ou se a profissão indicar médico
  if (role.includes("doctor") || role.includes("admin") || profession.includes("médico") || profession.includes("médica") || user.name.includes("Wésley")) {
    // Verificar se é mulher (doutora)
    const isFemale = profession.includes("médica") || profession.includes("doutora");
    title = isFemale ? "Dra." : "Dr.";
  }
  
  return `${title} ${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const userRole = (user as any)?.role ?? "user";

  const { data: stats, isLoading: statsLoading } = trpc.admin.getDashboardStats.useQuery();

  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const { data: todayAppointments } = trpc.appointments.getByDate.useQuery({
    from: todayStart.toISOString(),
    to: todayEnd.toISOString(),
  });

  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: lowStock } = trpc.inventory.getLowStock.useQuery();

  const getDoctorName = (doctorId: number) => {
    return doctors?.find((d) => d.id === doctorId)?.name ?? `Médico #${doctorId}`;
  };

  const statCards = [
    {
      title: "Total de Pacientes",
      value: statsLoading ? "..." : stats?.totalPatients ?? 0,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
      action: () => setLocation("/pacientes"),
    },
    {
      title: "Consultas Hoje",
      value: statsLoading ? "..." : stats?.todayAppointments ?? 0,
      icon: CalendarDays,
      color: "text-primary",
      bg: "bg-primary/10",
      action: () => setLocation("/agenda"),
    },
    {
      title: "Assinaturas Pendentes",
      value: statsLoading ? "..." : stats?.pendingSignatures ?? 0,
      icon: FileSignature,
      color: "text-primary",
      bg: "bg-primary/10",
      action: () => setLocation("/assinaturas"),
    },
    {
      title: "Médicos Ativos",
      value: statsLoading ? "..." : stats?.totalDoctors ?? 0,
      icon: Stethoscope,
      color: "text-primary",
      bg: "bg-primary/10",
      action: userRole === "admin" ? () => setLocation("/usuarios") : undefined,
    },
    {
      title: "Orçamentos Pendentes",
      value: statsLoading ? "..." : stats?.pendingBudgets ?? 0,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
      action: () => setLocation("/orcamentos"),
    },
    {
      title: "Estoque Baixo",
      value: statsLoading ? "..." : stats?.lowStockItems ?? 0,
      icon: Package,
      color: (stats?.lowStockItems ?? 0) > 0 ? "text-[#6B6B6B]" : "text-primary",
      bg: (stats?.lowStockItems ?? 0) > 0 ? "bg-[#6B6B6B]/10" : "bg-primary/10",
      action: () => setLocation("/estoque"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light text-foreground tracking-tight">
            {getGreeting()}, <span className="font-semibold text-primary">{formatUserGreeting(user)}</span>
          </h1>
          <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-widest">
            {today.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setLocation("/pacientes")}>
            <Users className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
          <Button size="sm" variant="premium" onClick={() => setLocation("/agenda")}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Nova Consulta
          </Button>
        </div>
      </div>

      {/* Alerta de estoque baixo */}
      {lowStock && lowStock.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#6B6B6B]/10 border border-[#6B6B6B]/30 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-[#6B6B6B] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#6B6B6B]">Alerta de Estoque</p>
            <p className="text-xs text-muted-foreground">
              {lowStock.length} produto(s) abaixo do estoque mínimo: {lowStock.slice(0, 3).map((p: any) => p.name).join(", ")}
              {lowStock.length > 3 && ` e mais ${lowStock.length - 3}`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/estoque")} className="shrink-0">
            Ver Estoque
          </Button>
        </div>
      )}

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className={`border-primary/10 bg-card/50 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-primary/30 ${card.action ? "cursor-pointer" : ""}`}
            onClick={card.action}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl ${card.bg} flex items-center justify-center shrink-0 shadow-inner`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-primary/20" />
              </div>
              <p className="text-3xl font-light text-foreground tracking-tight">{card.value}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mt-1">{card.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Consultas de hoje + Ações rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Consultas de Hoje
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/agenda")}>
                  Ver agenda completa
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!todayAppointments || todayAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma consulta agendada para hoje.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayAppointments.slice(0, 8).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                      onClick={() => setLocation("/agenda")}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[48px]">
                          <p className="text-sm font-semibold text-primary">
                            {new Date(apt.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Paciente #{apt.patientId}</p>
                          <p className="text-xs text-muted-foreground">{getDoctorName(apt.doctorId)}</p>
                        </div>
                      </div>
                      <Badge className={`text-xs ${STATUS_COLORS[apt.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[apt.status] ?? apt.status}
                      </Badge>
                    </div>
                  ))}
                  {todayAppointments.length > 8 && (
                    <p className="text-xs text-center text-muted-foreground pt-2">
                      + {todayAppointments.length - 8} consultas adicionais
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ações rápidas */}
        <div className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Ações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => setLocation("/pacientes")}>
                <Users className="h-4 w-4 text-[#C9A55B]" />
                Cadastrar Paciente
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => setLocation("/agenda")}>
                <CalendarDays className="h-4 w-4 text-[#C9A55B]" />
                Agendar Consulta
              </Button>
              {["admin", "medico"].includes(userRole) && (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => setLocation("/orcamentos")}>
                    <Receipt className="h-4 w-4 text-primary" />
                    Novo Orçamento
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => setLocation("/prescricoes")}>
                    <ClipboardList className="h-4 w-4 text-[#8A6526]" />
                    Nova Prescrição
                  </Button>
                </>
              )}
              <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => setLocation("/chat")}>
                <MessageSquare className="h-4 w-4 text-[#C9A55B]" />
                Chat da Equipe
              </Button>
            </CardContent>
          </Card>

          {/* Card de conformidade */}
          <Card className="border shadow-sm bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Conformidade Ativa</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sistema em conformidade com CFM 1821/2007, LGPD e CDC. Todos os acessos ao prontuário são registrados com hash de integridade.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
