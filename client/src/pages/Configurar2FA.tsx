import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, ShieldCheck, Download, CheckCircle2, ArrowRight } from "lucide-react";
import { trpc } from "@/_core/trpc";

type Step = "intro" | "qrcode" | "verify" | "backup" | "done";

export default function Configurar2FA() {
  const [step, setStep] = useState<Step>("intro");
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupSaved, setBackupSaved] = useState(false);

  const setupMutation = trpc.twoFactor.setup.useMutation({
    onSuccess: (data) => {
      setSecret(data.secret);
      setQrCode(data.qrCodeUrl);
      setStep("qrcode");
    },
    onError: (err) => setError(err.message),
  });

  const confirmMutation = trpc.twoFactor.confirm.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setStep("backup");
    },
    onError: (err) => {
      setError(err.message);
      setCode("");
    },
  });

  const handleStartSetup = () => {
    setError("");
    setupMutation.mutate();
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setError("");
    confirmMutation.mutate({ secret, code });
  };

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
  };

  const downloadBackupCodes = () => {
    const content = [
      "GLUTEC CLÍNICA — CÓDIGOS DE BACKUP 2FA",
      "========================================",
      "Guarde estes códigos em local seguro.",
      "Cada código pode ser usado apenas uma vez.",
      "",
      ...backupCodes.map((c, i) => `${i + 1}. ${c}`),
      "",
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "glutec-backup-codes-2fa.txt";
    a.click();
    URL.revokeObjectURL(url);
    setBackupSaved(true);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F4EE] relative overflow-hidden px-4">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-[#C9A55B]/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-7 text-center">
            <ShieldCheck className="h-10 w-10 text-white mx-auto mb-2" />
            <h1 className="text-white text-xl font-bold">Configurar Autenticação 2FA</h1>
            <p className="text-white/80 text-sm mt-1">Proteja sua conta com uma camada extra de segurança</p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 py-4 bg-[#FAF8F4]">
            {(["intro", "qrcode", "verify", "backup", "done"] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step ? "w-6 bg-[#C9A55B]" :
                  (["intro", "qrcode", "verify", "backup", "done"] as Step[]).indexOf(step) > i
                    ? "w-2 bg-[#C9A55B]/60" : "w-2 bg-[#E0D8CC]"
                }`}
              />
            ))}
          </div>

          <div className="px-8 py-8">
            {error && (
              <div className="flex items-start gap-2 bg-[#6B6B6B]/5 border border-[#6B6B6B]/25 rounded-lg px-4 py-3 mb-5">
                <AlertCircle className="h-4 w-4 text-[#6B6B6B] mt-0.5 shrink-0" />
                <p className="text-[#2F2F2F] text-sm">{error}</p>
              </div>
            )}

            {/* INTRO */}
            {step === "intro" && (
              <div className="text-center">
                <ShieldCheck className="h-16 w-16 text-[#C9A55B] mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#050505] mb-3">Ative o 2FA</h2>
                <p className="text-[#6B6B6B] text-sm mb-6 max-w-sm mx-auto">
                  A autenticação em dois fatores protege sua conta e os dados dos pacientes.
                  Você precisará de um app autenticador como:
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6 text-xs text-[#6B6B6B]">
                  {["Google Authenticator", "Microsoft Authenticator", "Authy"].map(app => (
                    <div key={app} className="bg-[#F7F4EE] rounded-lg p-3 text-center border border-[#E8E0D0]">
                      {app}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleStartSetup}
                    disabled={setupMutation.isPending}
                    className="flex-1 h-11 font-semibold text-white border-none"
                    style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                  >
                    {setupMutation.isPending ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Gerando...</span>
                    ) : (
                      <span className="flex items-center gap-2">Configurar agora <ArrowRight className="h-4 w-4" /></span>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* QR CODE */}
            {step === "qrcode" && (
              <div className="text-center">
                <h2 className="text-lg font-bold text-[#050505] mb-2">Escaneie o QR Code</h2>
                <p className="text-[#6B6B6B] text-sm mb-5">
                  Abra seu app autenticador, toque em "+" e escaneie o código abaixo.
                </p>
                {qrCode && (
                  <div className="inline-block p-3 bg-white border-2 border-[#C9A55B]/30 rounded-xl shadow mb-4">
                    <img src={qrCode} alt="QR Code 2FA" className="w-48 h-48" />
                  </div>
                )}
                <details className="mb-5 text-left">
                  <summary className="text-xs text-[#8A6526] cursor-pointer">
                    Não consegue escanear? Inserir código manualmente
                  </summary>
                  <div className="mt-2 bg-[#F7F4EE] rounded-lg px-3 py-2">
                    <p className="text-xs text-[#6B6B6B] mb-1">Chave secreta:</p>
                    <code className="text-xs font-mono break-all text-[#050505]">{secret}</code>
                  </div>
                </details>
                <Button
                  onClick={() => setStep("verify")}
                  className="w-full h-11 font-semibold text-white border-none"
                  style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                >
                  Já escaneei — Continuar
                </Button>
              </div>
            )}

            {/* VERIFY */}
            {step === "verify" && (
              <div>
                <h2 className="text-lg font-bold text-[#050505] mb-2">Verifique o código</h2>
                <p className="text-[#6B6B6B] text-sm mb-6">
                  Digite o código de 6 dígitos gerado pelo app autenticador para confirmar a configuração.
                </p>
                <form onSubmit={handleVerify} className="flex flex-col items-center gap-4">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={e => handleCodeChange(e.target.value)}
                    placeholder="000000"
                    className="text-center text-3xl font-mono tracking-[0.5em] h-16 border-[#E0D8CC] focus:border-[#C9A55B] w-48"
                    disabled={confirmMutation.isPending}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    disabled={confirmMutation.isPending || code.length !== 6}
                    className="w-full h-11 font-semibold text-white border-none"
                    style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                  >
                    {confirmMutation.isPending ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Verificando...</span>
                    ) : "Confirmar e Ativar 2FA"}
                  </Button>
                  <button type="button" onClick={() => setStep("qrcode")} className="text-sm text-[#8B8B8B] hover:text-[#050505]">
                    Voltar
                  </button>
                </form>
              </div>
            )}

            {/* BACKUP CODES */}
            {step === "backup" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-6 w-6 text-[#C9A55B]" />
                  <h2 className="text-lg font-bold text-[#050505]">2FA Ativado!</h2>
                </div>
                <p className="text-[#6B6B6B] text-sm mb-4">
                  Salve seus <strong>códigos de backup</strong> em local seguro. Use-os caso perca acesso ao app autenticador.
                  <span className="text-[#6B6B6B] font-medium"> Cada código funciona apenas uma vez.</span>
                </p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {backupCodes.map((c, i) => (
                    <code key={i} className="bg-[#F7F4EE] border border-[#E0D8CC] rounded-lg px-3 py-2 text-sm font-mono text-center text-[#050505] tracking-widest">
                      {c}
                    </code>
                  ))}
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={downloadBackupCodes}
                    variant="outline"
                    className="w-full h-11 border-[#C9A55B] text-[#8A6526] hover:bg-[#F7F4EE]"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {backupSaved ? "Baixado!" : "Baixar códigos (.txt)"}
                  </Button>
                  <Button
                    onClick={() => {
                      window.location.href = "/";
                    }}
                    disabled={!backupSaved}
                    className="w-full h-11 font-semibold text-white border-none"
                    style={{ background: backupSaved ? "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" : undefined }}
                  >
                    {backupSaved ? "Ir para o Dashboard" : "Baixe os códigos antes de continuar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
