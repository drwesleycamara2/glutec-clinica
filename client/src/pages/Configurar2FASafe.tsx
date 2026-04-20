import { useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/_core/trpc";

type Step = "intro" | "qrcode" | "verify" | "backup";

export default function Configurar2FASafe() {
  const [step, setStep] = useState<Step>("intro");
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupSaved, setBackupSaved] = useState(false);

  const setupMutation = trpc.twoFactor.setup.useMutation({
    onSuccess: data => {
      setSecret(data.secret);
      setQrCode(data.qrCodeUrl);
      setStep("qrcode");
    },
    onError: err => setError(err.message),
  });

  const confirmMutation = trpc.twoFactor.confirm.useMutation({
    onSuccess: data => {
      setBackupCodes(data.backupCodes);
      setStep("backup");
    },
    onError: err => {
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
      "GLUTEC CLINICA - CODIGOS DE BACKUP 2FA",
      "========================================",
      "Guarde estes codigos em local seguro.",
      "Cada codigo pode ser usado apenas uma vez.",
      "",
      ...backupCodes.map((backupCode, index) => `${index + 1}. ${backupCode}`),
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
    <div className="relative min-h-screen overflow-hidden bg-[#F7F4EE] px-4">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#F1D791]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#C9A55B]/20 bg-white/90 shadow-2xl backdrop-blur-sm">
          <div className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#8A6526] px-8 py-7 text-center">
            <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-white" />
            <h1 className="text-xl font-bold text-white">Configurar autentica\u00E7\u00E3o em 2 fatores</h1>
            <p className="mt-1 text-sm text-white/80">Seu acesso s\u00F3 ser\u00E1 liberado ap\u00F3s concluir esta etapa</p>
          </div>

          <div className="flex justify-center gap-2 bg-[#FAF8F4] py-4">
            {(["intro", "qrcode", "verify", "backup"] as Step[]).map((currentStep, index) => (
              <div
                key={currentStep}
                className={`h-2 rounded-full transition-all ${
                  currentStep === step
                    ? "w-6 bg-[#C9A55B]"
                    : (["intro", "qrcode", "verify", "backup"] as Step[]).indexOf(step) > index
                      ? "w-2 bg-[#C9A55B]/60"
                      : "w-2 bg-[#E0D8CC]"
                }`}
              />
            ))}
          </div>

          <div className="px-8 py-8">
            {error ? (
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#6B6B6B]/25 bg-[#6B6B6B]/5 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6B6B6B]" />
                <p className="text-sm text-[#2F2F2F]">{error}</p>
              </div>
            ) : null}

            {step === "intro" ? (
              <div className="text-center">
                <ShieldCheck className="mx-auto mb-4 h-16 w-16 text-[#C9A55B]" />
                <h2 className="mb-3 text-xl font-bold text-[#050505]">Ative o 2FA</h2>
                <p className="mx-auto mb-6 max-w-sm text-sm text-[#6B6B6B]">
                  A autentica\u00E7\u00E3o em dois fatores protege sua conta e os dados dos pacientes. Voc\u00EA vai
                  precisar de um aplicativo autenticador, como:
                </p>
                <div className="mb-6 grid grid-cols-3 gap-3 text-xs text-[#6B6B6B]">
                  {["Google Authenticator", "Microsoft Authenticator", "Authy"].map(app => (
                    <div key={app} className="rounded-lg border border-[#E8E0D0] bg-[#F7F4EE] p-3 text-center">
                      {app}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleStartSetup}
                  disabled={setupMutation.isPending}
                  className="h-11 w-full border-none font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                >
                  {setupMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando QR Code...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Configurar agora <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            ) : null}

            {step === "qrcode" ? (
              <div className="text-center">
                <h2 className="mb-2 text-lg font-bold text-[#050505]">Escaneie o QR Code</h2>
                <p className="mb-5 text-sm text-[#6B6B6B]">
                  Abra seu aplicativo autenticador, toque em "+" e escaneie o c\u00F3digo abaixo.
                </p>
                {qrCode ? (
                  <div className="mb-4 inline-block rounded-xl border-2 border-[#C9A55B]/30 bg-white p-3 shadow">
                    <img src={qrCode} alt="QR Code 2FA" className="h-48 w-48" />
                  </div>
                ) : null}
                <details className="mb-5 text-left">
                  <summary className="cursor-pointer text-xs text-[#8A6526]">N\u00E3o consegue escanear? Inserir chave manualmente</summary>
                  <div className="mt-2 rounded-lg bg-[#F7F4EE] px-3 py-2">
                    <p className="mb-1 text-xs text-[#6B6B6B]">Chave secreta:</p>
                    <code className="break-all font-mono text-xs text-[#050505]">{secret}</code>
                  </div>
                </details>
                <Button
                  onClick={() => setStep("verify")}
                  className="h-11 w-full border-none font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                >
                  J\u00E1 escaneei - continuar
                </Button>
              </div>
            ) : null}

            {step === "verify" ? (
              <div>
                <h2 className="mb-2 text-lg font-bold text-[#050505]">Confirme o c\u00F3digo</h2>
                <p className="mb-6 text-sm text-[#6B6B6B]">
                  Digite o c\u00F3digo de 6 d\u00EDgitos gerado pelo aplicativo autenticador para concluir a ativa\u00E7\u00E3o.
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
                    className="h-16 w-48 text-center font-mono text-3xl tracking-[0.5em] border-[#E0D8CC] focus:border-[#C9A55B]"
                    disabled={confirmMutation.isPending}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    disabled={confirmMutation.isPending || code.length !== 6}
                    className="h-11 w-full border-none font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" }}
                  >
                    {confirmMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verificando...
                      </span>
                    ) : (
                      "Confirmar e ativar 2FA"
                    )}
                  </Button>
                  <button type="button" onClick={() => setStep("qrcode")} className="text-sm text-[#8B8B8B] hover:text-[#050505]">
                    Voltar
                  </button>
                </form>
              </div>
            ) : null}

            {step === "backup" ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-[#C9A55B]" />
                  <h2 className="text-lg font-bold text-[#050505]">2FA ativado</h2>
                </div>
                <p className="mb-4 text-sm text-[#6B6B6B]">
                  Salve seus <strong>c\u00F3digos de backup</strong> em local seguro. Voc\u00EA poder\u00E1 us\u00E1-los
                  se perder o acesso ao aplicativo autenticador.
                  <span className="font-medium text-[#6B6B6B]"> Cada c\u00F3digo funciona apenas uma vez.</span>
                </p>
                <div className="mb-5 grid grid-cols-2 gap-2">
                  {backupCodes.map((backupCode, index) => (
                    <code
                      key={`${backupCode}-${index}`}
                      className="rounded-lg border border-[#E0D8CC] bg-[#F7F4EE] px-3 py-2 text-center font-mono text-sm tracking-widest text-[#050505]"
                    >
                      {backupCode}
                    </code>
                  ))}
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={downloadBackupCodes}
                    variant="outline"
                    className="h-11 w-full border-[#C9A55B] text-[#8A6526] hover:bg-[#F7F4EE]"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {backupSaved ? "Arquivo baixado" : "Baixar c\u00F3digos (.txt)"}
                  </Button>
                  <Button
                    onClick={() => {
                      window.location.href = "/";
                    }}
                    disabled={!backupSaved}
                    className="h-11 w-full border-none font-semibold text-white"
                    style={{
                      background: backupSaved ? "linear-gradient(135deg, #8A6526 0%, #C9A55B 50%, #8A6526 100%)" : undefined,
                    }}
                  >
                    {backupSaved ? "Entrar no sistema" : "Baixe os c\u00F3digos antes de continuar"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
