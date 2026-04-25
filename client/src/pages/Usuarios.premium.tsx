import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PremiumButton, PremiumCard, PremiumInput } from "@/components/premium";
import { AVAILABLE_MODULES } from "@/lib/access";
import {
  Users,
  User,
  Shield,
  Stethoscope,
  ClipboardList,
  UserCheck,
  Loader2,
  UserPlus,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "text-[#6B6B6B] bg-[#6B6B6B]/10" },
  gerente: { label: "Gerente", icon: Shield, color: "text-blue-600 bg-blue-100" },
  medico: { label: "Médico", icon: Stethoscope, color: "text-[#C9A55B] bg-[#C9A55B]/10" },
  enfermeiro: { label: "Enfermeiro", icon: UserCheck, color: "text-[#C9A55B] bg-[#C9A55B]/10" },
  recepcionista: { label: "Recepcionista", icon: ClipboardList, color: "text-yellow-500 bg-yellow-500/10" },
  user: { label: "Usuário", icon: User, color: "text-gray-500 bg-gray-500/10" },
};

const MODULES = AVAILABLE_MODULES;

export default function UsuariosPremium() {
  const { user: currentUser } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "user", permissions: [] as string[] });

  const { data: users, isLoading, refetch } = trpc.admin.getUsers.useQuery();

  const inviteMutation = trpc.admin.inviteUser.useMutation({
    onSuccess: result => {
      toast.success(result.emailSent ? "Convite enviado com sucesso!" : "Convite criado com link manual.");
      if (result.manualLink) {
        navigator.clipboard?.writeText(result.manualLink);
        toast.info("O link de convite foi copiado para a area de transferencia.");
      }
      if (result.warning) {
        toast.warning(result.warning);
      }
      setIsInviteModalOpen(false);
      setInviteForm({ email: "", name: "", role: "user", permissions: [] });
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const updateStatusMutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuario removido!");
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({
      email: inviteForm.email,
      name: inviteForm.name,
      role: inviteForm.role as any,
      permissions: JSON.stringify(inviteForm.permissions),
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
  const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-6 border-b border-gold pb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-text-primary">
            Gestao de <span className="font-semibold text-accent">Acessos</span>
          </h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-widest text-text-tertiary">
            Controle total sobre quem acessa o sistema
          </p>
        </div>
        {isSuperAdmin ? (
          <PremiumButton variant="primary" icon={<UserPlus size={18} />} onClick={() => setIsInviteModalOpen(true)}>
            Convidar Usuario
          </PremiumButton>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {!users || users.length === 0 ? (
          <PremiumCard borderGold className="py-20 text-center">
            <Users size={48} className="mx-auto mb-4 text-text-tertiary/20" />
            <p className="text-text-secondary">Nenhum usuário cadastrado.</p>
          </PremiumCard>
        ) : (
          users.map((u: any) => {
            const roleInfo = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.user;
            const RoleIcon = roleInfo.icon;
            const isSelf = currentUser?.id === u.id;
            const isTargetSuperAdmin = u.email === SUPER_ADMIN_EMAIL;

            return (
              <PremiumCard key={u.id} borderGold className="group">
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-accent-hover">
                      <User className="text-accent" size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{u.name || "Sem nome"}</h3>
                        {isSelf ? <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">Você</span> : null}
                        {isTargetSuperAdmin ? <Shield size={14} className="text-accent" /> : null}
                      </div>
                      <p className="text-sm text-text-tertiary">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${roleInfo.color}`}>
                      <RoleIcon size={14} />
                      {roleInfo.label}
                    </div>
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${u.status === 'active' ? 'text-[#C9A55B] bg-[#C9A55B]/10' : 'text-[#6B6B6B] bg-[#6B6B6B]/10'}`}>
                      {u.status === 'active' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {u.status === 'active' ? 'Ativo' : 'Inativo'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSuperAdmin && !isTargetSuperAdmin ? (
                      <>
                        <PremiumButton
                          variant="outline"
                          size="sm"
                          icon={u.status === 'active' ? <Lock size={14} /> : <Unlock size={14} />}
                          onClick={() => updateStatusMutation.mutate({ userId: u.id, status: u.status === 'active' ? 'inactive' : 'active' })}
                        >
                          {u.status === 'active' ? 'Bloquear' : 'Desbloquear'}
                        </PremiumButton>
                        <PremiumButton
                          variant="outline"
                          size="sm"
                          className="border-[#6B6B6B]/30 text-[#6B6B6B] hover:bg-[#6B6B6B]/10"
                          icon={<Trash2 size={14} />}
                          onClick={() => {
                            if (confirm('Tem certeza que deseja remover este usuário permanentemente?')) {
                              deleteMutation.mutate({ userId: u.id });
                            }
                          }}
                        >
                          Remover
                        </PremiumButton>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-gold/10 pt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Modulos Autorizados</p>
                  <div className="flex flex-wrap gap-2">
                    {u.role === 'admin' ? (
                      <span className="text-xs font-medium text-accent">Acesso total (Administrador)</span>
                    ) : (
                      (() => {
                        try {
                          const perms = JSON.parse(u.permissions || '[]');
                          return perms.length > 0
                            ? perms.map((p: string) => (
                                <span key={p} className="rounded border border-gold/20 bg-surface-alt px-2 py-0.5 text-[10px] text-text-secondary">
                                  {MODULES.find(m => m.id === p)?.label || p}
                                </span>
                              ))
                            : <span className="text-xs italic text-text-tertiary">Nenhum modulo autorizado</span>;
                        } catch {
                          return <span className="text-xs italic text-text-tertiary">Nenhum modulo autorizado</span>;
                        }
                      })()
                    )}
                  </div>
                </div>
              </PremiumCard>
            );
          })
        )}
      </div>

      {isInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <PremiumCard borderGold className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <div className="mb-6 flex items-center justify-between border-b border-gold pb-4">
              <h2 className="flex items-center gap-3 text-xl font-semibold text-text-primary">
                <UserPlus className="text-accent" />
                Convidar Novo Usuario
              </h2>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-text-tertiary hover:text-accent">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PremiumInput
                  label="Nome Completo"
                  placeholder="Ex: Dra. Joana Silva"
                  value={inviteForm.name}
                  onChange={e => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
                <PremiumInput
                  label="E-mail de Acesso"
                  placeholder="joana@exemplo.com"
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">Perfil de Acesso</label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {Object.entries(ROLE_CONFIG).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInviteForm(prev => ({ ...prev, role: key }))}
                      className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-all ${
                        inviteForm.role === key
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-gold/20 bg-surface-alt text-text-tertiary hover:border-gold/50'
                      }`}
                    >
                      <info.icon size={20} />
                      <span className="text-xs font-medium">{info.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {inviteForm.role !== 'admin' ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">Modulos autorizados</label>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {MODULES.filter(module => module.id !== 'usuarios' && module.id !== 'fiscal').map(module => (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => togglePermission(module.id)}
                        className={`flex items-center gap-2 rounded border p-2 text-xs transition-all ${
                          inviteForm.permissions.includes(module.id)
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-gold/10 bg-surface-alt text-text-tertiary'
                        }`}
                      >
                        <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                          inviteForm.permissions.includes(module.id) ? 'border-accent bg-accent' : 'border-gold/30'
                        }`}>
                          {inviteForm.permissions.includes(module.id) ? <CheckCircle2 size={10} className="text-black" /> : null}
                        </div>
                        {module.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-gold/10 pt-6">
                <PremiumButton variant="outline" type="button" onClick={() => setIsInviteModalOpen(false)}>
                  Cancelar
                </PremiumButton>
                <PremiumButton variant="primary" type="submit" loading={inviteMutation.isPending}>
                  Enviar Convite
                </PremiumButton>
              </div>
            </form>
          </PremiumCard>
        </div>
      ) : null}
    </div>
  );
}
