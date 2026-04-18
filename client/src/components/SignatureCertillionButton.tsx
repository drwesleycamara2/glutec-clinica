/**
 * Botão de Assinatura via Certillion (agregador VIDAAS / BirdID / CERTILLION_SIGNER)
 *
 * Fluxo:
 *  1. Calcula SHA-256 do conteúdo e envia ao backend (trpc.certillion.initiate)
 *  2. Backend registra sessão com stateNonce + codeVerifier e retorna authorizeUrl + QR
 *  3. Frontend abre popup apontando para authorizeUrl e também exibe QR
 *  4. Usuário autentica no PSC (app VIDAAS/BirdID ou login no navegador)
 *  5. PSC redireciona para /api/certillion/callback?code=...&state=...
 *  6. Callback HTTP troca o code por token, chama /oauth/signature e salva CMS
 *  7. Callback usa window.opener.postMessage para notificar sucesso/erro
 *  8. Polling em trpc.certillion.getSessionStatus a cada 3s como fallback
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Loader2,
  QrCode,
  Smartphone,
  X,
  XCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

export type CertillionDocType = "evolucao" | "atestado" | "prescricao" | "exame" | "outro";
export type CertillionPsc =
  | "VIDAAS" | "BIRDID" | "CERTILLION_SIGNER" | "SERPRO" | "SAFEID" | "SOLUTI";

interface Props {
  documentType: CertillionDocType;
  documentId: number;
  documentAlias: string;
  documentContent: string;
  /** CPF do signatário (só dígitos ou formatado) */
  signerCpf: string;
  /** PSC opcional — se omitido usa o default configurado na clínica */
  psc?: CertillionPsc;
  onSigned?: (validationCode: string) => void;
  disabled?: boolean;
  className?: string;
}

type Status = "idle" | "gerando" | "aguardando" | "assinado" | "erro";

async function sha256Base64(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function SignatureCertillionButton(props: Props) {
  const {
    documentType, documentId, documentAlias, documentContent,
    signerCpf, psc, onSigned, disabled, className,
  } = props;

  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [pscLabel, setPscLabel] = useState<string>(psc || "VIDAAS");
  const [validationCode, setValidationCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  const initiate = trpc.certillion.initiate.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setQrDataUrl(data.qrDataUrl);
      setAuthorizeUrl(data.authorizeUrl);
      setPscLabel(data.psc);
      setStatus("aguardando");
      // Abre popup direto para a URL do PSC (fluxo web) — se bloqueado, usuario usa QR
      const popup = window.open(data.authorizeUrl, "certillion_signer", "width=560,height=720,left=200,top=120");
      if (popup) popupRef.current = popup;
    },
    onError: (err) => {
      setStatus("erro");
      setErrorMsg(err.message);
      toast.error(err.message);
    },
  });

  // typed-safe no useUtils: getSessionStatus é query, usamos fetch manual
  const utils = trpc.useUtils();

  const clearPoll = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };

  const finish = (code: string) => {
    clearPoll();
    popupRef.current?.close();
    setValidationCode(code);
    setStatus("assinado");
    toast.success("Documento assinado via Certillion!");
    onSigned?.(code);
  };

  useEffect(() => {
    if (!sessionId || status !== "aguardando") return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await utils.certillion.getSessionStatus.fetch({ sessionId });
        if (!s) return;
        if (s.status === "assinado") finish("");
        else if (s.status === "erro" || s.status === "expirado") {
          clearPoll();
          setStatus("erro");
          setErrorMsg(s.errorMessage || "Assinatura expirada.");
          toast.error(s.errorMessage || "Erro na assinatura.");
        }
      } catch {}
    }, 3000);
    return clearPoll;
  }, [sessionId, status, utils]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "CERTILLION_DONE") finish(event.data.validationCode || "");
      else if (event.data?.type === "CERTILLION_ERROR") {
        clearPoll();
        setStatus("erro");
        setErrorMsg(event.data.error || "Erro na assinatura.");
        toast.error(event.data.error || "Erro ao assinar.");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleClick = async () => {
    if (status === "gerando" || status === "aguardando") return;
    setStatus("gerando"); setErrorMsg(""); setQrDataUrl(""); setSessionId(null);
    try {
      const hashBase64 = await sha256Base64(documentContent);
      initiate.mutate({
        documentType, documentId, documentAlias,
        documentHashBase64: hashBase64,
        signerCpf: signerCpf.replace(/\D/g, ""),
        psc,
      });
    } catch {
      setStatus("erro");
      setErrorMsg("Erro ao calcular hash do documento.");
    }
  };

  const handleCancel = () => {
    clearPoll();
    popupRef.current?.close();
    setStatus("idle"); setSessionId(null); setQrDataUrl("");
  };
  const handleRetry = () => { setStatus("idle"); setErrorMsg(""); setQrDataUrl(""); setSessionId(null); };

  if (status === "assinado") {
    return (
      <div className={`flex flex-col gap-1 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 ${className ?? ""}`}>
        <div className="flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 size={15} /> Assinado via Certillion ({pscLabel}) — ICP-Brasil
        </div>
        {validationCode && (
          <p className="text-[11px] text-green-600 font-mono">Código: {validationCode}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled || status === "gerando" || status === "aguardando"}
        onClick={handleClick}
        className="flex items-center gap-2 rounded-lg border border-[#C9A55B]/40 bg-[#C9A55B]/10 px-4 py-2 text-sm font-medium text-[#8A6526] transition-all hover:bg-[#C9A55B]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "gerando"
          ? <Loader2 size={16} className="animate-spin" />
          : <QrCode size={16} />}
        {status === "gerando"
          ? "Preparando assinatura…"
          : status === "aguardando"
          ? `Aguardando ${pscLabel}…`
          : `Assinar via Certillion (${psc || "VIDAAS/BirdID"})`}
      </button>

      {status === "aguardando" && qrDataUrl && (
        <div className="rounded-xl border border-[#C9A55B]/30 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-[#C9A55B]" />
              <div>
                <p className="text-sm font-semibold">Autenticação {pscLabel}</p>
                <p className="text-[11px] text-muted-foreground">Janela pop-up aberta — ou use o QR</p>
              </div>
            </div>
            <button type="button" onClick={handleCancel} className="text-muted-foreground hover:text-red-500" title="Cancelar">
              <X size={18} />
            </button>
          </div>

          <div className="flex justify-center mb-3">
            <img src={qrDataUrl} alt="QR Certillion" className="w-48 h-48 border border-border/30 rounded-lg" />
          </div>

          <a
            href={authorizeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-[#8A6526] underline mb-2"
          >
            Reabrir janela de autenticação
          </a>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Aguardando confirmação…
          </div>
        </div>
      )}

      {status === "erro" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <XCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
          <p className="flex-1 text-xs text-red-600">{errorMsg}</p>
          <button type="button" onClick={handleRetry} className="shrink-0 text-xs flex items-center gap-1 hover:text-foreground">
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
