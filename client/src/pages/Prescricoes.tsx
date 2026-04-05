import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { toast } from "sonner";
import { Plus, FileText, Loader2, Pill, Send, CheckCircle, XCircle, Clock } from "lucide-react";

const PRESCRIPTION_TYPES = [
  { value: "simples", label: "Receituário Simples (1 via)", color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  { value: "antimicrobiano", label: "Antimicrobiano (2 vias)", color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  { value: "controle_especial", label: "Controle Especial (2 vias)", color: "bg-[#8A6526]/10 text-[#8A6526]" },
];

const D4SIGN_STATUS = {
  pendente: { label: "Pendente", icon: Clock, color: "bg-gray-100 text-gray-700" },
  enviado: { label: "Enviado p/ Assinatura", icon: Send, color: "bg-[#C9A55B]/10 text-[#8A6526]" },
  assinado: { label: "Assinado", icon: CheckCircle, color: "bg-[#C9A55B]/15 text-[#6B5B2A]" },
  cancelado: { label: "Cancelado", icon: XCircle, color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
};

const defaultForm = { patientId: "", type: "simples" as const, observations: "", content: "" };

export default function Prescricoes() {
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? "user";
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: patients } = trpc.patients.list.useQuery({ limit: 200 });
  const { data: templates } = trpc.prescriptions.listTemplates.useQuery();
  const [filterPatientId, setFilterPatientId] = useState<number | null>(null);
  
  const { data: allPrescriptions, refetch: refetchAll } = trpc.prescriptions.getByPatient.useQuery(
    { patientId: filterPatientId ?? 0 }
  );

  const createMutation = trpc.prescriptions.create.useMutation({
    onSuccess: () => { toast.success("Prescrição criada!"); setShowCreate(false); setForm(defaultForm); refetchAll(); },
    onError: (err: any) => toast.error(err.message),
  });

  const saveTemplateMutation = trpc.prescriptions.createTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo salvo!"); setShowTemplates(false); },
    onError: (err: any) => toast.error(err.message),
  });

  // D4Sign via signatures router
  const sendToSignMutation = trpc.signatures.sendForSignature.useMutation({
    onSuccess: () => { toast.success("Enviado para assinatura eletrônica!"); refetchAll(); },
    onError: (err: any) => toast.error(err.message),
  });

  const canCreate = ["admin", "medico"].includes(userRole);

  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...defaultMedItem }] });
  const removeItem = (idx: number) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prescrições</h1>
          <p className="text-sm text-muted-foreground mt-1">{allPrescriptions?.length ?? 0} prescrição(ões) recentes</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />Nova Prescrição
          </Button>
        )}
      </div>

      {!allPrescriptions || allPrescriptions.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Pill className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhuma prescrição encontrada</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{canCreate ? "Crie a primeira prescrição clicando em 'Nova Prescrição'." : "Nenhuma prescrição registrada."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allPrescriptions.map((rx) => {
            const typeInfo = PRESCRIPTION_TYPES.find((t) => t.value === rx.type);
            const statusKey = (rx.d4signStatus ?? "pendente") as keyof typeof D4SIGN_STATUS;
            const d4Status = D4SIGN_STATUS[statusKey] ?? D4SIGN_STATUS.pendente;
            const StatusIcon = d4Status.icon;
            const patient = patients?.find((p) => p.id === rx.patientId);
            const items = Array.isArray(rx.items) ? rx.items as any[] : [];

            return (
              <Card key={rx.id} className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs ${typeInfo?.color ?? "bg-gray-100 text-gray-700"}`}>{typeInfo?.label ?? rx.type}</Badge>
                        <Badge className={`text-xs ${d4Status.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />{d4Status.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium">{patient?.fullName ?? `Paciente #${rx.patientId}`}</p>
                      <p className="text-xs text-muted-foreground">{new Date(rx.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {rx.pdfUrl && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={rx.pdfUrl} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-3 w-3 mr-1" />PDF
                          </a>
                        </Button>
                      )}
                      {rx.d4signStatus === "pendente" && canCreate && (
                        <Button size="sm" variant="outline" className="text-[#8A6526] border-[#C9A55B]/25 hover:bg-[#C9A55B]/5"
                          onClick={() => toast.info("Configure as credenciais D4Sign para habilitar assinatura eletrônica.")}
                          disabled={sendToSignMutation.isPending}>
                          <Send className="h-3 w-3 mr-1" />Assinar
                        </Button>
                      )}
                      {rx.signedPdfUrl && (
                        <Button size="sm" variant="outline" className="text-[#6B5B2A] border-[#C9A55B]/25 hover:bg-[#C9A55B]/5" asChild>
                          <a href={rx.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                            <CheckCircle className="h-3 w-3 mr-1" />Assinado
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {items.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-muted/50 text-sm">
                          <p className="font-medium">{item.medication}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">{item.dosage} · {item.frequency} · {item.duration}</p>
                          {item.instructions && <p className="text-xs text-muted-foreground mt-0.5 italic">{item.instructions}</p>}
                        </div>
                      ))}
                    </div>
                    {rx.observations && <p className="text-xs text-muted-foreground mt-2 italic">{rx.observations}</p>}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal criar prescrição */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-primary" />Nova Prescrição Médica</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{patients?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.fullName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Receituário</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRESCRIPTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Conteúdo da Prescrição *</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplates(!showTemplates)}>Modelos</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    if (!form.content) return toast.error("Digite o conteúdo para salvar como modelo.");
                    const name = prompt("Nome do modelo:");
                    if (name) saveTemplateMutation.mutate({ name, content: form.content, type: form.type });
                  }}>Salvar como Modelo</Button>
                </div>
              </div>
              
              {showTemplates && (
                <div className="mb-3 p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Selecione um modelo:</p>
                  <div className="flex flex-wrap gap-2">
                    {templates?.filter(t => t.type === form.type).map((t) => (
                      <Button key={t.id} variant="secondary" size="sm" onClick={() => {
                        setForm({ ...form, content: t.content });
                        setShowTemplates(false);
                      }}>{t.name}</Button>
                    ))}
                    {templates?.filter(t => t.type === form.type).length === 0 && <p className="text-xs text-muted-foreground">Nenhum modelo para este tipo.</p>}
                  </div>
                </div>
              )}

              <RichTextEditor
                value={form.content}
                onChange={(content) => setForm({ ...form, content })}
                placeholder="Digite a prescrição aqui..."
                minHeight="250px"
              />
            </div>

            <div>
              <Label>Observações Internas</Label>
              <Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observações adicionais..." className="mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.patientId) return toast.error("Selecione o paciente.");
              if (!form.content) return toast.error("O conteúdo da prescrição é obrigatório.");
              createMutation.mutate({
                patientId: parseInt(form.patientId),
                type: form.type,
                content: form.content,
                observations: form.observations || undefined,
              });
            }} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar Prescrição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
