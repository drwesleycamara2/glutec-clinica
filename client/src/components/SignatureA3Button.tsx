/**
 * Botão de Assinatura Digital A3 em Nuvem (VIDaaS / BirdID)
 *
 * Fluxo:
 * 1. Calcula SHA-256 do conteúdo do documento
 * 2. Chama initiateA3 → provedor envia push para o app do médico
 * 3. Polling a cada 3s em pollA3 → aguarda aprovação no app
 * 4. Quando assinado: callback onSigned(validationCode)
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Smartphone, XCircle } from "lucide-react";

type DocumentType = "evolucao" | "atestado" | "prescricao" | "exame";
type Status = "idle" | "iniciando" | "pendente" | "assinado" | "erro";

interface Props {
  documentType: DocumentType;
  documentId: number;
  documentAlias: string;
  /** Conteúdo textual do documento — será hasheado no browser com SHA-256 */
  documentContent: string;
  /** Chamado ao concluir com sucesso */
  onSigned?: (validationCode: string) => void;
  disabled?: boolean;
  className?: string;
}

async function sha256Base64(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64;
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
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initiateMutation = trpc.cloudSignature.initiateA3.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setStatus("pendente");
      setMessage(data.message || "Aguardando confirmação no app…");
      toast.info(data.message || "Confirme a assinatura no app do seu celular.");
    },
    onError: (err) => {
      setStatus("erro");
      setMessage(err.message);
      toast.error(err.message);
    },
  });

  const pollMutation = trpc.cloudSignature.pollA3.useMutation({
    onSuccess: (data) => {
      if (data.status === "assinado") {
        clearInterval(pollRef.current!);
        setStatus("assinado");
        setMessage("Documento assinado com sucesso!");
        toast.success("Documento assinado digitalmente com certificado A3 ICP-Brasil.");
        onSigned?.(data.validationCode || "");
      } else if (data.status === "erro" || data.status === "expirado") {
        clearInterval(pollRef.current!);
        setStatus("erro");
        setMessage(data.error || "Tempo esgotado ou erro na assinatura.");
        toast.error(data.error || "Assinatura não confirmada. Tente novamente.");
      }
      // status "pendente" → continua polling
    },
    onError: () => {
      // Erros de rede não interrompem o polling
    },
  });

  // Inicia polling quando sessionId é definido
  useEffect(() => {
    if (!sessionId || status !== "pendente") return;

    pollRef.current = setInterval(() => {
      pollMutation.mutate({ sessionId });
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, status]);

  const handleClick = async () => {
    if (status === "pendente" || status === "iniciando") return;

    setStatus("iniciando");
    setMessage("Calculando hash do documento…");

    try {
      const hashBase64 = await sha256Base64(documentContent);
      initiateMutation.mutate({
        documentType,
        documentId,
        documentAlias,
        documentHashBase64: hashBase64,
      });
    } catch {
      setStatus("erro");
      setMessage("Erro ao calcular hash do documento.");
      toast.error("Erro ao preparar o documento para assinatura.");
    }
  };

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("idle");
    setSessionId(null);
    setMessage("");
  };

  if (status === "assinado") {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 ${className}`}>
        <ShieldCheck size={16} className="shrink-0" />
        <span className="font-medium">Assinado digitalmente (ICP-Brasil A3)</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        disabled={disabled || status === "iniciando" || status === "pendente"}
        onClick={handleClick}
        className="flex items-center gap-2 rounded-lg border border-[#C9A55B]/40 bg-[#C9A55B]/10 px-4 py-2 text-sm font-medium text-[#8A6526] transition-all hover:bg-[#C9A55B]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "iniciando" || status === "pendente" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ShieldCheck size={16} />
        )}
        {status === "pendente"
          ? "Aguardando app…"
          : status === "iniciando"
          ? "Iniciando…"
          : "Assinar com A3 (VIDaaS / BirdID)"}
      </button>

      {status === "pendente" && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <Smartphone size={20} className="mt-0.5 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-700">Confirme no app do celular</p>
            <p className="mt-0.5 text-xs text-blue-600">{message}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Abra o app VIDaaS ou BirdID, toque na notificação e confirme com sua biometria ou PIN do certificado A3.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 text-muted-foreground hover:text-red-500"
            title="Cancelar"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {status === "erro" && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <XCircle size={13} />
          {message}
        </p>
      )}
    </div>
  );
}
