import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Activity, FileText, Loader2 } from "lucide-react";

export default function PacienteDetalhe() {
  const params = useParams<{ id: string }>();
  const patientId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const { data: patient, isLoading } = trpc.patients.getById.useQuery({ id: patientId });

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!patient) return <div className="text-center py-16 text-muted-foreground">Paciente não encontrado.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/pacientes")}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{patient.fullName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro do Paciente</p>
        </div>
        <Button onClick={() => setLocation(`/prontuarios/${patient.id}`)}>
          <FileText className="h-4 w-4 mr-2" />Ver Prontuário
        </Button>
      </div>
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
              { label: "Endereço", value: patient.address ?? "—" },
              { label: "Cidade/UF", value: patient.city ? `${patient.city}/${patient.state}` : "—" },
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
              { label: "Contato Emergência", value: patient.emergencyContactName ?? "—" },
              { label: "Tel. Emergência", value: patient.emergencyContactPhone ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right max-w-[200px]">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
