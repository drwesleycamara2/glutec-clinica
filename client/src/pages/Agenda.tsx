import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { patientDisplayName } from "@/lib/patientDisplay";
import {
  generateTimeSlotsForDate,
  getScheduleForProfessional,
  isDateTimeInsideSchedule,
  normalizeOpeningHoursConfig,
  sortTimeSlots,
} from "@shared/schedule-hours";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PatientAutocomplete } from "@/components/PatientAutocomplete";
import { toast } from "sonner";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
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

const DURATION_OPTIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1 hora e meia" },
  { value: "120", label: "2 horas" },
  { value: "150", label: "2 horas e meia" },
  { value: "180", label: "3 horas" },
  { value: "210", label: "3 horas e meia" },
  { value: "240", label: "4 horas" },
  { value: "270", label: "4 horas e meia" },
  { value: "300", label: "5 horas" },
  { value: "330", label: "5 horas e meia" },
  { value: "360", label: "6 horas" },
  { value: "other", label: "Outro" },
];

function getDurationPreset(durationMinutes: unknown) {
  const value = String(durationMinutes ?? "30");
  return DURATION_OPTIONS.some((option) => option.value === value) ? value : "other";
}

function formatCustomDurationHours(durationMinutes: unknown) {
  const minutes = Number(durationMinutes ?? 30);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return String(Number((minutes / 60).toFixed(2))).replace(".", ",");
}
const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  concluida: "Atendimento concluído",
  cancelada: "Cancelada",
  falta: "Faltou",
};

const DAY_STATUS_COLORS = {
  livre: "bg-green-500",
  parcial: "bg-yellow-500",
  ocupado: "bg-red-500",
  bloqueado: "bg-purple-500",
  fechado: "bg-black",
  sabado_vazio: "bg-gray-400",
  sabado_ocupado: "bg-red-500",
};

const DAY_STATUS_LABELS: Record<keyof typeof DAY_STATUS_COLORS, string> = {
  livre: "Livre",
  parcial: "Parcialmente livre",
  ocupado: "Ocupado",
  bloqueado: "Bloqueado ou feriado",
  fechado: "Fechado",
  sabado_vazio: "Sábado livre",
  sabado_ocupado: "Sábado com atendimento",
};

const defaultAppointmentForm = {
  appointmentId: "",
  patientId: "",
  doctorId: "",
  scheduledAt: "",
  durationMinutes: "30",
  durationPreset: "30",
  customDurationHours: "",
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

type ViewMode = "day" | "week";

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

function repairImportedText(value?: string | null) {
  let content = String(value ?? "");
  if (!content) return "";
  if (/[\u00c3\u00c2\uFFFD]/.test(content) || /\u00e2[\u0080-\u00bf]/.test(content)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const bytes = Uint8Array.from(Array.from(content).map((char) => char.charCodeAt(0) & 0xff));
        const decoded = new TextDecoder("utf-8").decode(bytes);
        if (!decoded || decoded === content) break;
        content = decoded;
      } catch {
        break;
      }
    }
  }
  return content.replace(/\uFFFD/g, "").trim();
}

function formatImportedText(value?: string | null) {
  let content = repairImportedText(value);
  if (!content) return "";
  const entities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, entity) => entities[entity] ?? match)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  agendada: "border border-yellow-300 bg-yellow-100 text-yellow-700",
  confirmada: "border border-emerald-300 bg-emerald-100 text-emerald-700",
  aguardando: "border border-amber-300 bg-amber-100 text-amber-800",
  em_atendimento: "border border-sky-300 bg-sky-100 text-sky-700",
  concluida: "border border-gray-200 bg-white text-gray-700",
  cancelada: "border border-rose-300 bg-rose-100 text-rose-700",
  falta: "border border-zinc-300 bg-zinc-100 text-zinc-700",
};

function getStatusBadgeClass(status?: string) {
  return STATUS_BADGE_CLASSES[String(status ?? "")] ?? "border border-gray-200 bg-white text-gray-700";
}

function getCancellationSummary(appointment: any) {
  if (appointment?.status !== "cancelada") return "";
  const summary = formatImportedText(appointment?.cancelReason);
  return summary || "Agendamento cancelado.";
}

function normalizeAppointmentDedupeKeyPart(value: unknown) {
  return formatImportedText(String(value ?? ""))
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function appointmentDedupeKey(appointment: any) {
  const date = new Date(appointment?.scheduledAt);
  const scheduledKey = Number.isNaN(date.getTime())
    ? normalizeAppointmentDedupeKeyPart(appointment?.scheduledAt)
    : date.toISOString();

  return [
    normalizeAppointmentDedupeKeyPart(appointment?.patientName) || appointment?.patientId,
    normalizeAppointmentDedupeKeyPart(appointment?.doctorName) || appointment?.doctorId,
    scheduledKey,
  ].join("|");
}

const APPOINTMENT_STATUS_PRIORITY: Record<string, number> = {
  cancelada: 8,
  concluida: 7,
  em_atendimento: 6,
  aguardando: 5,
  confirmada: 4,
  agendada: 3,
  falta: 2,
};

function appointmentStatusPriority(appointment: any) {
  return APPOINTMENT_STATUS_PRIORITY[normalizeAppointmentDedupeKeyPart(appointment?.status)] ?? 0;
}

function appointmentUpdatedTime(appointment: any) {
  const date = new Date(appointment?.updatedAt || appointment?.createdAt || appointment?.scheduledAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeAccessText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function canManageAppointmentSchedule(user: any) {
  const role = normalizeAccessText(user?.role);
  const profession = normalizeAccessText(user?.profession);
  const text = `${role} ${profession}`;
  return role === "admin" || role === "gerente" || role === "recepcionista" || text.includes("secretaria") || text.includes("recepc");
}

function getProfessionalDisplayRole(user: any) {
  const role = normalizeAccessText(user?.role);
  const profession = normalizeAccessText(user?.profession);
  const specialty = normalizeAccessText(user?.specialty);
  const licenseType = normalizeAccessText(user?.professionalLicenseType);
  const combined = `${role} ${profession} ${specialty} ${licenseType}`;

  if (combined.includes("massoterapeuta")) return "Massoterapeuta";
  if (role === "medico" || combined.includes("medic") || combined.includes("crm") || combined.includes("cirurg")) return "Médico";
  return String(user?.specialty || user?.profession || user?.role || "Profissional").trim();
}

function formatProfessionalOption(user: any) {
  const roleLabel = getProfessionalDisplayRole(user);
  return roleLabel ? `${user?.name ?? "Profissional"} — ${roleLabel}` : String(user?.name ?? "Profissional");
}

function appointmentMetadataScore(appointment: any) {
  return [
    appointment?.patientName,
    appointment?.patientPhone,
    appointment?.patientEmail,
    appointment?.doctorName,
    appointment?.notes,
    appointment?.cancelReason,
    appointment?.room,
  ].reduce((score, value) => score + String(value ?? "").trim().length, 0);
}

function shouldReplaceDisplayAppointment(current: any, candidate: any) {
  const currentStatus = appointmentStatusPriority(current);
  const candidateStatus = appointmentStatusPriority(candidate);
  if (candidateStatus !== currentStatus) return candidateStatus > currentStatus;

  const candidateUpdated = appointmentUpdatedTime(candidate);
  const currentUpdated = appointmentUpdatedTime(current);
  if (candidateUpdated !== currentUpdated) return candidateUpdated > currentUpdated;

  const candidateScore = appointmentMetadataScore(candidate);
  const currentScore = appointmentMetadataScore(current);
  if (candidateScore !== currentScore) return candidateScore > currentScore;

  return Number(candidate?.id ?? 0) > Number(current?.id ?? 0);
}

function dedupeAppointments(items: any[] = []) {
  const byKey = new Map<string, any>();

  for (const appointment of items) {
    const key = appointmentDedupeKey(appointment);
    const current = byKey.get(key);
    if (!current || shouldReplaceDisplayAppointment(current, appointment)) {
      byKey.set(key, appointment);
    }
  }

  return Array.from(byKey.values());
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

function toDateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function Agenda() {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const canManageSchedule = canManageAppointmentSchedule(currentUser);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDoctor, setSelectedDoctor] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [appointmentForm, setAppointmentForm] = useState(defaultAppointmentForm);
  const [blockForm, setBlockForm] = useState(defaultBlockForm);
  const [arrivalTime, setArrivalTime] = useState("");

  const broadRangeStart = useMemo(() => new Date(calendarYear - 1, 0, 1, 0, 0, 0, 0), [calendarYear]);
  const broadRangeEnd = useMemo(() => new Date(calendarYear + 1, 11, 31, 23, 59, 59, 999), [calendarYear]);

  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 5000 });
  const { data: clinicSettings } = trpc.clinic.get.useQuery();
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
  const updateAppointmentMutation = trpc.appointments.update.useMutation({
    onSuccess: () => {
      toast.success("Agendamento atualizado com sucesso.");
      setShowCreateDialog(false);
      setSelectedEvent(null);
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

  const structuralSectors = useMemo(() => {
    const values = Array.isArray(clinicSettings?.structuralSectors) ? clinicSettings.structuralSectors : [];
    return values.length > 0 ? values : ["Consultório", "Centro Cirúrgico"];
  }, [clinicSettings]);

  const openingHoursConfig = useMemo(() => normalizeOpeningHoursConfig(clinicSettings?.openingHours), [clinicSettings?.openingHours]);
  const selectedSchedule = useMemo(
    () => getScheduleForProfessional(openingHoursConfig, selectedDoctor),
    [openingHoursConfig, selectedDoctor],
  );

  const isEditingAppointment = Boolean(appointmentForm.appointmentId);
  const isSavingAppointment = createAppointmentMutation.isPending || updateAppointmentMutation.isPending;

  const filteredAppointments = useMemo(() => {
    return dedupeAppointments(appointments ?? [])
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

  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDayOfMonth = getFirstDayOfMonth(calendarYear, calendarMonth);

  const calendarDays = useMemo(() => {
    const values: Array<number | null> = [];
    for (let index = 0; index < firstDayOfMonth; index += 1) values.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) values.push(day);
    return values;
  }, [daysInMonth, firstDayOfMonth]);

  const getPatientName = (patientId: number) =>
    (() => { const patient = patients?.find((item) => item.id === patientId); return patient ? patientDisplayName(patient) : `Paciente #${patientId}`; })();

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

  const visibleTimeSlots = useMemo(() => {
    const configuredSlots = generateTimeSlotsForDate(selectedDate, selectedSchedule);
    const appointmentSlots = Object.keys(slotMap);
    return sortTimeSlots([...configuredSlots, ...appointmentSlots]);
  }, [selectedDate, selectedSchedule, slotMap]);

  const blockForSlot = (slot: string) => {
    const slotStart = buildDateTimeForSlot(selectedDate, slot);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

    return selectedDayBlocks.find((block) =>
      doesRangeOverlap(new Date(block.startsAt), new Date(block.endsAt), slotStart, slotEnd)
    );
  };

  const getDayStatus = (date: Date): keyof typeof DAY_STATUS_COLORS => {
    const dayOfWeek = date.getDay();

    const dayAppointments = filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.scheduledAt), date));
    const activeDayAppointments = dayAppointments.filter((appointment) => appointment.status !== "cancelada");
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const dayBlocks = filteredBlocks.filter((block) =>
      doesRangeOverlap(new Date(block.startsAt), new Date(block.endsAt), dayStart, dayEnd)
    );
    const daySlots = generateTimeSlotsForDate(date, getScheduleForProfessional(openingHoursConfig, selectedDoctor));

    if (daySlots.length === 0) return "fechado";
    if (dayBlocks.length > 0) return "bloqueado";

    if (dayOfWeek === 6) {
      return activeDayAppointments.length > 0 ? "sabado_ocupado" : "sabado_vazio";
    }

    if (activeDayAppointments.length === 0) return "livre";
    if (activeDayAppointments.length >= Math.max(daySlots.length, 1)) return "ocupado";
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
      scheduledAt: toDateTimeInputValue(scheduledAt),
    });
    setShowCreateDialog(true);
  };

  const handleCreateAppointment = () => {
    if (!appointmentForm.patientId || !appointmentForm.doctorId || !appointmentForm.scheduledAt || !appointmentForm.room.trim()) {
      toast.error("Preencha paciente, profissional, data, horário e local do atendimento.");
      return;
    }

    const durationMinutes = appointmentForm.durationPreset === "other"
      ? Math.round(Number(String(appointmentForm.customDurationHours || "").replace(",", ".")) * 60)
      : Number(appointmentForm.durationPreset || appointmentForm.durationMinutes || "30");

    if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
      toast.error("Informe uma duração válida para o atendimento.");
      return;
    }

    const scheduledDate = new Date(appointmentForm.scheduledAt);
    const doctorSchedule = getScheduleForProfessional(openingHoursConfig, appointmentForm.doctorId);
    if (Number.isNaN(scheduledDate.getTime())) {
      toast.error("Informe uma data e horário válidos para o atendimento.");
      return;
    }

    if (!isDateTimeInsideSchedule(scheduledDate, doctorSchedule, durationMinutes)) {
      const confirmed = window.confirm(
        "Este horário está fora do horário de funcionamento da clínica ou da agenda aberta do profissional. Deseja agendar mesmo assim?"
      );
      if (!confirmed) return;
    }
    const payload = {
      patientId: Number(appointmentForm.patientId),
      doctorId: Number(appointmentForm.doctorId),
      scheduledAt: appointmentForm.scheduledAt,
      durationMinutes,
      room: appointmentForm.room.trim(),
      type: appointmentForm.type,
      notes: appointmentForm.notes,
    };

    if (appointmentForm.appointmentId) {
      updateAppointmentMutation.mutate({
        appointmentId: Number(appointmentForm.appointmentId),
        ...payload,
      });
      return;
    }

    createAppointmentMutation.mutate(payload);
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
    setArrivalTime(appointment.arrivedAt ? toDateTimeInputValue(new Date(appointment.arrivedAt)) : "");
  };

  const openEditAppointment = (appointment: any) => {
    const duration = String(appointment.duration ?? appointment.durationMinutes ?? 30);
    const durationPreset = getDurationPreset(duration);
    setAppointmentForm({
      appointmentId: String(appointment.id),
      patientId: String(appointment.patientId),
      doctorId: String(appointment.doctorId),
      scheduledAt: toDateTimeInputValue(new Date(appointment.scheduledAt)),
      durationMinutes: duration,
      durationPreset,
      customDurationHours: durationPreset === "other" ? formatCustomDurationHours(duration) : "",
      type: appointment.type || "consulta",
      notes: formatImportedText(appointment.notes) || "",
      room: appointment.room || "",
    });
    setSelectedEvent(null);
    setShowCreateDialog(true);
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
    <div className="flex items-start gap-5">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {canManageSchedule ? (
              <Button
                onClick={() => {
                  setAppointmentForm(defaultAppointmentForm);
                  setShowCreateDialog(true);
                }}
                className="btn-gold-gradient font-semibold text-slate-950 hover:text-slate-950"
              >
                <Plus className="mr-2 h-4 w-4" />
                Agendar
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950"
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
            <Button variant="outline" size="sm" className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950">
              <UserCheck className="mr-2 h-4 w-4" />
              Check-in
            </Button>
          </div>

          <div className="flex gap-2">
            {(["day", "week"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode(mode)}
                className={viewMode === mode ? "btn-gold-gradient font-semibold text-slate-950 hover:text-slate-950" : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950"}
              >
                {mode === "day" ? "Dia" : "Semana"}
              </Button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950" onClick={() => setLocation("/configuracoes")}>
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

            <div className="rounded-lg border border-gray-300 bg-white">
              <table className="w-full">
                <thead className="bg-gray-100 backdrop-blur">
                  <tr className="text-xs font-semibold text-gray-700">
                    <th className="w-10 px-2 py-2 text-center"></th>
                    <th className="w-24 px-3 py-2 text-left">Horário</th>
                    <th className="px-3 py-2 text-left">Paciente</th>
                    <th className="w-28 px-3 py-2 text-left">Tipo</th>
                    <th className="w-32 px-3 py-2 text-left">Local</th>
                    <th className="w-32 px-3 py-2 text-center">Situação</th>
                    <th className="w-24 px-3 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTimeSlots.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border-t border-gray-200 px-3 py-10 text-center text-sm text-gray-500">
                        Agenda fechada neste dia para o filtro selecionado.
                      </td>
                    </tr>
                  ) : null}
                  {visibleTimeSlots.map((slot) => {
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
                          {appointment.status === "cancelada" ? (
                            <p className="mt-1 text-xs text-rose-600">{getCancellationSummary(appointment)}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs capitalize text-gray-600">{appointment.type ?? "Consulta"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-600">{appointment.room || "Não informado"}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge className={getStatusBadgeClass(appointment.status)}>
                            {STATUS_LABELS[appointment.status] ?? appointment.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button type="button" className="text-xs text-gray-600 hover:text-gray-900" onClick={() => openAppointmentDetails(appointment)}>
                            Ver detalhes
                          </button>
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
                              <Badge className={getStatusBadgeClass(item.status)}>
                                {STATUS_LABELS[item.status] ?? item.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-gray-900">{getPatientName(item.patientId)}</p>
                            <p className="text-xs text-gray-500">
                              {getDoctorName(item.doctorId)} · {item.room || "Sem sala"}
                            </p>
                            {item.status === "cancelada" ? (
                              <p className="mt-2 text-xs text-rose-600">{getCancellationSummary(item)}</p>
                            ) : null}
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
      </div>

      <div className="flex w-80 flex-col gap-4">
        <div className="rounded-lg border border-gray-300 bg-white p-4">
          <Label className="mb-2 block text-sm font-semibold text-gray-700">Profissional selecionado</Label>
          <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
            <SelectTrigger className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950">
              <SelectValue placeholder="Selecione um profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {doctors?.map((doctor) => (
                <SelectItem key={doctor.id} value={String(doctor.id)}>
                  {formatProfessionalOption(doctor)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={goToToday} className="btn-gold-gradient w-full font-semibold text-slate-950 hover:text-slate-950">
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
                  onClick={() => {
                    setSelectedDate(date);
                    setViewMode("day");
                  }}
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
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Legenda</p>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-green-500" />
            <span className="text-gray-700">Dia livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-yellow-500" />
            <span className="text-gray-700">Alguns horários vagos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-red-500" />
            <span className="text-gray-700">Agenda cheia</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-purple-500" />
            <span className="text-gray-700">Bloqueado / feriado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-black" />
            <span className="text-gray-700">Fechado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-gray-400" />
            <span className="text-gray-700">Sábado sem agenda</span>
          </div>
          <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
            <div className="h-4 w-4 rounded bg-red-500" />
            <span className="text-gray-700">Sábado com atendimento (exceção)</span>
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

      </div>

      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            setAppointmentForm(defaultAppointmentForm);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-md overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>{isEditingAppointment ? "Alterar agendamento" : "Novo agendamento"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Paciente *</Label>
              <PatientAutocomplete
                className="mt-1"
                value={
                  appointmentForm.patientId
                    ? (patients ?? []).find((item) => String(item.id) === appointmentForm.patientId) ?? {
                        id: Number(appointmentForm.patientId),
                        fullName: appointmentForm.patientId,
                      }
                    : null
                }
                onSelect={(patient) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    patientId: patient ? String(patient.id) : "",
                  }))
                }
                placeholder="Digite o nome, número de prontuário ou telefone…"
              />
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
                      {formatProfessionalOption(doctor)}
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

            <div className="grid gap-3 md:grid-cols-2">
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
                <Label className="text-sm font-semibold">Local do atendimento *</Label>
                <Select value={appointmentForm.room || undefined} onValueChange={(value) => setAppointmentForm((current) => ({ ...current, room: value }))}>
                  <SelectTrigger className="mt-1 border-gray-300">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    {structuralSectors.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Duração do procedimento</Label>
              <Select
                value={appointmentForm.durationPreset}
                onValueChange={(value) => setAppointmentForm((current) => ({
                  ...current,
                  durationPreset: value,
                  durationMinutes: value === "other" ? current.durationMinutes : value,
                  customDurationHours: value === "other" ? current.customDurationHours : "",
                }))}
              >
                <SelectTrigger className="mt-1 min-w-0 border-gray-300">
                  <SelectValue placeholder="Selecione a duração" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {appointmentForm.durationPreset === "other" ? (
                <Input
                  type="text"
                  inputMode="decimal"
                  value={appointmentForm.customDurationHours}
                  onChange={(event) => setAppointmentForm((current) => ({ ...current, customDurationHours: event.target.value }))}
                  placeholder="Informe a duração em horas"
                  className="mt-2 border-gray-300"
                />
              ) : null}
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
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950">
              Cancelar
            </Button>
            <Button onClick={handleCreateAppointment} className="btn-gold-gradient font-semibold text-slate-950 hover:text-slate-950" disabled={isSavingAppointment}>
              {isSavingAppointment ? "Salvando..." : isEditingAppointment ? "Salvar alterações" : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-md overflow-y-auto overscroll-contain">
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
                      {formatProfessionalOption(doctor)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Local</Label>
              <Select value={blockForm.room || "all"} onValueChange={(value) => setBlockForm((current) => ({ ...current, room: value === "all" ? "" : value }))}>
                <SelectTrigger className="mt-1 border-gray-300">
                  <SelectValue placeholder="Deixe em branco para todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {structuralSectors.map((sector) => (
                    <SelectItem key={sector} value={sector}>
                      {sector}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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
            <Button variant="outline" onClick={() => setShowBlockDialog(false)} className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-950">
              Cancelar
            </Button>
            <Button onClick={handleCreateBlock} className="btn-gold-gradient font-semibold text-slate-950 hover:text-slate-950" disabled={createBlockMutation.isPending}>
              {createBlockMutation.isPending ? "Salvando..." : "Salvar bloqueio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto overscroll-contain">
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
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Local</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{selectedEvent.room || "Não informado"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Fim previsto</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {getAppointmentEnd(selectedEvent).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge className={getStatusBadgeClass(selectedEvent.status)}>
                  {STATUS_LABELS[selectedEvent.status] ?? selectedEvent.status}
                </Badge>
                <Badge className="border border-gray-200 bg-white text-gray-700">{selectedEvent.type ?? "Consulta"}</Badge>
                {selectedEvent.arrivedAt ? (
                  <Badge className="border border-amber-200 bg-amber-50 text-amber-800">
                    Chegada: {new Date(selectedEvent.arrivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                ) : null}
              </div>

              {!["cancelada", "concluida", "falta"].includes(String(selectedEvent.status)) ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-50">
                  <Label className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900 dark:text-amber-100">Horário de chegada</Label>
                  <Input
                    type="datetime-local"
                    value={arrivalTime}
                    onChange={(event) => setArrivalTime(event.target.value)}
                    className="mt-2 border-amber-300 bg-white text-slate-950 placeholder:text-slate-500 [color-scheme:light] dark:border-amber-600 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-400 dark:[color-scheme:dark]"
                  />
                  <p className="mt-2 text-xs text-amber-900 dark:text-amber-100">Se ficar em branco, o sistema usará o horário exato em que você marcar como aguardando.</p>
                </div>
              ) : null}
              {selectedEvent.status === "cancelada" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-600">Cancelamento</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-rose-700">
                    {getCancellationSummary(selectedEvent)}
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Observações</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                  {formatImportedText(selectedEvent.notes) || "Nenhuma observação registrada para este agendamento."}
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
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Local</p>
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
                  {formatImportedText(selectedEvent.notes) || "Sem observações adicionais para este bloqueio."}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-wrap gap-2">
            {selectedEvent?.eventType === "appointment" ? (
              <>
                {canManageSchedule ? (
                  <Button variant="outline" onClick={() => openEditAppointment(selectedEvent)}>
                    Alterar
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "confirmada" })}
                >
                  Confirmar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "aguardando", arrivedAt: arrivalTime || undefined })}
                >
                  Aguardando
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "falta" })}
                >
                  Faltou
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateStatusMutation.mutate({ appointmentId: selectedEvent.id, status: "cancelada", cancelledBy: "clinica" })}
                >
                  Cancelar
                </Button>
                <Button
                  className="btn-gold-gradient font-semibold text-slate-950 hover:text-slate-950"
                  onClick={() => updateStatusMutation.mutate(
                    { appointmentId: selectedEvent.id, status: "em_atendimento" },
                    { onSuccess: () => setLocation(`/prontuarios/${selectedEvent.patientId}`) },
                  )}
                >
                  Abrir prontuário
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
