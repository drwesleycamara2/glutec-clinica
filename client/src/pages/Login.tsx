import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        // Redirecionar para a página de 2FA com o token temporário
        setLocation(`/verificar-2fa?token=${data.tempToken}`);
        return;
      }

      if (data.status === "must_change_password") {
        setLocation("/trocar-senha");
        return;
      }

      // Login completo — redirecionar para dashboard
      window.location.href = "/";
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F4EE] relative overflow-hidden">
      {/* Faixa dourada superior */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-[#F1D791] via-[#C9A55B] to-[#8A6526]" />

      {/* Marca d'água do logo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage: "url('/logo-glutee.svg')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "55%",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-[#C9A55B]/20 overflow-hidden">
          {/* Header do card */}
          <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-8 text-center">
            <img src="/logo-glutee.svg" alt="Glutec" className="h-14 mx-auto mb-3" />
            <h1 className="text-white text-2xl font-bold tracking-tight">Glutec Clínica</h1>
            <p className="text-white/80 text-sm mt-1">Sistema de Gestão Médica</p>
          </div>

          {/* Formulário */}
          <div className="px-8 py-8">
            <h2 className="text-[#050505] text-xl font-semibold mb-1">Bem-vindo de volta</h2>
            <p className="text-[#6B6B6B] text-sm mb-6">Faça login para acessar o sistema</p>

            {error && (
              <div className="flex items-start gap-2 bg-[#6B6B6B]/5 border border-[#6B6B6B]/25 rounded-lg px-4 py-3 mb-5">
                <AlertCircle className="h-4 w-4 text-[#6B6B6B] mt-0.5 shrink-0" />
                <p className="text-[#2F2F2F] text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* E-mail */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[#050505] font-medium text-sm">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8B8B]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10 h-11 border-[#E0D8CC] focus:border-[#C9A55B] focus:ring-[#C9A55B]/20"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[#050505] font-medium text-sm">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8B8B]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-11 border-[#E0D8CC] focus:border-[#C9A55B] focus:ring-[#C9A55B]/20"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8B8B] hover:text-[#050505] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Botão de login */}
              <Button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-12 text-base font-semibold text-white border-none shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: loading
                    ? "#C9A55B"
                    : "linear-gradient(135deg, #8A6526 0%, #C9A55B 30%, #F1D791 50%, #B8863B 75%, #8A6526 100%)",
                  boxShadow: "0 4px 15px rgba(201, 165, 91, 0.35)",
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </span>
                ) : (
                  "Entrar no Sistema"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#F0EAE0] text-center">
              <p className="text-xs text-[#8B8B8B]">
                Sem conta?{" "}
                <span className="text-[#8A6526]">
                  Solicite um convite ao administrador do sistema.
                </span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#8B8B8B] mt-5">
          © 2026 Clinica Glutee — Excelência em Gestão Médica
        </p>
      </div>
    </div>
  );
}
