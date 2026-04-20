import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isStrongPassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export default function ResetPasswordSafe() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const token = useMemo(() => String(params?.token ?? ""), [params?.token]);
  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setValidToken(false);
      setError("Link de recupera\u00E7\u00E3o inv\u00E1lido.");
      return;
    }

    let cancelled = false;
    setChecking(true);

    fetch(`/api/auth/password-reset/${token}`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Link inv\u00E1lido ou expirado.");
        }

        if (!cancelled) {
          setValidToken(true);
          setError("");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setValidToken(false);
          setError(err.message || "Link inv\u00E1lido ou expirado.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("As senhas n\u00E3o coincidem.");
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setError("Use no m\u00EDnimo 8 caracteres com letra mai\u00FAscula, n\u00FAmero e caractere especial.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "N\u00E3o foi poss\u00EDvel redefinir a senha.");
        return;
      }

      setSuccess(data.message || "Senha redefinida com sucesso. Voc\u00EA j\u00E1 pode entrar no sistema.");
      setValidToken(false);
      setTimeout(() => setLocation("/login"), 2000);
    } catch {
      setError("Erro de conex\u00E3o. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#040404] px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(246,226,166,0.14),transparent_32%),radial-gradient(circle_at_left_center,rgba(201,165,91,0.12),transparent_28%),linear-gradient(135deg,#020202_0%,#090909_48%,#030303_100%)]" />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[2rem] border border-[#d7ba78]/30 bg-[linear-gradient(180deg,rgba(10,10,10,0.94),rgba(6,6,6,0.9))] shadow-[0_34px_90px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl">
        <div className="relative overflow-hidden border-b border-[#d7ba78]/18 px-8 pb-8 pt-9 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(9,9,9,0.96)_0%,rgba(30,22,8,0.98)_40%,rgba(8,8,8,0.98)_100%)]" />
          <div className="relative mx-auto flex max-w-sm flex-col items-center gap-5">
            <img
              src="/logo-glutee-white.png"
              alt="Cl\u00EDnica Glut\u00E9e"
              className="h-24 w-auto object-contain drop-shadow-[0_0_24px_rgba(214,178,90,0.28)]"
            />
            <div className="w-full rounded-[1.4rem] border border-[#d7ba78]/28 bg-[linear-gradient(135deg,rgba(255,214,120,0.12),rgba(255,255,255,0.02),rgba(255,214,120,0.08))] px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md">
              <h1 className="text-3xl font-semibold tracking-[0.04em] text-[#fff8ea]">Redefinir senha</h1>
              <p className="mt-2 text-sm font-medium tracking-[0.08em] text-[#f1d791]/80">
                Defina uma nova senha para voltar a acessar o sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8 sm:px-10">
          {checking ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#f1d791]" />
            </div>
          ) : (
            <>
              {error ? (
                <div className="rounded-2xl border border-[#d7ba78]/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-[#f8f0dc]">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d791]" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{success}</span>
                  </div>
                </div>
              ) : null}

              {validToken && !success ? (
                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-sm font-medium text-[#f8efd8]">
                      Nova senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d7ba78]" />
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-[#c9a55b]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] pl-10 pr-10 text-[#fffaf0] placeholder:text-[#c8ba93] focus:border-[#f1d791] focus:ring-[#f1d791]/25"
                        required
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(value => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#d7ba78] transition-colors hover:text-[#fff4cf]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#f8efd8]">
                      Confirmar senha
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d7ba78]" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-[#c9a55b]/26 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] pl-10 text-[#fffaf0] placeholder:text-[#c8ba93] focus:border-[#f1d791] focus:ring-[#f1d791]/25"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="premium"
                    disabled={loading || !newPassword || !confirmPassword}
                    className="mt-2 h-[3.25rem] w-full rounded-xl text-base font-semibold text-[#130d02]"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </span>
                    ) : (
                      "Salvar nova senha"
                    )}
                  </Button>
                </form>
              ) : null}

              <div className="mt-6 border-t border-[#d7ba78]/14 pt-5 text-center">
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="text-sm text-[#f1d791] transition-colors hover:text-[#fff4cf]"
                >
                  Voltar para o login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
