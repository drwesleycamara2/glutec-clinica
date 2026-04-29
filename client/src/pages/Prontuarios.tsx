import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, User, ChevronRight, Loader2, Pencil, Stethoscope } from "lucide-react";
import { PatientEditDialog } from "@/components/PatientEditDialog";
import { PatientAttentionMark, PatientRecordBadge, patientDisplayName } from "@/lib/patientDisplay";

export default function Prontuarios() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const novoConsulta = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("novo") === "1";
  }, []);
  const { data: patients, isLoading, refetch } = trpc.patients.list.useQuery({ query: query || undefined, limit: 50 });

  useEffect(() => {
    if (novoConsulta) {
      searchInputRef.current?.focus();
    }
  }, [novoConsulta]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prontuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Prontuário Eletrônico do Paciente · CFM 1821/2007</p>
        </div>
      </div>

      {novoConsulta && (
        <div className="flex items-start gap-3 rounded-xl border border-[#C9A55B]/40 bg-[#C9A55B]/10 px-4 py-3 text-sm text-[#8a6d2e] dark:text-[#d5b978]">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Nova consulta</p>
            <p className="text-xs opacity-80">
              Selecione o paciente abaixo para abrir o prontuário e iniciar o atendimento (inclusive retroativo).
            </p>
          </div>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder="Buscar paciente por nome ou CPF..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !patients || patients.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum paciente encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Cadastre pacientes na seção de Pacientes para acessar seus prontuários.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="border shadow-sm cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
              onClick={() => setLocation(`/prontuarios/${patient.id}`)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {patient.photoUrl ? (
                    <img src={patient.photoUrl} alt={patientDisplayName(patient)} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <PatientAttentionMark patient={patient} />
                    <PatientRecordBadge patient={patient} />
                    <p className="truncate text-sm font-semibold">{patient.fullName}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {patient.birthDate && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(patient.birthDate).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {patient.cpf && <span className="text-xs text-muted-foreground font-mono">{patient.cpf}</span>}
                    {patient.insuranceName && (
                      <Badge variant="outline" className="text-xs h-5">{patient.insuranceName}</Badge>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  title="Editar cadastro do paciente"
                  onClick={(e) => { e.stopPropagation(); setEditId(patient.id); }}
                  className="rounded-md p-1.5 text-muted-foreground/70 hover:bg-[#C9A55B]/10 hover:text-[#C9A55B] transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PatientEditDialog
        patientId={editId}
        onClose={() => setEditId(null)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
