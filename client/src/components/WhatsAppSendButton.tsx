/**
 * WhatsAppSendButton — Botão reutilizável para enviar documentos via WhatsApp
 * Suporta: prescrição, pedido de exames, orçamento, atestado, NFS-e
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MessageCircle, Send, Loader2 } from "lucide-react";

export type WhatsAppDocumentType =
  | "prescricao"
  | "exame"
  | "orcamento"
  | "atestado"
  | "nfse";

interface WhatsAppSendButtonProps {
  documentType: WhatsAppDocumentType;
  documentId: number;
  /** Telefone padrão do paciente (preenchido automaticamente se informado) */
  defaultPhone?: string | null;
  /** Label personalizado (padrão: "Enviar via WhatsApp") */
  label?: string;
  /** Variante do botão */
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function WhatsAppSendButton({
  documentType,
  documentId,
  defaultPhone,
  label = "Enviar via WhatsApp",
  variant = "outline",
  size = "sm",
  className,
}: WhatsAppSendButtonProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");

  const sendMutation = trpc.whatsapp.sendDocumentToPatient.useMutation({
    onSuccess: (data) => {
      toast.success(`Documento enviado para ${formatPhone(data.phone)}!`);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Erro ao enviar: ${err.message}`);
    },
  });

  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, "");
    if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
    if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
    return raw;
  }

  const docLabels: Record<WhatsAppDocumentType, string> = {
    prescricao: "Prescrição Médica",
    exame: "Pedido de Exames",
    orcamento: "Orçamento",
    atestado: "Atestado",
    nfse: "Nota Fiscal (NFS-e)",
  };

  function handleSend() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Informe um número de telefone válido (com DDD).");
      return;
    }
    sendMutation.mutate({ documentType, documentId, phone: cleanPhone });
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`gap-2 text-green-700 hover:bg-green-50 hover:text-green-800 ${variant === "outline" ? "border-green-300" : ""} ${className ?? ""}`}
        title={label || "Enviar via WhatsApp"}
        onClick={() => {
          setPhone(defaultPhone ?? "");
          setOpen(true);
        }}
      >
        <MessageCircle className="h-4 w-4" />
        {label && <span>{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              Enviar via WhatsApp
            </DialogTitle>
            <DialogDescription>
              O arquivo <strong>{docLabels[documentType]}</strong> será gerado em PDF e
              enviado diretamente para o WhatsApp do paciente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="wa-phone">Número de WhatsApp</Label>
              <Input
                id="wa-phone"
                placeholder="(19) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <p className="text-xs text-muted-foreground">
                Com DDD. O código do país (+55) é adicionado automaticamente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sendMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
