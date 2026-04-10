import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ClipboardList,
  Edit,
  KeyRound,
  Loader2,
  Save,
  Shield,
  Stethoscope,
  User,
  UserCheck,
  X,
} from "lucide-react";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
  medico: { label: "Médico", icon: Stethoscope, color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  enfermeiro: { label: "Enfermeiro", icon: UserCheck, color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  recepcionista: { label: "Recepcionista", icon: ClipboardList, color: "bg-[#F1D791]/30 text-[#8A6526]" },
  user: { label: "Usuário", icon: User, color: "bg-gray-100 text-gray-700" },
};

const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

type ProfileFormState = {
  name: string;
  email: string;
  specialty: string;
  profession: string;
  crm: string;
  professionalLicenseType: "CRM" | "COREN" | "";
  professionalLicenseState: string;
  phone: string;
};

function buildForm(user: any): ProfileFormState {
  const role = String(user?.role ?? "");
  const defaultLicenseType =
    role === "enfermeiro" ? "COREN" : role === "medico" || role === "admin" ? "CRM" : "";

  return {
    name: user?.name ?? "",
    email: user?.email ?? "",
    specialty: user?.specialty ?? "",
    profession: user?.profession ?? "",
    crm: user?.crm ?? "",
    professionalLicenseType: user?.professionalLicenseType ?? defaultLicenseType,
    professionalLicenseState: user?.professionalLicenseState ?? "",
    phone: user?.phone ?? "",
  };
}

function formatProfessionalLicense(user: any) {
  const type = String(user?.professionalLicenseType ?? "").trim();
  const number = String(user?.crm ?? "").trim();
  const state = String(user?.professionalLicenseState ?? "").trim().toUpperCase();

  if (!type && !number && !state) return "—";
  if (type && number && state) return `${type} ${number}/${state}`;
  if (type && number) return `${type} ${number}`;
  return [type, number, state].filter(Boolean).join(" ");
}

export default function Perfil() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(() => buildForm(user));

  useEffect(() => {
    if (!editing) {
      setForm(buildForm(user));
    }
  }, [editing, user]);

  const role = (user as any)?.role ?? "user";
  const roleInfo = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.user;
  const RoleIcon = roleInfo.icon;
  const shouldShowClinicalFields = ["medico", "enfermeiro", "admin"].includes(role);

  const permissions = useMemo(
    () => [
      { perm: "Visualizar pacientes", allowed: true },
      { perm: "Editar prontuários", allowed: ["admin", "medico", "enfermeiro"].includes(role) },
      { perm: "Criar prescrições", allowed: ["admin", "medico"].includes(role) },
      { perm: "Solicitar exames", allowed: ["admin", "medico"].includes(role) },
      { perm: "Gerenciar usuários", allowed: ["admin"].includes(role) },
      { perm: "Visualizar auditoria", allowed: ["admin"].includes(role) },
      { perm: "Acessar relatórios", allowed: ["admin", "medico"].includes(role) },
    ],
    [role],
  );

  const updateMutation = trpc.auth.updateMe.useMutation({
    onSuccess: async (data) => {
      utils.auth.me.setData(undefined, data?.user ?? null);
      await utils.auth.me.invalidate();
      toast.success("Perfil atualizado com sucesso!");
      setEditing(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Não foi possível salvar o perfil.");
    },
  });

  if (!user) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const saveProfile = () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome completo.");
      return;
    }

    if (!form.email.trim()) {
      toast.error("Informe o e-mail.");
      return;
    }

    if (shouldShowClinicalFields && form.crm.trim() && !form.professionalLicenseState.trim()) {
      toast.error("Informe a UF do registro profissional.");
      return;
    }

    updateMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      specialty: form.specialty.trim() || undefined,
      profession: form.profession.trim() || undefined,
      crm: form.crm.trim() || undefined,
      professionalLicenseType: form.professionalLicenseType || undefined,
      professionalLicenseState: form.professionalLicenseState.trim() || undefined,
      phone: form.phone.trim() || undefined,
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
                    setForm(buildForm(user));
                    setEditing(true);
                  }}
                >
                  <Edit className="mr-1 h-3 w-3" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.location.href = "/trocar-senha";
                  }}
                >
                  <KeyRound className="mr-1 h-3 w-3" />
                  Alterar senha
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm(buildForm(user));
                    setEditing(false);
                  }}
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={saveProfile} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3 w-3" />
                  )}
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
                <RoleIcon className="mr-1 h-3 w-3" />
                {roleInfo.label}
              </Badge>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="seuemail@dominio.com"
                  className="mt-1"
                />
              </div>

              {shouldShowClinicalFields ? (
                <>
                  <div>
                    <Label>Profissão</Label>
                    <Input
                      value={form.profession}
                      onChange={(e) => setForm({ ...form, profession: e.target.value })}
                      placeholder={role === "enfermeiro" ? "Ex.: Enfermeiro(a)" : "Ex.: Médico(a)"}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Especialidade</Label>
                    <Input
                      value={form.specialty}
                      onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                      placeholder="Ex.: Cirurgia Plástica"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                    <Label>Registro profissional</Label>
                      <Select
                        value={form.professionalLicenseType || undefined}
                        onValueChange={(value) =>
                          setForm({ ...form, professionalLicenseType: value as "CRM" | "COREN" })
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRM">CRM</SelectItem>
                          <SelectItem value="COREN">COREN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Número</Label>
                      <Input
                        value={form.crm}
                        onChange={(e) => setForm({ ...form, crm: e.target.value })}
                        placeholder="Número do registro"
                        className="mt-1 font-mono"
                      />
                    </div>

                    <div>
                      <Label>UF do registro</Label>
                      <Select
                        value={form.professionalLicenseState || undefined}
                        onValueChange={(value) => setForm({ ...form, professionalLicenseState: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {BR_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  className="mt-1"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "E-mail", value: (user as any)?.email ?? "—" },
                { label: "Profissão", value: (user as any)?.profession ?? "—" },
                { label: "Especialidade", value: (user as any)?.specialty ?? "—" },
                { label: "CRM / COREN", value: formatProfessionalLicense(user) },
                { label: "Telefone", value: (user as any)?.phone ?? "—" },
                {
                  label: "Último acesso",
                  value: (user as any)?.lastSignedIn
                    ? new Date((user as any).lastSignedIn).toLocaleString("pt-BR")
                    : "—",
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
            <Shield className="h-4 w-4 text-primary" />
            Permissões de acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {permissions.map(({ perm, allowed }) => (
              <div key={perm} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">{perm}</span>
                <Badge
                  className={
                    allowed
                      ? "bg-[#C9A55B]/15 text-[#6B5B2A] text-xs"
                      : "bg-gray-100 text-gray-500 text-xs"
                  }
                >
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
