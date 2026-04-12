import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Settings,
  Building2,
  MapPin,
  Calculator,
  FileText,
  Save,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Zap,
} from "lucide-react";

/** Formata alíquota do banco (19.4000) para exibição pt-BR: "19,40" */
function formatAliquota(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const num = parseFloat(String(value).replace(",", "."));
  if (!isFinite(num)) return "";
  return num.toFixed(2).replace(".", ",");
}

export default function ConfiguracoesFiscaisPage() {
  const { data: fiscal, isLoading, refetch } = trpc.fiscal.get.useQuery();

  const upsertMutation = trpc.fiscal.upsert.useMutation({
    onSuccess: () => {
      toast.success("Configurações fiscais salvas com sucesso!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    telefone: "",
    email: "",
    cep: "",
    municipio: "Mogi Guaçu",
    uf: "SP",
    bairro: "",
    logradouro: "",
    numero: "",
    complemento: "",
    optanteSimplesNacional: true,
    regimeApuracao: "Simples Nacional",
    codigoTributacaoNacional: "04.03.03",
    descricaoTributacao: "Clínicas, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres",
    itemNbs: "123012100",
    descricaoNbs: "Serviços de clínica médica",
    aliquotaSimplesNacional: "18,63",
    aliquotaIss: "",
    municipioIncidencia: "Mogi Guaçu",
    ufIncidencia: "SP",
    descricaoServicoPadrao: "Procedimentos Médicos Ambulatoriais",
    textoLegalFixo: "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS",
    ambiente: "homologacao" as "homologacao" | "producao",
  });

  // Preencher formulário com dados do banco
  useEffect(() => {
    if (fiscal) {
      setForm({
        cnpj: fiscal.cnpj || "",
        razaoSocial: fiscal.razaoSocial || "",
        nomeFantasia: fiscal.nomeFantasia || "",
        telefone: fiscal.telefone || "",
        email: fiscal.email || "",
        cep: fiscal.cep || "",
        municipio: fiscal.municipio || "Mogi Guaçu",
        uf: fiscal.uf || "SP",
        bairro: fiscal.bairro || "",
        logradouro: fiscal.logradouro || "",
        numero: fiscal.numero || "",
        complemento: fiscal.complemento || "",
        optanteSimplesNacional: fiscal.optanteSimplesNacional ?? true,
        regimeApuracao: fiscal.regimeApuracao || "Simples Nacional",
        codigoTributacaoNacional: fiscal.codigoTributacaoNacional || "04.03.03",
        descricaoTributacao: fiscal.descricaoTributacao || "",
        itemNbs: fiscal.itemNbs || "123012100",
        descricaoNbs: fiscal.descricaoNbs || "Serviços de clínica médica",
        aliquotaSimplesNacional: formatAliquota(fiscal.aliquotaSimplesNacional) || "18,63",
        aliquotaIss: formatAliquota(fiscal.aliquotaIss),
        municipioIncidencia: fiscal.municipioIncidencia || "Mogi Guaçu",
        ufIncidencia: fiscal.ufIncidencia || "SP",
        descricaoServicoPadrao: fiscal.descricaoServicoPadrao || "Procedimentos Médicos Ambulatoriais",
        textoLegalFixo: fiscal.textoLegalFixo || "",
        ambiente: (fiscal.ambiente as any) || "homologacao",
      });
    }
  }, [fiscal]);

  const handleSave = () => {
    if (!form.cnpj || !form.razaoSocial) {
      toast.error("CNPJ e Razão Social são obrigatórios.");
      return;
    }
    upsertMutation.mutate(form);
  };

  // Buscar CEP
  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm({
          ...form,
          cep: cleanCep,
          municipio: data.localidade || "",
          uf: data.uf || "",
          bairro: data.bairro || "",
          logradouro: data.logradouro || "",
        });
      }
    } catch { /* silently fail */ }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Configurações Fiscais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dados do emitente e configuração tributária para emissão de NFS-e
          </p>
        </div>
        <Button onClick={handleSave} disabled={upsertMutation.isPending} className="btn-gold-gradient">
          {upsertMutation.isPending ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>

      {/* Ambiente */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#C9A55B]" />
            Ambiente de Emissão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setForm({ ...form, ambiente: "homologacao" })}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.ambiente === "homologacao"
                  ? "border-yellow-400 bg-yellow-50"
                  : "border-gray-200 bg-white hover:border-yellow-300"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm">Homologação (Testes)</h3>
                {form.ambiente === "homologacao" && <Badge className="bg-yellow-100 text-yellow-700">Ativo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">NFS-es emitidas aqui NÃO têm valor fiscal.</p>
            </div>
            <div
              onClick={() => setForm({ ...form, ambiente: "producao" })}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                form.ambiente === "producao"
                  ? "border-[#C9A55B]/40 bg-green-50"
                  : "border-gray-200 bg-white hover:border-[#C9A55B]/30"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-sm">Produção (Real)</h3>
                {form.ambiente === "producao" && <Badge className="bg-[#C9A55B]/15 text-[#6B5B2A]">Ativo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">NFS-es emitidas aqui TÊM valor fiscal real.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dados do Emitente */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Dados do Emitente (Prestador)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">CNPJ *</Label>
              <Input
                className="mt-1"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Razão Social *</Label>
              <Input
                className="mt-1"
                value={form.razaoSocial}
                onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Nome Fantasia</Label>
              <Input
                className="mt-1"
                value={form.nomeFantasia}
                onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                className="mt-1"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Endereço
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">CEP</Label>
              <Input
                className="mt-1"
                value={form.cep}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
                onBlur={(e) => fetchCep(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Município</Label>
              <Input className="mt-1" value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Input className="mt-1" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} maxLength={2} />
            </div>
            <div>
              <Label className="text-xs">Bairro</Label>
              <Input className="mt-1" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Logradouro</Label>
              <Input className="mt-1" value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Número</Label>
                <Input className="mt-1" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Complemento</Label>
                <Input className="mt-1" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tributação */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Configuração Tributária
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded">
            <Switch
              checked={form.optanteSimplesNacional}
              onCheckedChange={(v) => setForm({ ...form, optanteSimplesNacional: v })}
            />
            <div>
              <p className="text-sm font-medium">Optante pelo Simples Nacional</p>
              <p className="text-xs text-muted-foreground">ME/EPP - Microempresa ou Empresa de Pequeno Porte</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Regime de Apuração</Label>
              <Input
                className="mt-1"
                value={form.regimeApuracao}
                onChange={(e) => setForm({ ...form, regimeApuracao: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Código de Tributação Nacional</Label>
              <Input
                className="mt-1"
                value={form.codigoTributacaoNacional}
                onChange={(e) => setForm({ ...form, codigoTributacaoNacional: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Descrição da Tributação</Label>
              <Input
                className="mt-1"
                value={form.descricaoTributacao}
                onChange={(e) => setForm({ ...form, descricaoTributacao: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Item NBS</Label>
              <Input
                className="mt-1"
                value={form.itemNbs}
                onChange={(e) => setForm({ ...form, itemNbs: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Descrição NBS</Label>
              <Input
                className="mt-1"
                value={form.descricaoNbs}
                onChange={(e) => setForm({ ...form, descricaoNbs: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Alíquota Simples Nacional (%)</Label>
              <Input
                className="mt-1"
                value={form.aliquotaSimplesNacional}
                onChange={(e) => setForm({ ...form, aliquotaSimplesNacional: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Alíquota ISS (%)</Label>
              <Input
                className="mt-1"
                value={form.aliquotaIss}
                onChange={(e) => setForm({ ...form, aliquotaIss: e.target.value })}
                placeholder="Calculado automaticamente"
              />
            </div>
            <div>
              <Label className="text-xs">Município de Incidência ISSQN</Label>
              <Input
                className="mt-1"
                value={form.municipioIncidencia}
                onChange={(e) => setForm({ ...form, municipioIncidencia: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">UF de Incidência</Label>
              <Input
                className="mt-1"
                value={form.ufIncidencia}
                onChange={(e) => setForm({ ...form, ufIncidencia: e.target.value })}
                maxLength={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Descrição Padrão e Texto Legal */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Descrição Padrão do Serviço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Descrição padrão do serviço</Label>
            <Input
              className="mt-1"
              value={form.descricaoServicoPadrao}
              onChange={(e) => setForm({ ...form, descricaoServicoPadrao: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Esta descrição será usada como padrão em todas as NFS-e emitidas.
            </p>
          </div>
          <div>
            <Label className="text-xs">Texto Legal Fixo</Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={form.textoLegalFixo}
              onChange={(e) => setForm({ ...form, textoLegalFixo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Texto obrigatório incluído automaticamente em todas as NFS-e (ex: não retenção previdenciária).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Botão Salvar (rodapé) */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave} disabled={upsertMutation.isPending} className="btn-gold-gradient" size="lg">
          {upsertMutation.isPending ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
