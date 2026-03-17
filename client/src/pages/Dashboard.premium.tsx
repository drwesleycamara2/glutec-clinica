import { useAuth } from "@/_core/hooks/useAuth";
import { PremiumButton, PremiumCard, PremiumStatCard } from "@/components/premium";
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
  agendada: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  confirmada: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  em_atendimento: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  concluida: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  falta: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
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
  
  let title = "";
  const role = (user?.role ?? "").toLowerCase();
  const profession = (user?.profession ?? "").toLowerCase();
  
  if (role.includes("doctor") || role.includes("admin") || profession.includes("médico") || profession.includes("médica") || user.name.includes("Wésley")) {
    const isFemale = profession.includes("médica") || profession.includes("doutora");
    title = isFemale ? "Dra." : "Dr.";
  }
  
  return `${title} ${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
}

/**
 * Dashboard Premium - Versão com componentes estilizados
 * Segue o design system premium com dourado metálico
 */
export default function DashboardPremium() {
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
      action: () => setLocation("/pacientes"),
    },
    {
      title: "Consultas Hoje",
      value: statsLoading ? "..." : stats?.todayAppointments ?? 0,
      icon: CalendarDays,
      action: () => setLocation("/agenda"),
    },
    {
      title: "Assinaturas Pendentes",
      value: statsLoading ? "..." : stats?.pendingSignatures ?? 0,
      icon: FileSignature,
      action: () => setLocation("/assinaturas"),
    },
    {
      title: "Médicos Ativos",
      value: statsLoading ? "..." : stats?.totalDoctors ?? 0,
      icon: Stethoscope,
      action: userRole === "admin" ? () => setLocation("/usuarios") : undefined,
    },
    {
      title: "Orçamentos Pendentes",
      value: statsLoading ? "..." : stats?.pendingBudgets ?? 0,
      icon: DollarSign,
      action: () => setLocation("/orcamentos"),
    },
    {
      title: "Estoque Baixo",
      value: statsLoading ? "..." : stats?.lowStockItems ?? 0,
      icon: Package,
      action: () => setLocation("/estoque"),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Saudação Premium */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-gold">
        <div>
          <h1 className="text-4xl font-light text-text-primary tracking-tight">
            {getGreeting()}, <span className="font-semibold text-accent">{formatUserGreeting(user)}</span>
          </h1>
          <p className="text-sm text-text-tertiary font-medium mt-2 uppercase tracking-widest">
            {today.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <PremiumButton
            variant="outline"
            size="md"
            icon={<Users size={18} />}
            onClick={() => setLocation("/pacientes")}
          >
            Novo Paciente
          </PremiumButton>
          <PremiumButton
            variant="primary"
            size="md"
            icon={<CalendarDays size={18} />}
            onClick={() => setLocation("/agenda")}
          >
            Nova Consulta
          </PremiumButton>
        </div>
      </div>

      {/* Alerta de estoque baixo - Premium */}
      {lowStock && lowStock.length > 0 && (
        <PremiumCard borderGold className="border-red-500/30 bg-red-500/5 dark:bg-red-950/20">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Alerta de Estoque</p>
              <p className="text-xs text-text-secondary mt-1">
                {lowStock.length} produto(s) abaixo do estoque mínimo: {lowStock.slice(0, 3).map((p: any) => p.name).join(", ")}
                {lowStock.length > 3 && ` e mais ${lowStock.length - 3}`}
              </p>
            </div>
            <PremiumButton
              variant="outline"
              size="sm"
              onClick={() => setLocation("/estoque")}
              className="flex-shrink-0"
            >
              Ver Estoque
            </PremiumButton>
          </div>
        </PremiumCard>
      )}

      {/* Cards de estatísticas - Premium */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            onClick={card.action}
            className={card.action ? "cursor-pointer" : ""}
          >
            <PremiumStatCard
              title={card.title}
              value={card.value}
              icon={<card.icon size={24} />}
            />
          </div>
        ))}
      </div>

      {/* Consultas de hoje + Ações rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Consultas de Hoje */}
        <div className="lg:col-span-2">
          <PremiumCard borderGold glowEffect>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-gold">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-3">
                  <CalendarDays size={20} className="text-accent" />
                  Consultas de Hoje
                </h2>
                <PremiumButton
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/agenda")}
                >
                  Ver agenda completa
                </PremiumButton>
              </div>

              {!todayAppointments || todayAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarDays size={40} className="text-text-tertiary/30 mb-4" />
                  <p className="text-sm text-text-tertiary">Nenhuma consulta agendada para hoje.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayAppointments.slice(0, 8).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-surface-alt border border-gold/20 hover:border-accent hover:bg-accent-hover transition-all cursor-pointer"
                      onClick={() => setLocation("/agenda")}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-sm font-semibold text-accent">
                            {new Date(apt.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">Paciente #{apt.patientId}</p>
                          <p className="text-xs text-text-tertiary">{getDoctorName(apt.doctorId)}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[apt.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[apt.status] ?? apt.status}
                      </span>
                    </div>
                  ))}
                  {todayAppointments.length > 8 && (
                    <p className="text-xs text-center text-text-tertiary pt-4">
                      + {todayAppointments.length - 8} consultas adicionais
                    </p>
                  )}
                </div>
              )}
            </div>
          </PremiumCard>
        </div>

        {/* Ações rápidas + Conformidade */}
        <div className="space-y-6">
          {/* Ações Rápidas */}
          <PremiumCard borderGold>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-3 pb-4 border-b border-gold">
                <Activity size={20} className="text-accent" />
                Ações Rápidas
              </h2>
              <div className="space-y-2">
                <PremiumButton
                  variant="outline"
                  size="md"
                  fullWidth
                  icon={<Users size={18} />}
                  onClick={() => setLocation("/pacientes")}
                >
                  Cadastrar Paciente
                </PremiumButton>
                <PremiumButton
                  variant="outline"
                  size="md"
                  fullWidth
                  icon={<CalendarDays size={18} />}
                  onClick={() => setLocation("/agenda")}
                >
                  Agendar Consulta
                </PremiumButton>
                {["admin", "medico"].includes(userRole) && (
                  <>
                    <PremiumButton
                      variant="outline"
                      size="md"
                      fullWidth
                      icon={<Receipt size={18} />}
                      onClick={() => setLocation("/orcamentos")}
                    >
                      Novo Orçamento
                    </PremiumButton>
                    <PremiumButton
                      variant="outline"
                      size="md"
                      fullWidth
                      icon={<ClipboardList size={18} />}
                      onClick={() => setLocation("/prescricoes")}
                    >
                      Nova Prescrição
                    </PremiumButton>
                  </>
                )}
                <PremiumButton
                  variant="outline"
                  size="md"
                  fullWidth
                  icon={<MessageSquare size={18} />}
                  onClick={() => setLocation("/chat")}
                >
                  Chat da Equipe
                </PremiumButton>
              </div>
            </div>
          </PremiumCard>

          {/* Card de Conformidade Premium */}
          <PremiumCard borderGold glowEffect className="bg-accent-hover/30">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 p-3 rounded-lg bg-accent-active">
                <Activity size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Conformidade Ativa</p>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                  Sistema em conformidade com CFM 1821/2007, LGPD e CDC. Todos os acessos ao prontuário são registrados com hash de integridade.
                </p>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>
    </div>
  );
}
