import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, AlertCircle, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  medico: "Médico(a)",
  recepcionista: "Recepcionista",
  enfermeiro: "Enfermeiro(a)",
  user: "Usuário",
};

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(password) },
    { label: "Número", ok: /[0-9]/.test(password) },
    { label: "Caractere especial", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;

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
        Força: <span className="font-medium">{labels[score - 1] || "Muito fraca"}</span>
      </p>
      <div className="space-y-1">
        {checks.map(c => (
          <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-[#8A6526]" : "text-[#8B8B8B]"}`}>
            <CheckCircle2 className={`h-3 w-3 ${c.ok ? "text-[#C9A55B]" : "text-gray-300"}`} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AceitarConvite() {
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
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const res = await fetch(`/api/auth/invite/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Convite inválido.");
        return;
      }
      setInvitation(data);
    } catch {
      setInviteError("Erro ao carregar convite.");
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (!/[A-Z]/.test(password)) return setError("A senha deve conter pelo menos uma letra maiúscula.");
    if (!/[0-9]/.test(password)) return setError("A senha deve conter pelo menos um número.");
    if (password !== confirmPassword) return setError("As senhas não coincidem.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao ativar conta.");
        return;
      }

      // Conta criada e sessão iniciada — redirecionar ao dashboard
      window.location.href = "/configurar-2fa";
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-[#F1D791] via-[#C9A55B] to-[#8A6526]" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="overflow-hidden rounded-[2rem] border border-gold/20 bg-white/80 shadow-[0_38px_90px_rgba(90,63,18,0.18)] backdrop-blur-xl dark:bg-black/45">
          <div className="bg-[linear-gradient(135deg,#6F4D17_0%,#B8863B_26%,#F1D791_50%,#C89D49_72%,#6F4D17_100%)] px-8 py-7 text-center">
            <img src="/logo-glutee.svg" alt="Glutec" className="h-12 mx-auto mb-2" />
            <h1 className="text-white text-xl font-bold">Ativar Conta</h1>
            <p className="text-white/80 text-sm mt-1">Glutec Clínica</p>
          </div>

          <div className="px-8 py-8">
            {loadingInvite ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" />
              </div>
            ) : inviteError ? (
              <div className="text-center py-6">
                <AlertCircle className="h-12 w-12 text-[#6B6B6B] mx-auto mb-3" />
                <h2 className="text-[#050505] font-semibold mb-2">Convite inválido</h2>
                <p className="text-[#6B6B6B] text-sm mb-5">{inviteError}</p>
                <Button onClick={() => setLocation("/login")} variant="outline">
                  Ir para o login
                </Button>
              </div>
            ) : (
              <>
                {/* Info do convite */}
                <div className="bg-[#F7F4EE] rounded-xl p-4 mb-6 border border-[#E8E0D0]">
                  <p className="text-xs text-[#8B8B8B] font-medium uppercase tracking-wide mb-1">Convite para</p>
                  <p className="font-semibold text-[#050505]">{invitation?.name}</p>
                  <p className="text-sm text-[#6B6B6B]">{invitation?.email}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#C9A55B]" />
                    <span className="text-xs text-[#8A6526] font-medium">
                      {ROLE_LABELS[invitation?.role] || invitation?.role}
                    </span>
                  </div>
                </div>

                <h2 className="text-[#050505] text-lg font-semibold mb-1">Crie sua senha</h2>
                <p className="text-[#6B6B6B] text-sm mb-5">
                  Sua senha deve ser forte para proteger os dados dos pacientes.
                </p>

                {error && (
                  <div className="flex items-start gap-2 bg-[#6B6B6B]/5 border border-[#6B6B6B]/25 rounded-lg px-4 py-3 mb-5">
                    <AlertCircle className="h-4 w-4 text-[#6B6B6B] mt-0.5 shrink-0" />
                    <p className="text-[#2F2F2F] text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[#050505] font-medium text-sm">
                      Nova senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8B8B]" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="pl-10 pr-10 h-11 border-[#E0D8CC] focus:border-[#C9A55B]"
                        required
                        disabled={loading}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8B8B] hover:text-[#050505]"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={password} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm" className="text-[#050505] font-medium text-sm">
                      Confirmar senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8B8B]" />
                      <Input
                        id="confirm"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        className={`pl-10 h-11 border-[#E0D8CC] focus:border-[#C9A55B] ${
                          confirmPassword && password !== confirmPassword ? "border-[#6B6B6B]/30" : ""
                        }`}
                        required
                        disabled={loading}
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-[#6B6B6B]">As senhas não coincidem</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="premium"
                    disabled={loading || password.length < 8 || password !== confirmPassword}
                    className="w-full h-12 text-base font-semibold"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ativando conta...
                      </span>
                    ) : (
                      "Ativar Minha Conta"
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
