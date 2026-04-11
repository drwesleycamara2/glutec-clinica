/**
 * Botão de Assinatura Digital A3 em Nuvem (VIDaaS / BirdID)
 *
 * Fluxo QR Code (principal):
 * 1. Calcula SHA-256 do conteúdo do documento
 * 2. Backend gera URL de autorização OAuth2+PKCE e converte em QR
 * 3. Modal exibe o QR → médico escaneia no app VIDaaS/BirdID
 * 4. App redireciona para /api/cloud-signature/callback
 * 5. Callback completa a assinatura e envia postMessage para esta janela
 * 6. Polling a cada 3s como fallback para detectar conclusão
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

type DocumentType = "evolucao" | "atestado" | "prescricao" | "exame";
type Status = "idle" | "gerando" | "aguardando_qr" | "assinado" | "erro";

interface Props {
  documentType: DocumentType;
  documentId: number;
  documentAlias: string;
  /** Conteúdo textual do documento — será hasheado com SHA-256 */
  documentContent: string;
  onSigned?: (validationCode: string) => void;
  disabled?: boolean;
  className?: string;
}

async function sha256Base64(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

export function SignatureA3Button({
  documentType,
  documentId,
  documentAlias,
  documentContent,
  onSigned,
  disabled,
  className,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [providerName, setProviderName] = useState("VIDaaS / BirdID");
  const [validationCode, setValidationCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  const qrMutation = trpc.cloudSignature.generateQrCode.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setQrDataUrl(data.qrDataUrl);
      setProviderName(data.providerName);
      setStatus("aguardando_qr");

      // Abre janela popup para receber o redirect do OAuth2
      const popup = window.open(
        "",
        "assinatura_a3",
        "width=500,height=400,left=200,top=200",
      );
      if (popup) {
        popup.document.write(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
          <h3>Aguardando autenticação no app ${data.providerName}…</h3>
          <p>Escaneie o QR code e confirme no celular.</p>
          <p style="color:#888;font-size:12px">Esta janela fechará automaticamente após a confirmação.</p>
        </body></html>`);
        popupRef.current = popup;
      }
    },
    onError: (err) => {
      setStatus("erro");
      setErrorMsg(err.message);
      toast.error(err.message);
    },
  });

  const pollMutation = trpc.cloudSignature.pollA3.useMutation({
    onSuccess: (data) => {
      if (data.status === "assinado") {
        finish(data.validationCode || "");
      } else if (data.status === "erro" || data.status === "expirado") {
        clearPoll();
        setStatus("erro");
        setErrorMsg(data.error || "Tempo esgotado. Tente novamente.");
        toast.error(data.error || "Assinatura expirada.");
      }
    },
  });

  const clearPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const finish = (code: string) => {
    clearPoll();
    popupRef.current?.close();
    setValidationCode(code);
    setStatus("assinado");
    toast.success("Documento assinado digitalmente com certificado A3 ICP-Brasil!");
    onSigned?.(code);
  };

  // Inicia polling quando sessionId está disponível
  useEffect(() => {
    if (!sessionId || status !== "aguardando_qr") return;

    pollRef.current = setInterval(() => {
      pollMutation.mutate({ sessionId });
    }, 3000);

    return clearPoll;
  }, [sessionId, status]);

  // Escuta postMessage do popup/callback
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SIGNATURE_DONE") {
        finish(event.data.validationCode || "");
      } else if (event.data?.type === "SIGNATURE_ERROR") {
        clearPoll();
        setStatus("erro");
        setErrorMsg(event.data.error || "Erro na assinatura.");
        toast.error(event.data.error || "Erro ao assinar documento.");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleClick = async () => {
    if (status === "gerando" || status === "aguardando_qr") return;
    setStatus("gerando");
    setErrorMsg("");
    setQrDataUrl("");
    setSessionId(null);

    try {
      const hashBase64 = await sha256Base64(documentContent);
      qrMutation.mutate({
        documentType,
        documentId,
        documentAlias,
        documentHashBase64: hashBase64,
      });
    } catch {
      setStatus("erro");
      setErrorMsg("Erro ao calcular hash do documento.");
    }
  };

  const handleCancel = () => {
    clearPoll();
    popupRef.current?.close();
    setStatus("idle");
    setSessionId(null);
    setQrDataUrl("");
  };

  const handleRetry = () => {
    setStatus("idle");
    setErrorMsg("");
    setQrDataUrl("");
    setSessionId(null);
  };

  // ─── Estado: já assinado ──────────────────────────────────────────────────
  if (status === "assinado") {
    return (
      <div className={`flex flex-col gap-1 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 ${className}`}>
        <div className="flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 size={15} className="shrink-0" />
          Assinado digitalmente — ICP-Brasil A3
        </div>
        {validationCode && (
          <p className="text-[11px] text-green-600 font-mono">
            Código: {validationCode}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Botão principal */}
      <button
        type="button"
        disabled={disabled || status === "gerando" || status === "aguardando_qr"}
        onClick={handleClick}
        className="flex items-center gap-2 rounded-lg border border-[#C9A55B]/40 bg-[#C9A55B]/10 px-4 py-2 text-sm font-medium text-[#8A6526] transition-all hover:bg-[#C9A55B]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "gerando" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <QrCode size={16} />
        )}
        {status === "gerando"
          ? "Gerando QR code…"
          : status === "aguardando_qr"
          ? "Aguardando assinatura…"
          : "Assinar com A3 (VIDaaS / BirdID)"}
      </button>

      {/* Modal QR Code */}
      {status === "aguardando_qr" && qrDataUrl && (
        <div className="rounded-xl border border-[#C9A55B]/30 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-[#C9A55B]" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Escaneie com o app {providerName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  QR expira em 5 minutos
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-muted-foreground hover:text-red-500 transition-colors"
              title="Cancelar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex justify-center mb-3">
            <img
              src={qrDataUrl}
              alt="QR Code para assinatura A3"
              className="w-48 h-48 border border-border/30 rounded-lg"
            />
          </div>

          <div className="text-center space-y-1.5">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Aguardando confirmação no app…
            </div>
            <ol className="text-[11px] text-left text-muted-foreground space-y-1 mt-2 bg-muted/30 rounded-lg p-2.5">
              <li>1. Abra o app <strong>{providerName}</strong> no celular</li>
              <li>2. Toque em <strong>Escanear QR</strong> ou use a câmera</li>
              <li>3. Confirme com sua <strong>biometria ou PIN</strong> do certificado</li>
              <li>4. O documento será assinado automaticamente</li>
            </ol>
          </div>
        </div>
      )}

      {/* Erro */}
      {status === "erro" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <XCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="text-xs text-red-600">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
