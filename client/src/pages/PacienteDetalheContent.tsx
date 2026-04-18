import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowLeft, FileText, Link2, Loader2, MessageCircle, Pencil, User } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { PatientEditDialog } from "@/components/PatientEditDialog";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

export default function PacienteDetalheContent() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const { data: patient, isLoading, refetch: refetchPatient } = trpc.patients.getById.useQuery(
    { id: patientId },
    { enabled: Number.isFinite(patientId) && patientId > 0 },
  );
  const { data: anamneses, refetch: refetchAnamneses, isFetching: isFetchingAnamneses } = trpc.anamneses.listByPatient.useQuery(
    { patientId },
    { enabled: Number.isFinite(patientId) && patientId > 0 },
  );
  const sendAnamnesisRequestMutation = trpc.whatsapp.sendAnamnesisRequest.useMutation({
    onSuccess: async (result) => {
      toast.success(`Pedido de anamnese enviado para ${result.patientName}.`);
      await refetchAnamneses();
    },
    onError: (error: any) => {
      toast.error(error?.message || "Não foi possível enviar a anamnese por WhatsApp.");
    },
  });

  const latestAnamnesis = anamneses?.[0] ?? null;
  const hasCompletedAnamnesis = Boolean(anamneses?.length);
  const canSendAnamnesis =
    user?.role === "admin" ||
    user?.role === "medico" ||
    user?.role === "recepcionista" ||
    user?.role === "enfermeiro";
  const canViewAnswers = user?.role === "admin" || user?.role === "medico" || user?.role === "enfermeiro";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!patient) {
    return <div className="py-16 text-center text-muted-foreground">Paciente não encontrado.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/pacientes")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{patient.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastro do paciente</p>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar cadastro
        </Button>
        <Button onClick={() => setLocation(`/prontuarios/${patient.id}`)}>
          <FileText className="mr-2 h-4 w-4" />
          Ver prontuário
        </Button>
      </div>

      <PatientEditDialog
        patientId={editOpen ? patient.id : null}
        onClose={() => setEditOpen(false)}
        onSaved={() => refetchPatient()}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Dados pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Nome", value: patient.fullName },
              { label: "Nascimento", value: formatDate(patient.birthDate) },
              { label: "Sexo", value: patient.gender ?? "—" },
              { label: "CPF", value: patient.cpf ?? "—" },
              { label: "Telefone", value: patient.phone ?? "—" },
              { label: "E-mail", value: patient.email ?? "—" },
              { label: "Endereço", value: patient.address ?? "—" },
              { label: "Cidade/UF", value: patient.city ? `${patient.city}/${patient.state ?? ""}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-right text-sm font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Dados médicos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Tipo sanguíneo", value: patient.bloodType ?? "—" },
              { label: "Alergias", value: patient.allergies ?? "Nenhuma" },
              { label: "Condições crônicas", value: patient.chronicConditions ?? "Nenhuma" },
              { label: "Convênio", value: patient.insuranceName ?? "Particular" },
              { label: "Nº do convênio", value: patient.insuranceNumber ?? "—" },
              { label: "Contato de emergência", value: patient.emergencyContactName ?? "—" },
              { label: "Telefone de emergência", value: patient.emergencyContactPhone ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="max-w-[220px] text-right text-sm font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#C9A55B]/25 bg-gradient-to-br from-[#C9A55B]/10 via-transparent to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anamnese do paciente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Status</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge className={hasCompletedAnamnesis ? "bg-emerald-600/90 text-white" : "bg-amber-500/90 text-black"}>
                  {hasCompletedAnamnesis ? "Preenchida" : "Pendente"}
                </Badge>
                {isFetchingAnamneses ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {hasCompletedAnamnesis
                  ? "Este paciente já possui anamnese registrada no sistema."
                  : "Ainda não há anamnese preenchida para este paciente."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Último registro</p>
              <p className="mt-3 text-sm font-medium text-foreground">
                {formatDateTime(latestAnamnesis?.submittedAt || latestAnamnesis?.anamnesisDate || latestAnamnesis?.createdAt)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{latestAnamnesis?.title || "Nenhum envio concluído até o momento."}</p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Privacidade</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {canViewAnswers
                  ? "Seu perfil pode visualizar as respostas completas no prontuário."
                  : "Seu perfil pode solicitar a anamnese e ver apenas se ela foi preenchida ou não."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canSendAnamnesis ? (
              <Button
                onClick={() => sendAnamnesisRequestMutation.mutate({ patientId })}
                disabled={sendAnamnesisRequestMutation.isPending}
                className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] text-white hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]"
              >
                {sendAnamnesisRequestMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="mr-2 h-4 w-4" />
                )}
                Enviar anamnese por WhatsApp
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setLocation(`/prontuarios/${patient.id}?tab=anamnese`)}>
              <Link2 className="mr-2 h-4 w-4" />
              Abrir aba de anamnese
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {hasCompletedAnamnesis
              ? `Há ${anamneses?.length} anamnese(s) registrada(s), incluindo formulários atuais e importações do legado.`
              : "Quando a paciente responder pelo link, o status mudará automaticamente para preenchida."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
