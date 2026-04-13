import { useAuth } from "@/_core/hooks/useAuth";
import { PremiumButton, PremiumCard, PremiumStatCard } from "@/components/premium";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileSignature,
  MessageSquare,
  Package,
  Receipt,
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
  agendada: "bg-[#C9A55B]/10 text-[#8A6526] dark:bg-[#C9A55B]/15 dark:text-[#E8D29B]",
  confirmada: "bg-[#C9A55B]/15 text-[#6B5B2A] dark:bg-[#C9A55B]/20 dark:text-[#F1D791]",
  em_atendimento: "bg-[#F1D791]/30 text-[#8A6526] dark:bg-[#F1D791]/15 dark:text-[#F1D791]",
  concluida: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  cancelada: "bg-[#2F2F2F]/10 text-[#2F2F2F] dark:bg-[#6B6B6B]/20 dark:text-[#D3D3D3]",
  falta: "bg-[#E8D29B]/30 text-[#8A6526] dark:bg-[#E8D29B]/15 dark:text-[#E8D29B]",
};

function normalizePreferredName(name?: string | null) {
  return String(name ?? "")
    .trim()
    .replace(/\bWesley\b/gi, "Wésley")
    .replace(/\s+/g, " ");
}

function getMedicalTitle(role?: string | null, profession?: string | null, name?: string | null) {
  const normalizedRole = String(role ?? "").toLowerCase();
  const normalizedProfession = String(profession ?? "").toLowerCase();
  const normalizedName = normalizePreferredName(name).toLowerCase();
  const isDoctor =
    normalizedRole.includes("doctor") ||
    normalizedRole.includes("medico") ||
    normalizedRole.includes("médico") ||
    normalizedRole.includes("admin") ||
    normalizedProfession.includes("medica") ||
    normalizedProfession.includes("médica") ||
    normalizedProfession.includes("medico") ||
    normalizedProfession.includes("médico") ||
    normalizedName.includes("wésley câmara");

  if (!isDoctor) return "";
  if (
    normalizedProfession.includes("medica") ||
    normalizedProfession.includes("médica") ||
    normalizedProfession.includes("doutora")
  ) {
    return "Dra.";
  }
  if (
    normalizedProfession.includes("medico") ||
    normalizedProfession.includes("médico") ||
    normalizedProfession.includes("doutor")
  ) {
    return "Dr.";
  }
  return "Dr(a).";
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function formatUserGreeting(user: any) {
  if (!user?.name) return "Usuário";

  const normalizedName = normalizePreferredName(user.name);
  const nameParts = normalizedName.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  let title = "";
  const role = String(user?.role ?? "").toLowerCase();
  const profession = String(user?.profession ?? "").toLowerCase();

  if (
    role.includes("doctor") ||
    role.includes("admin") ||
    profession.includes("médico") ||
    profession.includes("médica") ||
    normalizedName.includes("Wésley")
  ) {
    const isFemale = profession.includes("médica") || profession.includes("doutora");
    title = isFemale ? "Dra." : "Dr.";
  }

  return `${title} ${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
}

function formatDoctorDisplayName(appointment: any, doctors?: any[]) {
  const doctor =
    doctors?.find((entry) => Number(entry.id) === Number(appointment?.doctorId)) ??
    (appointment?.doctorName
      ? {
          name: appointment.doctorName,
          role: appointment.doctorRole,
          specialty: appointment.doctorSpecialty,
        }
      : null);

  if (!doctor?.name) {
    return `Dr(a). Médico #${appointment?.doctorId ?? "-"}`;
  }

  const normalizedName = normalizePreferredName(doctor.name);
  const title = getMedicalTitle((doctor as any)?.role, (doctor as any)?.specialty, normalizedName);
  return `${title} ${normalizedName}`.trim();
}

function getPatientName(appointment: any) {
  const rawName =
    appointment?.patientName ??
    appointment?.fullName ??
    appointment?.name ??
    appointment?.patient?.fullName ??
    appointment?.patient?.name;

  const normalizedName = normalizePreferredName(rawName);
  return normalizedName || `Paciente #${appointment?.patientId ?? "-"}`;
}

function getPatientPhone(appointment: any) {
  return (
    appointment?.patientPhone ??
    appointment?.phone ??
    appointment?.patient?.phone ??
    "Telefone não informado"
  );
}

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

  const { data: patients } = trpc.patients.list.useQuery({ limit: 5000 });
  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: lowStock } = trpc.inventory.getLowStock.useQuery();

  const getDoctorName = (appointment: any) => formatDoctorDisplayName(appointment, doctors);
  const getResolvedPatientName = (appointment: any) => {
    const joinedName = getPatientName(appointment);
    if (!joinedName.startsWith("Paciente #")) return joinedName;

    const patient = patients?.find((entry: any) => Number(entry.id) === Number(appointment?.patientId));
    return normalizePreferredName(patient?.fullName) || joinedName;
  };

  const getResolvedPatientPhone = (appointment: any) => {
    const joinedPhone = getPatientPhone(appointment);
    if (joinedPhone !== "Telefone não informado") return joinedPhone;

    const patient = patients?.find((entry: any) => Number(entry.id) === Number(appointment?.patientId));
    return patient?.phone || joinedPhone;
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
      value: statsLoading ? "..." : todayAppointments?.length ?? stats?.todayAppointments ?? 0,
      icon: CalendarDays,
      action: () => setLocation("/agenda"),
    },
    {
      title: "Assinaturas Pendentes",
      value: statsLoading ? "..." : (stats as any)?.pendingSignatures ?? 0,
      icon: FileSignature,
      action: () => setLocation("/assinaturas"),
    },
    {
      title: "Médicos Ativos",
      value: statsLoading ? "..." : doctors?.length ?? (stats as any)?.totalDoctors ?? 0,
      icon: Stethoscope,
      action: userRole === "admin" ? () => setLocation("/usuarios") : undefined,
    },
    {
      title: "Orçamentos Pendentes",
      value: statsLoading ? "..." : (stats as any)?.pendingBudgets ?? 0,
      icon: DollarSign,
      action: () => setLocation("/orcamentos"),
    },
    {
      title: "Estoque Baixo",
      value: statsLoading ? "..." : lowStock?.length ?? (stats as any)?.lowStockItems ?? 0,
      icon: Package,
      action: () => setLocation("/estoque"),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-gold">
        <div>
          <h1 className="text-4xl font-light text-text-primary tracking-tight">
            {getGreeting()},{" "}
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {formatUserGreeting(user)}
            </span>
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

      {lowStock && lowStock.length > 0 && (
        <PremiumCard borderGold className="border-[#6B6B6B]/30 bg-[#6B6B6B]/5 dark:bg-red-950/20">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-[#6B6B6B]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#2F2F2F] dark:text-[#6B6B6B]">Alerta de Estoque</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                          <p className="text-sm font-medium text-text-primary">{getResolvedPatientName(apt)}</p>
                          <p className="text-xs text-text-secondary">{getResolvedPatientPhone(apt)}</p>
                          <p className="text-xs text-text-tertiary">{getDoctorName(apt)}</p>
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

        <div className="space-y-6">
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
