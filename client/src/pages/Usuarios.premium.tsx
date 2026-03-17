import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PremiumButton, PremiumCard, PremiumInput } from "@/components/premium";
import { 
  Users, 
  User, 
  Shield, 
  Stethoscope, 
  ClipboardList, 
  UserCheck, 
  Loader2, 
  Edit, 
  UserPlus, 
  Trash2, 
  Lock, 
  Unlock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "text-red-500 bg-red-500/10" },
  medico: { label: "Médico", icon: Stethoscope, color: "text-blue-500 bg-blue-500/10" },
  enfermeiro: { label: "Enfermeiro", icon: UserCheck, color: "text-green-500 bg-green-500/10" },
  recepcionista: { label: "Recepcionista", icon: ClipboardList, color: "text-yellow-500 bg-yellow-500/10" },
  user: { label: "Usuário", icon: User, color: "text-gray-500 bg-gray-500/10" },
};

const MODULES = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'pacientes', label: 'Pacientes' },
  { id: 'prontuarios', label: 'Prontuários' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'configuracoes', label: 'Configurações' },
];

export default function UsuariosPremium() {
  const { user: currentUser } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "user", permissions: [] as string[] });

  const { data: users, isLoading, refetch } = trpc.admin.getUsers.useQuery();

  const inviteMutation = trpc.admin.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário convidado com sucesso!");
      setIsInviteModalOpen(false);
      setInviteForm({ email: "", name: "", role: "user", permissions: [] });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMutation = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { toast.success("Usuário removido!"); refetch(); },
    onError: (err) => toast.error(err.message),
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
        : [...prev.permissions, moduleId]
    }));
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-10 w-10 animate-spin text-accent" />
    </div>
  );

  const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
  const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-gold">
        <div>
          <h1 className="text-4xl font-light text-text-primary tracking-tight">
            Gestão de <span className="font-semibold text-accent">Acessos</span>
          </h1>
          <p className="text-sm text-text-tertiary font-medium mt-2 uppercase tracking-widest">
            Controle total sobre quem acessa o sistema
          </p>
        </div>
        {isSuperAdmin && (
          <PremiumButton
            variant="primary"
            icon={<UserPlus size={18} />}
            onClick={() => setIsInviteModalOpen(true)}
          >
            Convidar Usuário
          </PremiumButton>
        )}
      </div>

      {/* Lista de Usuários */}
      <div className="grid grid-cols-1 gap-4">
        {!users || users.length === 0 ? (
          <PremiumCard borderGold className="py-20 text-center">
            <Users size={48} className="mx-auto text-text-tertiary/20 mb-4" />
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-accent-hover flex items-center justify-center border border-gold/30">
                      <User className="text-accent" size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{u.name || "Sem nome"}</h3>
                        {isSelf && <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full uppercase font-bold">Você</span>}
                        {isTargetSuperAdmin && <Shield size={14} className="text-accent" />}
                      </div>
                      <p className="text-sm text-text-tertiary">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                      <RoleIcon size={14} />
                      {roleInfo.label}
                    </div>
                    
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${u.status === 'active' ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
                      {u.status === 'active' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {u.status === 'active' ? 'Ativo' : 'Inativo'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSuperAdmin && !isTargetSuperAdmin && (
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
                          className="text-red-500 hover:bg-red-500/10 border-red-500/30"
                          icon={<Trash2 size={14} />}
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover este usuário permanentemente?")) {
                              deleteMutation.mutate({ userId: u.id });
                            }
                          }}
                        >
                          Remover
                        </PremiumButton>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Permissões */}
                <div className="mt-4 pt-4 border-t border-gold/10">
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-bold mb-2">Módulos Autorizados</p>
                  <div className="flex flex-wrap gap-2">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-accent font-medium">Acesso Total (Administrador)</span>
                    ) : (
                      (() => {
                        try {
                          const perms = JSON.parse(u.permissions || '[]');
                          return perms.length > 0 
                            ? perms.map((p: string) => (
                                <span key={p} className="text-[10px] bg-surface-alt border border-gold/20 px-2 py-0.5 rounded text-text-secondary">
                                  {MODULES.find(m => m.id === p)?.label || p}
                                </span>
                              ))
                            : <span className="text-xs text-text-tertiary italic">Nenhum módulo autorizado</span>;
                        } catch {
                          return <span className="text-xs text-text-tertiary italic">Nenhum módulo autorizado</span>;
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

      {/* Modal de Convite */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <PremiumCard borderGold className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gold">
              <h2 className="text-xl font-semibold text-text-primary flex items-center gap-3">
                <UserPlus className="text-accent" />
                Convidar Novo Usuário
              </h2>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-text-tertiary hover:text-accent">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PremiumInput
                  label="Nome Completo"
                  placeholder="Ex: Dr. João Silva"
                  value={inviteForm.name}
                  onChange={e => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
                <PremiumInput
                  label="E-mail de Acesso"
                  placeholder="joao@exemplo.com"
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary mb-2 block">Perfil de Acesso</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(ROLE_CONFIG).map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInviteForm(prev => ({ ...prev, role: key }))}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
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

              {inviteForm.role !== 'admin' && (
                <div>
                  <label className="text-sm font-medium text-text-primary mb-2 block">Módulos Autorizados</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {MODULES.map(module => (
                      <button
                        key={module.id}
                        type="button"
                        onClick={() => togglePermission(module.id)}
                        className={`flex items-center gap-2 p-2 rounded border text-xs transition-all ${
                          inviteForm.permissions.includes(module.id)
                            ? 'border-accent bg-accent/5 text-accent'
                            : 'border-gold/10 bg-surface-alt text-text-tertiary'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          inviteForm.permissions.includes(module.id) ? 'border-accent bg-accent' : 'border-gold/30'
                        }`}>
                          {inviteForm.permissions.includes(module.id) && <CheckCircle2 size={10} className="text-black" />}
                        </div>
                        {module.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-gold/10 flex justify-end gap-3">
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
      )}
    </div>
  );
}
