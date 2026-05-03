import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck,
  Loader2,
  Clock,
  User,
  FileText,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  // Eventos novos (LGPD - leituras de PHI)
  patient_view: "Abriu cadastro do paciente",
  patient_history_read: "Leu histórico clínico",
  patient_appointments_read: "Leu agendamentos do paciente",
  patient_prescriptions_read: "Leu prescrições do paciente",
  patient_exam_requests_read: "Leu pedidos de exame do paciente",
  patient_photos_read: "Acessou fotos/mídia do paciente",
  patient_budgets_read: "Leu orçamentos do paciente",
  patient_documents_read: "Leu documentos do paciente",
  patient_anamneses_read: "Leu anamneses do paciente",
  contracts_list_read: "Listou contratos e termos",
  clinical_evolution_list_read: "Leu evoluções clínicas do paciente",

  // Eventos antigos (mantidos para compatibilidade)
  VIEW_MEDICAL_RECORDS: "Visualizou prontuários",
  VIEW_MEDICAL_RECORD: "Visualizou prontuário",
  CREATE_MEDICAL_RECORD: "Criou entrada no prontuário",
  UPDATE_MEDICAL_RECORD: "Editou prontuário",
  CREATE_PRESCRIPTION: "Criou prescrição",
  CREATE_EXAM_REQUEST: "Criou pedido de exame",
  UPDATE_USER_ROLE: "Alterou perfil de usuário",
  VIEW_PATIENT: "Visualizou paciente",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

const PAGE_SIZE_OPTIONS = ["25", "50", "100", "200"] as const;

type Filters = {
  userId: string;
  patientId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  userId: "",
  patientId: "",
  action: "",
  dateFrom: "",
  dateTo: "",
};

function toIntOrUndef(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function Auditoria() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>("50");
  const [page, setPage] = useState(0);

  const queryInput = useMemo(
    () => ({
      userId: toIntOrUndef(applied.userId) ?? undefined,
      patientId: toIntOrUndef(applied.patientId) ?? undefined,
      action: applied.action ? applied.action : undefined,
      dateFrom: applied.dateFrom || undefined,
      dateTo: applied.dateTo || undefined,
      limit: parseInt(pageSize, 10),
      offset: page * parseInt(pageSize, 10),
    }),
    [applied, pageSize, page],
  );

  const { data, isLoading, isFetching } = trpc.admin.listAuditLogs.useQuery(queryInput);
  const { data: actions = [] } = trpc.admin.listAuditLogActions.useQuery();

  const rows = (data as any)?.rows ?? [];
  const total = Number((data as any)?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / parseInt(pageSize, 10)));

  const applyFilters = () => {
    setApplied(draft);
    setPage(0);
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Auditoria de Acessos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro de leituras e ações sobre dados de pacientes — Conformidade LGPD
          </p>
        </div>
        <Select value={pageSize} onValueChange={(v) => { setPageSize(v as any); setPage(0); }}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={n}>{n} por página</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-lg bg-[#C9A55B]/5 border border-[#C9A55B]/20">
        <ShieldCheck className="h-4 w-4 text-[#C9A55B] shrink-0 mt-0.5" />
        <p className="text-xs text-[#8A6526]">
          Todos os acessos a prontuários e dados sensíveis são registrados automaticamente conforme a LGPD
          e a Resolução CFM 1821/2007. Esta tabela é append-only — registros não podem ser excluídos pela aplicação.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">ID do usuário</label>
              <Input
                value={draft.userId}
                onChange={(e) => setDraft({ ...draft, userId: e.target.value.replace(/\D/g, "") })}
                placeholder="ex.: 285"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">ID do paciente</label>
              <Input
                value={draft.patientId}
                onChange={(e) => setDraft({ ...draft, patientId: e.target.value.replace(/\D/g, "") })}
                placeholder="ex.: 1284"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Ação</label>
              <Select
                value={draft.action || "__all__"}
                onValueChange={(v) => setDraft({ ...draft, action: v === "__all__" ? "" : v })}
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(actions as string[]).map((a) => (
                    <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">De</label>
              <Input
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Até</label>
              <Input
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={applyFilters} className="gap-2">
              <Filter className="h-4 w-4" />
              Aplicar filtros
            </Button>
            <Button variant="outline" onClick={resetFilters} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Limpar
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {total.toLocaleString("pt-BR")} registro{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · página ${page + 1} de ${totalPages}` : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum registro encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Ajuste os filtros ou aguarde novas ações no sistema.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map((log: any) => (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-[#C9A55B]/10 text-[#8A6526] text-xs">
                        {actionLabel(log.action)}
                      </Badge>
                      {log.resourceType && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.resourceType}#{log.resourceId ?? "?"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {log.userEmail || `Usuário #${log.userId ?? "?"}`}
                        {log.userRole ? ` · ${log.userRole}` : ""}
                      </span>
                      {log.patientId ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Paciente #{log.patientId}
                        </span>
                      ) : null}
                      {log.ipAddress ? (
                        <span className="text-xs text-muted-foreground font-mono">{log.ipAddress}</span>
                      ) : null}
                    </div>
                    {log.metadata ? (
                      <p className="text-[11px] text-muted-foreground/80 mt-1 font-mono break-all">
                        {String(log.metadata).slice(0, 240)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {new Date(log.createdAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
