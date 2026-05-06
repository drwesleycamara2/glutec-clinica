import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  SCHEDULE_DAY_KEYS,
  SCHEDULE_DAY_LABELS,
  cloneOpeningHoursConfig,
  createDefaultWeeklySchedule,
  ensureProfessionalSchedules,
  normalizeOpeningHoursConfig,
  type ScheduleDayKey,
  type WeeklySchedule,
} from "@shared/schedule-hours";
import {
  Moon,
  Sun,
  Palette,
  Bell,
  Shield,
  User,
  FileStack,
  Workflow,
  Plus,
  MinusCircle,
  FolderOpen,
  CalendarClock,
  FileLock2,
} from "lucide-react";

const DEFAULT_STRUCTURAL_SECTORS = ["Consultório", "Centro Cirúrgico"];
const DEFAULT_ATTACHMENT_FOLDERS = ["Documentos pessoais", "Resultados de exames"];

export default function ConfiguracoesSafe() {
  const { theme, setTheme } = useTheme();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSeniorAdmin = user?.role === "admin" && String(user?.email ?? "").trim().toLowerCase() === "contato@drwesleycamara.com.br";
  const clinicQuery = trpc.clinic.get.useQuery(undefined, { enabled: isSeniorAdmin });
  const updateClinicMutation = trpc.clinic.update.useMutation({
    onSuccess: async () => {
      await clinicQuery.refetch();
      toast.success("Configurações da clínica atualizadas.");
    },
    onError: (error) => toast.error(error.message),
  });
  const doctorsQuery = trpc.admin.getDoctors.useQuery(undefined, { enabled: isSeniorAdmin });

  const [newSector, setNewSector] = useState("");
  const [newAttachmentFolder, setNewAttachmentFolder] = useState("");
  const [structuralSectors, setStructuralSectors] = useState<string[]>(DEFAULT_STRUCTURAL_SECTORS);
  const [attachmentFolders, setAttachmentFolders] = useState<string[]>(DEFAULT_ATTACHMENT_FOLDERS);
  const [openingHoursConfig, setOpeningHoursConfig] = useState(() => normalizeOpeningHoursConfig(null));

  useEffect(() => {
    if (!isSeniorAdmin) {
      return;
    }

    const sectors =
      Array.isArray(clinicQuery.data?.structuralSectors) && clinicQuery.data.structuralSectors.length > 0
        ? clinicQuery.data.structuralSectors
        : DEFAULT_STRUCTURAL_SECTORS;
    setStructuralSectors(sectors);

    const folders =
      Array.isArray(clinicQuery.data?.patientAttachmentFolders) && clinicQuery.data.patientAttachmentFolders.length > 0
        ? clinicQuery.data.patientAttachmentFolders
        : DEFAULT_ATTACHMENT_FOLDERS;
    setAttachmentFolders(folders);

    setOpeningHoursConfig(
      ensureProfessionalSchedules(normalizeOpeningHoursConfig(clinicQuery.data?.openingHours), doctorsQuery.data ?? []),
    );
  }, [clinicQuery.data, doctorsQuery.data, isSeniorAdmin]);

  const normalizedSectors = useMemo(
    () => structuralSectors.map((item) => item.trim()).filter(Boolean),
    [structuralSectors],
  );
  const normalizedAttachmentFolders = useMemo(
    () => attachmentFolders.map((item) => item.trim()).filter(Boolean),
    [attachmentFolders],
  );

  const addSector = () => {
    const value = newSector.trim();
    if (!value) {
      toast.error("Informe o nome do setor para adicionar.");
      return;
    }

    const alreadyExists = normalizedSectors.some(
      (item) => item.localeCompare(value, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (alreadyExists) {
      toast.error("Esse setor já está cadastrado.");
      return;
    }

    setStructuralSectors((current) => [...current, value]);
    setNewSector("");
  };

  const removeSector = (sector: string) => {
    setStructuralSectors((current) => current.filter((item) => item !== sector));
  };

  const addAttachmentFolder = () => {
    const value = newAttachmentFolder.trim();
    if (!value) {
      toast.error("Informe o nome da pasta para adicionar.");
      return;
    }

    const alreadyExists = normalizedAttachmentFolders.some(
      (item) => item.localeCompare(value, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (alreadyExists) {
      toast.error("Essa pasta já está cadastrada.");
      return;
    }

    setAttachmentFolders((current) => [...current, value]);
    setNewAttachmentFolder("");
  };

  const removeAttachmentFolder = (folder: string) => {
    setAttachmentFolders((current) => current.filter((item) => item !== folder));
  };

  const updateScheduleDay = (
    target: "clinic" | string,
    dayKey: ScheduleDayKey,
    patch: Partial<{ enabled: boolean; start: string; end: string }>,
  ) => {
    if (!isSeniorAdmin) return;
    setOpeningHoursConfig((current) => {
      const next = cloneOpeningHoursConfig(ensureProfessionalSchedules(current, doctorsQuery.data ?? []));
      const schedule = target === "clinic"
        ? next.clinic
        : next.professionals[String(target)] ?? createDefaultWeeklySchedule();
      schedule.days[dayKey] = { ...schedule.days[dayKey], ...patch };
      if (target === "clinic") {
        next.clinic = schedule;
      } else {
        next.professionals[String(target)] = schedule;
      }
      return normalizeOpeningHoursConfig(next);
    });
  };

  const saveOpeningHours = () => {
    if (!isSeniorAdmin) return;
    updateClinicMutation.mutate({
      openingHours: ensureProfessionalSchedules(openingHoursConfig, doctorsQuery.data ?? []),
    });
  };

  const renderScheduleEditor = (title: string, subtitle: string, target: "clinic" | string, schedule: WeeklySchedule) => (
    <div key={`${target}-schedule`} className="rounded-xl border border-border/60 bg-muted/10 p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {SCHEDULE_DAY_KEYS.map((dayKey) => {
          const day = schedule.days[dayKey];
          return (
            <div key={`${target}-${dayKey}`} className="grid gap-3 rounded-lg border border-border/50 bg-background/70 p-3 sm:grid-cols-[170px_1fr_1fr]">
              <div className="flex items-center gap-3">
                <ToggleSwitch
                  checked={day.enabled}
                  onCheckedChange={(checked) => updateScheduleDay(target, dayKey, { enabled: checked })}
                />
                <span className="text-sm font-medium text-foreground">{SCHEDULE_DAY_LABELS[dayKey]}</span>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Início</Label>
                <Input
                  type="time"
                  step={1800}
                  value={day.start}
                  disabled={!day.enabled}
                  onChange={(event) => updateScheduleDay(target, dayKey, { start: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Fim</Label>
                <Input
                  type="time"
                  step={1800}
                  value={day.end}
                  disabled={!day.enabled}
                  onChange={(event) => updateScheduleDay(target, dayKey, { end: event.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
  const saveStructure = () => {
    if (!isSeniorAdmin) return;
    updateClinicMutation.mutate({
      structuralSectors: normalizedSectors.length > 0 ? normalizedSectors : DEFAULT_STRUCTURAL_SECTORS,
      patientAttachmentFolders:
        normalizedAttachmentFolders.length > 0 ? normalizedAttachmentFolders : DEFAULT_ATTACHMENT_FOLDERS,
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">{isSeniorAdmin ? "Configurações Gerais" : "Preferências"}</h1>
        <p className="text-muted-foreground">{isSeniorAdmin ? "Gerencie as preferências do sistema e a estrutura da clínica." : "Escolha o tema visual do seu acesso."}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>Aparência</CardTitle>
            </div>
            <CardDescription>Escolha o tema visual do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={theme} onValueChange={(value) => setTheme?.(value === "dark" ? "dark" : "light")} className="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem value="light" id="light" className="peer sr-only" />
                <Label
                  htmlFor="light"
                  className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Sun className="mb-3 h-6 w-6" />
                  <span className="text-sm font-medium">Modo Claro</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
                <Label
                  htmlFor="dark"
                  className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Moon className="mb-3 h-6 w-6" />
                  <span className="text-sm font-medium">Modo Escuro</span>
                </Label>
              </div>
            </RadioGroup>

            <div className="mt-6 rounded-lg border border-primary/10 bg-primary/5 p-4">
              <p className="text-xs font-medium text-primary/70">
                O modo escuro permanece otimizado com detalhes dourados para o visual premium da clínica.
              </p>
            </div>
          </CardContent>
        </Card>

        {isSeniorAdmin ? (
          <>
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-primary" />
              <CardTitle>Estrutura da clínica</CardTitle>
            </div>
            <CardDescription>
              Defina os setores, salas e locais de atendimento usados na agenda. O sistema começa com Consultório e Centro Cirúrgico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Setores e salas disponíveis</Label>
              <div className="space-y-2">
                {normalizedSectors.map((sector) => (
                  <div
                    key={sector}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <span className="text-sm font-medium">{sector}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeSector(sector)}>
                      <MinusCircle className="mr-1.5 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Novo setor</Label>
                <Input
                  value={newSector}
                  onChange={(event) => setNewSector(event.target.value)}
                  placeholder="Ex.: Sala 2, Procedimentos, Pós-operatório"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={addSector} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={saveStructure} className="btn-glossy-gold" disabled={updateClinicMutation.isPending}>
                {updateClinicMutation.isPending ? "Salvando..." : "Salvar estrutura"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              <CardTitle>Pastas padrão de anexos</CardTitle>
            </div>
            <CardDescription>
              Essas pastas aparecem na aba de anexos de todos os pacientes para organizar documentos, exames e novos grupos da clínica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pastas disponíveis no prontuário</Label>
              <div className="space-y-2">
                {normalizedAttachmentFolders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <span className="text-sm font-medium">{folder}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeAttachmentFolder(folder)}>
                      <MinusCircle className="mr-1.5 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Nova pasta</Label>
                <Input
                  value={newAttachmentFolder}
                  onChange={(event) => setNewAttachmentFolder(event.target.value)}
                  placeholder="Ex.: Pré-operatório, Contratos estéticos, Financeiro"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={addAttachmentFolder} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={saveStructure} className="btn-glossy-gold" disabled={updateClinicMutation.isPending}>
                {updateClinicMutation.isPending ? "Salvando..." : "Salvar pastas"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isSeniorAdmin ? (
          <Card className="border-primary/10 bg-card/50 backdrop-blur-sm md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                <CardTitle>Horários de agenda</CardTitle>
              </div>
              <CardDescription>
                Configure o funcionamento da clínica e a agenda própria de cada profissional habilitado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {renderScheduleEditor(
                "Funcionamento da clínica",
                "Padrão inicial: segunda a sexta das 08:30 às 19:00 e sábado das 09:30 às 13:00.",
                "clinic",
                openingHoursConfig.clinic,
              )}

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Agendas dos profissionais</p>
                  <p className="text-xs text-muted-foreground">
                    Apenas usuários com agenda habilitada aparecem aqui e na tela de agendamento.
                  </p>
                </div>
                {(doctorsQuery.data ?? []).length === 0 ? (
                  <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                    Nenhum profissional com agenda habilitada foi encontrado.
                  </p>
                ) : (
                  (doctorsQuery.data ?? []).map((doctor: any) =>
                    renderScheduleEditor(
                      String(doctor?.name ?? `Profissional #${doctor?.id}`),
                      "Horário aberto individual dentro do funcionamento geral da clínica.",
                      String(doctor.id),
                      openingHoursConfig.professionals[String(doctor.id)] ?? createDefaultWeeklySchedule(),
                    ),
                  )
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">Os horários livres da agenda aparecem em intervalos de 30 minutos.</p>
                <Button type="button" onClick={saveOpeningHours} className="btn-glossy-gold" disabled={updateClinicMutation.isPending}>
                  {updateClinicMutation.isPending ? "Salvando..." : "Salvar horários"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Notificações</CardTitle>
            </div>
            <CardDescription>Configure como você recebe alertas.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[140px] items-center justify-center italic text-sm text-muted-foreground">
            Em breve: alertas via WhatsApp e e-mail.
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Segurança</CardTitle>
            </div>
            <CardDescription>Autenticação em duas etapas e logs.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[140px] items-center justify-center italic text-sm text-muted-foreground">
            Configurações de segurança avançada.
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>Perfil</CardTitle>
            </div>
            <CardDescription>Gerencie seus dados pessoais.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[140px] items-center justify-center">
            <button onClick={() => navigate("/perfil")} className="btn-glossy-gold px-6 py-2 text-sm">
              Acessar meu perfil
            </button>
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              <CardTitle>Modelos</CardTitle>
            </div>
            <CardDescription>Prescrições, exames, anamneses, atestados e evolução.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[140px] items-center justify-center">
            <button onClick={() => navigate("/templates")} className="btn-glossy-gold px-6 py-2 text-sm">
              Gerenciar modelos
            </button>
          </CardContent>
        </Card>

        {isSeniorAdmin ? (
          <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileLock2 className="h-5 w-5 text-primary" />
                <CardTitle>Backup e portabilidade</CardTitle>
              </div>
              <CardDescription>Exporte prontuários, cadastros, anamneses, atendimentos, exames, anexos, fotos, contratos, histórico e agenda.</CardDescription>
            </CardHeader>
            <CardContent className="flex h-[140px] items-center justify-center">
              <button onClick={() => navigate("/relatorios/portabilidade")} className="btn-glossy-gold px-6 py-2 text-sm">
                Solicitar backup completo
              </button>
            </CardContent>
          </Card>
        ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
