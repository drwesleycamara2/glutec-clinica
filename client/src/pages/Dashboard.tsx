import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Stethoscope,
  Users,
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
  agendada: "bg-blue-100 text-blue-800",
  confirmada: "bg-green-100 text-green-800",
  em_atendimento: "bg-yellow-100 text-yellow-800",
  concluida: "bg-gray-100 text-gray-700",
  cancelada: "bg-red-100 text-red-800",
  falta: "bg-orange-100 text-orange-800",
};

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

  const getDoctorName = (doctorId: number) => {
    return doctors?.find((d) => d.id === doctorId)?.name ?? `Médico #${doctorId}`;
  };

  const statCards = [
    {
      title: "Total de Pacientes",
      value: statsLoading ? "..." : stats?.totalPatients ?? 0,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
      action: () => setLocation("/pacientes"),
    },
    {
      title: "Consultas Hoje",
      value: statsLoading ? "..." : stats?.todayAppointments ?? 0,
      icon: CalendarDays,
      color: "text-green-600",
      bg: "bg-green-50",
      action: () => setLocation("/agenda"),
    },
    {
      title: "Assinaturas Pendentes",
      value: statsLoading ? "..." : stats?.pendingSignatures ?? 0,
      icon: FileSignature,
      color: "text-orange-600",
      bg: "bg-orange-50",
      action: () => setLocation("/assinaturas"),
    },
    {
      title: "Médicos Ativos",
      value: statsLoading ? "..." : stats?.totalDoctors ?? 0,
      icon: Stethoscope,
      color: "text-purple-600",
      bg: "bg-purple-50",
      action: userRole === "admin" ? () => setLocation("/usuarios") : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Bom dia, {user?.name?.split(" ")[0] ?? "Usuário"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {today.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation("/pacientes")}>
            <Users className="h-4 w-4 mr-2" />
            Novo Paciente
          </Button>
          <Button size="sm" onClick={() => setLocation("/agenda")}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Nova Consulta
          </Button>
        </div>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className={`border shadow-sm transition-shadow hover:shadow-md ${card.action ? "cursor-pointer" : ""}`}
            onClick={card.action}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                  <p className="text-3xl font-bold mt-1 text-foreground">{card.value}</p>
                </div>
                <div className={`h-12 w-12 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Consultas de hoje */}
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ações rápidas */}
        <div>
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Ações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setLocation("/pacientes")}>
                <Users className="h-4 w-4 text-blue-600" />
                Cadastrar Paciente
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setLocation("/agenda")}>
                <CalendarDays className="h-4 w-4 text-green-600" />
                Agendar Consulta
              </Button>
              {["admin", "medico"].includes(userRole) && (
                <>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setLocation("/prescricoes")}>
                    <ClipboardList className="h-4 w-4 text-purple-600" />
                    Nova Prescrição
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setLocation("/exames")}>
                    <ClipboardList className="h-4 w-4 text-teal-600" />
                    Pedido de Exames
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Conformidade LGPD */}
          <Card className="border shadow-sm mt-4 bg-blue-50/50 border-blue-100">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">Conformidade Ativa</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Sistema em conformidade com CFM 1821/2007 e LGPD. Todos os acessos ao prontuário são registrados.
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
