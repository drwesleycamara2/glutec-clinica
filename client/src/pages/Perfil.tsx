import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  User,
  Shield,
  Stethoscope,
  ClipboardList,
  UserCheck,
  Loader2,
  Edit,
  Save,
  X,
  KeyRound,
} from "lucide-react";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
  medico: { label: "Médico", icon: Stethoscope, color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  enfermeiro: { label: "Enfermeiro", icon: UserCheck, color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  recepcionista: { label: "Recepcionista", icon: ClipboardList, color: "bg-[#F1D791]/30 text-[#8A6526]" },
  user: { label: "Usuário", icon: User, color: "bg-gray-100 text-gray-700" },
};

export default function Perfil() {
  const { user, refresh } = useAuth();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: (user as any)?.name ?? "",
    specialty: (user as any)?.specialty ?? "",
    crm: (user as any)?.crm ?? "",
    phone: (user as any)?.phone ?? "",
  });

  const updateMutation = trpc.auth.updateMe.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, {
        ...(user as any),
        name: form.name || (user as any)?.name || null,
        specialty: form.specialty || null,
        crm: form.crm || null,
        phone: form.phone || null,
      });
      await refresh();
      toast.success("Perfil atualizado com sucesso!");
      setEditing(false);
    },
    onError: (err: any) => toast.error(err.message || "Não foi possível salvar o perfil."),
  });

  const role = (user as any)?.role ?? "user";
  const roleInfo = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.user;
  const RoleIcon = roleInfo.icon;

  if (!user) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const saveProfile = () => {
    updateMutation.mutate({
      name: form.name || undefined,
      specialty: form.specialty || undefined,
      crm: form.crm || undefined,
      phone: form.phone || undefined,
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu Perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Informações da sua conta</p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Dados do profissional
            </CardTitle>
            {!editing ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      name: (user as any)?.name ?? "",
                      specialty: (user as any)?.specialty ?? "",
                      crm: (user as any)?.crm ?? "",
                      phone: (user as any)?.phone ?? "",
                    });
                    setEditing(true);
                  }}
                >
                  <Edit className="mr-1 h-3 w-3" />Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => { window.location.href = "/trocar-senha"; }}>
                  <KeyRound className="mr-1 h-3 w-3" />Alterar senha
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  <X className="mr-1 h-3 w-3" />Cancelar
                </Button>
                <Button size="sm" onClick={saveProfile} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                  Salvar
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 border-b pb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{(user as any)?.name ?? "Sem nome"}</p>
              <Badge className={`mt-1 text-xs ${roleInfo.color}`}>
                <RoleIcon className="mr-1 h-3 w-3" />{roleInfo.label}
              </Badge>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" />
              </div>
              {["medico", "enfermeiro"].includes(role) && (
                <>
                  <div>
                    <Label>Especialidade</Label>
                    <Input value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })} placeholder="Ex.: Cardiologia" className="mt-1" />
                  </div>
                  <div>
                    <Label>CRM / COREN</Label>
                    <Input value={form.crm} onChange={e => setForm({ ...form, crm: e.target.value })} placeholder="Número do registro" className="mt-1 font-mono" />
                  </div>
                </>
              )}
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" className="mt-1" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "E-mail", value: (user as any)?.email ?? "—" },
                { label: "Especialidade", value: (user as any)?.specialty ?? "—" },
                { label: "CRM / COREN", value: (user as any)?.crm ?? "—" },
                { label: "Telefone", value: (user as any)?.phone ?? "—" },
                {
                  label: "Último acesso",
                  value: (user as any)?.lastSignedIn ? new Date((user as any).lastSignedIn).toLocaleString("pt-BR") : "—",
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-right text-sm font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" />Permissões de acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { perm: "Visualizar pacientes", allowed: true },
              { perm: "Editar prontuários", allowed: ["admin", "medico", "enfermeiro"].includes(role) },
              { perm: "Criar prescrições", allowed: ["admin", "medico"].includes(role) },
              { perm: "Solicitar exames", allowed: ["admin", "medico"].includes(role) },
              { perm: "Gerenciar usuários", allowed: ["admin"].includes(role) },
              { perm: "Visualizar auditoria", allowed: ["admin"].includes(role) },
              { perm: "Acessar relatórios", allowed: ["admin", "medico"].includes(role) },
            ].map(({ perm, allowed }) => (
              <div key={perm} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">{perm}</span>
                <Badge className={allowed ? "bg-[#C9A55B]/15 text-[#6B5B2A] text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                  {allowed ? "Permitido" : "Restrito"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
