import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ExternalLink, Key, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function statusBadgeClass(configured: boolean) {
  return configured
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300";
}

export default function Assinaturas() {
  const statusQuery = trpc.signatures.getIntegrationStatus.useQuery();
  const safesQuery = trpc.signatures.listSafes.useQuery(undefined, { enabled: false });
  const testConnectionQuery = trpc.signatures.testConnection.useQuery(undefined, { enabled: false, retry: false });

  const status = statusQuery.data;
  const safes = safesQuery.data ?? [];

  const runConnectionTest = async () => {
    try {
      const result = await testConnectionQuery.refetch();
      if (result.data?.connected) {
        toast.success(`Conexão com D4Sign validada. ${result.data.safeCount} cofres encontrados.`);
      } else if (result.error) {
        throw result.error;
      }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível validar a conexão com a D4Sign.");
    }
  };

  const loadSafes = async () => {
    try {
      const result = await safesQuery.refetch();
      if (result.error) throw result.error;
      toast.success(`Cofres carregados: ${result.data?.length ?? 0}.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível listar os cofres da D4Sign.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Assinaturas e certificados</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Esta tela agora consulta a integração real da D4Sign, mostrando se as credenciais estão válidas
          e quais cofres da conta estão disponíveis para o sistema da clínica.
        </p>
      </div>

      <Card className="overflow-hidden border-[#C9A55B]/25 bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(255,255,255,0.68))] shadow-[0_18px_45px_rgba(90,63,18,0.12)] dark:bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(18,17,16,0.92))]">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-2xl border border-[#C9A55B]/30 bg-[#C9A55B]/12 p-2.5">
              <ShieldCheck className="h-5 w-5 text-[#C9A55B]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Status atual da integração</p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Use os botões abaixo para testar a conexão da API e listar os cofres reais da sua conta D4Sign.
              </p>
            </div>
          </div>
          <Badge className={statusBadgeClass(Boolean(status?.configured))}>
            {status?.configured ? "Credenciais configuradas" : "Credenciais ausentes"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-premium border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Key className="h-4 w-4 text-[#C9A55B]" />
              Credenciais ativas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">Token API</p>
              <p className="mt-1">{status?.tokenPreview || "Não configurado"}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">Crypt Key</p>
              <p className="mt-1">{status?.cryptKeyPreview || "Não configurado"}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">Origem</p>
              <p className="mt-1">
                {status?.hasClinicToken || status?.hasClinicCryptKey
                  ? "Configuração salva no ambiente da clínica"
                  : status?.hasEnvToken || status?.hasEnvCryptKey
                    ? "Variáveis de ambiente do servidor"
                    : "Sem credenciais ativas"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-premium border-border/70 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-[#C9A55B]" />
              Testes operacionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button variant="premium" size="sm" onClick={runConnectionTest} disabled={testConnectionQuery.isFetching || statusQuery.isLoading}>
                {testConnectionQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Testar conexão
              </Button>
              <Button variant="outline" size="sm" onClick={loadSafes} disabled={safesQuery.isFetching || statusQuery.isLoading}>
                {safesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Listar cofres
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://secure.d4sign.com.br" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir D4Sign
                </a>
              </Button>
            </div>

            {testConnectionQuery.error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {testConnectionQuery.error.message}
              </div>
            ) : null}

            {testConnectionQuery.data?.connected ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Conexão validada em {new Date(testConnectionQuery.data.checkedAt).toLocaleString("pt-BR")}. {testConnectionQuery.data.safeCount} cofres disponíveis.
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
              <p className="text-sm font-semibold text-foreground">URL da API</p>
              <p className="mt-1 text-sm text-muted-foreground">{status?.baseUrl || "https://secure.d4sign.com.br/api/v1"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-premium border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-[#C9A55B]" />
            Cofres disponíveis na conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!safes.length ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-[#C9A55B]/25 bg-[radial-gradient(circle_at_top,rgba(241,215,145,0.16),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.4),rgba(255,255,255,0.08))] px-6 py-10 text-center dark:bg-[radial-gradient(circle_at_top,rgba(201,165,91,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
              <AlertTriangle className="mb-4 h-6 w-6 text-[#C9A55B]" />
              <p className="text-sm font-semibold text-foreground">Nenhum cofre listado ainda</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Clique em <strong>Listar cofres</strong> para consultar a conta D4Sign em tempo real.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {safes.map((safe: any) => (
                <div key={safe.uuid_safe} className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                  <p className="text-sm font-semibold text-foreground">{safe["name-safe"]}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{safe.uuid_safe}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
