import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CalendarDays, Loader2, Clock, User, Stethoscope, ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Search } from "lucide-react";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const APPOINTMENT_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "exame", label: "Exame" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  agendada: { label: "Agendado", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-400" },
  confirmada: { label: "Confirmado", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-400" },
  presente: { label: "Presente", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-400" },
  em_atendimento: { label: "Em Atendimento", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", dot: "bg-purple-400" },
  concluida: { label: "Atendido", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30", dot: "bg-gray-400" },
  cancelada: { label: "Cancelada", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", dot: "bg-red-400" },
  falta: { label: "Falta", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", dot: "bg-orange-400" },
};

// Generate time slots from 08:00 to 19:30 (30-min intervals)
function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = 8; h < 20; h++) {
    slots.push(`${h.toString().padStart(2, "0")}:00`);
    slots.push(`${h.toString().padStart(2, "0")}:30`);
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

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function formatDateHeader(date: Date) {
  const dayName = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"][date.getDay()];
  const day = date.getDate();
  const month = MONTHS_PT[date.getMonth()].toUpperCase();
  const year = date.getFullYear();
  return `${dayName}, ${day} DE ${month} DE ${year}`;
}

const defaultForm = {
  patientId: "", doctorId: "", scheduledAt: "",
  durationMinutes: "30", type: "consulta", notes: "",
};

export default function Agenda() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [searchTerm, setSearchTerm] = useState("");

  const dayStart = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [selectedDate]);

  const dayEnd = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [selectedDate]);

  const { data: doctors } = trpc.admin.getDoctors.useQuery();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 500 });
  const { data: appointments, refetch } = trpc.appointments.getByDate.useQuery({
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });

  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => { toast.success("Consulta agendada!"); setShowCreate(false); setForm(defaultForm); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStatusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); setSelectedEvent(null); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { agendada: 0, confirmada: 0, presente: 0, concluida: 0 };
    (appointments ?? []).forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
    return counts;
  }, [appointments]);

  // Map appointments to time slots
  const slotMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    (appointments ?? []).forEach((apt) => {
      const d = new Date(apt.scheduledAt);
      const key = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes() < 30 ? "00" : "30"}`;
      if (!map[key]) map[key] = [];
      const patient = patients?.find((p) => p.id === apt.patientId);
      const doctor = doctors?.find((d) => d.id === apt.doctorId);
      map[key].push({ ...apt, patientName: patient?.fullName ?? `Paciente #${apt.patientId}`, doctorName: doctor?.name ?? "" });
    });
    return map;
  }, [appointments, patients, doctors]);

  // Calendar mini
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const today = new Date();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [daysInMonth, firstDay]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const handleSlotClick = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date(selectedDate);
    d.setHours(h, m, 0, 0);
    setForm({ ...defaultForm, scheduledAt: d.toISOString().slice(0, 16) });
    setShowCreate(true);
  };

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)]">
      {/* Main area - Slot list */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Button onClick={() => { setForm(defaultForm); setShowCreate(true); }} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Agendar
          </Button>
          <Button variant="outline" size="sm">
            <UserCheck className="h-4 w-4 mr-2" />Check-in
          </Button>
          <Button variant="outline" size="sm">
            <CalendarDays className="h-4 w-4 mr-2" />Painel de Chamada
          </Button>
        </div>

        {/* Date header + status counts */}
        <div className="mb-3">
          <h2 className="text-lg font-bold text-foreground">{formatDateHeader(selectedDate)}</h2>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />Agendados ({statusCounts.agendada ?? 0})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Confirmados ({statusCounts.confirmada ?? 0})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Presentes ({statusCounts.presente ?? 0})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-400" />Atendidos ({statusCounts.concluida ?? 0})</span>
          </div>
        </div>

        {/* Slots table */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-border/50 bg-card">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <tr className="text-xs text-muted-foreground">
                <th className="w-10 px-2 py-2 text-center"></th>
                <th className="w-24 px-3 py-2 text-left font-medium">Horário</th>
                <th className="px-3 py-2 text-left font-medium">Paciente</th>
                <th className="w-28 px-3 py-2 text-left font-medium">Tipo</th>
                <th className="w-28 px-3 py-2 text-left font-medium">Convênio</th>
                <th className="w-28 px-3 py-2 text-center font-medium">Situação</th>
                <th className="w-24 px-3 py-2 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => {
                const aptsInSlot = slotMap[time] ?? [];
                const isEmpty = aptsInSlot.length === 0;

                if (isEmpty) {
                  return (
                    <tr key={time} className="border-t border-border/30 hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => handleSlotClick(time)}>
                      <td className="px-2 py-3 text-center">
                        <button className="h-6 w-6 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity mx-auto">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                          <span className="text-sm font-semibold text-emerald-400">{time}</span>
                          <span className="text-[10px] font-medium text-emerald-400/70 uppercase">Livre</span>
                        </div>
                      </td>
                      <td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground/50">—</td>
                    </tr>
                  );
                }

                return aptsInSlot.map((apt, idx) => {
                  const sc = STATUS_CONFIG[apt.status] ?? STATUS_CONFIG.agendada;
                  return (
                    <tr key={`${time}-${idx}`} className="border-t border-border/30 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedEvent(apt)}>
                      <td className="px-2 py-3 text-center">
                        <button className="h-6 w-6 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 flex items-center justify-center mx-auto">
                          <CalendarDays className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${sc.bg}`}>
                          <span className={`text-sm font-semibold ${sc.color}`}>{time}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm font-medium text-foreground">{apt.patientName}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-muted-foreground capitalize">{apt.type ?? "Consulta"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-muted-foreground">Particular</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge className={`text-[10px] font-medium border ${sc.bg} ${sc.color}`}>{sc.label}</Badge>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedEvent(apt); }}>
                          Detalhes
                        </Button>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right sidebar - Calendar + actions */}
      <div className="w-72 shrink-0 flex flex-col gap-4 hidden lg:flex">
        {/* Doctor selector */}
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                <Stethoscope className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-amber-400 font-medium">Profissional selecionado</p>
                <p className="text-xs font-medium text-foreground truncate">Dr. Wésley Câmara</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today button + Calendar mode */}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs" onClick={() => { setSelectedDate(new Date()); setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()); }}>
            Hoje
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />Calendário
          </Button>
        </div>

        {/* Mini calendar */}
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{MONTHS_PT[calMonth]} {calYear}</span>
              <button onClick={nextMonth} className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DAYS_PT.map((d) => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} />;
                const date = new Date(calYear, calMonth, day);
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`h-7 w-7 rounded-md text-xs font-medium transition-all mx-auto flex items-center justify-center ${
                      isSelected
                        ? "bg-amber-600 text-white"
                        : isToday
                        ? "ring-1 ring-amber-500 text-amber-400"
                        : isWeekend
                        ? "text-muted-foreground/50 hover:bg-muted"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="border-border/50">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Livre</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Ocupada</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Parcial</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" />Fechada</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" />Agendado</div>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs border-amber-500/20 hover:bg-amber-500/10">
            <Search className="h-3.5 w-3.5 mr-2 text-amber-400" />Buscar Agendamento
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs border-amber-500/20 hover:bg-amber-500/10">
            <Search className="h-3.5 w-3.5 mr-2 text-amber-400" />Buscar Tratamentos
          </Button>
        </div>
      </div>

      {/* Modal criar consulta */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-amber-500" />Agendar Consulta</DialogTitle></DialogHeader>
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
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => {
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
                <CalendarDays className="h-5 w-5 text-amber-500" />Detalhes da Consulta
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Paciente</p><p className="text-sm font-medium">{selectedEvent.patientName}</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Médico</p><p className="text-sm font-medium">{selectedEvent.doctorName}</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Horário</p><p className="text-sm font-medium">{new Date(selectedEvent.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - {selectedEvent.durationMinutes ?? 30} min</p></div>
              </div>
              {selectedEvent.notes && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{selectedEvent.notes}</p>
                </div>
              )}
              <div>
                <Label className="text-xs">Alterar Status</Label>
                <Select value={selectedEvent.status} onValueChange={(v) => updateStatusMutation.mutate({ id: selectedEvent.id, status: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
