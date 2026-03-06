import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenLine, Info, ExternalLink, ShieldCheck, Key } from "lucide-react";

export default function Assinaturas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assinatura Eletrônica</h1>
        <p className="text-sm text-muted-foreground mt-1">Integração com certificado digital ICP-Brasil via D4Sign</p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">Configuração necessária</p>
          <p className="text-sm text-blue-700 mt-1">
            Para habilitar a assinatura eletrônica com certificado digital ICP-Brasil, configure as credenciais D4Sign
            nas configurações do sistema. A integração suporta certificados A1 e A3.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />Padrões Suportados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Certificado A1", desc: "Software, armazenado no computador", supported: true },
              { label: "Certificado A3", desc: "Token USB ou cartão inteligente", supported: true },
              { label: "ICP-Brasil", desc: "Padrão nacional de certificação digital", supported: true },
              { label: "Assinatura Simples", desc: "Sem certificado digital", supported: true },
            ].map(({ label, desc, supported }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Badge className={supported ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                  {supported ? "Suportado" : "Não disponível"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />Configuração D4Sign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Para ativar a assinatura eletrônica, você precisará de uma conta D4Sign e as seguintes credenciais:
            </p>
            <div className="space-y-2">
              {[
                { key: "D4SIGN_TOKEN_API", desc: "Token de API da D4Sign" },
                { key: "D4SIGN_CRYPT_KEY", desc: "Chave de criptografia" },
                { key: "D4SIGN_SAFE_KEY", desc: "Chave do cofre de documentos" },
              ].map(({ key, desc }) => (
                <div key={key} className="p-2 rounded bg-muted/50">
                  <p className="text-xs font-mono font-medium">{key}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href="https://d4sign.com.br" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-2" />Acessar D4Sign
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />Documentos para Assinar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <PenLine className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum documento pendente</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Prescrições e pedidos de exames enviados para assinatura aparecerão aqui.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
