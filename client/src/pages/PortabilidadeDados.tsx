import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download, FileLock2, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** power;
  return `${value.toFixed(value >= 10 || power === 0 ? 0 : 1)} ${units[power]}`;
}

export default function PortabilidadeDados() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [confirmExportPassword, setConfirmExportPassword] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [includeFiles, setIncludeFiles] = useState(true);
  const [reason, setReason] = useState("");
  const [lastResult, setLastResult] = useState<any | null>(null);

  const exportMutation = trpc.admin.generateSystemExport.useMutation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (exportPassword.length < 12) {
      toast.error("A senha de exportação precisa ter pelo menos 12 caracteres.");
      return;
    }

    if (exportPassword !== confirmExportPassword) {
      toast.error("A confirmação da senha de exportação não confere.");
      return;
    }

    try {
      const result = await exportMutation.mutateAsync({
        currentPassword,
        exportPassword,
        includeFiles,
        reason: reason || undefined,
        securityCode: securityCode || undefined,
      });

      setLastResult(result);
      const response = await fetch(result.downloadUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error("O pacote foi gerado, mas o download falhou.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);

      toast.success("Pacote de portabilidade gerado e baixado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar os dados.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portabilidade de dados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Exporte sua base completa em pacote criptografado para futura migração.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/relatorios">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos relatórios
          </Link>
        </Button>
      </div>

      <Card className="border-[#C9A55B]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-[#C9A55B]" />
            Como funciona
          </CardTitle>
          <CardDescription>
            O sistema gera um arquivo criptografado, temporário e auditável. Sem a senha de exportação, o conteúdo não pode ser lido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Informe sua senha atual para confirmar que é você.</p>
          <p>2. Se sua conta usa 2FA, informe também o código do autenticador.</p>
          <p>3. Defina uma senha exclusiva para o pacote de exportação. Não reutilize a senha do login.</p>
          <p>4. Guarde o arquivo exportado e a senha em locais separados. Os dois serão necessários numa migração futura.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileLock2 className="h-4 w-4 text-[#C9A55B]" />
            Gerar pacote seguro
          </CardTitle>
          <CardDescription>
            A conta conectada é {user?.email || "administrador"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha atual do sistema</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityCode">Código do autenticador</Label>
                <Input
                  id="securityCode"
                  inputMode="numeric"
                  placeholder="Obrigatório se o 2FA estiver ativo"
                  value={securityCode}
                  onChange={(event) => setSecurityCode(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exportPassword">Senha do pacote de exportação</Label>
                <Input
                  id="exportPassword"
                  type="password"
                  value={exportPassword}
                  onChange={(event) => setExportPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmExportPassword">Confirmar senha do pacote</Label>
                <Input
                  id="confirmExportPassword"
                  type="password"
                  value={confirmExportPassword}
                  onChange={(event) => setConfirmExportPassword(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo da exportação</Label>
              <Textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex.: migração para outro sistema, backup externo controlado, auditoria interna."
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm">
              <Checkbox checked={includeFiles} onCheckedChange={(value) => setIncludeFiles(Boolean(value))} />
              <span>Incluir anexos, imagens, vídeos e uploads protegidos no pacote</span>
            </label>

            <Button type="submit" disabled={exportMutation.isPending} className="rounded-xl">
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando exportação segura...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Gerar e baixar pacote
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {lastResult ? (
        <Card className="border-[#C9A55B]/20">
          <CardHeader>
            <CardTitle className="text-base">Último pacote gerado</CardTitle>
            <CardDescription>Disponível temporariamente para download controlado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <p><strong>Arquivo:</strong> {lastResult.fileName}</p>
            <p><strong>Expira em:</strong> {new Date(lastResult.expiresAt).toLocaleString("pt-BR")}</p>
            <p><strong>Tabelas:</strong> {lastResult.tableCount}</p>
            <p><strong>Registros:</strong> {lastResult.rowCount}</p>
            <p><strong>Arquivos anexos:</strong> {lastResult.fileCount}</p>
            <p><strong>Tamanho:</strong> {formatBytes(lastResult.fileSizeBytes)}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
