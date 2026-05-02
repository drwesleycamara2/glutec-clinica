import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, ShieldCheck, ArrowLeft, KeyRound } from "lucide-react";
import { CLINICAL_LOCK_RETURN_TO_KEY } from "@/lib/clinicalSession";
import { safeReturnTo } from "@/lib/safe-redirect";

export default function VerificarDoisFatores() {
  const [location, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pegar token da URL
  const params = new URLSearchParams(window.location.search);
  const tempToken = params.get("token") || "";
  const returnTo = safeReturnTo(params.get("returnTo") || localStorage.getItem(CLINICAL_LOCK_RETURN_TO_KEY));

  useEffect(() => {
    if (!tempToken) setLocation("/login");
    inputRef.current?.focus();
  }, []);

  // Formatar código automaticamente (adicionar espaço no meio)
  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) {
      handleVerify(cleaned);
    }
  };

  const handleVerify = async (codeToVerify = code) => {
    if (codeToVerify.length !== 6) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: codeToVerify }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código inválido.");
        setCode("");
        inputRef.current?.focus();
        return;
      }

      localStorage.removeItem(CLINICAL_LOCK_RETURN_TO_KEY);
      window.location.href = returnTo;
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, backupCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código de backup inválido.");
        return;
      }

      if (data.remainingBackupCodes <= 2) {
        // Redirecionar após login mas mostrar aviso
        localStorage.removeItem(CLINICAL_LOCK_RETURN_TO_KEY);
        window.location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}aviso=backup_codes_baixos`;
      } else {
        localStorage.removeItem(CLINICAL_LOCK_RETURN_TO_KEY);
        window.location.href = returnTo;
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F4EE] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-[#F1D791] via-[#C9A55B] to-[#8A6526]" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-[#C9A55B]/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-7 text-center">
            <ShieldCheck className="h-10 w-10 text-white mx-auto mb-2" />
            <h1 className="text-white text-xl font-bold">Verificação em Dois Fatores</h1>
            <p className="text-white/80 text-sm mt-1">Glutec System — Acesso Seguro</p>
          </div>

          <div className="px-8 py-8">
            {!showBackupForm ? (
              <>
                <h2 className="text-[#050505] text-lg font-semibold mb-1">Digite o código</h2>
                <p className="text-[#6B6B6B] text-sm mb-6">
                  Abra seu app autenticador (Google Authenticator, Authy, etc.) e insira o código de 6 dígitos.
                </p>

                {error && (
                  <div className="flex items-start gap-2 bg-[#6B6B6B]/5 border border-[#6B6B6B]/25 rounded-lg px-4 py-3 mb-5">
                    <AlertCircle className="h-4 w-4 text-[#6B6B6B] mt-0.5 shrink-0" />
                    <p className="text-[#2F2F2F] text-sm">{error}</p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-4">
                  <Input
                    ref={inputRef}
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={e => handleCodeChange(e.target.value)}
                    placeholder="000000"
                    className="text-center text-3xl font-mono tracking-[0.5em] h-16 border-[#E0D8CC] focus:border-[#C9A55B] w-48"
                    disabled={loading}
                    autoComplete="one-time-code"
                  />

                  <Button
                    onClick={() => handleVerify()}
                    disabled={loading || code.length !== 6}
                    className="w-full h-11 font-semibold text-white border-none"
                    style={{
                      background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      "Verificar Código"
                    )}
                  </Button>
                </div>

                <div className="mt-6 pt-5 border-t border-[#F0EAE0] space-y-3">
                  <button
                    onClick={() => { setShowBackupForm(true); setError(""); }}
                    className="w-full flex items-center justify-center gap-2 text-sm text-[#8A6526] hover:text-[#6B4E1E] transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    Usar código de backup
                  </button>
                  <button
                    onClick={() => setLocation("/login")}
                    className="w-full flex items-center justify-center gap-2 text-sm text-[#8B8B8B] hover:text-[#050505] transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o login
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[#050505] text-lg font-semibold mb-1">Código de Backup</h2>
                <p className="text-[#6B6B6B] text-sm mb-6">
                  Digite um dos seus códigos de backup no formato <span className="font-mono font-semibold">XXXX-XXXX</span>.
                  Cada código pode ser usado apenas uma vez.
                </p>

                {error && (
                  <div className="flex items-start gap-2 bg-[#6B6B6B]/5 border border-[#6B6B6B]/25 rounded-lg px-4 py-3 mb-5">
                    <AlertCircle className="h-4 w-4 text-[#6B6B6B] mt-0.5 shrink-0" />
                    <p className="text-[#2F2F2F] text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleBackupCode} className="space-y-4">
                  <Input
                    type="text"
                    value={backupCode}
                    onChange={e => setBackupCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    className="text-center text-lg font-mono h-12 border-[#E0D8CC] focus:border-[#C9A55B] tracking-widest"
                    maxLength={9}
                    disabled={loading}
                    autoFocus
                  />

                  <Button
                    type="submit"
                    disabled={loading || backupCode.length < 8}
                    className="w-full h-11 font-semibold text-white border-none"
                    style={{
                      background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      "Usar Código de Backup"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => { setShowBackupForm(false); setError(""); }}
                    className="w-full flex items-center justify-center gap-2 text-sm text-[#8B8B8B] hover:text-[#050505] transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o código do app
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
