import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileDown, Loader2, Search, ScrollText, ExternalLink } from "lucide-react";

function cleanText(value?: string | null) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR");
}

function documentLabel(type?: string | null) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "contrato") return "Contrato";
  if (normalized === "termo") return "Termo";
  return "Documento";
}

export default function Contratos() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { data: contracts = [], isLoading } = trpc.medicalRecords.listContracts.useQuery({
    query: search.trim() || undefined,
    limit: 1000,
  });

  const totalWithPdf = useMemo(
    () => contracts.filter((doc: any) => doc.fileUrl || doc.url).length,
    [contracts],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ScrollText className="h-6 w-6 text-primary" />
            Contratos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contratos e termos importados do Prontuario Verde, reunidos em uma lista unica.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {totalWithPdf}/{contracts.length} com PDF
        </Badge>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por paciente, CPF, contrato ou termo"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[#C9A55B]" />
        </div>
      ) : contracts.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-16 text-center">
            <ScrollText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum contrato ou termo encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contracts.map((doc: any) => {
            const fileUrl = doc.fileUrl || doc.url || "";
            return (
              <Card key={doc.id} className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <ScrollText className="h-4 w-4 shrink-0 text-[#C9A55B]" />
                      <span className="truncate">{cleanText(doc.name) || documentLabel(doc.type)}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px]">{documentLabel(doc.type)}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                    <p><span className="font-medium text-foreground">Paciente:</span> {doc.patientName || "Nao informado"}</p>
                    <p><span className="font-medium text-foreground">Data:</span> {formatDate(doc.createdAt)}</p>
                    <p><span className="font-medium text-foreground">Origem:</span> {doc.sourceSystem === "prontuario_verde" ? "Prontuario Verde" : cleanText(doc.sourceSystem) || "Sistema"}</p>
                  </div>
                  {doc.description ? <p className="text-sm text-muted-foreground">{cleanText(doc.description)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {fileUrl ? (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline">
                          <FileDown className="mr-1.5 h-3.5 w-3.5" />
                          Baixar PDF
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                        PDF indisponivel
                      </Button>
                    )}
                    {doc.patientId ? (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/prontuarios/${doc.patientId}#contratos`)}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir prontuario
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
