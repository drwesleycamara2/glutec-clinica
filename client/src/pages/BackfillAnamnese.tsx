/**
 * Ferramenta admin: backfill do texto das perguntas em anamneses importadas
 * do Prontuário Verde / OnDoctor.
 *
 * Os imports antigos só preservaram as RESPOSTAS (ex.: "#73693: Não").
 * Aqui o admin cola um CSV com `questionId,questionText` e a ferramenta
 * substitui "#73693:" por "Você tem alergias? (#73693):" em todas as
 * evoluções e anamneses afetadas.
 *
 * Sempre tenta primeiro em modo dry-run para o admin conferir antes de
 * confirmar a gravação no banco.
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, Database, Eye, Save, ListChecks, FileSignature } from "lucide-react";
import { toast } from "sonner";

const SAMPLE_CSV = `questionId,questionText
73693,"Tem alguma alergia conhecida?"
73694,"Faz uso de algum medicamento contínuo?"
79783,"Tem algum problema de saúde relevante?"`;

function parseLocalCsvForPreview(input: string): { id: string; text: string }[] {
  if (!input?.trim()) return [];
  const out: { id: string; text: string }[] = [];
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Mesma lógica do parser do servidor (id sempre numérico).
    const match = line.match(/^\s*"?(\d+)"?\s*,\s*"?(.+?)"?\s*$/);
    if (!match) continue;
    out.push({ id: match[1], text: match[2].replace(/""/g, '"') });
  }
  return out;
}

export default function BackfillAnamnese() {
  const [csvText, setCsvText] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);
  const utils = trpc.useUtils();
  const dryRunMutation = trpc.admin.backfillLegacyAnamneseQuestions.useMutation({
    onSuccess: (data) => {
      setLastResult({ ...data, mode: "dryRun" });
      toast.success("Pré-visualização gerada.");
    },
    onError: (err) => toast.error(err.message),
  });
  const applyMutation = trpc.admin.backfillLegacyAnamneseQuestions.useMutation({
    onSuccess: (data) => {
      setLastResult({ ...data, mode: "applied" });
      toast.success(`Backfill concluído: ${data.evolutionsUpdated} evoluções e ${data.anamnesesUpdated} anamneses atualizadas.`);
      void utils.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const localPreview = useMemo(() => parseLocalCsvForPreview(csvText), [csvText]);
  const isBusy = dryRunMutation.isPending || applyMutation.isPending;

  const runDryRun = () => {
    if (!csvText.trim()) {
      toast.error("Cole um CSV com pelo menos uma linha 'questionId,questionText'.");
      return;
    }
    dryRunMutation.mutate({ mappingCsv: csvText, dryRun: true });
  };

  const runApply = () => {
    if (!csvText.trim()) {
      toast.error("Cole um CSV com pelo menos uma linha 'questionId,questionText'.");
      return;
    }
    if (!window.confirm(
      "Aplicar o mapeamento em todas as anamneses e evoluções importadas? Esta ação grava no banco.",
    )) return;
    applyMutation.mutate({ mappingCsv: csvText, dryRun: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Backfill de anamneses importadas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recompõe o texto das perguntas das anamneses migradas do Prontuário Verde / OnDoctor.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-[#C9A55B]/20 bg-[#C9A55B]/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A55B]" />
        <p className="text-xs text-[#8A6526]">
          Os imports legados gravaram só os IDs das perguntas (ex.: <code>#73693: Não</code>).
          Cole abaixo um CSV com o texto de cada pergunta. A ferramenta substitui
          <code className="mx-1">#73693:</code> por <code>Pergunta legível (#73693):</code>
          mantendo o ID para auditoria. Sempre rode primeiro o modo de pré-visualização.
        </p>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-[#C9A55B]" /> Mapeamento CSV
          </CardTitle>
          <CardDescription>
            Formato: <code>questionId,questionText</code> — uma linha por pergunta.
            Linhas em branco e cabeçalho são ignoradas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={SAMPLE_CSV}
            rows={10}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <ListChecks className="h-3 w-3" />
              {localPreview.length} {localPreview.length === 1 ? "pergunta" : "perguntas"} no CSV
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setCsvText(SAMPLE_CSV)}
              disabled={isBusy}
            >
              Carregar exemplo
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={runDryRun} disabled={isBusy} className="gap-2">
              {dryRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Pré-visualizar (dry run)
            </Button>
            <Button
              onClick={runApply}
              disabled={isBusy || lastResult?.mode !== "dryRun"}
              variant="default"
              className="gap-2 bg-[#8A6526] hover:bg-[#6B4F1B]"
              title={lastResult?.mode !== "dryRun" ? "Rode o dry-run antes" : "Aplicar no banco"}
            >
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Aplicar no banco
            </Button>
          </div>
        </CardContent>
      </Card>

      <SignatureBackfillSection />

      {lastResult ? (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {lastResult.mode === "applied" ? "Resultado da aplicação" : "Pré-visualização"}
              <Badge variant={lastResult.mode === "applied" ? "default" : "secondary"}>
                {lastResult.mode === "applied" ? "GRAVADO" : "DRY RUN"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Evoluções clínicas</p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">{lastResult.evolutionsUpdated}</span>
                  <span className="text-muted-foreground"> de {lastResult.evolutionsScanned} examinadas</span>
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Anamneses (share links)</p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">{lastResult.anamnesesUpdated}</span>
                  <span className="text-muted-foreground"> de {lastResult.anamnesesScanned} examinadas</span>
                </p>
              </div>
            </div>

            {lastResult.sampleBefore ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Amostra do antes / depois (primeiros 240 chars)</p>
                <div className="rounded border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                  <span className="text-rose-700">- </span>{String(lastResult.sampleBefore).slice(0, 600)}
                </div>
                <div className="rounded border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap">
                  <span className="text-emerald-700">+ </span>{String(lastResult.sampleAfter).slice(0, 600)}
                </div>
              </div>
            ) : null}

            {Array.isArray(lastResult.unmappedIds) && lastResult.unmappedIds.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  IDs sem texto correspondente no CSV (primeiros 50)
                </p>
                <p className="mt-1 text-xs font-mono break-all text-muted-foreground">
                  {lastResult.unmappedIds.join(", ")}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SignatureBackfillSection() {
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<any>(null);
  const dryRunMutation = trpc.admin.backfillOnDoctorSignatures.useMutation({
    onSuccess: (data) => {
      setResult({ ...data, mode: "dryRun" });
      toast.success(`Pré-visualização: ${data.matchedInGlutec} de ${data.rowsMarkedSigned} assinaturas casadas com a base.`);
    },
    onError: (err) => toast.error(err.message),
  });
  const applyMutation = trpc.admin.backfillOnDoctorSignatures.useMutation({
    onSuccess: (data) => {
      setResult({ ...data, mode: "applied" });
      toast.success(`${data.updated} registros atualizados com a assinatura digital.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const isBusy = dryRunMutation.isPending || applyMutation.isPending;

  const runDryRun = () => {
    if (!csvText.trim()) {
      toast.error("Cole o conteúdo do FORMULARIO_CLIENTE.csv (separado por ;).");
      return;
    }
    dryRunMutation.mutate({ csv: csvText, dryRun: true });
  };

  const runApply = () => {
    if (!csvText.trim()) {
      toast.error("Cole o CSV antes de aplicar.");
      return;
    }
    if (!window.confirm(
      "Aplicar dados de assinatura digital nas anamneses do OnDoctor? Esta ação grava no banco.",
    )) return;
    applyMutation.mutate({ csv: csvText, dryRun: false });
  };

  return (
    <>
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-[#C9A55B]" />
            Importar assinaturas digitais (OnDoctor)
          </CardTitle>
          <CardDescription>
            Cole abaixo o conteúdo de <code>FORMULARIO_CLIENTE.csv</code> (do backup OnDoctor).
            Para cada linha com <code>assinado_paciente=True</code> casamos pelo campo <code>id</code>
            com o registro importado em <code>medical_records</code> e gravamos
            <code className="mx-1">signedAt</code>, <code>signatureHash</code>,
            <code className="mx-1">signedPdfUrl</code>, <code>d4signDocumentKey</code>
            e marcamos <code>status=&apos;assinado&apos;</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="id;id_empresa;id_cliente;id_formulario;…;link_assinatura_paciente;id_documento_assinatura;assinado_paciente;arquivo;…"
            rows={10}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runDryRun} disabled={isBusy} className="gap-2" variant="outline">
              {dryRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Pré-visualizar (dry run)
            </Button>
            <Button
              onClick={runApply}
              disabled={isBusy || result?.mode !== "dryRun"}
              className="gap-2 bg-[#8A6526] hover:bg-[#6B4F1B]"
              title={result?.mode !== "dryRun" ? "Rode o dry-run antes" : "Aplicar no banco"}
            >
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Aplicar no banco
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {result.mode === "applied" ? "Resultado das assinaturas aplicadas" : "Pré-visualização das assinaturas"}
              <Badge variant={result.mode === "applied" ? "default" : "secondary"}>
                {result.mode === "applied" ? "GRAVADO" : "DRY RUN"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Linhas no CSV</p>
                <p className="mt-1 text-lg font-semibold">{result.totalRows}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Marcadas assinadas</p>
                <p className="mt-1 text-lg font-semibold">{result.rowsMarkedSigned}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Casadas no Glutec</p>
                <p className="mt-1 text-lg font-semibold">{result.matchedInGlutec}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Atualizadas</p>
                <p className="mt-1 text-lg font-semibold">{result.updated}</p>
              </div>
            </div>

            {Array.isArray(result.sampleMatched) && result.sampleMatched.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Amostra de casamentos (primeiros 5)</p>
                <div className="mt-1 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 text-left">OnDoctor id</th>
                        <th className="py-1 pr-3 text-left">medical_records.id</th>
                        <th className="py-1 pr-3 text-left">arquivo</th>
                        <th className="py-1 pr-3 text-left">signedAt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.sampleMatched.map((item: any) => (
                        <tr key={item.targetId} className="border-t border-border/30">
                          <td className="py-1 pr-3 font-mono">{item.sourceId}</td>
                          <td className="py-1 pr-3 font-mono">{item.targetId}</td>
                          <td className="py-1 pr-3">{item.arquivo}</td>
                          <td className="py-1 pr-3">{item.signedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {Array.isArray(result.unmatchedSourceIds) && result.unmatchedSourceIds.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  IDs sem correspondência no Glutec (primeiros 50)
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {result.unmatchedSourceIds.join(", ")}
                </p>
              </div>
            ) : null}

            {Array.isArray(result.errors) && result.errors.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-rose-700">Erros</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-rose-700">
                  {result.errors.slice(0, 10).map((err: string, idx: number) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
