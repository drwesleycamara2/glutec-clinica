import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Clock, User, ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Search, Settings } from "lucide-react";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const APPOINTMENT_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

// Cores de status por dia
const DAY_STATUS_COLORS = {
  livre: "bg-green-500", // Verde - totalmente livre
  parcial: "bg-yellow-500", // Amarelo - parcialmente livre
  ocupado: "bg-red-500", // Vermelho - sem horários vagos
  fechado: "bg-black", // Preto - clínica fechada
};

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
  durationMinutes: "30", type: "consulta", notes: "", room: "", isConsultation: true,
};

type ViewMode = "day" | "week" | "month";

export default function AgendaReformulada() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [selectedDoctor, setSelectedDoctor] = useState<string>("");
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

  // Calcular status do dia (verde, amarelo, vermelho, preto)
  const getDayStatus = (date: Date): keyof typeof DAY_STATUS_COLORS => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return "fechado"; // Domingo
    
    const dayAppointments = (appointments ?? []).filter(apt => {
      const aptDate = new Date(apt.scheduledAt);
      return isSameDay(aptDate, date);
    });

    if (dayAppointments.length === 0) return "livre";
    if (dayAppointments.length < TIME_SLOTS.length / 2) return "parcial";
    return "ocupado";
  };

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

  const handleCreateAppointment = () => {
    if (!form.patientId || !form.doctorId || !form.scheduledAt) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    createMutation.mutate({
      patientId: form.patientId,
      doctorId: form.doctorId,
      scheduledAt: form.scheduledAt,
      durationMinutes: parseInt(form.durationMinutes),
      type: form.type,
      notes: form.notes,
    });
  };

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)]">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar com botões e seletor de visualização */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            <Button onClick={() => { setForm(defaultForm); setShowCreate(true); }} className="btn-gold-gradient">
              <Plus className="h-4 w-4 mr-2" />Agendar
            </Button>
            <Button variant="outline" size="sm" className="border-gray-300">
              <UserCheck className="h-4 w-4 mr-2" />Check-in
            </Button>
            <Button variant="outline" size="sm" className="border-gray-300">
              <Clock className="h-4 w-4 mr-2" />Painel de Chamada
            </Button>
          </div>

          <div className="flex gap-2">
            <Button 
              variant={viewMode === "day" ? "default" : "outline"} 
              size="sm"
              onClick={() => setViewMode("day")}
              className={viewMode === "day" ? "btn-gold-gradient" : "border-gray-300"}
            >
              Dia
            </Button>
            <Button 
              variant={viewMode === "week" ? "default" : "outline"} 
              size="sm"
              onClick={() => setViewMode("week")}
              className={viewMode === "week" ? "btn-gold-gradient" : "border-gray-300"}
            >
              Semana
            </Button>
            <Button 
              variant={viewMode === "month" ? "default" : "outline"} 
              size="sm"
              onClick={() => setViewMode("month")}
              className={viewMode === "month" ? "btn-gold-gradient" : "border-gray-300"}
            >
              Mês
            </Button>
          </div>

          <Button variant="outline" size="sm" className="border-gray-300">
            <Settings className="h-4 w-4 mr-2" />Opções
          </Button>
        </div>

        {/* Conteúdo principal por modo de visualização */}
        {viewMode === "day" && (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-foreground">{formatDateHeader(selectedDate)}</h2>
            </div>

            {/* Slots table */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-gray-300 bg-white">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-100 backdrop-blur z-10">
                  <tr className="text-xs text-gray-700 font-semibold">
                    <th className="w-10 px-2 py-2 text-center"></th>
                    <th className="w-24 px-3 py-2 text-left">Horário</th>
                    <th className="px-3 py-2 text-left">Paciente</th>
                    <th className="w-28 px-3 py-2 text-left">Tipo</th>
                    <th className="w-28 px-3 py-2 text-left">Sala</th>
                    <th className="w-28 px-3 py-2 text-center">Situação</th>
                    <th className="w-24 px-3 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map((time) => {
                    const aptsInSlot = slotMap[time] ?? [];
                    const isEmpty = aptsInSlot.length === 0;

                    if (isEmpty) {
                      return (
                        <tr key={time} className="border-t border-gray-200 hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => handleSlotClick(time)}>
                          <td className="px-2 py-3 text-center">
                            <button className="h-6 w-6 rounded bg-green-100 text-green-600 hover:bg-green-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity mx-auto">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-100 border border-green-300">
                              <span className="text-sm font-semibold text-green-700">{time}</span>
                              <span className="text-[10px] font-medium text-green-600 uppercase">Livre</span>
                            </div>
                          </td>
                          <td colSpan={5} className="px-3 py-3 text-xs text-gray-400">—</td>
                        </tr>
                      );
                    }

                    return aptsInSlot.map((apt, idx) => (
                      <tr key={`${time}-${idx}`} className="border-t border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedEvent(apt)}>
                        <td className="px-2 py-3 text-center">
                          <button className="h-6 w-6 rounded bg-yellow-100 text-yellow-600 hover:bg-yellow-200 flex items-center justify-center mx-auto">
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-100 border border-yellow-300">
                            <span className="text-sm font-semibold text-yellow-700">{time}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm font-medium text-gray-900">{apt.patientName}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-600 capitalize">{apt.type ?? "Consulta"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-600">-</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge className="text-[10px] font-medium bg-yellow-100 text-yellow-700 border-yellow-300">Agendado</Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button className="text-xs text-gray-600 hover:text-gray-900">Editar</button>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === "month" && (
          <div className="flex-1 flex flex-col min-w-0">
            <h2 className="text-lg font-bold text-foreground mb-4">{MONTHS_PT[calMonth]} {calYear}</h2>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_PT.map(day => (
                <div key={day} className="text-center font-semibold text-sm text-gray-700 py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                const date = new Date(calYear, calMonth, day);
                const status = getDayStatus(date);
                const statusColor = DAY_STATUS_COLORS[status];
                
                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDate(date);
                      setViewMode("day");
                    }}
                    className={`aspect-square rounded-lg font-semibold text-white flex items-center justify-center transition-all hover:shadow-lg ${statusColor}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar com calendário e profissional */}
      <div className="w-80 flex flex-col gap-4">
        {/* Seletor de Profissional */}
        <div className="bg-white rounded-lg border border-gray-300 p-4">
          <Label className="text-sm font-semibold text-gray-700 mb-2 block">Profissional selecionado</Label>
          <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
            <SelectTrigger className="border-gray-300">
              <SelectValue placeholder="Selecione um profissional" />
            </SelectTrigger>
            <SelectContent>
              {doctors?.map(doc => (
                <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Botão Hoje */}
        <Button 
          onClick={() => setSelectedDate(new Date())}
          className="btn-gold-gradient w-full"
        >
          Hoje
        </Button>

        {/* Mini calendário */}
        <div className="bg-white rounded-lg border border-gray-300 p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="font-semibold text-sm text-gray-700">
              {MONTHS_PT[calMonth]} {calYear}
            </h3>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs">
            {DAYS_PT.map(day => (
              <div key={day} className="text-center font-semibold text-gray-600 py-1">
                {day}
              </div>
            ))}
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }
              const date = new Date(calYear, calMonth, day);
              const status = getDayStatus(date);
              const statusColor = DAY_STATUS_COLORS[status];
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(date)}
                  className={`aspect-square rounded text-xs font-semibold transition-all ${
                    isSelected 
                      ? "ring-2 ring-offset-1 ring-gray-400" 
                      : ""
                  } ${statusColor} text-white`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legenda de cores */}
        <div className="bg-white rounded-lg border border-gray-300 p-4 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500" />
            <span className="text-gray-700">Livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500" />
            <span className="text-gray-700">Parcialmente Livre</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-gray-700">Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-black" />
            <span className="text-gray-700">Fechado</span>
          </div>
        </div>
      </div>

      {/* Dialog para criar agendamento */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Paciente *</Label>
              <Select value={form.patientId} onValueChange={(val) => setForm({ ...form, patientId: val })}>
                <SelectTrigger className="border-gray-300 mt-1">
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Profissional *</Label>
              <Select value={form.doctorId} onValueChange={(val) => setForm({ ...form, doctorId: val })}>
                <SelectTrigger className="border-gray-300 mt-1">
                  <SelectValue placeholder="Selecione um profissional" />
                </SelectTrigger>
                <SelectContent>
                  {doctors?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Data e Hora *</Label>
              <Input 
                type="datetime-local" 
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Tipo *</Label>
                <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                  <SelectTrigger className="border-gray-300 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold">Sala</Label>
                <Input 
                  placeholder="Ex: Sala 1"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  className="border-gray-300 mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Duração (minutos)</Label>
              <Input 
                type="number"
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Observações</Label>
              <Textarea 
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="border-gray-300 mt-1"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="border-gray-300">Cancelar</Button>
            <Button onClick={handleCreateAppointment} className="btn-gold-gradient" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
