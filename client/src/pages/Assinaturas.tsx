import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Key,
  PenLine,
  ShieldCheck,
} from "lucide-react";

const readinessItems = [
  {
    title: "Credenciais e cofres D4Sign",
    status: "Parcial",
    tone: "warning",
    description:
      "O backend ja possui servico centralizado, selecao de cofres e suporte a token e chave criptografica.",
  },
  {
    title: "Fluxo transacional no sistema",
    status: "Pendente",
    tone: "danger",
    description:
      "As telas ainda usam trechos demonstrativos. Envio real, acompanhamento de status e download assinado nao estao fechados de ponta a ponta.",
  },
  {
    title: "ICP-Brasil A1 e A3",
    status: "Dependente",
    tone: "neutral",
    description:
      "A arquitetura contempla esse cenario via D4Sign, mas eu nao encontrei validacao operacional completa para afirmar que A1 e A3 ja estao prontos.",
  },
];

const integrationChecklist = [
  "Configurar credenciais validas do D4Sign sem valores de fallback.",
  "Ligar contratos, termos e documentos do sistema ao envio real.",
  "Persistir status, chave do documento, signatarios e trilha de auditoria.",
  "Homologar A1 e A3 com certificados reais antes de liberar para uso clinico.",
];

function badgeClass(tone: string) {
  if (tone === "danger") {
    return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  if (tone === "warning") {
    return "border-[#C9A55B]/25 bg-[#C9A55B]/12 text-[#8A6526] dark:text-[#F1D791]";
  }

  return "border-border/60 bg-muted/60 text-foreground";
}

export default function Assinaturas() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Assinaturas e certificados</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Esta area agora separa com clareza o que ja existe no codigo do que ainda precisa de
          homologacao real. Ha base tecnica para D4Sign, mas o fluxo clinico completo com
          assinatura eletronica e ICP-Brasil ainda precisa ser fechado antes de ser tratado como pronto.
        </p>
      </div>

      <Card className="overflow-hidden border-[#C9A55B]/25 bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(255,255,255,0.68))] shadow-[0_18px_45px_rgba(90,63,18,0.12)] dark:bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(18,17,16,0.92))]">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-2xl border border-[#C9A55B]/30 bg-[#C9A55B]/12 p-2.5">
              <AlertTriangle className="h-5 w-5 text-[#C9A55B]" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Status de liberacao em producao</p>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                A interface antiga fazia essa integracao parecer mais pronta do que realmente estava.
                Agora a pagina mostra o nivel de maturidade correto para evitar uso clinico antes da hora.
              </p>
            </div>
          </div>
          <Badge className="w-fit border-[#C9A55B]/25 bg-[#C9A55B]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#8A6526] dark:text-[#F1D791]">
            Homologacao pendente
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {readinessItems.map(item => (
          <Card key={item.title} className="card-premium border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-start justify-between gap-3 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#C9A55B]" />
                  {item.title}
                </span>
                <Badge className={badgeClass(item.tone)}>{item.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="card-premium border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Key className="h-4 w-4 text-[#C9A55B]" />
              Configuracao necessaria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Para liberar assinatura digital com trilha de auditoria confiavel, a clinica precisa
              informar credenciais validas e homologar os cofres corretos para prontuario, contratos,
              termos e documentos fiscais.
            </p>
            <div className="grid gap-2">
              {[
                ["D4SIGN_TOKEN_API", "Token principal de autenticacao da API."],
                ["D4SIGN_CRYPT_KEY", "Chave criptografica utilizada pelo D4Sign."],
                ["D4SIGN_SAFE_KEY", "Cofre padrao para documentos gerais."],
              ].map(([keyName, description]) => (
                <div
                  key={keyName}
                  className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                    {keyName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="premium" size="sm" asChild>
                <a href="https://d4sign.com.br" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir D4Sign
                </a>
              </Button>
              <Button variant="outline" size="sm">
                Revisar cofres e documentos
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-premium border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="h-4 w-4 text-[#C9A55B]" />
              O que ainda falta fechar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrationChecklist.map(item => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A55B]" />
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="card-premium border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <PenLine className="h-4 w-4 text-[#C9A55B]" />
            Documentos pendentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-[#C9A55B]/25 bg-[radial-gradient(circle_at_top,rgba(241,215,145,0.16),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.4),rgba(255,255,255,0.08))] px-6 py-10 text-center dark:bg-[radial-gradient(circle_at_top,rgba(201,165,91,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
            <div className="mb-4 rounded-2xl border border-[#C9A55B]/25 bg-[#C9A55B]/10 p-3">
              <PenLine className="h-6 w-6 text-[#C9A55B]" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nenhum documento aguardando assinatura</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Assim que o fluxo real com D4Sign for fechado, esta area deve listar contratos,
              prescricoes, termos e documentos enviados para assinatura, com status, signatarios
              e comprovante final.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
