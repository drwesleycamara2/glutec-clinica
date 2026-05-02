import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import { CLINICAL_LOCK_RETURN_TO_KEY } from "@/lib/clinicalSession";
import { safeReturnTo } from "@/lib/safe-redirect";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const query = new URLSearchParams(window.location.search);
  const returnTo = safeReturnTo(query.get("returnTo") || localStorage.getItem(CLINICAL_LOCK_RETURN_TO_KEY));
  const locked = query.get("locked") === "1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login.");
        return;
      }

      if (data.status === "requires_2fa") {
        setLocation(`/verificar-2fa?token=${data.tempToken}&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      if (data.status === "must_change_password") {
        window.location.href = "/trocar-senha";
        return;
      }

      if (data.status === "requires_2fa_setup") {
        window.location.href = "/configurar-2fa";
        return;
      }

      localStorage.removeItem(CLINICAL_LOCK_RETURN_TO_KEY);
      window.location.href = returnTo;
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#040404] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(246,226,166,0.14),transparent_32%),radial-gradient(circle_at_left_center,rgba(201,165,91,0.12),transparent_28%),linear-gradient(135deg,#020202_0%,#090909_48%,#030303_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-16 top-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(201,165,91,0.16),transparent_68%)] blur-3xl" />
        <div className="absolute bottom-[-5rem] right-[-3rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(246,226,166,0.12),transparent_66%)] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(246,226,166,0.85),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(201,165,91,0.4),transparent)]" />
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-screen">
        <div
          className="absolute inset-0 bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/logo-glutee-white.png')",
            backgroundSize: "54rem",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[2rem] border border-[#d7ba78]/30 bg-[linear-gradient(180deg,rgba(10,10,10,0.94),rgba(6,6,6,0.9))] shadow-[0_34px_90px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl">
        <div className="relative overflow-hidden border-b border-[#d7ba78]/18 px-8 pb-8 pt-9 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(9,9,9,0.96)_0%,rgba(30,22,8,0.98)_40%,rgba(8,8,8,0.98)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(246,226,166,0.95),transparent)]" />
          <div className="pointer-events-none absolute bottom-0 left-10 right-10 h-px bg-[linear-gradient(90deg,transparent,rgba(201,165,91,0.45),transparent)]" />
          <div className="pointer-events-none absolute -right-20 -top-12 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(246,226,166,0.2),transparent_65%)] blur-2xl" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(201,165,91,0.18),transparent_68%)] blur-2xl" />

          <div className="relative mx-auto flex max-w-sm flex-col items-center gap-5">
            <img
              src="/logo-glutee-white.png"
              alt="Clínica Glutée"
              className="h-24 w-auto object-contain drop-shadow-[0_0_24px_rgba(214,178,90,0.28)]"
            />

            <div className="w-full rounded-[1.4rem] border border-[#d7ba78]/28 bg-[linear-gradient(135deg,rgba(255,214,120,0.12),rgba(255,255,255,0.02),rgba(255,214,120,0.08))] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md">
              <h1 className="text-3xl font-semibold tracking-[0.04em] text-[#fff8ea]">Glutec System</h1>
              <p className="mt-2 text-sm font-medium tracking-[0.18em] text-[#f1d791]/80 uppercase">
                Sistema de atendimento e gestão médica
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8 sm:px-10">
          <h2 className="text-3xl font-semibold tracking-tight text-[#fffaf0]">Bem-vindo de volta</h2>
          <p className="mt-2 text-sm text-[#d3c6a4]">Faça login para acessar o sistema.</p>

          {locked && !error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d7ba78]/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d791]" />
              <p className="text-sm text-[#f8f0dc]">
                Sua sessão foi bloqueada por 1 hora de inatividade. Entre novamente para continuar.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d7ba78]/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d791]" />
              <p className="text-sm text-[#f8f0dc]">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-[#f8efd8]">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d7ba78]" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-12 rounded-xl border-[#c9a55b]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] pl-10 text-[#fffaf0] placeholder:text-[#c8ba93] focus:border-[#f1d791] focus:ring-[#f1d791]/25"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#f8efd8]">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d7ba78]" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  className="h-12 rounded-xl border-[#c9a55b]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] pl-10 pr-10 text-[#fffaf0] placeholder:text-[#c8ba93] focus:border-[#f1d791] focus:ring-[#f1d791]/25"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d7ba78] transition-colors hover:text-[#fff4cf]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="premium"
              disabled={loading || !email || !password}
              className="mt-2 h-[3.25rem] w-full rounded-xl text-base font-semibold text-[#130d02] transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </span>
              ) : (
                "Entrar no sistema"
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-[#d7ba78]/14 pt-5 text-center">
            <p className="text-xs text-[#cbbf9c]">
              O acesso é liberado apenas por convite do administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
