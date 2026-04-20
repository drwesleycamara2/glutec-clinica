import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "M\u00E9dica(o)",
  recepcionista: "Secret\u00E1ria(o) / apoio",
  enfermeiro: "Enfermeira(o)",
  gerente: "Gerente",
  user: "Apoio",
};

const JOB_TITLE_LABELS: Record<string, string> = {
  medico: "M\u00E9dica(o)",
  gerente: "Gerente",
  massoterapeuta: "Massoterapeuta",
  tecnico_enfermagem: "T\u00E9cnica(o) de enfermagem",
  enfermeiro: "Enfermeira(o)",
  secretaria: "Secret\u00E1ria(o)",
  apoio: "Apoio",
};

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "M\u00EDnimo de 8 caracteres", ok: password.length >= 8 },
    { label: "Letra mai\u00FAscula", ok: /[A-Z]/.test(password) },
    { label: "N\u00FAmero", ok: /[0-9]/.test(password) },
    { label: "Caractere especial", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(check => check.ok).length;

  if (!password) return null;

  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-500"];
  const labels = ["Fraca", "Regular", "Boa", "Forte"];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score - 1] : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className={`text-xs ${score === 4 ? "text-[#8A6526]" : "text-[#8B8B8B]"}`}>
        For\u00E7a: <span className="font-medium">{labels[score - 1] || "Muito fraca"}</span>
      </p>
      <div className="space-y-1">
        {checks.map(check => (
          <div
            key={check.label}
            className={`flex items-center gap-1.5 text-xs ${check.ok ? "text-[#8A6526]" : "text-[#8B8B8B]"}`}
          >
            <CheckCircle2 className={`h-3 w-3 ${check.ok ? "text-[#C9A55B]" : "text-gray-300"}`} />
            {check.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AceitarConviteSafe() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<any>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState("");

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }
    void fetchInvitation();
  }, [token, setLocation]);

  const invitationJobTitles = useMemo(() => {
    if (!Array.isArray(invitation?.jobTitles)) return [];
    return invitation.jobTitles.map((jobTitle: string) => JOB_TITLE_LABELS[jobTitle] || jobTitle).filter(Boolean);
  }, [invitation]);

  async function fetchInvitation() {
    try {
      const res = await fetch(`/api/auth/invite/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Convite inv\u00E1lido.");
        return;
      }
      setInvitation(data);
    } catch {
      setInviteError("Erro ao carregar o convite.");
    } finally {
      setLoadingInvite(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (!/[A-Z]/.test(password)) return setError("A senha deve conter pelo menos uma letra mai\u00FAscula.");
    if (!/[0-9]/.test(password)) return setError("A senha deve conter pelo menos um n\u00FAmero.");
    if (!/[^A-Za-z0-9]/.test(password)) return setError("A senha deve conter pelo menos um caractere especial.");
    if (password !== confirmPassword) return setError("As senhas n\u00E3o coincidem.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao ativar a conta.");
        return;
      }

      window.location.href = "/configurar-2fa";
    } catch {
      setError("Erro de conex\u00E3o. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />
      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#F1D791] via-[#C9A55B] to-[#8A6526]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-gold/20 bg-white/80 shadow-[0_38px_90px_rgba(90,63,18,0.18)] backdrop-blur-xl dark:bg-black/45">
          <div className="bg-[linear-gradient(135deg,#6F4D17_0%,#B8863B_26%,#F1D791_50%,#C89D49_72%,#6F4D17_100%)] px-8 py-7 text-center">
            <img src="/logo-glutee.svg" alt="Glutec" className="mx-auto mb-2 h-12" />
            <h1 className="text-xl font-bold text-white">Ativar conta</h1>
            <p className="mt-1 text-sm text-white/80">Glutec Cl\u00EDnica</p>
          </div>

          <div className="px-8 py-8">
            {loadingInvite ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" />
              </div>
            ) : inviteError ? (
              <div className="py-6 text-center">
                <AlertCircle className="mx-auto mb-3 h-12 w-12 text-[#6B6B6B]" />
                <h2 className="mb-2 font-semibold text-[#050505]">Convite inv\u00E1lido</h2>
                <p className="mb-5 text-sm text-[#6B6B6B]">{inviteError}</p>
                <Button onClick={() => setLocation("/login")} variant="outline">
                  Ir para o login
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-6 rounded-xl border border-[#E8E0D0] bg-[#F7F4EE] p-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#8B8B8B]">Convite para</p>
                  <p className="font-semibold text-[#050505]">{invitation?.name}</p>
                  <p className="text-sm text-[#6B6B6B]">{invitation?.email}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#C9A55B]" />
                    <span className="text-xs font-medium text-[#8A6526]">
                      {ROLE_LABELS[invitation?.role] || invitation?.role}
                    </span>
                  </div>
                  {invitationJobTitles.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {invitationJobTitles.map((jobTitle: string) => (
                        <span
                          key={jobTitle}
                          className="rounded-full border border-[#C9A55B]/25 bg-white/80 px-3 py-1 text-[11px] font-medium text-[#8A6526]"
                        >
                          {jobTitle}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <h2 className="mb-1 text-lg font-semibold text-[#050505]">Crie sua senha</h2>
                <p className="mb-5 text-sm text-[#6B6B6B]">
                  Sua senha deve ser forte para proteger os dados dos pacientes. Depois disso, o sistema vai levar
                  voc\u00EA para configurar o Google Authenticator, etapa obrigat\u00F3ria para liberar o acesso.
                </p>

                {error ? (
                  <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#6B6B6B]/25 bg-[#6B6B6B]/5 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" />
                    <p className="text-sm text-[#2F2F2F]">{error}</p>
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium text-[#050505]">
                      Nova senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B8B]" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="M\u00EDnimo de 8 caracteres"
                        className="h-11 border-[#E0D8CC] pl-10 pr-10 focus:border-[#C9A55B]"
                        required
                        disabled={loading}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(value => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8B8B] hover:text-[#050505]"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#050505]">
                      Confirmar senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B8B]" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        className={`h-11 border-[#E0D8CC] pl-10 focus:border-[#C9A55B] ${
                          confirmPassword && password !== confirmPassword ? "border-[#6B6B6B]/30" : ""
                        }`}
                        required
                        disabled={loading}
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword && password !== confirmPassword ? (
                      <p className="text-xs text-[#6B6B6B]">As senhas n\u00E3o coincidem.</p>
                    ) : null}
                  </div>

                  <Button
                    type="submit"
                    variant="premium"
                    disabled={loading || password.length < 8 || password !== confirmPassword}
                    className="h-12 w-full text-base font-semibold"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ativando conta...
                      </span>
                    ) : (
                      "Continuar para o Google Authenticator"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
