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
  ShieldCheck,
  Smartphone,
  Stethoscope,
  User,
  UserCheck,
  X,
} from "lucide-react";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
  gerente: { label: "Gerente", icon: Shield, color: "bg-blue-100 text-blue-700" },
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

      {["admin", "medico", "enfermeiro"].includes(role) ? (
        <CloudSignatureConfigCard />
      ) : null}
    </div>
  );
}

function CloudSignatureConfigCard() {
  const { data: config, isLoading, refetch } = trpc.cloudSignature.getConfig.useQuery();
  const [form, setForm] = useState({
    provider: "vidaas" as "vidaas" | "birdid",
    cpf: "",
    clientId: "",
    clientSecret: "",
    ambiente: "homologacao" as "producao" | "homologacao",
  });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (config && !editing) {
      setForm({
        provider: config.provider,
        cpf: config.cpf,
        clientId: config.clientId,
        clientSecret: "",
        ambiente: config.ambiente,
      });
    }
  }, [config, editing]);

  const saveMutation = trpc.cloudSignature.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração de assinatura A3 salva!");
      setEditing(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message || "Erro ao salvar configuração."),
  });

  if (isLoading) return null;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Assinatura Digital A3 (VIDaaS / BirdID)
          </CardTitle>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Edit className="mr-1 h-3 w-3" />
              {config ? "Editar" : "Configurar"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-1 h-3 w-3" />Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Salvar
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!editing ? (
          config ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Provedor</span>
                <span className="font-medium flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  {config.provider === "vidaas" ? "VIDaaS (Valid)" : "BirdID (Certisign)"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CPF cadastrado</span>
                <span className="font-mono font-medium">
                  {config.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ambiente</span>
                <Badge className={config.ambiente === "producao" ? "bg-green-100 text-green-700 text-xs" : "bg-yellow-100 text-yellow-700 text-xs"}>
                  {config.ambiente === "producao" ? "Produção" : "Homologação"}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Para assinar documentos, clique em "Assinar com A3" em qualquer evolução, atestado ou prescrição.
                Você receberá uma notificação no app do celular para confirmar.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Configure seu certificado digital A3 em nuvem para assinar prontuários,
              atestados, prescrições e pedidos de exame com validade ICP-Brasil.
            </p>
          )
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Provedor</Label>
              <div className="mt-1 flex gap-2">
                {(["vidaas", "birdid"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, provider: p }))}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-all ${
                      form.provider === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {p === "vidaas" ? "VIDaaS (Valid)" : "BirdID (Certisign)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>CPF (do titular do certificado A3)</Label>
              <Input
                className="mt-1 font-mono"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, "") }))}
                maxLength={14}
              />
            </div>
            <div>
              <Label>Client ID</Label>
              <Input
                className="mt-1"
                placeholder="Obtido ao registrar seu app no provedor"
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input
                className="mt-1"
                type="password"
                placeholder="Client secret do seu app"
                value={form.clientSecret}
                onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
              />
            </div>
            <div>
              <Label>Ambiente</Label>
              <div className="mt-1 flex gap-2">
                {(["homologacao", "producao"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, ambiente: a }))}
                    className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-all ${
                      form.ambiente === a
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {a === "producao" ? "Produção" : "Homologação (testes)"}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-700">
              <p className="font-medium mb-1">Como obter Client ID e Secret:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li><b>VIDaaS:</b> Registre em hml-certificado.vidaas.com.br/v0/oauth/application</li>
                <li><b>BirdID:</b> Registre em apihom.birdid.com.br/v0/oauth/application</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
