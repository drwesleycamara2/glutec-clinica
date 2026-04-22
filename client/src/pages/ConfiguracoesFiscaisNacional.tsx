import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Globe,
  MapPin,
  Save,
  Settings,
  Shield,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

type Ambiente = "homologacao" | "producao";

/** Formata alíquota do banco (19.4000) para exibição pt-BR: "19,40" */
function formatAliquota(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const num = parseFloat(String(value).replace(",", "."));
  if (!isFinite(num)) return "";
  return num.toFixed(2).replace(".", ",");
}

type FiscalForm = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoMunicipal: string;
  inscricaoEstadual: string;
  codigoMunicipio: string;
  telefone: string;
  email: string;
  cep: string;
  municipio: string;
  uf: string;
  bairro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  optanteSimplesNacional: boolean;
  regimeApuracao: string;
  codigoTributacaoNacional: string;
  codigoServico: string;
  itemListaServico: string;
  cnaeServico: string;
  descricaoTributacao: string;
  itemNbs: string;
  descricaoNbs: string;
  aliquotaSimplesNacional: string;
  aliquotaIss: string;
  municipioIncidencia: string;
  ufIncidencia: string;
  descricaoServicoPadrao: string;
  textoLegalFixo: string;
  webserviceUrl: string;
  ambiente: Ambiente;
};

const initialForm: FiscalForm = {
  cnpj: "",
  razaoSocial: "",
  nomeFantasia: "",
  inscricaoMunicipal: "",
  inscricaoEstadual: "",
  codigoMunicipio: "",
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
  regimeApuracao: "simples_nacional",
  codigoTributacaoNacional: "4.03.03",
  codigoServico: "",
  itemListaServico: "4.03",
  cnaeServico: "",
  descricaoTributacao: "",
  itemNbs: "",
  descricaoNbs: "",
  aliquotaSimplesNacional: "",
  aliquotaIss: "",
  municipioIncidencia: "Mogi Guaçu",
  ufIncidencia: "SP",
  descricaoServicoPadrao: "Procedimentos médicos ambulatoriais",
  textoLegalFixo: "",
  webserviceUrl: "",
  ambiente: "homologacao",
};

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ConfiguracoesFiscaisNacional() {
  const [, navigate] = useLocation();
  const { data: fiscal, isLoading, refetch } = trpc.fiscal.get.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FiscalForm>(initialForm);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");

  const upsertMutation = trpc.fiscal.upsert.useMutation({
    onSuccess: () => {
      toast.success("Configurações fiscais salvas com sucesso.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadCertificateMutation = trpc.fiscal.uploadCertificate.useMutation({
    onSuccess: () => {
      toast.success("Certificado A1 salvo com sucesso.");
      setCertificateFile(null);
      setCertificatePassword("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const testApiMutation = trpc.fiscal.testNationalApi.useMutation({
    onSuccess: (data) => toast.success(data.message || "Conexão com a API nacional realizada."),
    onError: (err) => toast.error(err.message),
  });

  const syncMunicipalMutation = trpc.fiscal.syncMunicipalParameters.useMutation({
    onSuccess: () => {
      toast.success("Parâmetros municipais sincronizados.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!fiscal) return;

    setForm({
      cnpj: fiscal.cnpj || "",
      razaoSocial: fiscal.razaoSocial || "",
      nomeFantasia: fiscal.nomeFantasia || "",
      inscricaoMunicipal: fiscal.inscricaoMunicipal || "",
      inscricaoEstadual: fiscal.inscricaoEstadual || "",
      codigoMunicipio: fiscal.codigoMunicipio || "",
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
      regimeApuracao: fiscal.regimeApuracao || "simples_nacional",
      codigoTributacaoNacional: fiscal.codigoTributacaoNacional || "",
      codigoServico: fiscal.codigoServico || "",
      itemListaServico: fiscal.itemListaServico || "",
      cnaeServico: fiscal.cnaeServico || "",
      descricaoTributacao: fiscal.descricaoTributacao || "",
      itemNbs: fiscal.itemNbs || "",
      descricaoNbs: fiscal.descricaoNbs || "",
      aliquotaSimplesNacional: formatAliquota(fiscal.aliquotaSimplesNacional),
      aliquotaIss: formatAliquota(fiscal.aliquotaIss),
      municipioIncidencia: fiscal.municipioIncidencia || fiscal.municipio || "Mogi Guaçu",
      ufIncidencia: fiscal.ufIncidencia || fiscal.uf || "SP",
      descricaoServicoPadrao: fiscal.descricaoServicoPadrao || "Procedimentos médicos ambulatoriais",
      textoLegalFixo: fiscal.textoLegalFixo || "",
      webserviceUrl: fiscal.webserviceUrl || "",
      ambiente: (fiscal.ambiente as Ambiente) || "homologacao",
    });
  }, [fiscal]);

  const setField = <K extends keyof FiscalForm>(field: K, value: FiscalForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    if (!form.cnpj || !form.razaoSocial || !form.codigoMunicipio) {
      toast.error("Preencha CNPJ, Razão Social e código IBGE do município.");
      return;
    }

    upsertMutation.mutate(form);
  };

  const handleCertificateUpload = async () => {
    if (!certificateFile || !certificatePassword) {
      toast.error("Selecione o arquivo do certificado e informe a senha.");
      return;
    }

    const fileBase64 = await fileToBase64(certificateFile);
    uploadCertificateMutation.mutate({
      fileName: certificateFile.name,
      mimeType: certificateFile.type || "application/x-pkcs12",
      fileBase64,
      password: certificatePassword,
    });
  };

  const fetchCep = async (cep: string) => {
    const normalized = cep.replace(/\D/g, "");
    if (normalized.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
      const data = await response.json();
      if (data?.erro) return;

      setForm((current) => ({
        ...current,
        cep: normalized,
        municipio: data.localidade || current.municipio,
        uf: data.uf || current.uf,
        bairro: data.bairro || current.bairro,
        logradouro: data.logradouro || current.logradouro,
      }));
    } catch {
      toast.error("Não foi possível consultar o CEP agora.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Settings className="h-6 w-6 text-primary" />
            Configurações fiscais
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados do emitente, certificado A1 e integração oficial com a API nacional da NFS-e.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => navigate("/nfse")}>
            <FileText className="mr-2 h-4 w-4" />
            Emitir nota
          </Button>
          <Button
            variant="outline"
            onClick={() => syncMunicipalMutation.mutate({ ambiente: form.ambiente })}
            disabled={syncMunicipalMutation.isPending}
          >
            <Globe className="mr-2 h-4 w-4" />
            Sincronizar município
          </Button>
          <Button
            variant="outline"
            onClick={() => testApiMutation.mutate({ ambiente: form.ambiente })}
            disabled={testApiMutation.isPending}
          >
            <Zap className="mr-2 h-4 w-4" />
            Testar API
          </Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending} className="btn-gold-gradient">
            <Save className="mr-2 h-4 w-4" />
            Salvar configurações
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" />
            Status da integração
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ambiente</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge className={form.ambiente === "producao" ? "bg-[#C9A55B]/15 text-[#6B5B2A]" : "bg-yellow-100 text-yellow-700"}>
                {form.ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Certificado A1</p>
            <div className="mt-2 flex items-center gap-2">
              {fiscal?.certificadoConfigurado ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">Configurado no sistema</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium">Ainda não enviado</span>
                </>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Endpoint da API</p>
            <p className="mt-2 break-all text-sm">
              {form.webserviceUrl || "Usando endpoint padrão do ambiente nacional"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            Ambiente de emissão
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setField("ambiente", "homologacao")}
            className={`rounded-lg border-2 p-4 text-left transition ${
              form.ambiente === "homologacao"
                ? "border-yellow-400 bg-yellow-50"
                : "border-border bg-background hover:border-yellow-300"
            }`}
          >
            <p className="font-medium">Homologação</p>
            <p className="mt-1 text-sm text-muted-foreground">Use para testar certificado, conexão e emissão sem valor fiscal.</p>
          </button>
          <button
            type="button"
            onClick={() => setField("ambiente", "producao")}
            className={`rounded-lg border-2 p-4 text-left transition ${
              form.ambiente === "producao"
                ? "border-[#C9A55B]/40 bg-emerald-50"
                : "border-border bg-background hover:border-[#C9A55B]/30"
            }`}
          >
            <p className="font-medium">Produção</p>
            <p className="mt-1 text-sm text-muted-foreground">Use apenas após validar a homologação e conferir a parametrização real do município.</p>
          </button>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            Dados do emitente
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs">CNPJ</Label>
            <Input className="mt-1" value={form.cnpj} onChange={(e) => setField("cnpj", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Razão social</Label>
            <Input className="mt-1" value={form.razaoSocial} onChange={(e) => setField("razaoSocial", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Nome fantasia</Label>
            <Input className="mt-1" value={form.nomeFantasia} onChange={(e) => setField("nomeFantasia", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Inscrição municipal</Label>
            <Input className="mt-1" value={form.inscricaoMunicipal} onChange={(e) => setField("inscricaoMunicipal", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Inscrição estadual</Label>
            <Input className="mt-1" value={form.inscricaoEstadual} onChange={(e) => setField("inscricaoEstadual", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Código IBGE do município</Label>
            <Input className="mt-1" value={form.codigoMunicipio} onChange={(e) => setField("codigoMunicipio", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input className="mt-1" value={form.telefone} onChange={(e) => setField("telefone", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">E-mail</Label>
            <Input className="mt-1" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" />
            Endereço do prestador
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-xs">CEP</Label>
            <Input className="mt-1" value={form.cep} onChange={(e) => setField("cep", e.target.value)} onBlur={(e) => fetchCep(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Município</Label>
            <Input className="mt-1" value={form.municipio} onChange={(e) => setField("municipio", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">UF</Label>
            <Input className="mt-1" maxLength={2} value={form.uf} onChange={(e) => setField("uf", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input className="mt-1" value={form.bairro} onChange={(e) => setField("bairro", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Logradouro</Label>
            <Input className="mt-1" value={form.logradouro} onChange={(e) => setField("logradouro", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Número</Label>
              <Input className="mt-1" value={form.numero} onChange={(e) => setField("numero", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Complemento</Label>
              <Input className="mt-1" value={form.complemento} onChange={(e) => setField("complemento", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Tributação e integração nacional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
            <Switch checked={form.optanteSimplesNacional} onCheckedChange={(checked) => setField("optanteSimplesNacional", checked)} />
            <div>
              <p className="text-sm font-medium">Optante pelo Simples Nacional</p>
              <p className="text-xs text-muted-foreground">Use conforme o enquadramento tributário real da empresa.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs">Regime de apuração</Label>
              <Input className="mt-1" value={form.regimeApuracao} onChange={(e) => setField("regimeApuracao", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Código de tributação nacional</Label>
              <Input className="mt-1" value={form.codigoTributacaoNacional} onChange={(e) => setField("codigoTributacaoNacional", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Código do serviço <span className="text-muted-foreground">(opcional)</span></Label>
              <Input className="mt-1" value={form.codigoServico} onChange={(e) => setField("codigoServico", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Item da lista de serviços</Label>
              <Input className="mt-1" value={form.itemListaServico} onChange={(e) => setField("itemListaServico", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">CNAE do serviço</Label>
              <Input className="mt-1" value={form.cnaeServico} onChange={(e) => setField("cnaeServico", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Alíquota ISS (%) <span className="text-muted-foreground">(opcional)</span></Label>
              <Input className="mt-1" value={form.aliquotaIss} onChange={(e) => setField("aliquotaIss", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Alíquota Simples Nacional (%)</Label>
              <Input className="mt-1" value={form.aliquotaSimplesNacional} onChange={(e) => setField("aliquotaSimplesNacional", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Município de incidência</Label>
              <Input className="mt-1" value={form.municipioIncidencia} onChange={(e) => setField("municipioIncidencia", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">UF de incidência</Label>
              <Input className="mt-1" maxLength={2} value={form.ufIncidencia} onChange={(e) => setField("ufIncidencia", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Descrição da tributação</Label>
              <Input className="mt-1" value={form.descricaoTributacao} onChange={(e) => setField("descricaoTributacao", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Item NBS</Label>
              <Input className="mt-1" value={form.itemNbs} onChange={(e) => setField("itemNbs", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Descrição NBS</Label>
              <Input className="mt-1" value={form.descricaoNbs} onChange={(e) => setField("descricaoNbs", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Endpoint customizado da API</Label>
              <Input className="mt-1" placeholder="Opcional. Se vazio, o sistema usa o endpoint oficial do ambiente." value={form.webserviceUrl} onChange={(e) => setField("webserviceUrl", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" />
            Certificado A1 da clínica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[#C9A55B]/25 bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(255,255,255,0.7))] p-4 text-sm dark:bg-[linear-gradient(135deg,rgba(201,165,91,0.12),rgba(18,17,16,0.92))]">
            Esse certificado é usado para autenticação TLS e emissão oficial da NFS-e nacional pelo backend.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs">Arquivo do certificado (.pfx ou .p12)</Label>
              <Input className="mt-1" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <Label className="text-xs">Senha do certificado</Label>
              <Input className="mt-1" type="password" value={certificatePassword} onChange={(e) => setCertificatePassword(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCertificateUpload} disabled={uploadCertificateMutation.isPending} className="btn-gold-gradient">
              <Upload className="mr-2 h-4 w-4" />
              Enviar certificado
            </Button>
            {fiscal?.certificadoConfigurado ? <Badge className="bg-emerald-100 text-emerald-700">Certificado salvo</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Descrição padrão da NFS-e
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Descrição padrão do serviço</Label>
            <Input className="mt-1" value={form.descricaoServicoPadrao} onChange={(e) => setField("descricaoServicoPadrao", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Texto legal fixo</Label>
            <Textarea className="mt-1" rows={5} value={form.textoLegalFixo} onChange={(e) => setField("textoLegalFixo", e.target.value)} />
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-4 text-sm">
            A descrição da NFS-e seguirá apenas o texto padrão do serviço e o texto legal fixo configurado abaixo.
          </div>
          <div className="rounded-lg border border-[#C9A55B]/20 bg-[#C9A55B]/8 p-4 text-sm text-muted-foreground">
            Se o portal nacional da sua prefeitura não exigir esses campos no preenchimento manual, você pode manter código do serviço e alíquota de ISS em branco no sistema.
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={upsertMutation.isPending} className="btn-gold-gradient" size="lg">
          <Save className="mr-2 h-4 w-4" />
          Salvar configurações fiscais
        </Button>
      </div>
    </div>
  );
}
