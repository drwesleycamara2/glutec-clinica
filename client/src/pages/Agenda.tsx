import { useState, useMemo } from "react";
import { Calendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CalendarDays, Loader2, Clock, User, Stethoscope } from "lucide-react";

moment.locale("pt-br");
const localizer = momentLocalizer(moment);

const APPOINTMENT_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "exame", label: "Exame" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-800",
  confirmada: "bg-green-100 text-green-800",
  em_atendimento: "bg-yellow-100 text-yellow-800",
  concluida: "bg-gray-100 text-gray-700",
  cancelada: "bg-red-100 text-red-800",
  falta: "bg-orange-100 text-orange-800",
};

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_atendimento: "Em Atendimento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  falta: "Falta",
};

const EVENT_COLORS: Record<string, string> = {
  agendada: "#3b82f6",
  confirmada: "#22c55e",
  em_atendimento: "#f59e0b",
  concluida: "#9ca3af",
  cancelada: "#ef4444",
  falta: "#f97316",
};

const defaultForm = {
  patientId: "", doctorId: "", scheduledAt: "",
  durationMinutes: "30", type: "consulta", notes: "",
};

export default function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<any>(Views.WEEK);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);

  const rangeStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const rangeEnd = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 14);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [currentDate]);

  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 200 });
  const { data: appointments, refetch } = trpc.appointments.getByDate.useQuery({
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
  });

  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => { toast.success("Consulta agendada!"); setShowCreate(false); setForm(defaultForm); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); setSelectedEvent(null); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const filteredAppointments = useMemo(() =>
    (appointments ?? []).filter((a) => !selectedDoctorId || a.doctorId === selectedDoctorId),
    [appointments, selectedDoctorId]);

  const calendarEvents = useMemo(() =>
    filteredAppointments.map((apt) => {
      const start = new Date(apt.scheduledAt);
      const end = new Date(start.getTime() + (apt.durationMinutes ?? 30) * 60000);
      const patient = patients?.find((p) => p.id === apt.patientId);
      const doctor = doctors?.find((d) => d.id === apt.doctorId);
      return {
        id: apt.id,
        title: patient?.fullName ?? `Paciente #${apt.patientId}`,
        start, end,
        resource: { ...apt, patientName: patient?.fullName, doctorName: doctor?.name },
      };
    }), [filteredAppointments, patients, doctors]);

  const handleSelectSlot = ({ start }: { start: Date; end: Date }) => {
    setForm({ ...defaultForm, scheduledAt: start.toISOString().slice(0, 16) });
    setShowCreate(true);
  };

  const eventStyleGetter = (event: any) => ({
    style: {
      backgroundColor: EVENT_COLORS[event.resource?.status ?? "agendada"] ?? "#3b82f6",
      borderRadius: "6px", border: "none", color: "white", fontSize: "12px", padding: "2px 6px",
    },
  });

  const messages = {
    today: "Hoje", previous: "Anterior", next: "Próximo",
    month: "Mês", week: "Semana", day: "Dia", agenda: "Lista",
    date: "Data", time: "Hora", event: "Consulta",
    noEventsInRange: "Nenhuma consulta neste período.",
    showMore: (total: number) => `+${total} mais`,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">{filteredAppointments.length} consulta(s) no período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedDoctorId?.toString() ?? "all"} onValueChange={(v) => setSelectedDoctorId(v === "all" ? null : parseInt(v))}>
            <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Todos os médicos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os médicos</SelectItem>
              {doctors?.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm(defaultForm); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-2" />Nova Consulta
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Badge key={key} className={`text-xs font-normal ${STATUS_COLORS[key]}`}>{label}</Badge>
        ))}
      </div>

      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
            view={view}
            onView={setView}
            date={currentDate}
            onNavigate={setCurrentDate}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={(e: any) => setSelectedEvent(e.resource)}
            selectable
            eventPropGetter={eventStyleGetter}
            messages={messages}
            min={new Date(0, 0, 0, 7, 0, 0)}
            max={new Date(0, 0, 0, 20, 0, 0)}
            step={15}
            timeslots={4}
          />
        </CardContent>
      </Card>

      {/* Modal criar consulta */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Agendar Consulta</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Paciente *</Label>
              <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                <SelectContent>{patients?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.fullName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Médico *</Label>
              <Select value={form.doctorId} onValueChange={(v) => setForm({ ...form, doctorId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                <SelectContent>{doctors?.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}{d.specialty ? ` - ${d.specialty}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data e Hora *</Label>
                <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Duração</Label>
                <Select value={form.durationMinutes} onValueChange={(v) => setForm({ ...form, durationMinutes: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{[15, 20, 30, 45, 60, 90, 120].map((d) => <SelectItem key={d} value={d.toString()}>{d} min</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{APPOINTMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.patientId || !form.doctorId || !form.scheduledAt) return toast.error("Preencha paciente, médico e horário.");
              createMutation.mutate({
                patientId: parseInt(form.patientId), doctorId: parseInt(form.doctorId),
                scheduledAt: new Date(form.scheduledAt).toISOString(),
                durationMinutes: parseInt(form.durationMinutes),
                type: form.type as any, notes: form.notes || undefined,
              });
            }} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal detalhes */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />Detalhes da Consulta
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Paciente</p><p className="text-sm font-medium">{selectedEvent.patientName ?? `#${selectedEvent.patientId}`}</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Médico</p><p className="text-sm font-medium">{selectedEvent.doctorName ?? `#${selectedEvent.doctorId}`}</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Horário</p>
                  <p className="text-sm font-medium">{new Date(selectedEvent.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {selectedEvent.durationMinutes} min</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={`text-xs ${STATUS_COLORS[selectedEvent.status] ?? ""}`}>{STATUS_LABELS[selectedEvent.status] ?? selectedEvent.status}</Badge>
              </div>
              {selectedEvent.notes && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{selectedEvent.notes}</p>
                </div>
              )}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {selectedEvent.status === "agendada" && (
                <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => updateStatusMutation.mutate({ id: selectedEvent.id, status: "confirmada" })}>Confirmar</Button>
              )}
              {["agendada", "confirmada"].includes(selectedEvent.status) && (
                <Button size="sm" variant="outline" className="text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                  onClick={() => updateStatusMutation.mutate({ id: selectedEvent.id, status: "em_atendimento" })}>Iniciar Atendimento</Button>
              )}
              {selectedEvent.status === "em_atendimento" && (
                <Button size="sm" variant="outline" className="text-blue-700 border-blue-200 hover:bg-blue-50"
                  onClick={() => updateStatusMutation.mutate({ id: selectedEvent.id, status: "concluida" })}>Concluir</Button>
              )}
              {!["concluida", "cancelada"].includes(selectedEvent.status) && (
                <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50"
                  onClick={() => updateStatusMutation.mutate({ id: selectedEvent.id, status: "cancelada" })}>Cancelar</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
