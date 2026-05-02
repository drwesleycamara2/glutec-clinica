import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLINICAL_LOCK_RETURN_TO_KEY } from "@/lib/clinicalSession";
import { safeReturnTo } from "@/lib/safe-redirect";

export default function VerificarDoisFatoresSafe() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBackupForm, setShowBackupForm] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const params = new URLSearchParams(window.location.search);
  const tempToken = params.get("token") || "";
  const returnTo = safeReturnTo(params.get("returnTo") || localStorage.getItem(CLINICAL_LOCK_RETURN_TO_KEY));

  useEffect(() => {
    if (!tempToken) setLocation("/login");
    inputRef.current?.focus();
  }, [setLocation, tempToken]);

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) {
      void handleVerify(cleaned);
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

      localStorage.removeItem(CLINICAL_LOCK_RETURN_TO_KEY);
      if (data.remainingBackupCodes <= 2) {
        window.location.href = `${returnTo}${returnTo.includes("?") ? "&" : "?"}aviso=backup_codes_baixos`;
      } else {
        window.location.href = returnTo;
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F4EE]">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />
      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#F1D791] via-[#C9A55B] to-[#8A6526]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#C9A55B]/20 bg-white/90 shadow-2xl backdrop-blur-sm">
          <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-7 text-center">
            <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-white" />
            <h1 className="text-xl font-bold text-white">Verificação em dois fatores</h1>
            <p className="mt-1 text-sm text-white/80">Glutec System - acesso seguro</p>
          </div>

          <div className="px-8 py-8">
            {!showBackupForm ? (
              <>
                <h2 className="mb-1 text-lg font-semibold text-[#050505]">Digite o código</h2>
                <p className="mb-6 text-sm text-[#6B6B6B]">
                  Abra seu aplicativo autenticador, como Google Authenticator ou Authy, e informe o código de 6
                  dígitos.
                </p>

                {error ? (
                  <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#6B6B6B]/25 bg-[#6B6B6B]/5 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" />
                    <p className="text-sm text-[#2F2F2F]">{error}</p>
                  </div>
                ) : null}

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
                    className="h-16 w-48 border-[#E0D8CC] text-center font-mono text-3xl tracking-[0.5em] focus:border-[#C9A55B]"
                    disabled={loading}
                    autoComplete="one-time-code"
                  />

                  <Button
                    onClick={() => void handleVerify()}
                    disabled={loading || code.length !== 6}
                    className="h-11 w-full border-none font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      "Verificar código"
                    )}
                  </Button>
                </div>

                <div className="mt-6 space-y-3 border-t border-[#F0EAE0] pt-5">
                  <button
                    onClick={() => {
                      setShowBackupForm(true);
                      setError("");
                    }}
                    className="flex w-full items-center justify-center gap-2 text-sm text-[#8A6526] transition-colors hover:text-[#6B4E1E]"
                  >
                    <KeyRound className="h-4 w-4" />
                    Usar código de backup
                  </button>
                  <button
                    onClick={() => setLocation("/login")}
                    className="flex w-full items-center justify-center gap-2 text-sm text-[#8B8B8B] transition-colors hover:text-[#050505]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o login
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-lg font-semibold text-[#050505]">Código de backup</h2>
                <p className="mb-6 text-sm text-[#6B6B6B]">
                  Digite um dos seus códigos de backup no formato <span className="font-mono font-semibold">XXXX-XXXX</span>.
                  Cada código pode ser usado apenas uma vez.
                </p>

                {error ? (
                  <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#6B6B6B]/25 bg-[#6B6B6B]/5 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" />
                    <p className="text-sm text-[#2F2F2F]">{error}</p>
                  </div>
                ) : null}

                <form onSubmit={handleBackupCode} className="space-y-4">
                  <Input
                    type="text"
                    value={backupCode}
                    onChange={e => setBackupCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    className="h-12 border-[#E0D8CC] text-center font-mono text-lg tracking-widest focus:border-[#C9A55B]"
                    maxLength={9}
                    disabled={loading}
                    autoFocus
                  />

                  <Button
                    type="submit"
                    disabled={loading || backupCode.length < 8}
                    className="h-11 w-full border-none font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      "Usar código de backup"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowBackupForm(false);
                      setError("");
                    }}
                    className="flex w-full items-center justify-center gap-2 text-sm text-[#8B8B8B] transition-colors hover:text-[#050505]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o código do aplicativo
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
