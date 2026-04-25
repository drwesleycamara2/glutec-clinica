import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";
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

export default function TrocarSenha() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setError("Use no minimo 8 caracteres com letra maiuscula, numero e caractere especial.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Não foi possível atualizar a senha.");
        return;
      }

      if (data.status === "requires_2fa_setup") {
        window.location.href = "/configurar-2fa";
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F4EE] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#C9A55B]/20 bg-white/90 shadow-2xl backdrop-blur-sm">
        <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-7 text-center">
          <Lock className="mx-auto mb-2 h-10 w-10 text-white" />
          <h1 className="text-xl font-bold text-white">Defina sua senha</h1>
          <p className="mt-1 text-sm text-white/80">A troca inicial de senha e obrigatoria.</p>
        </div>

        <div className="space-y-5 px-8 py-8">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-[#6B6B6B]/25 bg-[#6B6B6B]/5 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" />
              <p className="text-sm text-[#2F2F2F]">{error}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium text-[#050505]">
                Nova senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B8B]" />
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="h-11 border-[#E0D8CC] pl-10 pr-10 focus:border-[#C9A55B]"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8B8B]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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
                  className="h-11 border-[#E0D8CC] pl-10 focus:border-[#C9A55B]"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full border-none text-base font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, #8A6526 0%, #C9A55B 30%, #F1D791 50%, #B8863B 75%, #8A6526 100%)",
                boxShadow: "0 4px 15px rgba(201, 165, 91, 0.35)",
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </span>
              ) : (
                "Salvar senha e continuar"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
