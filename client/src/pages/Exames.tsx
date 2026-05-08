import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { patientDisplayName } from "@/lib/patientDisplay";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generatePremiumPdf } from "@/components/PdfExporter";
import { ClinicalDocumentSignatureActions } from "@/components/ClinicalDocumentSignatureActions";
import { toast } from "sonner";
import { Plus, FlaskConical, Loader2, FileText, AlertTriangle, Clock, Trash2 } from "lucide-react";

const EXAM_TEMPLATES: Record<string, { name: string; code?: string }[]> = {
  "Hemograma": [
    { name: "Hemograma Completo", code: "HEMO" },
    { name: "Plaquetas", code: "PLQ" },
  ],
  "Bioquímica": [
    { name: "Glicemia de Jejum", code: "GLIC" },
    { name: "HbA1c", code: "HBA1C" },
    { name: "Colesterol Total e Frações", code: "LIPID" },
    { name: "Triglicerídeos", code: "TG" },
    { name: "Creatinina", code: "CREAT" },
    { name: "Ureia", code: "UREIA" },
    { name: "TGO/AST", code: "TGO" },
    { name: "TGP/ALT", code: "TGP" },
    { name: "TSH", code: "TSH" },
    { name: "T4 Livre", code: "T4L" },
  ],
  "Urina": [
    { name: "EAS / Urina Tipo I", code: "EAS" },
    { name: "Urocultura", code: "UROC" },
  ],
  "Imagem": [
    { name: "Raio-X de Tórax PA e Perfil", code: "RX-TORAX" },
    { name: "Ultrassonografia Abdominal Total", code: "USG-ABD" },
    { name: "Eletrocardiograma", code: "ECG" },
  ],
};

const URGENCY_CONFIG = {
  rotina: { label: "Rotina", color: "bg-gray-100 text-gray-700" },
  urgente: { label: "Urgente", color: "bg-[#F1D791]/30 text-[#8A6526]" },
  emergencia: { label: "Emergência", color: "bg-[#2F2F2F]/10 text-[#2F2F2F]" },
};

const defaultForm = {
  patientId: "", specialty: "", clinicalIndication: "", observations: "",
  content: "",
};

export default function Exames() {
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? "user";
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [filterPatientId, setFilterPatientId] = useState<number | null>(null);
  const [lockedPatientId, setLockedPatientId] = useState<number | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: patients } = trpc.patients.list.useQuery({ limit: 200 });
  const examUtils = trpc.useUtils();
  const { data: templates } = trpc.examRequests.listTemplates.useQuery();
  const saveTemplateMutation = trpc.examRequests.createTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo salvo com sucesso!"); void examUtils.examRequests.listTemplates.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteTemplateMutation = trpc.examRequests.deleteTemplate.useMutation({
    onSuccess: () => { toast.success("Modelo excluído."); void examUtils.examRequests.listTemplates.invalidate(); },
    onError: (err: any) => toast.error(err.message || "Não foi possível excluir o modelo."),
  });
  const { data: examRequests, refetch } = trpc.examRequests.getByPatient.useQuery(
    { patientId: filterPatientId ?? 0 },
    { enabled: !!filterPatientId }
  );
  const lockedPatient = useMemo(
    () => patients?.find((patient) => Number(patient.id) === Number(lockedPatientId)) ?? null,
    [lockedPatientId, patients],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linkedPatientId = params.get("patientId");
    const shouldCreate = params.get("create") === "1";

    if (linkedPatientId && /^\d+$/.test(linkedPatientId)) {
      const patientId = Number(linkedPatientId);
      setLockedPatientId(patientId);
      setFilterPatientId(patientId);
      setForm((current) => ({ ...current, patientId: linkedPatientId }));
      if (shouldCreate) {
        setShowCreate(true);
      }
    }
  }, []);

  const resetFormForContext = () => setForm({ ...defaultForm, patientId: lockedPatientId ? String(lockedPatientId) : "" });
  const openCreateDialog = () => {
    setForm((current) => ({
      ...current,
      patientId: lockedPatientId ? String(lockedPatientId) : current.patientId,
    }));
    setShowCreate(true);
  };

  const createMutation = trpc.examRequests.create.useMutation({
    onSuccess: () => { toast.success("Pedido de exames criado!"); setShowCreate(false); resetFormForContext(); if (filterPatientId) refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const canCreate = ["admin", "medico"].includes(userRole);

  const handlePrintExamRequest = async (request: any) => {
    let exams = request.exams ?? request.content ?? "";
    if (typeof exams === "string") {
      try {
        const parsed = JSON.parse(exams);
        if (Array.isArray(parsed)) exams = parsed;
      } catch {}
    }
    const examText = Array.isArray(exams)
      ? exams.map((item: any) => typeof item === "string" ? item : [item?.name, item?.instructions].filter(Boolean).join(" - ")).filter(Boolean).join("<br />")
      : String(exams ?? "");

    await generatePremiumPdf({
      filename: `pedido_exames_${request.id}.pdf`,
      title: "Pedido de exames",
      subtitle: `Paciente: ${request.patientName ?? "Paciente"}`,
      content: `
        <div style="font-family: Montserrat, sans-serif; font-size: 14px; line-height: 1.6;">
          <p><strong>Paciente:</strong> ${request.patientName ?? ""}</p>
          <p><strong>Data:</strong> ${new Date(request.createdAt ?? Date.now()).toLocaleDateString("pt-BR")}</p>
          <p><strong>Exames solicitados:</strong></p>
          <p>${examText}</p>
          ${request.clinicalIndication ? `<p><strong>Indicação clínica:</strong> ${request.clinicalIndication}</p>` : ""}
          ${request.signatureValidationCode ? `<p><strong>Assinatura:</strong> ${request.signatureProvider || "assinatura digital"} - código ${request.signatureValidationCode}</p>` : ""}
        </div>
      `,
      includeWatermark: true,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos de Exames</h1>
          <p className="text-sm text-muted-foreground mt-1">Solicitação e acompanhamento de exames</p>
        </div>
        {canCreate && (
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />Novo Pedido
          </Button>
        )}
      </div>

      {/* Filtro por paciente */}
      <div className="flex items-center gap-3">
        {lockedPatientId ? (
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Paciente do prontuário: </span>
            <span className="font-medium">{lockedPatient ? patientDisplayName(lockedPatient) : `Paciente #${lockedPatientId}`}</span>
          </div>
        ) : (
          <>
            <Select value={filterPatientId?.toString() ?? ""} onValueChange={(v) => setFilterPatientId(v ? parseInt(v) : null)}>
              <SelectTrigger className="w-72 h-9"><SelectValue placeholder="Filtrar por paciente..." /></SelectTrigger>
              <SelectContent>
                {patients?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{patientDisplayName(p)}</SelectItem>)}
              </SelectContent>
            </Select>
            {filterPatientId && <Button variant="ghost" size="sm" onClick={() => setFilterPatientId(null)}>Limpar</Button>}
          </>
        )}
      </div>

      {!filterPatientId ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Selecione um paciente</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Filtre por paciente para visualizar os pedidos de exames.</p>
          </CardContent>
        </Card>
      ) : !examRequests || examRequests.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum pedido encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{canCreate ? "Crie o primeiro pedido clicando em 'Novo Pedido'." : "Nenhum pedido registrado."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {examRequests.map((req) => {
            const exams = Array.isArray(req.exams) ? req.exams as any[] : [];
            return (
              <Card key={req.id} className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      {req.specialty && <Badge variant="outline" className="text-xs">{req.specialty}</Badge>}
                      <p className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                    <ClinicalDocumentSignatureActions
                      documentType="exame"
                      documentId={req.id}
                      documentTitle={`Pedido de exames #${req.id}`}
                      documentContent={(req as any).content || JSON.stringify(exams)}
                      patientName={req.patientName ?? ""}
                      patientPhone={req.patientPhone ?? ""}
                      signerName={(user as any)?.name ?? ""}
                      signerCpf={(user as any)?.cloudSignatureCpf ?? ""}
                      isSigned={Boolean((req as any).signedAt || (req as any).signatureValidationCode)}
                      signedAt={(req as any).signedAt}
                      signatureProvider={(req as any).signatureProvider}
                      signatureValidationCode={(req as any).signatureValidationCode}
                      onPrint={() => handlePrintExamRequest(req)}
                      onSigned={async () => {
                        await refetch();
                        await examUtils.examRequests.getByPatient.invalidate();
                      }}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {exams.length > 0 ? exams.map((exam: any, idx: number) => {
                    const urgencyInfo = URGENCY_CONFIG[exam.urgency as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.rotina;
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{exam.name}</p>
                          {exam.instructions && <p className="text-xs text-muted-foreground">{exam.instructions}</p>}
                        </div>
                        <Badge className={`text-xs shrink-0 ${urgencyInfo.color}`}>{urgencyInfo.label}</Badge>
                      </div>
                    );
                  }) : (req as any).content ? (
                    <div className="p-3 rounded-lg bg-muted/50 whitespace-pre-wrap text-sm font-mono">
                      {(req as any).content}
                    </div>
                  ) : null}
                  {req.clinicalIndication && (
                    <p className="text-xs text-muted-foreground mt-2"><span className="font-medium">Indicação:</span> {req.clinicalIndication}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal criar pedido */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" />Novo Pedido de Exames</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                {lockedPatientId ? (
                  <div className="mt-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">
                    {lockedPatient ? patientDisplayName(lockedPatient) : `Paciente #${lockedPatientId}`}
                  </div>
                ) : (
                  <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{patients?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{patientDisplayName(p)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Especialidade</Label>
                <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Ex: Cardiologia" className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Indicação Clínica</Label>
              <Input value={form.clinicalIndication} onChange={(e) => setForm({ ...form, clinicalIndication: e.target.value })} placeholder="Indicação clínica para os exames" className="mt-1" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Exames Solicitados *</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplates(!showTemplates)}>Modelos</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    if (!form.content) return toast.error("Digite os exames para salvar como modelo.");
                    const name = prompt("Nome do modelo:");
                    if (name) saveTemplateMutation.mutate({ name, content: form.content, specialty: form.specialty });
                  }}>Salvar como Modelo</Button>
                </div>
              </div>

              {showTemplates && (
                <div className="mb-3 p-3 rounded-lg border bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Selecione um modelo:</p>
                  <div className="flex flex-wrap gap-2">
                    {templates?.map((t) => (
                      <div key={t.id} className="inline-flex items-center gap-1 rounded-md border bg-background">
                        <Button variant="secondary" size="sm" className="rounded-r-none border-0" onClick={() => {
                          setForm({ ...form, content: t.content, specialty: t.specialty || form.specialty });
                          setShowTemplates(false);
                        }}>{t.name}</Button>
                        <button
                          type="button"
                          title="Excluir modelo"
                          disabled={deleteTemplateMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Excluir o modelo "${t.name}"? Esta ação não poderá ser desfeita.`)) {
                              deleteTemplateMutation.mutate({ id: Number(t.id) });
                            }
                          }}
                          className="px-2 py-1 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {templates?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum modelo salvo.</p>}
                  </div>
                </div>
              )}

              <RichTextEditor
                value={form.content}
                onChange={(content) => setForm({ ...form, content })}
                placeholder="Liste os exames e instruções aqui..."
                minHeight="220px"
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
              if (!form.content) return toast.error("O conteúdo do pedido é obrigatório.");
              createMutation.mutate({
                patientId: parseInt(form.patientId),
                specialty: form.specialty || undefined,
                clinicalIndication: form.clinicalIndication || undefined,
                content: form.content,
                observations: form.observations || undefined,
              });
            }} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Criar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
