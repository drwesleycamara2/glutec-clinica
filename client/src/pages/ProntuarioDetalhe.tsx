import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, FileText, Activity, Stethoscope, ClipboardList, Loader2, Calendar, User, ShieldCheck, FileDown } from "lucide-react";
import { AllergyAlert } from "@/components/AllergyAlert";
import { ExportProntuarioButton } from "@/components/ExportProntuario";

const defaultEntryForm = {
  chiefComplaint: "", historyOfPresentIllness: "", physicalExam: "",
  vitalSignsBp: "", vitalSignsHr: "", vitalSignsTemp: "", vitalSignsWeight: "", vitalSignsHeight: "",
  diagnosis: "", icdCode: "", clinicalEvolution: "", treatmentPlan: "",
  currentMedications: "", allergies: "",
};

export default function ProntuarioDetalhe() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const userRole = (user as any)?.role ?? "user";
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState(defaultEntryForm);

  const { data: patient, isLoading: patientLoading } = trpc.patients.getById.useQuery({ id: patientId });
  const { data: records, refetch } = trpc.medicalRecords.getByPatient.useQuery({ patientId });

  const createEntryMutation = trpc.medicalRecords.create.useMutation({
    onSuccess: () => { toast.success("Entrada adicionada!"); setShowAddEntry(false); setEntryForm(defaultEntryForm); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  if (patientLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!patient) return <div className="text-center py-16 text-muted-foreground">Paciente não encontrado.</div>;

  const canAddEntry = ["admin", "medico", "enfermeiro"].includes(userRole);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/prontuarios")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{patient.fullName}</h1>
            <Badge variant="outline" className="text-xs">PEP · CFM 1821/2007</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Prontuário Eletrônico do Paciente</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportProntuarioButton patientId={patientId} patientName={patient.fullName} />
          {canAddEntry && (
            <Button onClick={() => setShowAddEntry(true)}>
              <Plus className="h-4 w-4 mr-2" />Nova Entrada
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de Alergias - Fase 16 */}
      <AllergyAlert allergies={patient.allergies} patientName={patient.fullName} variant="banner" />

      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
        <p className="text-xs text-blue-700">Prontuário protegido pela LGPD. Todos os acessos são registrados com data, hora e usuário responsável.</p>
      </div>

      <Tabs defaultValue="prontuario">
        <TabsList>
          <TabsTrigger value="prontuario" className="gap-2"><ClipboardList className="h-4 w-4" />Prontuário</TabsTrigger>
          <TabsTrigger value="dados" className="gap-2"><User className="h-4 w-4" />Dados do Paciente</TabsTrigger>
        </TabsList>

        <TabsContent value="prontuario" className="mt-4">
          {!records || records.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-base font-medium text-muted-foreground">Prontuário vazio</p>
                <p className="text-sm text-muted-foreground/70 mt-1">{canAddEntry ? "Adicione a primeira entrada clicando em 'Nova Entrada'." : "Nenhuma entrada registrada."}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <Card key={record.id} className="border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs bg-blue-100 text-blue-800">Prontuário</Badge>
                        {record.icdCode && <Badge variant="outline" className="text-xs font-mono">{record.icdCode}</Badge>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Calendar className="h-3 w-3" />{new Date(record.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {record.chiefComplaint && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Queixa Principal</p><p className="text-sm">{record.chiefComplaint}</p></div>}
                    {record.historyOfPresentIllness && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">HDA</p><p className="text-sm whitespace-pre-wrap">{record.historyOfPresentIllness}</p></div>}
                    {record.physicalExam && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Exame Físico</p><p className="text-sm whitespace-pre-wrap">{record.physicalExam}</p></div>}
                    {record.vitalSigns != null && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sinais Vitais</p><p className="text-sm font-mono bg-muted/50 p-2 rounded">{JSON.stringify(record.vitalSigns as Record<string, unknown>)}</p></div>}
                    {record.diagnosis && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Diagnóstico</p><p className="text-sm">{record.diagnosis}</p></div>}
                    {record.clinicalEvolution && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Evolução Clínica</p><p className="text-sm whitespace-pre-wrap">{record.clinicalEvolution}</p></div>}
                    {record.treatmentPlan && <div><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Plano Terapêutico</p><p className="text-sm whitespace-pre-wrap">{record.treatmentPlan}</p></div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dados" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" />Dados Pessoais</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Nome", value: patient.fullName },
                  { label: "Nascimento", value: patient.birthDate ? new Date(patient.birthDate).toLocaleDateString("pt-BR") : "—" },
                  { label: "Sexo", value: patient.gender ?? "—" },
                  { label: "CPF", value: patient.cpf ?? "—" },
                  { label: "Telefone", value: patient.phone ?? "—" },
                  { label: "E-mail", value: patient.email ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-right">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Dados Médicos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Tipo Sanguíneo", value: patient.bloodType ?? "—" },
                  { label: "Alergias", value: patient.allergies ?? "Nenhuma" },
                  { label: "Condições Crônicas", value: patient.chronicConditions ?? "Nenhuma" },
                  { label: "Convênio", value: patient.insuranceName ?? "Particular" },
                  { label: "Nº Convênio", value: patient.insuranceNumber ?? "—" },
                  { label: "Emergência", value: patient.emergencyContactPhone ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium text-right max-w-[200px]">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddEntry} onOpenChange={setShowAddEntry}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" />Nova Entrada no Prontuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Queixa Principal</Label><Input value={entryForm.chiefComplaint} onChange={(e) => setEntryForm({ ...entryForm, chiefComplaint: e.target.value })} placeholder="Queixa principal do paciente" className="mt-1" /></div>
            <div><Label>História da Doença Atual (HDA)</Label><Textarea value={entryForm.historyOfPresentIllness} onChange={(e) => setEntryForm({ ...entryForm, historyOfPresentIllness: e.target.value })} placeholder="Descreva a HDA..." className="mt-1 resize-none" rows={3} /></div>
            <div><Label>Exame Físico</Label><Textarea value={entryForm.physicalExam} onChange={(e) => setEntryForm({ ...entryForm, physicalExam: e.target.value })} placeholder="Achados do exame físico..." className="mt-1 resize-none" rows={3} /></div>
            <div>
              <Label>Sinais Vitais</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <Input value={entryForm.vitalSignsBp} onChange={(e) => setEntryForm({ ...entryForm, vitalSignsBp: e.target.value })} placeholder="PA: 120/80" className="font-mono text-sm" />
                <Input value={entryForm.vitalSignsHr} onChange={(e) => setEntryForm({ ...entryForm, vitalSignsHr: e.target.value })} placeholder="FC: 72 bpm" className="font-mono text-sm" />
                <Input value={entryForm.vitalSignsTemp} onChange={(e) => setEntryForm({ ...entryForm, vitalSignsTemp: e.target.value })} placeholder="T: 36.5°C" className="font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Diagnóstico</Label><Input value={entryForm.diagnosis} onChange={(e) => setEntryForm({ ...entryForm, diagnosis: e.target.value })} placeholder="Diagnóstico principal" className="mt-1" /></div>
              <div><Label>CID-10</Label><Input value={entryForm.icdCode} onChange={(e) => setEntryForm({ ...entryForm, icdCode: e.target.value })} placeholder="J06.9" className="mt-1 font-mono" /></div>
            </div>
            <div><Label>Evolução Clínica</Label><Textarea value={entryForm.clinicalEvolution} onChange={(e) => setEntryForm({ ...entryForm, clinicalEvolution: e.target.value })} placeholder="Evolução do quadro clínico..." className="mt-1 resize-none" rows={3} /></div>
            <div><Label>Plano Terapêutico / Conduta</Label><Textarea value={entryForm.treatmentPlan} onChange={(e) => setEntryForm({ ...entryForm, treatmentPlan: e.target.value })} placeholder="Conduta e plano de tratamento..." className="mt-1 resize-none" rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEntry(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!entryForm.chiefComplaint && !entryForm.diagnosis && !entryForm.clinicalEvolution) return toast.error("Preencha ao menos um campo.");
              const vs: Record<string, string> = {};
              if (entryForm.vitalSignsBp) vs.bp = entryForm.vitalSignsBp;
              if (entryForm.vitalSignsHr) vs.hr = entryForm.vitalSignsHr;
              if (entryForm.vitalSignsTemp) vs.temp = entryForm.vitalSignsTemp;
              createEntryMutation.mutate({
                patientId,
                chiefComplaint: entryForm.chiefComplaint || undefined,
                historyOfPresentIllness: entryForm.historyOfPresentIllness || undefined,
                physicalExam: entryForm.physicalExam || undefined,
                vitalSigns: Object.keys(vs).length > 0 ? vs : undefined,
                diagnosis: entryForm.diagnosis || undefined,
                icdCode: entryForm.icdCode || undefined,
                clinicalEvolution: entryForm.clinicalEvolution || undefined,
                treatmentPlan: entryForm.treatmentPlan || undefined,
              });
            }} disabled={createEntryMutation.isPending}>
              {createEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar Entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
