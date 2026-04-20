import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PremiumButton, PremiumCard, PremiumInput } from "@/components/premium";
import { AVAILABLE_MODULES } from "@/lib/access";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Crown,
  Loader2,
  Lock,
  MailCheck,
  Shield,
  Stethoscope,
  Trash2,
  Unlock,
  User,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type TeamJobId =
  | "medico"
  | "gerente"
  | "massoterapeuta"
  | "tecnico_enfermagem"
  | "enfermeiro"
  | "secretaria"
  | "apoio";

type AccessStage = "invite_pending" | "awaiting_2fa" | "active" | "inactive";

type UserRow = {
  id: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  permissions?: string | null;
  profession?: string | null;
  openId?: string | null;
  twoFactorEnabled?: boolean | number | null;
};

const TEAM_JOB_OPTIONS: Array<{
  id: TeamJobId;
  label: string;
  icon: typeof Stethoscope;
}> = [
  { id: "medico", label: "M\u00E9dica(o)", icon: Stethoscope },
  { id: "gerente", label: "Gerente", icon: Crown },
  { id: "massoterapeuta", label: "Massoterapeuta", icon: BriefcaseBusiness },
  { id: "tecnico_enfermagem", label: "T\u00E9cnica(o) de enfermagem", icon: UserCheck },
  { id: "enfermeiro", label: "Enfermeira(o)", icon: UserCheck },
  { id: "secretaria", label: "Secret\u00E1ria(o)", icon: ClipboardList },
  { id: "apoio", label: "Apoio", icon: Users },
];

const LEGACY_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "M\u00E9dica(o)",
  enfermeiro: "Enfermeira(o)",
  recepcionista: "Secret\u00E1ria(o)",
  gerente: "Gerente",
  user: "Apoio",
};

const MODULE_META = AVAILABLE_MODULES.map((module) => {
  if (module.id === "documentos") {
    return {
      ...module,
      label: "Documentos e termos",
      description: "Documentos de identifica\u00E7\u00E3o, comprovantes, contratos e termos de consentimento.",
    };
  }

  if (module.id === "templates") {
    return {
      ...module,
      label: "Modelos cl\u00EDnicos",
      description: "Modelos de evolu\u00E7\u00E3o, prescri\u00E7\u00F5es, pedidos de exames, atestados e outros modelos cl\u00EDnicos.",
    };
  }

  return { ...module, description: "" };
});

function normalizeEmail(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function parseModulePermissions(rawPermissions?: string | null) {
  if (!rawPermissions) return [] as string[];

  try {
    const parsed = JSON.parse(rawPermissions);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJobTitles(user: UserRow) {
  const profession = String(user.profession ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (profession.length > 0) return profession;
  return [LEGACY_ROLE_LABELS[String(user.role ?? "")] || "Apoio"];
}

function deriveSystemRole(jobTitles: TeamJobId[]) {
  if (jobTitles.includes("medico")) return "medico" as const;
  if (jobTitles.includes("enfermeiro") || jobTitles.includes("tecnico_enfermagem")) return "enfermeiro" as const;
  if (jobTitles.includes("gerente")) return "gerente" as const;
  return "recepcionista" as const;
}

function getAccessStage(user: UserRow): AccessStage {
  const openId = String(user.openId ?? "");
  const isInvitePlaceholder = openId.startsWith("invited_");
  const isTwoFactorEnabled = Boolean(user.twoFactorEnabled);

  if (isInvitePlaceholder) return "invite_pending";
  if (String(user.status ?? "") !== "active") return "inactive";
  if (!isTwoFactorEnabled) return "awaiting_2fa";
  return "active";
}

const ACCESS_STAGE_CONFIG: Record<
  AccessStage,
  { label: string; detail: string; className: string; icon: typeof MailCheck }
> = {
  invite_pending: {
    label: "Convite enviado",
    detail: "Aguardando o colaborador aceitar o convite por e-mail.",
    className: "text-amber-800 bg-amber-100/90 border-amber-300/60",
    icon: MailCheck,
  },
  awaiting_2fa: {
    label: "Aguardando Google Authenticator",
    detail: "Senha criada. Falta concluir a configura\u00E7\u00E3o obrigat\u00F3ria do 2 fatores.",
    className: "text-blue-800 bg-blue-100/90 border-blue-300/60",
    icon: Shield,
  },
  active: {
    label: "Acesso liberado",
    detail: "Conta ativa, senha definida e autentica\u00E7\u00E3o em dois fatores conclu\u00EDda.",
    className: "text-emerald-800 bg-emerald-100/90 border-emerald-300/60",
    icon: BadgeCheck,
  },
  inactive: {
    label: "Acesso bloqueado",
    detail: "Usu\u00E1rio existente, por\u00E9m sem acesso ativo ao sistema no momento.",
    className: "text-slate-700 bg-slate-100 border-slate-300/60",
    icon: Lock,
  },
};

export default function UsuariosEquipe() {
  const { user: currentUser } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    jobTitles: [] as TeamJobId[],
    permissions: [] as string[],
  });
  const previousStagesRef = useRef<Record<number, AccessStage>>({});
  const hasLoadedRef = useRef(false);

  const {
    data: users,
    isLoading,
    refetch,
  } = trpc.admin.getUsers.useQuery(undefined, {
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const inviteMutation = trpc.admin.inviteUser.useMutation({
    onSuccess: result => {
      toast.success(result.emailSent ? "Convite enviado com sucesso." : "Convite criado com link manual.");
      if (result.manualLink) {
        navigator.clipboard?.writeText(result.manualLink);
        toast.info("O link do convite foi copiado para a \u00E1rea de transfer\u00EAncia.");
      }
      if (result.warning) {
        toast.warning(result.warning);
      }
      setIsInviteModalOpen(false);
      setInviteForm({ email: "", name: "", jobTitles: [], permissions: [] });
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const updateStatusMutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado com sucesso.");
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido com sucesso.");
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  useEffect(() => {
    if (!users) return;

    const currentStages: Record<number, AccessStage> = {};
    for (const user of users as UserRow[]) {
      currentStages[user.id] = getAccessStage(user);
    }

    if (hasLoadedRef.current) {
      for (const user of users as UserRow[]) {
        const previousStage = previousStagesRef.current[user.id];
        const currentStage = currentStages[user.id];
        const userName = user.name || user.email || `Usu\u00E1rio #${user.id}`;

        if (previousStage === "invite_pending" && currentStage === "awaiting_2fa") {
          toast.info(`${userName} aceitou o convite e est\u00E1 configurando o Google Authenticator.`);
        }

        if (previousStage === "awaiting_2fa" && currentStage === "active") {
          toast.success(`${userName} concluiu a ativa\u00E7\u00E3o e j\u00E1 est\u00E1 com acesso liberado.`);
        }
      }
    }

    previousStagesRef.current = currentStages;
    hasLoadedRef.current = true;
  }, [users]);

  const visibleUsers = useMemo(() => (users ?? []) as UserRow[], [users]);
  const pendingFlowUsers = useMemo(
    () => visibleUsers.filter(user => {
      const stage = getAccessStage(user);
      return stage === "invite_pending" || stage === "awaiting_2fa";
    }),
    [visibleUsers]
  );
  const activeUsers = useMemo(
    () => visibleUsers.filter(user => getAccessStage(user) === "active"),
    [visibleUsers]
  );

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteForm.name.trim()) {
      toast.error("Informe o nome completo do colaborador.");
      return;
    }

    if (!inviteForm.email.trim()) {
      toast.error("Informe o e-mail de acesso.");
      return;
    }

    if (inviteForm.jobTitles.length === 0) {
      toast.error("Selecione pelo menos um cargo para o colaborador.");
      return;
    }

    inviteMutation.mutate({
      email: inviteForm.email.trim().toLowerCase(),
      name: inviteForm.name.trim(),
      role: deriveSystemRole(inviteForm.jobTitles),
      permissions: inviteForm.permissions,
      jobTitles: inviteForm.jobTitles,
    });
  };

  const togglePermission = (moduleId: string) => {
    setInviteForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(moduleId)
        ? prev.permissions.filter(id => id !== moduleId)
        : [...prev.permissions, moduleId],
    }));
  };

  const toggleJobTitle = (jobTitle: TeamJobId) => {
    setInviteForm(prev => ({
      ...prev,
      jobTitles: prev.jobTitles.includes(jobTitle)
        ? prev.jobTitles.filter(item => item !== jobTitle)
        : [...prev.jobTitles, jobTitle],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  const superAdminEmail = "contato@drwesleycamara.com.br";
  const isSuperAdmin =
    String(currentUser?.role ?? "") === "admin" &&
    normalizeEmail(currentUser?.email) === superAdminEmail;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-6 border-b border-gold pb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-text-primary">
            Gest\u00E3o de <span className="font-semibold text-accent">acessos</span>
          </h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-widest text-text-tertiary">
            Convites, cargos, permiss\u00F5es e autentica\u00E7\u00E3o obrigat\u00F3ria em 2 fatores
          </p>
        </div>
        {isSuperAdmin ? (
          <PremiumButton variant="primary" icon={<UserPlus size={18} />} onClick={() => setIsInviteModalOpen(true)}>
            Convidar novo usu\u00E1rio
          </PremiumButton>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PremiumCard borderGold>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-text-tertiary">Equipe com acesso liberado</p>
          <p className="mt-3 text-3xl font-semibold text-text-primary">{activeUsers.length}</p>
          <p className="mt-2 text-sm text-text-secondary">
            Profissionais que j\u00E1 criaram senha e conclu\u00EDram o Google Authenticator.
          </p>
        </PremiumCard>

        <PremiumCard borderGold>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-text-tertiary">Convites em andamento</p>
          <p className="mt-3 text-3xl font-semibold text-text-primary">{pendingFlowUsers.length}</p>
          <p className="mt-2 text-sm text-text-secondary">
            Convites enviados ou contas aguardando a configura\u00E7\u00E3o final do 2 fatores.
          </p>
        </PremiumCard>

        <PremiumCard borderGold>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-text-tertiary">Fluxo do colaborador</p>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            <p>1. Recebe o convite por e-mail.</p>
            <p>2. Cria a senha.</p>
            <p>3. Configura o Google Authenticator.</p>
            <p>4. Se esquecer a senha, usa {"\u201CEsqueci minha senha\u201D"} na tela inicial.</p>
          </div>
        </PremiumCard>
      </div>

      <PremiumCard borderGold>
        <div className="flex items-center justify-between gap-4 border-b border-gold/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Acompanhamento de convites e acessos</h2>
            <p className="mt-1 text-sm text-text-secondary">
              O sistema avisa automaticamente aqui quando o colaborador aceita o convite e quando termina a ativa\u00E7\u00E3o com 2 fatores.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          {visibleUsers.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={48} className="mx-auto mb-4 text-text-tertiary/20" />
              <p className="text-text-secondary">Nenhum colaborador cadastrado.</p>
            </div>
          ) : (
            visibleUsers.map((user) => {
              const accessStage = getAccessStage(user);
              const stageInfo = ACCESS_STAGE_CONFIG[accessStage];
              const StageIcon = stageInfo.icon;
              const isSelf = currentUser?.id === user.id;
              const isTargetSuperAdmin = normalizeEmail(user.email) === superAdminEmail;
              const jobTitles = parseJobTitles(user);
              const modulePermissions = parseModulePermissions(user.permissions);

              return (
                <PremiumCard key={user.id} borderGold className="group">
                  <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-accent-hover">
                        <User className="text-accent" size={24} />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-text-primary">{user.name || "Sem nome"}</h3>
                            {isSelf ? (
                              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                                Voc\u00EA
                              </span>
                            ) : null}
                            {isTargetSuperAdmin ? <Shield size={14} className="text-accent" /> : null}
                          </div>
                          <p className="text-sm text-text-tertiary">{user.email}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {jobTitles.map((jobTitle) => (
                            <span
                              key={`${user.id}-${jobTitle}`}
                              className="rounded-full border border-gold/20 bg-surface-alt px-3 py-1 text-xs font-medium text-text-secondary"
                            >
                              {jobTitle}
                            </span>
                          ))}
                        </div>

                        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${stageInfo.className}`}>
                          <StageIcon size={14} />
                          {stageInfo.label}
                        </div>
                        <p className="text-xs text-text-tertiary">{stageInfo.detail}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-stretch gap-2 md:items-end">
                      <div className="rounded-full border border-gold/15 bg-background/70 px-3 py-1 text-xs font-medium text-text-tertiary">
                        Perfil t\u00E9cnico do sistema: {LEGACY_ROLE_LABELS[String(user.role ?? "")] || "Apoio"}
                      </div>

                      {isSuperAdmin && !isTargetSuperAdmin ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <PremiumButton
                            variant="outline"
                            size="sm"
                            icon={String(user.status) === "active" ? <Lock size={14} /> : <Unlock size={14} />}
                            onClick={() =>
                              updateStatusMutation.mutate({
                                userId: user.id,
                                status: String(user.status) === "active" ? "inactive" : "active",
                              })
                            }
                          >
                            {String(user.status) === "active" ? "Bloquear" : "Desbloquear"}
                          </PremiumButton>
                          <PremiumButton
                            variant="outline"
                            size="sm"
                            className="border-[#6B6B6B]/30 text-[#6B6B6B] hover:bg-[#6B6B6B]/10"
                            icon={<Trash2 size={14} />}
                            onClick={() => {
                              if (confirm("Tem certeza que deseja remover este usu\u00E1rio permanentemente?")) {
                                deleteMutation.mutate({ userId: user.id });
                              }
                            }}
                          >
                            Remover
                          </PremiumButton>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-gold/10 pt-4 lg:grid-cols-[1.2fr_1fr]">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                        Acessos liberados
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {String(user.role) === "admin" ? (
                          <span className="text-xs font-medium text-accent">Acesso total do administrador</span>
                        ) : modulePermissions.length > 0 ? (
                          modulePermissions.map((permission) => (
                            <span
                              key={`${user.id}-${permission}`}
                              className="rounded border border-gold/20 bg-surface-alt px-2 py-0.5 text-[10px] text-text-secondary"
                            >
                              {MODULE_META.find(module => module.id === permission)?.label || permission}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs italic text-text-tertiary">Nenhum m\u00F3dulo liberado.</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gold/10 bg-background/55 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Recupera\u00E7\u00E3o de senha</p>
                      <p className="mt-2 text-xs leading-6 text-text-secondary">
                        Se esse colaborador esquecer a senha, ele deve acessar a tela inicial do sistema, clicar em{" "}
                        <strong>{"\u201CEsqueci minha senha\u201D"}</strong> e seguir o link enviado por e-mail. Depois disso, o login continua exigindo o Google Authenticator.
                      </p>
                    </div>
                  </div>
                </PremiumCard>
              );
            })
          )}
        </div>
      </PremiumCard>

      {isInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <PremiumCard borderGold className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden">
            <div className="mb-6 flex items-center justify-between border-b border-gold pb-4">
              <div>
                <h2 className="flex items-center gap-3 text-xl font-semibold text-text-primary">
                  <UserPlus className="text-accent" />
                  Convidar novo usu\u00E1rio
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Convite por e-mail com cria\u00E7\u00E3o de senha e configura\u00E7\u00E3o obrigat\u00F3ria do Google Authenticator.
                </p>
              </div>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-text-tertiary hover:text-accent">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <PremiumInput
                    label="Nome completo"
                    placeholder="Ex.: Joana Silva"
                    value={inviteForm.name}
                    onChange={e => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                  <PremiumInput
                    label="E-mail de acesso"
                    placeholder="joana@exemplo.com"
                    type="email"
                    value={inviteForm.email}
                    onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Cargo(s) na equipe</label>
                  <p className="mb-3 text-xs leading-6 text-text-secondary">
                    Voc\u00EA pode marcar mais de um cargo para a mesma pessoa. O sistema usa isso para exibir a fun\u00E7\u00E3o correta da equipe, enquanto o acesso real continua sendo controlado pelos m\u00F3dulos abaixo.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {TEAM_JOB_OPTIONS.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => toggleJobTitle(job.id)}
                        className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                          inviteForm.jobTitles.includes(job.id)
                            ? "border-accent bg-accent/10 text-accent shadow-[0_12px_28px_rgba(201,165,91,0.12)]"
                            : "border-gold/20 bg-surface-alt text-text-tertiary hover:border-gold/50"
                        }`}
                      >
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-current/20">
                          <job.icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{job.label}</p>
                          <p className="mt-1 text-xs opacity-80">
                            {inviteForm.jobTitles.includes(job.id) ? "Selecionado" : "Clique para adicionar este cargo"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Partes do sistema que esse colaborador poder\u00E1 acessar</label>
                  <p className="mb-3 text-xs leading-6 text-text-secondary">
                    O acesso \u00E9 liberado somente ao que voc\u00EA marcar aqui. O grupo <strong>Documentos e termos</strong> cobre documentos de identifica\u00E7\u00E3o, comprovantes, contratos e termos de consentimento. Os <strong>modelos de evolu\u00E7\u00E3o, prescri\u00E7\u00F5es e pedidos de exames</strong> ficam em <strong>Modelos cl\u00EDnicos</strong>, separados.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {MODULE_META.filter(module => module.id !== "usuarios").map(module => (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => togglePermission(module.id)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          inviteForm.permissions.includes(module.id)
                            ? "border-accent bg-accent/5 text-accent shadow-[0_10px_24px_rgba(201,165,91,0.10)]"
                            : "border-gold/10 bg-surface-alt text-text-tertiary hover:border-gold/40"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${
                              inviteForm.permissions.includes(module.id) ? "border-accent bg-accent" : "border-gold/30"
                            }`}
                          >
                            {inviteForm.permissions.includes(module.id) ? <CheckCircle2 size={10} className="text-black" /> : null}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{module.label}</p>
                            {module.description ? (
                              <p className="mt-1 text-xs leading-5 opacity-80">{module.description}</p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gold/10 bg-background/80 pt-5">
                <p className="text-xs leading-5 text-text-secondary">
                  Depois do envio, o colaborador receber\u00E1 um link para criar a senha. O acesso s\u00F3 fica liberado ap\u00F3s concluir o Google Authenticator.
                </p>
                <div className="flex gap-3">
                  <PremiumButton variant="outline" type="button" onClick={() => setIsInviteModalOpen(false)}>
                    Cancelar
                  </PremiumButton>
                  <PremiumButton variant="primary" type="submit" loading={inviteMutation.isPending}>
                    Enviar convite
                  </PremiumButton>
                </div>
              </div>
            </form>
          </PremiumCard>
        </div>
      ) : null}
    </div>
  );
}
