import type { ComponentProps } from "react";
import { Copy, Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { SYSTEM_ANAMNESIS_TEMPLATES, serializeAnamnesisQuestions } from "@/lib/anamnesis";

type SendAnamnesisButtonProps = {
  patientId: number;
  patientName?: string | null;
  label?: string;
  disabled?: boolean;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  onLinkCreated?: () => void;
};

export function SendAnamnesisButton({
  patientId,
  patientName,
  label = "Enviar anamnese",
  disabled,
  className,
  variant,
  size,
  onLinkCreated,
}: SendAnamnesisButtonProps) {
  const createLinkMutation = trpc.anamnesisShare.createLink.useMutation();
  const sendWhatsappMutation = trpc.whatsapp.sendAnamnesisRequest.useMutation({
    onSuccess: (result) => {
      toast.success(`Pedido de anamnese enviado para ${result.patientName}.`);
      onLinkCreated?.();
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível enviar a anamnese pelo WhatsApp.");
    },
  });

  const isPending = createLinkMutation.isPending || sendWhatsappMutation.isPending;

  const copyLink = async () => {
    const template = SYSTEM_ANAMNESIS_TEMPLATES[0];
    try {
      const result = await createLinkMutation.mutateAsync({
        patientId,
        title: patientName ? `Anamnese de ${patientName}` : template.name,
        templateName: template.name,
        anamnesisDate: new Date().toISOString().slice(0, 10),
        expiresInDays: 14,
        questions: serializeAnamnesisQuestions(template.questions),
      });

      await navigator.clipboard.writeText(result.shareUrl);
      toast.success("Link da anamnese copiado para enviar manualmente.");
      onLinkCreated?.();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar ou copiar o link da anamnese.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={disabled || isPending} className={className}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={disabled || sendWhatsappMutation.isPending}
          onSelect={(event) => {
            event.preventDefault();
            sendWhatsappMutation.mutate({ patientId, expiresInDays: 14 });
          }}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Enviar pelo WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || createLinkMutation.isPending}
          onSelect={(event) => {
            event.preventDefault();
            void copyLink();
          }}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copiar link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
