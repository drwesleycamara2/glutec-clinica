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
import { toast } from "sonner";
import { Plus, FileText, Loader2, Pill, Send, CheckCircle, XCircle, Clock } from "lucide-react";

const PRESCRIPTION_TYPES = [
  { value: "simples", label: "Receituário Simples", color: "bg-blue-100 text-blue-800" },
  { value: "especial_azul", label: "Receituário Especial Azul", color: "bg-indigo-100 text-indigo-800" },
  { value: "especial_amarelo", label: "Receituário Especial Amarelo", color: "bg-yellow-100 text-yellow-800" },
  { value: "antimicrobiano", label: "Antimicrobiano", color: "bg-green-100 text-green-800" },
];

const D4SIGN_STATUS = {
  pendente: { label: "Pendente", icon: Clock, color: "bg-gray-100 text-gray-700" },
  enviado: { label: "Enviado p/ Assinatura", icon: Send, color: "bg-blue-100 text-blue-800" },
  assinado: { label: "Assinado", icon: CheckCircle, color: "bg-green-100 text-green-800" },
  cancelado: { label: "Cancelado", icon: XCircle, color: "bg-red-100 text-red-800" },
};

const defaultMedItem = { medication: "", dosage: "", frequency: "", duration: "", instructions: "" };
const defaultForm = { patientId: "", type: "simples" as const, observations: "", items: [{ ...defaultMedItem }] };

export default function Prescricoes() {
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? "user";
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const { data: patients } = trpc.patients.list.useQuery({ limit: 200 });
  const [filterPatientId, setFilterPatientId] = useState<number | null>(null);
  const { data: patientPrescriptions } = trpc.prescriptions.getByPatient.useQuery(
    { patientId: filterPatientId ?? 0 },
    { enabled: !!filterPatientId }
  );
  // Use all patients' prescriptions by querying a known patient list
  const { data: allPrescriptions, refetch: refetchAll } = trpc.prescriptions.getByPatient.useQuery(
    { patientId: 0 },
    { enabled: false }
  );

  const createMutation = trpc.prescriptions.create.useMutation({
    onSuccess: () => { toast.success("Prescrição criada!"); setShowCreate(false); setForm(defaultForm); refetchAll(); },
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
                        <Button size="sm" variant="outline" className="text-blue-700 border-blue-200 hover:bg-blue-50"
                          onClick={() => toast.info("Configure as credenciais D4Sign para habilitar assinatura eletrônica.")}
                          disabled={sendToSignMutation.isPending}>
                          <Send className="h-3 w-3 mr-1" />Assinar
                        </Button>
                      )}
                      {rx.signedPdfUrl && (
                        <Button size="sm" variant="outline" className="text-green-700 border-green-200 hover:bg-green-50" asChild>
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
                <Label>Medicamentos</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
              </div>
              <div className="space-y-3">
                {form.items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Medicamento {idx + 1}</span>
                      {form.items.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => removeItem(idx)}>×</Button>
                      )}
                    </div>
                    <Input value={item.medication} onChange={(e) => updateItem(idx, "medication", e.target.value)} placeholder="Nome do medicamento" className="text-sm" />
                    <div className="grid grid-cols-3 gap-2">
                      <Input value={item.dosage} onChange={(e) => updateItem(idx, "dosage", e.target.value)} placeholder="Dose (ex: 500mg)" className="text-sm" />
                      <Input value={item.frequency} onChange={(e) => updateItem(idx, "frequency", e.target.value)} placeholder="Frequência" className="text-sm" />
                      <Input value={item.duration} onChange={(e) => updateItem(idx, "duration", e.target.value)} placeholder="Duração" className="text-sm" />
                    </div>
                    <Input value={item.instructions} onChange={(e) => updateItem(idx, "instructions", e.target.value)} placeholder="Instruções especiais (opcional)" className="text-sm" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Observações adicionais..." className="mt-1 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.patientId) return toast.error("Selecione o paciente.");
              if (!form.items[0]?.medication) return toast.error("Adicione ao menos um medicamento.");
              createMutation.mutate({
                patientId: parseInt(form.patientId),
                type: form.type,
                items: form.items.filter((i) => i.medication),
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
