import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { patientDisplayName } from "@/lib/patientDisplay";
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { exportPrescriptionPdf } from "@/components/PdfExporter";
import { WhatsAppSendButton } from "@/components/WhatsAppSendButton";
import { SignatureCertillionButton } from "@/components/SignatureCertillionButton";
import { toast } from "sonner";
import { CheckCircle, Clock, FileText, Loader2, Pill, Plus, Printer, Send, XCircle, Trash2 } from "lucide-react";

const PRESCRIPTION_TYPES = [
  { value: "simples", label: "Receituário simples (1 via)", color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  { value: "antimicrobiano", label: "Antimicrobiano (2 vias)", color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  { value: "controle_especial", label: "Controle especial C1 (2 vias)", color: "bg-[#8A6526]/10 text-[#8A6526]" },
] as const;

const D4SIGN_STATUS = {
  pendente: { label: "Pendente", icon: Clock, color: "bg-gray-100 text-gray-700" },
  enviado: { label: "Enviado para assinatura", icon: Send, color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  assinado: { label: "Assinado", icon: CheckCircle, color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  cancelado: { label: "Cancelado", icon: XCircle, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
} as const;

type PrescriptionForm = {
  patientId: string;
  type: (typeof PRESCRIPTION_TYPES)[number]["value"];
  observations: string;
  content: string;
};

const defaultForm: PrescriptionForm = {
  patientId: "",
  type: "simples",
  observations: "",
  content: "",
};

export default function Prescricoes() {
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? "user";
  const canCreate = ["admin", "medico"].includes(userRole);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState<PrescriptionForm>(defaultForm);
  const [filterPatientId, setFilterPatientId] = useState<string>("all");
  const [printAfterSave, setPrintAfterSave] = useState(false);

  const utils = trpc.useUtils();
  const { data: patients } = trpc.patients.list.useQuery({ limit: 5000 });
  const { data: templates } = trpc.prescriptions.listTemplates.useQuery();
  const selectedPatientId = filterPatientId === "all" ? 0 : Number(filterPatientId);
  const { data: allPrescriptions, refetch: refetchAll } = trpc.prescriptions.getByPatient.useQuery({ patientId: selectedPatientId });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedPatientId = params.get("patientId");
    const shouldCreate = params.get("create") === "1";

    if (linkedPatientId && /^\d+$/.test(linkedPatientId)) {
      setFilterPatientId(linkedPatientId);
      setForm((current) => ({ ...current, patientId: linkedPatientId }));
      if (shouldCreate) {
        setShowCreate(true);
      }
    }
  }, []);

  const createMutation = trpc.prescriptions.create.useMutation({
    onSuccess: async () => {
      toast.success("Prescrição salva com sucesso.");
      setShowCreate(false);
      setShowTemplates(false);
      setForm(defaultForm);
      setPrintAfterSave(false);
      await refetchAll();
      await utils.prescriptions.getByPatient.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Não foi possível salvar a prescrição."),
  });

  const saveTemplateMutation = trpc.prescriptions.createTemplate.useMutation({
    onSuccess: () => {
      toast.success("Modelo salvo com sucesso.");
      setShowTemplates(false);
      void utils.prescriptions.listTemplates.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Não foi possível salvar o modelo."),
  });

  const deleteTemplateMutation = trpc.prescriptions.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success("Modelo excluído.");
      void utils.prescriptions.listTemplates.invalidate();
    },
    onError: (err: any) => toast.error(err.message || "Não foi possível excluir o modelo."),
  });

  const sendToSignMutation = trpc.signatures.sendForSignature.useMutation({
    onSuccess: () => {
      toast.success("Documento enviado para o fluxo de assinatura.");
      void refetchAll();
    },
    onError: (err: any) => toast.error(err.message || "Não foi possível enviar para assinatura."),
  });

  const currentPatient = useMemo(
    () => patients?.find((patient) => String(patient.id) === form.patientId) ?? null,
    [form.patientId, patients],
  );

  const filteredTemplates = (templates ?? []).filter((template: any) => !template.type || template.type === form.type);

  const handleSave = async (shouldPrint: boolean) => {
    if (!form.patientId) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!form.content.trim()) {
      toast.error("O conteúdo da prescrição é obrigatório.");
      return;
    }

    setPrintAfterSave(shouldPrint);

    try {
      await createMutation.mutateAsync({
        patientId: Number(form.patientId),
        type: form.type,
        content: form.content,
        observations: form.observations.trim() || undefined,
      });

      if (shouldPrint && currentPatient) {
        await exportPrescriptionPdf(currentPatient.fullName, {
          type: form.type,
          content: form.content,
          observations: form.observations,
        });
      }
    } catch {
      setPrintAfterSave(false);
    }
  };

  const handlePrintExisting = async (prescription: any) => {
    const patient = patients?.find((item) => item.id === prescription.patientId);
    await exportPrescriptionPdf(patient?.fullName || `Paciente ${prescription.patientId}`, prescription);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prescrições</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre, imprima e envie receituários com layout clínico.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterPatientId} onValueChange={setFilterPatientId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Filtrar por paciente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pacientes</SelectItem>
              {(patients ?? []).map((patient) => (
                <SelectItem key={patient.id} value={String(patient.id)}>
                  {patientDisplayName(patient)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova prescrição
            </Button>
          ) : null}
        </div>
      </div>

      {!allPrescriptions || allPrescriptions.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Pill className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-base font-medium text-muted-foreground">Nenhuma prescrição encontrada</p>
            <p className="mt-1 text-sm text-muted-foreground/70">Selecione um paciente ou cadastre uma nova prescrição.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allPrescriptions.map((rx: any) => {
            const typeInfo = PRESCRIPTION_TYPES.find((item) => item.value === rx.type);
            const statusKey = (rx.d4signStatus ?? "pendente") as keyof typeof D4SIGN_STATUS;
            const d4Status = D4SIGN_STATUS[statusKey] ?? D4SIGN_STATUS.pendente;
            const StatusIcon = d4Status.icon;
            const patient = patients?.find((item) => item.id === rx.patientId);

            return (
              <Card key={rx.id} className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`text-xs ${typeInfo?.color ?? "bg-gray-100 text-gray-700"}`}>
                          {typeInfo?.label ?? rx.type}
                        </Badge>
                        <Badge className={`text-xs ${d4Status.color}`}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {d4Status.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{patient?.fullName ?? `Paciente #${rx.patientId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(rx.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handlePrintExisting(rx)}>
                        <Printer className="mr-1 h-3 w-3" />
                        Imprimir / PDF
                      </Button>
                      <WhatsAppSendButton
                        documentType="prescricao"
                        documentId={rx.id}
                        defaultPhone={patient?.phone ?? ""}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#C9A55B]/25 text-[#8A6526] hover:bg-[#C9A55B]/5"
                        onClick={() => sendToSignMutation.mutate({ documentId: rx.id, documentType: "prescription" })}
                        disabled={sendToSignMutation.isPending}
                        title="Enviar para assinatura D4Sign"
                      >
                        <Send className="mr-1 h-3 w-3" />
                        D4Sign
                      </Button>
                      {(user as any)?.cloudSignatureCpf && (
                        <SignatureCertillionButton
                          documentType="prescricao"
                          documentId={rx.id}
                          documentAlias={`Prescricao #${rx.id} — ${patient?.fullName ?? "Paciente"}`}
                          documentContent={rx.content || ""}
                          signerCpf={(user as any).cloudSignatureCpf}
                          onSigned={() => { void refetchAll(); }}
                        />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div
                    className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: rx.content || "<p>Sem conteúdo registrado.</p>" }}
                  />
                  {rx.observations ? <p className="text-xs italic text-muted-foreground">{rx.observations}</p> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] w-[min(92vw,56rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              Nova prescrição médica
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Label>Paciente *</Label>
                <Select value={form.patientId} onValueChange={(value) => setForm((current) => ({ ...current, patientId: value }))}>
                  <SelectTrigger className="mt-1 w-full min-w-0">
                    <SelectValue placeholder="Selecione o paciente" className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {(patients ?? []).map((patient) => (
                      <SelectItem key={patient.id} value={String(patient.id)}>
                        {patientDisplayName(patient)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0">
                <Label>Tipo de receituario</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((current) => ({ ...current, type: value as PrescriptionForm["type"] }))}
                >
                  <SelectTrigger className="mt-1 w-full min-w-0">
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESCRIPTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Conteúdo da prescrição *</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplates((current) => !current)}>
                    Modelos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!form.content.trim()) {
                        toast.error("Digite o conteúdo antes de salvar como modelo.");
                        return;
                      }
                      const name = window.prompt("Nome do modelo:");
                      if (name?.trim()) {
                        saveTemplateMutation.mutate({ name: name.trim(), content: form.content, type: form.type });
                      }
                    }}
                  >
                    Salvar como modelo
                  </Button>
                </div>
              </div>

              {showTemplates ? (
                <div className="mb-3 rounded-lg border bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Escolha um modelo:</p>
                  <div className="flex flex-wrap gap-2">
                    {filteredTemplates.length > 0 ? (
                      filteredTemplates.map((template: any) => (
                        <div key={template.id} className="inline-flex items-center gap-1 rounded-md border bg-background">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-r-none border-0"
                            onClick={() => {
                              setForm((current) => ({ ...current, content: template.content }));
                              setShowTemplates(false);
                            }}
                          >
                            {template.name}
                          </Button>
                          <button
                            type="button"
                            title="Excluir modelo"
                            disabled={deleteTemplateMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Excluir o modelo "${template.name}"? Esta ação não poderá ser desfeita.`)) {
                                deleteTemplateMutation.mutate({ id: Number(template.id) });
                              }
                            }}
                            className="px-2 py-1 text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhum modelo disponível para este tipo.</p>
                    )}
                  </div>
                </div>
              ) : null}

              <RichTextEditor
                value={form.content}
                onChange={(content) => setForm((current) => ({ ...current, content }))}
                placeholder="Digite a prescrição aqui..."
                minHeight="260px"
              />
            </div>

            <div>
              <Label>Observações internas</Label>
              <Textarea
                value={form.observations}
                onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
                placeholder="Observações adicionais..."
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleSave(true)} disabled={createMutation.isPending}>
                <Printer className="mr-2 h-4 w-4" />
                Salvar e imprimir
              </Button>
              <Button onClick={() => void handleSave(false)} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Salvar prescrição
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
