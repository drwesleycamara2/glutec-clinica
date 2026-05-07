import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Clock, DoorOpen, Loader2, UserCheck } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  aguardando: "Aguardando atendimento",
  em_atendimento: "Em atendimento",
  concluida: "Atendimento concluído",
  cancelada: "Cancelada",
  falta: "Faltou",
};

const STATUS_CLASSES: Record<string, string> = {
  agendada: "border-yellow-300 bg-yellow-100 text-yellow-700",
  confirmada: "border-emerald-300 bg-emerald-100 text-emerald-700",
  aguardando: "border-amber-300 bg-amber-100 text-amber-800",
  em_atendimento: "border-sky-300 bg-sky-100 text-sky-700",
  concluida: "border-gray-200 bg-white text-gray-700",
  cancelada: "border-rose-300 bg-rose-100 text-rose-700",
  falta: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function appointmentTime(appointment: any) {
  return formatTime(appointment?.scheduledAt) || "--:--";
}

function sortBySchedule(left: any, right: any) {
  return new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime();
}

function statusBadge(status?: string) {
  return `border ${STATUS_CLASSES[String(status ?? "")] ?? "border-gray-200 bg-white text-gray-700"}`;
}

function AppointmentRow({ appointment, arrivalValue, onArrivalChange, onMarkWaiting, onOpenRecord }: any) {
  const canMarkWaiting = ["agendada", "confirmada"].includes(String(appointment.status));
  const canOpenRecord = ["aguardando", "em_atendimento", "confirmada", "agendada"].includes(String(appointment.status));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{appointmentTime(appointment)}</span>
            <Badge className={statusBadge(appointment.status)}>{STATUS_LABELS[appointment.status] ?? appointment.status}</Badge>
            {appointment.arrivedAt ? (
              <Badge className="border border-amber-200 bg-amber-50 text-amber-800">Chegada: {formatTime(appointment.arrivedAt)}</Badge>
            ) : null}
          </div>
          <p className="truncate text-base font-semibold text-gray-950">{appointment.patientName ?? `Paciente #${appointment.patientId}`}</p>
          <p className="text-sm text-gray-600">{appointment.doctorName ?? `Profissional #${appointment.doctorId}`} · {appointment.room || "Sem sala"}</p>
        </div>

        <div className="grid w-full min-w-0 gap-2">
          {canMarkWaiting ? (
            <Input
              type="datetime-local"
              value={arrivalValue || ""}
              onChange={(event) => onArrivalChange(appointment.id, event.target.value)}
              className="min-w-0 border-gray-300 bg-white text-slate-950 placeholder:text-slate-500 [color-scheme:light] dark:border-gray-300 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-500 dark:[color-scheme:light]"
            />
          ) : null}
          {canMarkWaiting ? (
            <Button variant="outline" className="w-full border-gray-300 bg-white text-slate-900 hover:bg-gray-100 hover:text-slate-950" onClick={() => onMarkWaiting(appointment)}>
              <UserCheck className="mr-2 h-4 w-4" />
              Marcar chegada
            </Button>
          ) : null}
          {canOpenRecord ? (
            <Button className="btn-gold-gradient w-full text-slate-950 hover:text-slate-950" onClick={() => onOpenRecord(appointment)}>
              <DoorOpen className="mr-2 h-4 w-4" />
              Abrir prontuário
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function SalaEspera() {
  const [, setLocation] = useLocation();
  const [selectedDate] = useState(() => new Date());
  const [arrivalTimes, setArrivalTimes] = useState<Record<number, string>>({});
  const { start, end } = useMemo(() => getDayBounds(selectedDate), [selectedDate]);

  const { data: appointments, isLoading, refetch } = trpc.appointments.getByDate.useQuery(
    { from: start.toISOString(), to: end.toISOString() },
    { refetchInterval: 15000 },
  );

  const updateStatusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const todayAppointments = useMemo(() => [...(appointments ?? [])].sort(sortBySchedule), [appointments]);
  const waiting = todayAppointments.filter((item) => item.status === "aguardando");
  const inService = todayAppointments.filter((item) => item.status === "em_atendimento");
  const receptionCandidates = todayAppointments.filter((item) => ["agendada", "confirmada"].includes(String(item.status)));

  const onArrivalChange = (appointmentId: number, value: string) => {
    setArrivalTimes((current) => ({ ...current, [appointmentId]: value }));
  };

  const markWaiting = (appointment: any) => {
    updateStatusMutation.mutate({
      appointmentId: Number(appointment.id),
      status: "aguardando",
      arrivedAt: arrivalTimes[appointment.id] || undefined,
    });
  };

  const openRecord = (appointment: any) => {
    updateStatusMutation.mutate(
      { appointmentId: Number(appointment.id), status: "em_atendimento" },
      { onSuccess: () => setLocation(`/prontuarios/${appointment.patientId}?appointmentId=${appointment.id}`) },
    );
  };

  const renderGroup = (title: string, items: any[], emptyText: string) => (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-gray-600">{title}</h2>
        <Badge className="border border-[#C9A55B]/25 bg-[#C9A55B]/10 text-[#8A6526]">{items.length}</Badge>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : items.map((appointment) => (
          <AppointmentRow
            key={appointment.id}
            appointment={appointment}
            arrivalValue={arrivalTimes[appointment.id] || ""}
            onArrivalChange={onArrivalChange}
            onMarkWaiting={markWaiting}
            onOpenRecord={openRecord}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8A6526]">Fluxo da clínica</p>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950">Sala de Espera</h1>
          <p className="mt-2 text-sm text-gray-600">Recepção, chegada e início de atendimento dos agendamentos de hoje.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">
          <Clock className="h-4 w-4 text-[#8A6526]" />
          {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#8A6526]" />
          Carregando sala de espera...
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {renderGroup("Aguardando atendimento", waiting, "Nenhum paciente aguardando agora.")}
          {renderGroup("Em atendimento", inService, "Nenhum atendimento em andamento.")}
          {renderGroup("Para recepcionar", receptionCandidates, "Nenhum agendamento pendente de chegada.")}
        </div>
      )}
    </div>
  );
}
