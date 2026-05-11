import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignatureCertillionButton, type CertillionDocType } from "@/components/SignatureCertillionButton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Download, Loader2, Printer, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type ClinicalDocumentActionType =
  | "prescricao"
  | "exame"
  | "atestado"
  | "declaracao"
  | "laudo"
  | "solicitacao_exames"
  | "orcamento";

type SignatureMethod = "a1_pf" | "d4sign" | "certisign_vidaas_birdid";

interface ClinicalDocumentSignatureActionsProps {
  documentType: ClinicalDocumentActionType;
  documentId?: number | null;
  documentTitle: string;
  documentContent: string;
  patientName?: string | null;
  patientPhone?: string | null;
  signerName?: string | null;
  signerCpf?: string | null;
  isSigned?: boolean;
  signedAt?: string | null;
  signatureProvider?: string | null;
  signatureValidationCode?: string | null;
  onPrint?: () => void | Promise<void>;
  onSigned?: () => void | Promise<void>;
  className?: string;
}

const SIGNATURE_METHOD_LABELS: Record<SignatureMethod, string> = {
  a1_pf: "Certificado A1 PF",
  d4sign: "D4Sign",
  certisign_vidaas_birdid: "CertiSign (VIDaaS/BirdID)",
};

function mapToD4SignType(type: ClinicalDocumentActionType) {
  if (type === "prescricao") return "prescription";
  if (type === "exame") return "exam_request";
  return "patient_document";
}

function mapToCertillionType(type: ClinicalDocumentActionType): CertillionDocType {
  if (type === "prescricao") return "prescricao";
  if (type === "exame" || type === "solicitacao_exames") return "exame";
  if (type === "orcamento") return "outro";
  return "atestado";
}

function mapToA1Type(type: ClinicalDocumentActionType) {
  if (type === "prescricao") return "prescricao";
  if (type === "exame" || type === "solicitacao_exames") return "exame";
  if (type === "orcamento") return "orcamento";
  return "documento_clinico";
}

function mapToWhatsAppType(type: ClinicalDocumentActionType) {
  if (type === "prescricao") return "prescricao" as const;
  if (type === "exame" || type === "solicitacao_exames") return "exame" as const;
  if (type === "orcamento") return "orcamento" as const;
  return "atestado" as const;
}

function openPdfBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function resolveSignatureProviderLabel(provider?: string | null) {
  const normalized = String(provider ?? "").toLowerCase();
  if (normalized.includes("a1")) return "A1 PF ICP-Brasil";
  if (normalized.includes("certillion") || normalized.includes("vidaas") || normalized.includes("birdid")) {
    return "CertiSign (VIDaaS/BirdID)";
  }
  if (normalized.includes("d4")) return "D4Sign";
  return provider || "Assinatura registrada";
}

export function ClinicalDocumentSignatureActions({
  documentType,
  documentId,
  documentTitle,
  documentContent,
  patientName,
  patientPhone,
  signerName,
  signerCpf,
  isSigned,
  signedAt,
  signatureProvider,
  signatureValidationCode,
  onPrint,
  onSigned,
  className,
}: ClinicalDocumentSignatureActionsProps) {
  const [method, setMethod] = useState<SignatureMethod>("a1_pf");
  const [locallySigned, setLocallySigned] = useState(false);
  const [lastSignedPdfBase64, setLastSignedPdfBase64] = useState("");

  const utils = trpc.useUtils();
  const { data: a1Status } = trpc.a1Certificate.getStatus.useQuery();

  const signed = Boolean(isSigned || locallySigned || signatureValidationCode);
  const canUseSavedDocument = Number(documentId ?? 0) > 0;

  const signD4Mutation = trpc.signatures.sendForSignature.useMutation({
    onSuccess: async () => {
      toast.success("Documento enviado para assinatura pela D4Sign.");
      await onSigned?.();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar para D4Sign."),
  });

  const signA1Mutation = trpc.a1Certificate.signClinicalDocument.useMutation({
    onSuccess: async (result) => {
      setLocallySigned(true);
      setLastSignedPdfBase64(result.signedPdfBase64 || "");
      toast.success(result.sentToWhatsApp ? "Documento assinado e enviado por WhatsApp." : "Documento assinado com certificado A1 PF.");
      await onSigned?.();
    },
    onError: (error) => toast.error(error.message || "Não foi possível assinar com certificado A1 PF."),
  });

  const sendWhatsAppMutation = trpc.whatsapp.sendDocumentToPatient.useMutation({
    onSuccess: () => toast.success("Documento enviado por WhatsApp."),
    onError: (error) => toast.error(error.message || "Não foi possível enviar por WhatsApp."),
  });

  const printFileName = useMemo(() => {
    const base = `${documentTitle || "documento"}-${patientName || "paciente"}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    return `${base || "documento-assinado"}.pdf`;
  }, [documentTitle, patientName]);

  const ensureSavedDocument = () => {
    if (canUseSavedDocument) return true;
    toast.error("Salve o documento antes de assinar.");
    return false;
  };

  const handleA1Sign = async (sendToWhatsApp: boolean, openAfterSign = false) => {
    if (!ensureSavedDocument()) return;
    if (!a1Status?.configured) {
      toast.error("Certificado A1 PF não configurado. Faça o upload em Perfil > Certificado Digital.");
      return;
    }
    const result = await signA1Mutation.mutateAsync({
      documentType: mapToA1Type(documentType),
      documentId: Number(documentId),
      sendToWhatsApp,
      phone: patientPhone || undefined,
    });
    if (openAfterSign && result?.signedPdfBase64) {
      openPdfBase64(result.signedPdfBase64, result.filename || printFileName);
    }
  };

  const handleD4Sign = async (sendAfterSignature: boolean) => {
    if (!ensureSavedDocument()) return;
    await signD4Mutation.mutateAsync({
      documentType: mapToD4SignType(documentType),
      documentId: Number(documentId),
    });
    if (sendAfterSignature) {
      toast.info("A D4Sign é assíncrona. Envie ao paciente depois que o retorno de assinatura aparecer como concluído.");
    }
  };

  const handleCertillionSigned = async (sendToWhatsApp: boolean, openAfterSign = false) => {
    setLocallySigned(true);
    await onSigned?.();
    if (sendToWhatsApp && canUseSavedDocument) {
      await sendWhatsAppMutation.mutateAsync({
        documentType: mapToWhatsAppType(documentType),
        documentId: Number(documentId),
        phone: patientPhone || undefined,
      });
    }
    if (openAfterSign) {
      await onPrint?.();
    }
  };

  const handleSignAndSend = () => {
    if (method === "a1_pf") {
      void handleA1Sign(true);
      return;
    }
    if (method === "d4sign") {
      void handleD4Sign(true);
    }
  };

  const handleSignAndDownload = () => {
    if (method === "a1_pf") {
      void handleA1Sign(false, true);
      return;
    }
    if (method === "d4sign") {
      void handleD4Sign(false);
    }
  };

  const handlePrint = async () => {
    if (!signed) {
      toast.error("Assine o documento antes de imprimir.");
      return;
    }
    if (lastSignedPdfBase64) {
      openPdfBase64(lastSignedPdfBase64, printFileName);
      return;
    }
    await onPrint?.();
  };

  const sharedButtonClass =
    "gap-2 border-[#C9A55B]/35 bg-background text-foreground hover:bg-[#C9A55B]/10 max-sm:w-full";
  const certillionButtonClass =
    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#C9A55B]/35 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-[#C9A55B]/10 disabled:pointer-events-none disabled:opacity-50 max-sm:w-full";

  return (
    <div className={cn("flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 max-sm:flex-col max-sm:items-stretch", className)}>
      <div className="min-w-[220px] space-y-1 max-sm:min-w-0">
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assinatura digital</Label>
        <Select value={method} onValueChange={(value) => setMethod(value as SignatureMethod)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a1_pf">Certificado A1 PF</SelectItem>
            <SelectItem value="d4sign">D4Sign</SelectItem>
            <SelectItem value="certisign_vidaas_birdid">CertiSign (VIDaaS/BirdID)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {method === "certisign_vidaas_birdid" ? (
        signerCpf ? (
          <>
            <SignatureCertillionButton
              documentType={mapToCertillionType(documentType)}
              documentId={Number(documentId || 0)}
              documentAlias={`${documentTitle || "Documento"} - ${patientName || "Paciente"}`}
              documentContent={documentContent || documentTitle || "Documento clínico"}
              signerCpf={signerCpf}
              buttonLabel="Assinar e baixar"
              buttonClassName={certillionButtonClass}
              disabled={!canUseSavedDocument || sendWhatsAppMutation.isPending}
              onSigned={() => void handleCertillionSigned(false, true)}
            />
            <SignatureCertillionButton
              documentType={mapToCertillionType(documentType)}
              documentId={Number(documentId || 0)}
              documentAlias={`${documentTitle || "Documento"} - ${patientName || "Paciente"}`}
              documentContent={documentContent || documentTitle || "Documento clínico"}
              signerCpf={signerCpf}
              buttonLabel="Assinar e enviar"
              buttonClassName={certillionButtonClass}
              disabled={!canUseSavedDocument || sendWhatsAppMutation.isPending}
              onSigned={() => void handleCertillionSigned(true)}
            />
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={sharedButtonClass}
            onClick={() => toast.error("Cadastre o CPF do certificado em Perfil > Assinatura Digital.")}
          >
            <ShieldCheck className="h-4 w-4" />
            Assinar e baixar
          </Button>
        )
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            className={sharedButtonClass}
            onClick={handleSignAndDownload}
            disabled={!canUseSavedDocument || signA1Mutation.isPending || signD4Mutation.isPending}
            title={`Assinar com ${SIGNATURE_METHOD_LABELS[method]} e abrir/baixar`}
          >
            {signA1Mutation.isPending || signD4Mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Assinar e baixar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={sharedButtonClass}
            onClick={handleSignAndSend}
            disabled={!canUseSavedDocument || signA1Mutation.isPending || signD4Mutation.isPending}
            title={`Assinar com ${SIGNATURE_METHOD_LABELS[method]} e enviar`}
          >
            {signA1Mutation.isPending || signD4Mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Assinar e enviar
          </Button>
        </>
      )}

      {signed ? (
        <Button type="button" variant="outline" className={sharedButtonClass} onClick={() => void handlePrint()}>
          {lastSignedPdfBase64 ? <Download className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
          Imprimir
        </Button>
      ) : null}

      {signed ? (
        <div className="min-w-[180px] text-[11px] leading-snug text-muted-foreground">
          <p className="font-medium text-emerald-700">Assinado</p>
          <p>{resolveSignatureProviderLabel(signatureProvider || (locallySigned ? method : ""))}</p>
          {signedAt ? <p>{new Date(signedAt).toLocaleString("pt-BR")}</p> : null}
          {signatureValidationCode ? <p className="font-mono">Validação: {signatureValidationCode}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
