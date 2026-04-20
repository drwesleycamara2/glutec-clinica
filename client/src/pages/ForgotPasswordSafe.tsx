import { useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordSafe() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warning, setWarning] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setWarning("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "N\u00E3o foi poss\u00EDvel iniciar a recupera\u00E7\u00E3o de senha.");
        return;
      }

      setSuccess(
        data.message ||
          "Se houver uma conta compat\u00EDvel com esse e-mail, voc\u00EA receber\u00E1 um link seguro para redefinir a senha.",
      );

      if (data.warning) {
        setWarning(data.warning);
      }
    } catch {
      setError("Erro de conex\u00E3o. Tente novamente em instantes.");
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
              <h1 className="text-3xl font-semibold tracking-[0.04em] text-[#fff8ea]">Recuperar acesso</h1>
              <p className="mt-2 text-sm font-medium tracking-[0.08em] text-[#f1d791]/80">
                Enviaremos um link seguro para redefinir sua senha.
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8 sm:px-10">
          <h2 className="text-3xl font-semibold tracking-tight text-[#fffaf0]">Esqueci minha senha</h2>
          <p className="mt-2 text-sm text-[#d3c6a4]">
            Informe seu e-mail de acesso. Se a conta existir, voc\u00EA receber\u00E1 um link tempor\u00E1rio para criar uma nova senha.
          </p>

          {error ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d7ba78]/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d791]" />
              <p className="text-sm text-[#f8f0dc]">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {success}
            </div>
          ) : null}

          {warning ? (
            <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              {warning}
            </div>
          ) : null}

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

            <Button
              type="submit"
              variant="premium"
              disabled={loading || !email}
              className="mt-2 h-[3.25rem] w-full rounded-xl text-base font-semibold text-[#130d02]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : (
                "Enviar link de recupera\u00E7\u00E3o"
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-[#d7ba78]/14 pt-5">
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="inline-flex items-center gap-2 text-sm text-[#f1d791] transition-colors hover:text-[#fff4cf]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
