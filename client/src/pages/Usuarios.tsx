import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, User, Shield, Stethoscope, ClipboardList, UserCheck, Loader2, Edit } from "lucide-react";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
  medico: { label: "Médico", icon: Stethoscope, color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  enfermeiro: { label: "Enfermeiro", icon: UserCheck, color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  recepcionista: { label: "Recepcionista", icon: ClipboardList, color: "bg-[#F1D791]/30 text-[#8A6526]" },
  user: { label: "Usuário", icon: User, color: "bg-gray-100 text-gray-700" },
};

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState({ role: "", name: "", specialty: "", crm: "", phone: "" });

  const { data: users, isLoading, refetch } = trpc.admin.listUsers.useQuery();

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Perfil atualizado!"); setEditingUser(null); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const updateProfileMutation = trpc.admin.updateUserProfile.useMutation({
    onSuccess: () => { toast.success("Dados atualizados!"); setEditingUser(null); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = (u: any) => {
    setEditingUser(u);
    setEditForm({ role: u.role, name: u.name ?? "", specialty: u.specialty ?? "", crm: u.crm ?? "", phone: u.phone ?? "" });
  };

  const handleSave = () => {
    if (!editingUser) return;
    if (editForm.role !== editingUser.role) {
      updateRoleMutation.mutate({ userId: editingUser.id, role: editForm.role as any });
    }
    updateProfileMutation.mutate({
      userId: editingUser.id,
      name: editForm.name || undefined,
      specialty: editForm.specialty || undefined,
      crm: editForm.crm || undefined,
      phone: editForm.phone || undefined,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Usuários do Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">{users?.length ?? 0} usuário(s) cadastrado(s)</p>
      </div>

      <div className="space-y-2">
        {!users || users.length === 0 ? (
          <Card className="border shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-base font-medium text-muted-foreground">Nenhum usuário cadastrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Os usuários aparecerão aqui após fazerem login no sistema.</p>
            </CardContent>
          </Card>
        ) : (
          users.map((u) => {
            const roleInfo = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.user;
            const RoleIcon = roleInfo.icon;
            const isCurrentUser = (currentUser as any)?.id === u.id;

            return (
              <Card key={u.id} className="border shadow-sm">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{u.name ?? "Sem nome"}</p>
                      {isCurrentUser && <Badge variant="outline" className="text-xs">Você</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge className={`text-xs ${roleInfo.color}`}>
                        <RoleIcon className="h-3 w-3 mr-1" />{roleInfo.label}
                      </Badge>
                      {u.specialty && <span className="text-xs text-muted-foreground">{u.specialty}</span>}
                      {u.crm && <span className="text-xs text-muted-foreground font-mono">CRM: {u.crm}</span>}
                      {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={u.active ? "bg-[#C9A55B]/15 text-[#6B5B2A] text-xs" : "bg-gray-100 text-gray-700 text-xs"}>
                      {u.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                      <Edit className="h-3 w-3 mr-1" />Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal editar usuário */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Perfil de Acesso</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([value, { label }]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {["medico", "enfermeiro"].includes(editForm.role) && (
              <>
                <div>
                  <Label>Especialidade</Label>
                  <Input value={editForm.specialty} onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })} placeholder="Ex: Cardiologia" className="mt-1" />
                </div>
                <div>
                  <Label>CRM / COREN</Label>
                  <Input value={editForm.crm} onChange={(e) => setEditForm({ ...editForm, crm: e.target.value })} placeholder="Número do registro" className="mt-1 font-mono" />
                </div>
              </>
            )}
            <div>
              <Label>Telefone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="(11) 99999-9999" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateRoleMutation.isPending || updateProfileMutation.isPending}>
              {(updateRoleMutation.isPending || updateProfileMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
