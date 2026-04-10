import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { generatePremiumPdf } from "@/components/PdfExporter";
import { AllergyAlert } from "@/components/AllergyAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Loader2, Search } from "lucide-react";

const SECTION_OPTIONS = [
  { id: "anamneses", label: "Anamneses" },
  { id: "evolucoes", label: "Evoluções" },
  { id: "prescricoes", label: "Prescrições" },
  { id: "agendamentos", label: "Agendamentos" },
  { id: "anexos", label: "Anexos e documentos" },
  { id: "imagens", label: "Imagens" },
] as const;

function buildHistorySummary(record: any) {
  return [
    record.chiefComplaint,
    record.anamnesis,
    record.historyOfPresentIllness,
    record.clinicalEvolution,
    record.evolution,
    record.plan,
    record.treatmentPlan,
    record.pastMedicalHistory,
    record.familyHistory,
    record.socialHistory,
    record.currentMedications,
    record.allergies,
    record.physicalExam,
    record.diagnosis,
  ]
    .filter(Boolean)
    .join("<br/><br/>");
}

export default function RelatorioProntuario() {
  const [, setLocation] = useLocation();
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>(SECTION_OPTIONS.map((option) => option.id));
  const [exporting, setExporting] = useState(false);

  const { data: patientMatches } = trpc.patients.list.useQuery(
    { query: patientSearch || undefined, limit: 12 },
    { enabled: patientSearch.trim().length >= 2 },
  );

  const { data: patient } = trpc.patients.getById.useQuery(
    { id: selectedPatientId ?? 0 },
    { enabled: !!selectedPatientId },
  );

  const { data: history, isLoading } = trpc.medicalRecords.getHistory.useQuery(
    { patientId: selectedPatientId ?? 0 },
    { enabled: !!selectedPatientId },
  );

  const counts = useMemo<Record<(typeof SECTION_OPTIONS)[number]["id"], number>>(() => ({
    anamneses: history?.records?.length ?? 0,
    evolucoes: history?.records?.length ?? 0,
    prescricoes: history?.prescriptions?.length ?? 0,
    agendamentos: history?.appointments?.length ?? 0,
    anexos: history?.documents?.length ?? 0,
    imagens: history?.photos?.length ?? 0,
  }), [history]);

  const toggleSection = (sectionId: string) => {
    setSelectedSections((current) =>
      current.includes(sectionId)
        ? current.filter((item) => item !== sectionId)
        : [...current, sectionId],
    );
  };

  const buildReportHtml = () => {
    if (!patient || !history) return "";

    const sections: string[] = [];

    if (selectedSections.includes("anamneses")) {
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Anamneses e antecedentes</h3>
          ${(history.records ?? []).map((record: any) => `
            <div style="margin-bottom:16px;padding:14px;border:1px solid #e8dcc4;border-radius:14px;">
              <div style="font-weight:600;margin-bottom:8px;">
                ${new Date(record.date || record.createdAt).toLocaleString("pt-BR")}
              </div>
              <div>${buildHistorySummary(record) || "Sem resumo clínico estruturado no legado."}</div>
            </div>
          `).join("") || "<p>Sem anamneses registradas.</p>"}
        </section>
      `);
    }

    if (selectedSections.includes("evolucoes")) {
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Evoluções clínicas</h3>
          ${(history.records ?? []).map((record: any) => `
            <div style="margin-bottom:16px;padding:14px;border:1px solid #e8dcc4;border-radius:14px;">
              <div style="font-weight:600;margin-bottom:8px;">
                ${new Date(record.date || record.createdAt).toLocaleString("pt-BR")} • ${record.doctorName || "Profissional não identificado"}
              </div>
              <div>${buildHistorySummary(record) || "Sem evolução estruturada."}</div>
            </div>
          `).join("") || "<p>Sem evoluções registradas.</p>"}
        </section>
      `);
    }

    if (selectedSections.includes("prescricoes")) {
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Prescrições</h3>
          ${(history.prescriptions ?? []).map((item: any) => `
            <div style="margin-bottom:16px;padding:14px;border:1px solid #e8dcc4;border-radius:14px;">
              <div style="font-weight:600;margin-bottom:8px;">
                ${new Date(item.date || item.createdAt).toLocaleString("pt-BR")} • ${item.doctorName || "Profissional não identificado"}
              </div>
              <div style="white-space:pre-wrap;">${String(item.content || "Sem conteúdo textual disponível.")}</div>
            </div>
          `).join("") || "<p>Sem prescrições registradas.</p>"}
        </section>
      `);
    }

    if (selectedSections.includes("agendamentos")) {
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Agendamentos</h3>
          ${(history.appointments ?? []).map((item: any) => `
            <div style="margin-bottom:16px;padding:14px;border:1px solid #e8dcc4;border-radius:14px;">
              <div style="font-weight:600;margin-bottom:8px;">
                ${new Date(item.scheduledAt).toLocaleString("pt-BR")} • ${item.status || "Sem status"}
              </div>
              <div>Sala: ${item.room || "Não informada"} • Tipo: ${item.type || "Não informado"}</div>
              ${item.notes ? `<div style="margin-top:8px;white-space:pre-wrap;">${String(item.notes)}</div>` : ""}
            </div>
          `).join("") || "<p>Sem agendamentos registrados.</p>"}
        </section>
      `);
    }

    if (selectedSections.includes("anexos")) {
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Anexos e documentos</h3>
          ${(history.documents ?? []).map((item: any) => `
            <div style="margin-bottom:10px;padding:12px;border:1px solid #e8dcc4;border-radius:12px;">
              <div style="font-weight:600;">${item.title || item.name || "Documento sem título"}</div>
              <div style="font-size:12px;color:#666;">${item.type || "Documento"} • ${new Date(item.createdAt).toLocaleDateString("pt-BR")}</div>
              <div style="font-size:12px;color:#666;">${item.description || ""}</div>
            </div>
          `).join("") || "<p>Sem anexos registrados.</p>"}
        </section>
      `);
    }

    if (selectedSections.includes("imagens")) {
      const photoItems = history.photos ?? [];
      sections.push(`
        <section>
          <h3 style="font-size:16px;margin:0 0 12px 0;color:#8A6526;">Imagens</h3>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
            ${photoItems.slice(0, 12).map((item: any) => `
              <div style="padding:12px;border:1px solid #e8dcc4;border-radius:12px;">
                <img src="${item.thumbnailUrl || item.photoUrl}" style="width:100%;height:220px;object-fit:cover;border-radius:10px;" />
                <div style="margin-top:8px;font-size:12px;">
                  <div style="font-weight:600;">${item.description || item.category || "Imagem clínica"}</div>
                  <div style="color:#666;">${new Date(item.takenAt || item.createdAt).toLocaleDateString("pt-BR")}</div>
                </div>
              </div>
            `).join("")}
          </div>
          ${photoItems.length > 12 ? `<p style="margin-top:12px;font-size:12px;color:#666;">O relatório exibiu as 12 primeiras imagens desta seleção.</p>` : ""}
          ${photoItems.length === 0 ? "<p>Sem imagens registradas.</p>" : ""}
        </section>
      `);
    }

    return `
      <div style="font-family:Montserrat,sans-serif;">
        <section style="margin-bottom:24px;">
          <h2 style="font-size:20px;margin:0 0 10px 0;">Relatório personalizado do prontuário</h2>
          <p style="margin:0 0 6px 0;"><strong>Paciente:</strong> ${patient.fullName}</p>
          <p style="margin:0 0 6px 0;"><strong>CPF:</strong> ${patient.cpf || "Não informado"}</p>
          <p style="margin:0 0 6px 0;"><strong>Data de emissão:</strong> ${new Date().toLocaleString("pt-BR")}</p>
          ${patient.allergies ? `<p style="margin:0 0 6px 0;color:#B91C1C;"><strong>Alergias registradas:</strong> ${patient.allergies}</p>` : ""}
        </section>
        ${sections.join("")}
      </div>
    `;
  };

  const handleExport = async () => {
    if (!patient || !history) {
      toast.error("Selecione um paciente para gerar o relatório.");
      return;
    }

    if (!selectedSections.length) {
      toast.error("Selecione pelo menos um bloco para exportar.");
      return;
    }

    try {
      setExporting(true);
      await generatePremiumPdf({
        filename: `relatorio_prontuario_${patient.fullName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
        title: "Relatório do prontuário",
        subtitle: `Paciente: ${patient.fullName}`,
        content: buildReportHtml(),
        includeAuditReport: false,
        includeWatermark: true,
      });
      toast.success("Relatório exportado em PDF.");
    } catch (error) {
      toast.error("Não foi possível gerar o PDF do prontuário.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/relatorios")}>
            <ArrowLeft className="h-4 w-4" />
            Voltar aos relatórios
          </Button>
          <h1 className="mt-2 text-2xl font-semibold">Relatório personalizado do prontuário</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecione o paciente e os blocos que devem entrar no PDF da cópia do prontuário.
          </p>
        </div>
        <Button variant="premium" onClick={handleExport} disabled={exporting || !selectedPatientId}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Exportar PDF
        </Button>
      </div>

      <Card className="card-premium border-border/70">
        <CardContent className="space-y-2 p-5">
          <Label>Paciente</Label>
          <div className="relative">
            <Input
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder="Busque pelo nome do paciente"
            />
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {patientSearch.trim().length >= 2 && (patientMatches?.length ?? 0) > 0 ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl">
                {patientMatches?.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                    onClick={() => {
                      setSelectedPatientId(match.id);
                      setSelectedPatientLabel(match.fullName ?? match.name ?? "");
                      setPatientSearch("");
                    }}
                  >
                    <span className="font-medium text-foreground">{match.fullName ?? match.name}</span>
                    <span className="text-xs text-muted-foreground">ID {match.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedPatientId ? `Paciente selecionado: ${selectedPatientLabel}` : "Selecione um paciente para iniciar."}
          </p>
        </CardContent>
      </Card>

      {patient?.allergies ? <AllergyAlert allergies={patient.allergies} patientName={patient.fullName} variant="banner" /> : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="card-premium border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Conteúdo do relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SECTION_OPTIONS.map((option) => (
              <label key={option.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedSections.includes(option.id)}
                    onCheckedChange={() => toggleSection(option.id)}
                  />
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <Badge variant="outline">{counts[option.id]}</Badge>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="card-premium border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resumo da seleção</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedPatientId && isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando dados do prontuário...
              </div>
            ) : patient ? (
              <>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-sm leading-6">
                  <p><span className="font-medium">Paciente:</span> {patient.fullName}</p>
                  <p><span className="font-medium">CPF:</span> {patient.cpf || "Não informado"}</p>
                  <p><span className="font-medium">Contato:</span> {patient.phone || patient.email || "Não informado"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSections.map((sectionId) => {
                    const option = SECTION_OPTIONS.find((item) => item.id === sectionId);
                    return option ? <Badge key={sectionId} variant="secondary">{option.label}</Badge> : null;
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Depois de selecionar o paciente, esta área mostra um resumo da exportação.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
