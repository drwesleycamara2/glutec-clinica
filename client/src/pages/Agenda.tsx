import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Plus,
  Settings,
  UserCheck,
} from "lucide-react";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_NAMES_FULL = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const APPOINTMENT_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_atendimento: "Em atendimento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  falta: "Falta",
};

const DAY_STATUS_COLORS = {
  livre: "bg-green-500",
  parcial: "bg-yellow-500",
  ocupado: "bg-red-500",
  fechado: "bg-black",
};

const defaultAppointmentForm = {
  patientId: "",
  doctorId: "",
  scheduledAt: "",
  durationMinutes: "30",
  type: "consulta",
  notes: "",
  room: "",
};

const defaultBlockForm = {
  title: "Bloqueio de agenda",
  doctorId: "all",
  room: "",
  startsAt: "",
  endsAt: "",
  notes: "",
};

type ViewMode = "day" | "week" | "month";

function generateTimeSlots() {
  const slots: string[] = [];
  for (let hour = 8; hour < 20; hour += 1) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    slots.push(`${hour.toString().padStart(2, "0")}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateHeader(date: Date) {
  return `${DAY_NAMES_FULL[date.getDay()]}, ${date.getDate()} DE ${MONTHS_PT[date.getMonth()].toUpperCase()} DE ${date.getFullYear()}`;
}

function buildDateTimeForSlot(baseDate: Date, slot: string) {
  const [hours, minutes] = slot.split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getAppointmentEnd(appointment: any) {
  const startsAt = new Date(appointment.scheduledAt);
  const duration = Number(appointment.duration ?? appointment.durationMinutes ?? 30);
  return new Date(startsAt.getTime() + duration * 60 * 1000);
}

function doesRangeOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export default function Agenda() {
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDoctor, setSelectedDoctor] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [appointmentForm, setAppointmentForm] = useState(defaultAppointmentForm);
  const [blockForm, setBlockForm] = useState(defaultBlockForm);

  const broadRangeStart = useMemo(() => new Date(calendarYear - 1, 0, 1, 0, 0, 0, 0), [calendarYear]);
  const broadRangeEnd = useMemo(() => new Date(calendarYear + 1, 11, 31, 23, 59, 59, 999), [calendarYear]);

  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 5000 });
  const { data: appointments, refetch: refetchAppointments } = trpc.appointments.getByDate.useQuery({
    from: broadRangeStart.toISOString(),
    to: broadRangeEnd.toISOString(),
  });
  const { data: blocks, refetch: refetchBlocks } = trpc.appointmentBlocks.list.useQuery({
    from: broadRangeStart.toISOString(),
    to: broadRangeEnd.toISOString(),
  });

  const createAppointmentMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Agendamento salvo com sucesso.");
      setShowCreateDialog(false);
      setAppointmentForm(defaultAppointmentForm);
      refetchAppointments();
    },
    onError: (error) => toast.error(error.message),
  });

  const createBlockMutation = trpc.appointmentBlocks.create.useMutation({
    onSuccess: () => {
      toast.success("Bloqueio de agenda salvo.");
      setShowBlockDialog(false);
      setBlockForm(defaultBlockForm);
      refetchBlocks();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteBlockMutation = trpc.appointmentBlocks.delete.useMutation({
    onSuccess: () => {
      toast.success("Bloqueio removido.");
      setSelectedEvent(null);
      refetchBlocks();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStatusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado.");
      setSelectedEvent(null);
      refetchAppointments();
    },
    onError: (error) => toast.error(error.message),
  });

  const filteredAppointments = useMemo(() => {
    return (appointments ?? [])
      .filter((appointment) => selectedDoctor === "all" || String(appointment.doctorId) === selectedDoctor)
      .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime());
  }, [appointments, selectedDoctor]);

  const filteredBlocks = useMemo(() => {
    return (blocks ?? [])
      .filter((block) => selectedDoctor === "all" || block.doctorId == null || String(block.doctorId) === selectedDoctor)
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }, [blocks, selectedDoctor]);

  const selectedDayAppointments = useMemo(() => {
    return filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.scheduledAt), selectedDate));
  }, [filteredAppointments, selectedDate]);

  const selectedDayBlocks = useMemo(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    return filteredBlocks.filter((block) =>
      doesRangeOverlap(new Date(block.startsAt), new Date(block.endsAt), dayStart, dayEnd)
    );
  }, [filteredBlocks, selectedDate]);

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    return filteredAppointments.filter((appointment) => new Date(appointment.scheduledAt).getTime() >= now).slice(0, 8);
  }, [filteredAppointments]);

  const pastAppointments = useMemo(() => {
    const now = Date.now();
    return [...filteredAppointments]
      .filter((appointment) => new Date(appointment.scheduledAt).getTime() < now)
      .sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime())
      .slice(0, 8);
  }, [filteredAppointments]);
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDayOfMonth = getFirstDayOfMonth(calendarYear, calendarMonth);

  const calendarDays = useMemo(() => {
    const values: Array<number | null> = [];
    for (let index = 0; index < firstDayOfMonth; index += 1) values.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) values.push(day);
    return values;
  }, [daysInMonth, firstDayOfMonth]);

  const getPatientName = (patientId: number) =>
    patients?.find((patient) => patient.id === patientId)?.fullName ?? `Paciente #${patientId}`;

  const getDoctorName = (doctorId: number) =>
    doctors?.find((doctor) => doctor.id === doctorId)?.name ?? `Profissional #${doctorId}`;

  const slotMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    selectedDayAppointments.forEach((appointment) => {
      const start = new Date(appointment.scheduledAt);
      const key = `${start.getHours().toString().padStart(2, "0")}:${start.getMinutes() < 30 ? "00" : "30"}`;
      if (!map[key]) {
        map[key] = [];
      }

      map[key].push({
        ...appointment,
        patientName: getPatientName(appointment.patientId),
        doctorName: getDoctorName(appointment.doctorId),
      });
    });
    return map;
  }, [selectedDayAppointments, patients, doctors]);

  const blockForSlot = (slot: string) => {
    const slotStart = buildDateTimeForSlot(selectedDate, slot);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

    return selectedDayBlocks.find((block) =>
      doesRangeOverlap(new Date(block.startsAt), new Date(block.endsAt), slotStart, slotEnd)
    );
  };

  const getDayStatus = (date: Date): keyof typeof DAY_STATUS_COLORS => {
    if (date.getDay() === 0) return "fechado";

    const dayAppointments = filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.scheduledAt), date));
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const dayBlocks = filteredBlocks.filter((block) =>
      doesRangeOverlap(new Date(block.startsAt), new Date(block.endsAt), dayStart, dayEnd)
    );

    if (dayAppointments.length === 0 && dayBlocks.length === 0) return "livre";
    if (dayAppointments.length >= TIME_SLOTS.length / 2) return "ocupado";
    return "parcial";
  };

  const openCreateDialogForSlot = (slot: string) => {
    const scheduledAt = buildDateTimeForSlot(selectedDate, slot);
    const blockingItem = blockForSlot(slot);
    if (blockingItem) {
      toast.error("Há um bloqueio ativo nesse horário.");
      return;
    }

    setAppointmentForm({
      ...defaultAppointmentForm,
      doctorId: selectedDoctor === "all" ? "" : selectedDoctor,
      scheduledAt: scheduledAt.toISOString().slice(0, 16),
    });
    setShowCreateDialog(true);
  };

  const handleCreateAppointment = () => {
    if (!appointmentForm.patientId || !appointmentForm.doctorId || !appointmentForm.scheduledAt || !appointmentForm.room.trim()) {
      toast.error("Preencha paciente, profissional, data, horário e sala.");
      return;
    }

    createAppointmentMutation.mutate({
      patientId: Number(appointmentForm.patientId),
      doctorId: Number(appointmentForm.doctorId),
      scheduledAt: appointmentForm.scheduledAt,
      durationMinutes: Number(appointmentForm.durationMinutes || "30"),
      room: appointmentForm.room.trim(),
      type: appointmentForm.type,
      notes: appointmentForm.notes,
    });
  };

  const handleCreateBlock = () => {
    if (!blockForm.title.trim() || !blockForm.startsAt || !blockForm.endsAt) {
      toast.error("Informe título, início e fim do bloqueio.");
      return;
    }

    createBlockMutation.mutate({
      title: blockForm.title.trim(),
      notes: blockForm.notes || undefined,
      room: blockForm.room.trim() || undefined,
      doctorId: blockForm.doctorId === "all" ? undefined : Number(blockForm.doctorId),
      startsAt: blockForm.startsAt,
      endsAt: blockForm.endsAt,
    });
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCalendarMonth(today.getMonth());
    setCalendarYear(today.getFullYear());
    setViewMode("day");
  };

  const openAppointmentDetails = (appointment: any) => {
    setSelectedEvent({ ...appointment, eventType: "appointment" });
  };

  const openBlockDetails = (block: any) => {
    setSelectedEvent({ ...block, eventType: "block" });
  };

  const moveMonth = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (calendarMonth === 0) {
        setCalendarMonth(11);
        setCalendarYear((value) => value - 1);
        return;
      }
      setCalendarMonth((value) => value - 1);
      return;
    }

    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((value) => value + 1);
      return;
    }

    setCalendarMonth((value) => value + 1);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setAppointmentForm(defaultAppointmentForm);
                setShowCreateDialog(true);
              }}
              className="btn-gold-gradient"
            >
              <Plus className="mr-2 h-4 w-4" />
              Agendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300"
              onClick={() => {
                setBlockForm({
                  ...defaultBlockForm,
                  doctorId: selectedDoctor,
                  startsAt: "",
                  endsAt: "",
                });
                setShowBlockDialog(true);
              }}
            >
              <Ban className="mr-2 h-4 w-4" />
              Bloquear horário
            </Button>
            <Button variant="outline" size="sm" className="border-gray-300">
              <UserCheck className="mr-2 h-4 w-4" />
              Check-in
            </Button>
          </div>

          <div className="flex gap-2">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode(mode)}
                className={viewMode === mode ? "btn-gold-gradient" : "border-gray-300"}
              >
                {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
              </Button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="border-gray-300">
            <Settings className="mr-2 h-4 w-4" />
            Opções
          </Button>
        </div>
        <div className="mb-4 grid gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-300 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Total no filtro</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{filteredAppointments.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">No dia</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{selectedDayAppointments.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Próximos</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{upcomingAppointments.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-300 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Bloqueios ativos</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{selectedDayBlocks.length}</p>
          </div>
        </div>

        {viewMode === "day" && (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-foreground">{formatDateHeader(selectedDate)}</h2>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-gray-100 backdrop-blur">
                  <tr className="text-xs font-semibold text-gray-700">
                    <th className="w-10 px-2 py-2 text-center"></th>
                    <th className="w-24 px-3 py-2 text-left">Horário</th>
                    <th className="px-3 py-2 text-left">Paciente</th>
                    <th className="w-28 px-3 py-2 text-left">Tipo</th>
                    <th className="w-28 px-3 py-2 text-left">Sala</th>
                    <th className="w-32 px-3 py-2 text-center">Situação</th>
                    <th className="w-24 px-3 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map((slot) => {
                    const appointmentsInSlot = slotMap[slot] ?? [];
                    const activeBlock = blockForSlot(slot);

                    if (appointmentsInSlot.length === 0 && activeBlock) {
                      return (
                        <tr key={`block-${slot}`} className="border-t border-gray-200 bg-black/90 text-white">
                          <td className="px-2 py-3 text-center">
                            <Ban className="mx-auto h-4 w-4 text-amber-300" />
                          </td>
                          <td className="px-3 py-3">
                            <div className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2.5 py-1">
                              <span className="text-sm font-semibold">{slot}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-sm font-medium">{activeBlock.title}</span>
                          </td>
                          <td className="px-3 py-3 text-xs text-white/70">Bloqueio</td>
                          <td className="px-3 py-3 text-xs text-white/70">{activeBlock.room || "Todas"}</td>
                          <td className="px-3 py-3 text-center">
                            <Badge className="border border-white/15 bg-amber-400/15 text-amber-200">Bloqueado</Badge>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button type="button" className="text-xs text-amber-200 hover:text-white" onClick={() => openBlockDetails(activeBlock)}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    if (appointmentsInSlot.length === 0) {
                      return (
                        <tr
                          key={slot}
                          className="group cursor-pointer border-t border-gray-200 transition-colors hover:bg-gray-50"
                          onClick={() => openCreateDialogForSlot(slot)}
                        >
                          <td className="px-2 py-3 text-center">
                            <button type="button" className="mx-auto flex h-6 w-6 items-center justify-center rounded bg-green-100 text-green-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-green-200">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-100 px-2.5 py-1">
                              <span className="text-sm font-semibold text-green-700">{slot}</span>
                              <span className="text-[10px] font-medium uppercase text-green-600">Livre</span>
                            </div>
                          </td>
                          <td colSpan={5} className="px-3 py-3 text-xs text-gray-400">
                            Clique para criar um agendamento neste horário.
                          </td>
                        </tr>
                      );
                    }

                    return appointmentsInSlot.map((appointment, index) => (
                      <tr
                        key={`${slot}-${appointment.id}-${index}`}
                        className="cursor-pointer border-t border-gray-200 transition-colors hover:bg-gray-50"
                        onClick={() => openAppointmentDetails(appointment)}
                      >
                        <td className="px-2 py-3 text-center">
                          <button type="button" className="mx-auto flex h-6 w-6 items-center justify-center rounded bg-yellow-100 text-yellow-600 hover:bg-yellow-200">
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-1.5 rounded-md border border-yellow-300 bg-yellow-100 px-2.5 py-1">
                            <span className="text-sm font-semibold text-yellow-700">{slot}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm font-medium text-gray-900">{appointment.patientName}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs capitalize text-gray-600">{appointment.type ?? "Consulta"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-600">{appointment.room || "Sem sala"}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge className="border border-yellow-300 bg-yellow-100 text-yellow-700">
                            {STATUS_LABELS[appointment.status] ?? appointment.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button type="button" className="text-xs text-gray-600 hover:text-gray-900">Ver</button>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === "week" && (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-foreground">Semana de {selectedDate.toLocaleDateString("pt-BR")}</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 7 }, (_, index) => {
                const currentDate = new Date(selectedDate);
                currentDate.setDate(selectedDate.getDate() - selectedDate.getDay() + index);
                const items = filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.scheduledAt), currentDate));
                const blockCount = filteredBlocks.filter((block) => {
                  const start = new Date(block.startsAt);
                  const end = new Date(block.endsAt);
                  const dayStart = new Date(currentDate);
                  dayStart.setHours(0, 0, 0, 0);
                  const dayEnd = new Date(currentDate);
                  dayEnd.setHours(23, 59, 59, 999);
                  return doesRangeOverlap(start, end, dayStart, dayEnd);
                }).length;

                return (
                  <div key={currentDate.toISOString()} className="rounded-2xl border border-gray-300 bg-white p-4">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        setSelectedDate(currentDate);
                        setViewMode("day");
                      }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">{DAYS_PT[currentDate.getDay()]}</p>
                      <p className="mt-1 text-base font-semibold text-gray-900">{currentDate.toLocaleDateString("pt-BR")}</p>
                      {blockCount > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">{blockCount} bloqueio(s) neste dia</p>
                      ) : null}
                    </button>

                    <div className="mt-4 space-y-3">
                      {items.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum agendamento neste dia.</p>
                      ) : (
                        items.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:border-[#C9A55B]/40"
                            onClick={() => openAppointmentDetails(item)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {new Date(item.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <Badge className="border border-[#C9A55B]/25 bg-[#C9A55B]/10 text-[#8A6526]">
                                {STATUS_LABELS[item.status] ?? item.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-gray-900">{getPatientName(item.patientId)}</p>
                            <p className="text-xs text-gray-500">
                              {getDoctorName(item.doctorId)} · {item.room || "Sem sala"}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "month" && (
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="mb-4 text-lg font-bold text-foreground">
              {MONTHS_PT[calendarMonth]} {calendarYear}
            </h2>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_PT.map((day) => (
                <div key={day} className="py-2 text-center text-sm font-semibold text-gray-700">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const date = new Date(calendarYear, calendarMonth, day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                    }}
                    className={`aspect-square rounded-lg font-semibold text-white transition-all hover:shadow-lg ${DAY_STATUS_COLORS[getDayStatus(date)]}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-gray-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Agenda do dia selecionado</p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">
                    {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <Badge className="border border-[#C9A55B]/25 bg-[#C9A55B]/10 text-[#8A6526]">
                    {selectedDayAppointments.length} agendamento(s)
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-300"
                    onClick={() => setViewMode("day")}
                  >
                    Ver dia completo
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {selectedDayAppointments.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum paciente agendado para este dia.</p>
                ) : (
                  selectedDayAppointments.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-gray-900">
                              {new Date(item.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <Badge className="border border-gray-200 bg-white text-gray-700">
                              {STATUS_LABELS[item.status] ?? item.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{getPatientName(item.patientId)}</p>
                          <p className="text-xs text-gray-500">
                            {getDoctorName(item.doctorId)} · {item.room || "Sem sala"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-300"
                            onClick={() => openAppointmentDetails(item)}
                          >
                            Ver detalhes
                          </Button>
                          <Button
                            size="sm"
                            className="btn-gold-gradient"
                            onClick={() => setLocation(`/prontuarios/${item.patientId}#evolucao`)}
                          >
                            Iniciar atendimento
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Bloqueios do dia selecionado</p>
                  <h3 className="mt-1 text-lg font-semibold text-gray-900">
                    {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </h3>
                </div>
                <Badge className="border border-amber-200 bg-amber-100 text-amber-700">
                  {selectedDayBlocks.length} bloqueio(s)
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                {selectedDayBlocks.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum bloqueio registrado para este dia.</p>
                ) : (
                  selectedDayBlocks.map((block) => (
                    <div
                      key={block.id}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-gray-900">
                              {new Date(block.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} até {new Date(block.endsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <Badge className="border border-amber-200 bg-white text-amber-700">
                              Bloqueado
                            </Badge>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{block.title}</p>
                          <p className="text-xs text-gray-500">
                            Sala: {block.room || "Todas"} · Profissional: {block.doctorId ? getDoctorName(block.doctorId) : "Todos"}
                          </p>
                          {block.notes ? (
                            <p className="text-xs text-gray-500">{block.notes}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-300"
                            onClick={() => openBlockDetails(block)}
                          >
                            Ver detalhes
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex w-80 flex-col gap-4">
        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <Label className="mb-2 block text-sm font-semibold text-gray-700">Profissional selecionado</Label>
          <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
            <SelectTrigger className="border-gray-300">
              <SelectValue placeholder="Selecione um profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {doctors?.map((doctor) => (
                <SelectItem key={doctor.id} value={String(doctor.id)}>
                  {doctor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={goToToday} className="btn-gold-gradient w-full">
          Hoje
        </Button>

        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth("prev")} className="rounded p-1 hover:bg-gray-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-semibold text-gray-700">
              {MONTHS_PT[calendarMonth]} {calendarYear}
            </h3>
            <button type="button" onClick={() => moveMonth("next")} className="rounded p-1 hover:bg-gray-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs">
            {DAYS_PT.map((day) => (
              <div key={day} className="py-1 text-center font-semibold text-gray-600">
                {day}
              </div>
            ))}
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`mini-empty-${index}`} />;
              }

              const date = new Date(calendarYear, calendarMonth, day);
              const isSelected = isSameDay(date, selectedDate);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={`aspect-square rounded text-xs font-semibold text-white transition-all ${
                    isSelected ? "ring-2 ring-gray-400 ring-offset-1" : ""
                  } ${DAY_STATUS_COLORS[getDayStatus(date)]}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-gray-300 bg-white p-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-green-500" />
            <span className="text-gray-700">Livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-yellow-500" />
            <span className="text-gray-700">Parcialmente livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-red-500" />
            <span className="text-gray-700">Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-black" />
            <span className="text-gray-700">Fechado ou bloqueado</span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-[#C9A55B]" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Bloqueios do dia</p>
          </div>
          <div className="mt-3 space-y-3">
            {selectedDayBlocks.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum bloqueio no dia selecionado.</p>
            ) : (
              selectedDayBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:border-[#C9A55B]/40"
                  onClick={() => openBlockDetails(block)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{block.title}</span>
                    <Badge className="border border-amber-200 bg-amber-100 text-amber-700">Bloqueado</Badge>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {new Date(block.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} até {new Date(block.endsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-gray-500">
                    Sala: {block.room || "Todas"} · Profissional: {block.doctorId ? getDoctorName(block.doctorId) : "Todos"}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#C9A55B]" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Próximos agendamentos</p>
          </div>
          <div className="mt-3 space-y-3">
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum agendamento futuro no filtro atual.</p>
            ) : (
              upcomingAppointments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:border-[#C9A55B]/40"
                  onClick={() => openAppointmentDetails(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {new Date(item.scheduledAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-sm text-[#8A6526]">
                      {new Date(item.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-900">{getPatientName(item.patientId)}</p>
                  <p className="text-xs text-gray-500">{item.room || "Sem sala"}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#C9A55B]" />
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Histórico recente</p>
          </div>
          <div className="mt-3 space-y-3">
            {pastAppointments.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum atendimento anterior no filtro atual.</p>
            ) : (
              pastAppointments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:border-[#C9A55B]/40"
                  onClick={() => openAppointmentDetails(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {new Date(item.scheduledAt).toLocaleDateString("pt-BR")}
                    </span>
                    <Badge className="border border-gray-200 bg-white text-gray-700">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-900">{getPatientName(item.patientId)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Paciente *</Label>
              <Select value={appointmentForm.patientId || undefined} onValueChange={(value) => setAppointmentForm((current) => ({ ...current, patientId: value }))}>
                <SelectTrigger className="mt-1 border-gray-300">
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients?.map((patient) => (
                    <SelectItem key={patient.id} value={String(patient.id)}>
                      {patient.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Profissional *</Label>
              <Select value={appointmentForm.doctorId || undefined} onValueChange={(value) => setAppointmentForm((current) => ({ ...current, doctorId: value }))}>
                <SelectTrigger className="mt-1 border-gray-300">
                  <SelectValue placeholder="Selecione um profissional" />
                </SelectTrigger>
                <SelectContent>
                  {doctors?.map((doctor) => (
                    <SelectItem key={doctor.id} value={String(doctor.id)}>
                      {doctor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Data e hora *</Label>
              <Input
                type="datetime-local"
                value={appointmentForm.scheduledAt}
                onChange={(event) => setAppointmentForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                className="mt-1 border-gray-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Tipo *</Label>
                <Select value={appointmentForm.type} onValueChange={(value) => setAppointmentForm((current) => ({ ...current, type: value }))}>
                  <SelectTrigger className="mt-1 border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold">Sala *</Label>
                <Input
                  placeholder="Ex.: Sala 1"
                  value={appointmentForm.room}
                  onChange={(event) => setAppointmentForm((current) => ({ ...current, room: event.target.value }))}
                  className="mt-1 border-gray-300"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Duração (minutos)</Label>
              <Input
                type="number"
                min={5}
                value={appointmentForm.durationMinutes}
                onChange={(event) => setAppointmentForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                className="mt-1 border-gray-300"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Observações</Label>
              <Textarea
                value={appointmentForm.notes}
                onChange={(event) => setAppointmentForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                className="mt-1 border-gray-300"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-gray-300">
              Cancelar
            </Button>
            <Button onClick={handleCreateAppointment} className="btn-gold-gradient" disabled={createAppointmentMutation.isPending}>
              {createAppointmentMutation.isPending ? "Salvando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bloquear agenda</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Título *</Label>
              <Input
                value={blockForm.title}
                onChange={(event) => setBlockForm((current) => ({ ...current, title: event.target.value }))}
                className="mt-1 border-gray-300"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Profissional</Label>
              <Select value={blockForm.doctorId} onValueChange={(value) => setBlockForm((current) => ({ ...current, doctorId: value }))}>
                <SelectTrigger className="mt-1 border-gray-300">
                  <SelectValue placeholder="Todos os profissionais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os profissionais</SelectItem>
                  {doctors?.map((doctor) => (
                    <SelectItem key={doctor.id} value={String(doctor.id)}>
                      {doctor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Sala</Label>
              <Input
                value={blockForm.room}
                onChange={(event) => setBlockForm((current) => ({ ...current, room: event.target.value }))}
                placeholder="Deixe em branco para todas"
                className="mt-1 border-gray-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Início *</Label>
                <Input
                  type="datetime-local"
                  value={blockForm.startsAt}
                  onChange={(event) => setBlockForm((current) => ({ ...current, startsAt: event.target.value }))}
                  className="mt-1 border-gray-300"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Fim *</Label>
                <Input
                  type="datetime-local"
                  value={blockForm.endsAt}
                  onChange={(event) => setBlockForm((current) => ({ ...current, endsAt: event.target.value }))}
                  className="mt-1 border-gray-300"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Observações</Label>
              <Textarea
                rows={3}
                value={blockForm.notes}
                onChange={(event) => setBlockForm((current) => ({ ...current, notes: event.target.value }))}
                className="mt-1 border-gray-300"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)} className="border-gray-300">
              Cancelar
            </Button>
            <Button onClick={handleCreateBlock} className="btn-gold-gradient" disabled={createBlockMutation.isPending}>
              {createBlockMutation.isPending ? "Salvando..." : "Salvar bloqueio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent?.eventType === "block" ? "Detalhes do bloqueio" : "Detalhes do agendamento"}
            </DialogTitle>
          </DialogHeader>

          {selectedEvent?.eventType === "appointment" ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Paciente</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {selectedEvent.patientName ?? getPatientName(selectedEvent.patientId)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Profissional</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {selectedEvent.doctorName ?? getDoctorName(selectedEvent.doctorId)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Data</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {new Date(selectedEvent.scheduledAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Horário</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {new Date(selectedEvent.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Sala</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{selectedEvent.room || "Sem sala"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Fim previsto</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {getAppointmentEnd(selectedEvent).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className="border border-[#C9A55B]/25 bg-[#C9A55B]/10 text-[#8A6526]">
                  {STATUS_LABELS[selectedEvent.status] ?? selectedEvent.status}
                </Badge>
                <Badge className="border border-gray-200 bg-white text-gray-700">{selectedEvent.type ?? "Consulta"}</Badge>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Observações</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                  {selectedEvent.notes || "Nenhuma observação registrada para este agendamento."}
                </p>
              </div>
            </div>
          ) : selectedEvent ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Título</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{selectedEvent.title}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Sala</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{selectedEvent.room || "Todas"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Início</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{new Date(selectedEvent.startsAt).toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Fim</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{new Date(selectedEvent.endsAt).toLocaleString("pt-BR")}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Observações</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                  {selectedEvent.notes || "Sem observações adicionais para este bloqueio."}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-wrap gap-2">
            {selectedEvent?.eventType === "appointment" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "confirmada" })}
                >
                  Confirmar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "cancelada" })}
                >
                  Cancelar
                </Button>
                <Button
                  className="btn-gold-gradient"
                  onClick={() => setLocation(`/prontuarios/${selectedEvent.patientId}`)}
                >
                  Atender
                </Button>
              </>
            ) : selectedEvent ? (
              <Button
                variant="outline"
                onClick={() => deleteBlockMutation.mutate({ blockId: selectedEvent.id })}
                disabled={deleteBlockMutation.isPending}
              >
                Remover bloqueio
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSelectedEvent(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
