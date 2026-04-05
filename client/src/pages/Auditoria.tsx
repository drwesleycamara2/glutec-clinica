import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Search, Loader2, Clock, User, FileText } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  VIEW_MEDICAL_RECORDS: "bg-[#C9A55B]/10 text-[#8A6526]",
  VIEW_MEDICAL_RECORD: "bg-[#C9A55B]/10 text-[#8A6526]",
  CREATE_MEDICAL_RECORD: "bg-[#C9A55B]/15 text-[#6B5B2A]",
  UPDATE_MEDICAL_RECORD: "bg-[#F1D791]/30 text-[#8A6526]",
  CREATE_PRESCRIPTION: "bg-[#8A6526]/10 text-[#8A6526]",
  CREATE_EXAM_REQUEST: "bg-[#C9A55B]/10 text-[#8A6526]",
  UPDATE_USER_ROLE: "bg-[#2F2F2F]/10 text-[#2F2F2F]",
  VIEW_PATIENT: "bg-gray-100 text-gray-700",
};

const ACTION_LABELS: Record<string, string> = {
  VIEW_MEDICAL_RECORDS: "Visualizou Prontuários",
  VIEW_MEDICAL_RECORD: "Visualizou Prontuário",
  CREATE_MEDICAL_RECORD: "Criou Entrada no Prontuário",
  UPDATE_MEDICAL_RECORD: "Editou Prontuário",
  CREATE_PRESCRIPTION: "Criou Prescrição",
  CREATE_EXAM_REQUEST: "Criou Pedido de Exame",
  UPDATE_USER_ROLE: "Alterou Perfil de Usuário",
  VIEW_PATIENT: "Visualizou Paciente",
};

export default function Auditoria() {
  const [limit, setLimit] = useState("50");

  const { data: logs, isLoading } = trpc.admin.getAuditLogs.useQuery({ limit: parseInt(limit) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Auditoria de Acessos</h1>
          <p className="text-sm text-muted-foreground mt-1">Registro de acessos e ações — Conformidade LGPD</p>
        </div>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25 registros</SelectItem>
            <SelectItem value="50">50 registros</SelectItem>
            <SelectItem value="100">100 registros</SelectItem>
            <SelectItem value="200">200 registros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-lg bg-[#C9A55B]/5 border border-[#C9A55B]/20">
        <ShieldCheck className="h-4 w-4 text-[#C9A55B] shrink-0 mt-0.5" />
        <p className="text-xs text-[#8A6526]">
          Todos os acessos a prontuários e dados sensíveis são registrados automaticamente conforme exigido pela LGPD
          e pela Resolução CFM 1821/2007. Este log é imutável e não pode ser excluído.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !logs || logs.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum registro de auditoria</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Os logs de acesso aparecerão aqui conforme o sistema for utilizado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-xs ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                      {log.resourceType && (
                        <span className="text-xs text-muted-foreground font-mono">{log.resourceType}#{log.resourceId}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />Usuário #{log.userId}
                      </span>
                      {log.patientId && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="h-3 w-3" />Paciente #{log.patientId}
                        </span>
                      )}
                      {log.ipAddress && (
                        <span className="text-xs text-muted-foreground font-mono">{log.ipAddress}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {new Date(log.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
