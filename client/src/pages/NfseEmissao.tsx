import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Receipt,
  Users,
  FileText,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  Eye,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Building2,
  MapPin,
  Calculator,
  Send,
  Clock,
  FileCheck,
  Printer,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/[^\d,]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-yellow-100 text-yellow-800" },
  emitida: { label: "Emitida", color: "bg-green-100 text-green-800" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-800" },
  substituida: { label: "Substituída", color: "bg-blue-100 text-blue-800" },
  erro: { label: "Erro", color: "bg-red-100 text-red-800" },
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NfseForm {
  // Etapa 1 - Pessoas
  dataCompetencia: string;
  tomadorDocumento: string;
  tomadorTipoDocumento: "cpf" | "cnpj";
  tomadorNome: string;
  tomadorEmail: string;
  tomadorTelefone: string;
  tomadorCep: string;
  tomadorMunicipio: string;
  tomadorUf: string;
  tomadorBairro: string;
  tomadorLogradouro: string;
  tomadorNumero: string;
  tomadorComplemento: string;
  patientId?: number;
  // Etapa 2 - Serviço
  descricaoServico: string;
  complementoDescricao: string;
  // Etapa 3 - Valores
  valorServico: string;
  valorDeducao: string;
  valorDescontoIncondicionado: string;
  formaPagamento: string;
  detalhesPagamento: string;
  // Controle
  ambiente: "homologacao" | "producao";
}

const initialForm: NfseForm = {
  dataCompetencia: new Date().toISOString().split("T")[0],
  tomadorDocumento: "",
  tomadorTipoDocumento: "cpf",
  tomadorNome: "",
  tomadorEmail: "",
  tomadorTelefone: "",
  tomadorCep: "",
  tomadorMunicipio: "",
  tomadorUf: "",
  tomadorBairro: "",
  tomadorLogradouro: "",
  tomadorNumero: "",
  tomadorComplemento: "",
  descricaoServico: "Procedimentos Médicos Ambulatoriais",
  complementoDescricao: "",
  valorServico: "",
  valorDeducao: "",
  valorDescontoIncondicionado: "",
  formaPagamento: "pix",
  detalhesPagamento: "",
  ambiente: "homologacao",
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function NfseEmissao() {
  const [activeTab, setActiveTab] = useState<"emitir" | "historico">("emitir");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<NfseForm>({ ...initialForm });
  const [showEmitir, setShowEmitir] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [selectedNfse, setSelectedNfse] = useState<any>(null);
  const [showCancelar, setShowCancelar] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [patientSearch, setPatientSearch] = useState("");

  // Queries
  const { data: fiscalSettings } = trpc.fiscal.get.useQuery();
  const { data: nfseList, isLoading: loadingList, refetch } = trpc.nfse.list.useQuery({});
  const { data: patients } = trpc.patients.list.useQuery({ limit: 500 });

  // Mutations
  const createMutation = trpc.nfse.create.useMutation({
    onSuccess: (data) => {
      toast.success("NFS-e criada como rascunho!");
      refetch();
      setStep(1);
      setForm({ ...initialForm });
      setShowEmitir(true);
      setSelectedNfse(data);
    },
    onError: (err) => toast.error(err.message),
  });

  const emitMutation = trpc.nfse.emit.useMutation({
    onSuccess: (data) => {
      toast.success(`NFS-e emitida com sucesso! Número: ${data.numero}`);
      refetch();
      setShowEmitir(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.nfse.cancel.useMutation({
    onSuccess: () => {
      toast.success("NFS-e cancelada com sucesso!");
      refetch();
      setShowCancelar(false);
      setMotivoCancelamento("");
    },
    onError: (err) => toast.error(err.message),
  });

  // Filtro de pacientes para autocomplete
  const filteredPatients = useMemo(() => {
    if (!patients || !patientSearch) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter((p: any) =>
      p.name?.toLowerCase().includes(q) || p.cpf?.includes(q)
    ).slice(0, 8);
  }, [patients, patientSearch]);

  // Selecionar paciente
  const selectPatient = (patient: any) => {
    setForm({
      ...form,
      tomadorNome: patient.name || "",
      tomadorDocumento: patient.cpf || "",
      tomadorEmail: patient.email || "",
      tomadorTelefone: patient.phone || "",
      tomadorCep: patient.zipCode || "",
      tomadorMunicipio: patient.city || "",
      tomadorUf: patient.state || "",
      tomadorBairro: patient.neighborhood || "",
      tomadorLogradouro: patient.address || "",
      tomadorNumero: "",
      tomadorComplemento: "",
      patientId: patient.id,
    });
    setPatientSearch("");
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
          tomadorCep: cleanCep,
          tomadorMunicipio: data.localidade || "",
          tomadorUf: data.uf || "",
          tomadorBairro: data.bairro || "",
          tomadorLogradouro: data.logradouro || "",
        });
      }
    } catch { /* silently fail */ }
  };

  // Valores calculados
  const valorServicoCents = parseCurrencyInput(form.valorServico);
  const valorDeducaoCents = parseCurrencyInput(form.valorDeducao);
  const valorDescontoCents = parseCurrencyInput(form.valorDescontoIncondicionado);
  const valorLiquido = valorServicoCents - valorDeducaoCents - valorDescontoCents;

  // Validações por etapa
  const isStep1Valid = form.tomadorDocumento.replace(/\D/g, "").length >= 11 && form.tomadorNome.length >= 3 && (form.tomadorEmail || form.tomadorTelefone);
  const isStep2Valid = form.descricaoServico.length >= 5;
  const isStep3Valid = valorServicoCents > 0;

  // Submeter NFS-e
  const handleSubmit = () => {
    createMutation.mutate({
      tomadorDocumento: form.tomadorDocumento.replace(/\D/g, ""),
      tomadorTipoDocumento: form.tomadorTipoDocumento,
      tomadorNome: form.tomadorNome,
      tomadorEmail: form.tomadorEmail || undefined,
      tomadorTelefone: form.tomadorTelefone || undefined,
      tomadorCep: form.tomadorCep || undefined,
      tomadorMunicipio: form.tomadorMunicipio || undefined,
      tomadorUf: form.tomadorUf || undefined,
      tomadorBairro: form.tomadorBairro || undefined,
      tomadorLogradouro: form.tomadorLogradouro || undefined,
      tomadorNumero: form.tomadorNumero || undefined,
      tomadorComplemento: form.tomadorComplemento || undefined,
      patientId: form.patientId,
      descricaoServico: form.descricaoServico,
      complementoDescricao: form.complementoDescricao || undefined,
      valorServico: valorServicoCents,
      valorDeducao: valorDeducaoCents || undefined,
      valorDescontoIncondicionado: valorDescontoCents || undefined,
      formaPagamento: form.formaPagamento as any,
      detalhesPagamento: form.detalhesPagamento || undefined,
      dataCompetencia: form.dataCompetencia || undefined,
      ambiente: form.ambiente,
    });
  };

  // ─── Etapa 1: Pessoas ───────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Data de Competência */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Data de Competência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="date"
            value={form.dataCompetencia}
            onChange={(e) => setForm({ ...form, dataCompetencia: e.target.value })}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">Data em que o serviço foi prestado</p>
        </CardContent>
      </Card>

      {/* Emitente (fixo) */}
      <Card className="border shadow-sm bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Emitente (Prestador)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">CNPJ</p>
              <p className="text-sm font-medium">{fiscalSettings?.cnpj ? formatCpfCnpj(fiscalSettings.cnpj) : "Não configurado"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Razão Social</p>
              <p className="text-sm font-medium">{fiscalSettings?.razaoSocial || "Não configurado"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Município</p>
              <p className="text-sm font-medium">{fiscalSettings?.municipio || "Mogi Guaçu"}/{fiscalSettings?.uf || "SP"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Regime</p>
              <p className="text-sm font-medium">{fiscalSettings?.regimeApuracao || "Simples Nacional"}</p>
            </div>
          </div>
          {!fiscalSettings?.cnpj && (
            <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
              <p className="text-xs text-yellow-800 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Configure os dados fiscais em Configurações Fiscais antes de emitir.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tomador do Serviço */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Tomador do Serviço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buscar paciente */}
          <div className="relative">
            <Label className="text-xs">Buscar paciente cadastrado</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome ou CPF do paciente..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {filteredPatients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredPatients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => selectPatient(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b last:border-0"
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.cpf && <span className="text-muted-foreground ml-2">CPF: {formatCpfCnpj(p.cpf)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo de Documento *</Label>
              <Select value={form.tomadorTipoDocumento} onValueChange={(v) => setForm({ ...form, tomadorTipoDocumento: v as any })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF (Pessoa Física)</SelectItem>
                  <SelectItem value="cnpj">CNPJ (Pessoa Jurídica)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{form.tomadorTipoDocumento === "cpf" ? "CPF" : "CNPJ"} *</Label>
              <Input
                className="mt-1"
                placeholder={form.tomadorTipoDocumento === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                value={form.tomadorDocumento}
                onChange={(e) => setForm({ ...form, tomadorDocumento: formatCpfCnpj(e.target.value) })}
                maxLength={form.tomadorTipoDocumento === "cpf" ? 14 : 18}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Nome Completo / Razão Social *</Label>
              <Input
                className="mt-1"
                placeholder="Nome completo do tomador"
                value={form.tomadorNome}
                onChange={(e) => setForm({ ...form, tomadorNome: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                className="mt-1"
                type="email"
                placeholder="email@exemplo.com"
                value={form.tomadorEmail}
                onChange={(e) => setForm({ ...form, tomadorEmail: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                className="mt-1"
                placeholder="(00) 00000-0000"
                value={form.tomadorTelefone}
                onChange={(e) => setForm({ ...form, tomadorTelefone: e.target.value })}
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Endereço do Tomador
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">CEP</Label>
                <Input
                  className="mt-1"
                  placeholder="00000-000"
                  value={form.tomadorCep}
                  onChange={(e) => setForm({ ...form, tomadorCep: e.target.value })}
                  onBlur={(e) => fetchCep(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Município</Label>
                <Input className="mt-1" value={form.tomadorMunicipio} onChange={(e) => setForm({ ...form, tomadorMunicipio: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input className="mt-1" value={form.tomadorUf} onChange={(e) => setForm({ ...form, tomadorUf: e.target.value })} maxLength={2} />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <Input className="mt-1" value={form.tomadorBairro} onChange={(e) => setForm({ ...form, tomadorBairro: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Logradouro</Label>
                <Input className="mt-1" value={form.tomadorLogradouro} onChange={(e) => setForm({ ...form, tomadorLogradouro: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input className="mt-1" value={form.tomadorNumero} onChange={(e) => setForm({ ...form, tomadorNumero: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Complemento</Label>
                  <Input className="mt-1" value={form.tomadorComplemento} onChange={(e) => setForm({ ...form, tomadorComplemento: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          {!isStep1Valid && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Preencha CPF/CNPJ, nome e pelo menos e-mail ou telefone para continuar.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ─── Etapa 2: Serviço ──────────────────────────────────────────────────────

  const renderStep2 = () => (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Dados do Serviço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Local da Prestação (fixo) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/30 rounded">
            <div>
              <p className="text-xs text-muted-foreground">Local da Prestação</p>
              <p className="text-sm font-medium">Brasil - {fiscalSettings?.municipioIncidencia || "Mogi Guaçu"}/{fiscalSettings?.ufIncidencia || "SP"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Código de Tributação Nacional</p>
              <p className="text-sm font-medium">{fiscalSettings?.codigoTributacaoNacional || "04.03.03"}</p>
              <p className="text-xs text-muted-foreground">{fiscalSettings?.descricaoTributacao || "Clínicas, sanatórios, manicômios, casas de saúde, prontos-socorros, ambulatórios e congêneres"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Item NBS</p>
              <p className="text-sm font-medium">{fiscalSettings?.itemNbs || "123012100"} - {fiscalSettings?.descricaoNbs || "Serviços de clínica médica"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Município de Incidência ISSQN</p>
              <p className="text-sm font-medium">{fiscalSettings?.municipioIncidencia || "Mogi Guaçu"}/{fiscalSettings?.ufIncidencia || "SP"}</p>
            </div>
          </div>

          {/* Descrição do Serviço */}
          <div>
            <Label className="text-xs">Descrição do Serviço *</Label>
            <Input
              className="mt-1"
              value={form.descricaoServico}
              onChange={(e) => setForm({ ...form, descricaoServico: e.target.value })}
              placeholder="Procedimentos Médicos Ambulatoriais"
            />
          </div>

          {/* Complemento */}
          <div>
            <Label className="text-xs">Complemento da Descrição</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={form.complementoDescricao}
              onChange={(e) => setForm({ ...form, complementoDescricao: e.target.value })}
              placeholder="Forma de pagamento (Pix, cartão, financiamento...), parcelas, etc."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Informe a forma de pagamento, número de parcelas, ou detalhes do financiamento.
            </p>
          </div>

          {/* Forma de Pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={form.formaPagamento} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="financiamento">Financiamento</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Detalhes do Pagamento</Label>
              <Input
                className="mt-1"
                value={form.detalhesPagamento}
                onChange={(e) => setForm({ ...form, detalhesPagamento: e.target.value })}
                placeholder="Ex: 3x sem juros, Financiadora Multban..."
              />
            </div>
          </div>

          {/* Texto Legal (somente leitura) */}
          <div className="p-3 bg-blue-50 rounded border border-blue-100">
            <p className="text-xs font-medium text-blue-800 mb-1">Texto Legal (incluído automaticamente)</p>
            <p className="text-xs text-blue-700">
              {fiscalSettings?.textoLegalFixo || "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Etapa 3: Valores e Tributação ──────────────────────────────────────────

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Valores do Serviço */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Valores do Serviço Prestado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Valor do Serviço Prestado (R$) *</Label>
              <Input
                className="mt-1 text-lg font-semibold"
                placeholder="0,00"
                value={form.valorServico}
                onChange={(e) => setForm({ ...form, valorServico: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Dedução (R$)</Label>
              <Input
                className="mt-1"
                placeholder="0,00"
                value={form.valorDeducao}
                onChange={(e) => setForm({ ...form, valorDeducao: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Desconto Incondicionado (R$)</Label>
              <Input
                className="mt-1"
                placeholder="0,00"
                value={form.valorDescontoIncondicionado}
                onChange={(e) => setForm({ ...form, valorDescontoIncondicionado: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <div className="p-3 bg-green-50 rounded border border-green-200 w-full">
                <p className="text-xs text-green-700">Valor Líquido</p>
                <p className="text-lg font-bold text-green-800">{formatCurrency(valorLiquido)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tributação Municipal */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Tributação Municipal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/30 rounded">
            <div>
              <p className="text-xs text-muted-foreground">Tributação ISSQN</p>
              <p className="text-sm font-medium">Operação Tributável</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Regime Especial de Tributação</p>
              <p className="text-sm font-medium">Nenhum</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Retenção ISSQN pelo Tomador</p>
              <p className="text-sm font-medium">Não</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Benefício Municipal</p>
              <p className="text-sm font-medium">Não</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Alíquota, base de cálculo e valor do ISSQN são calculados automaticamente pelo portal.
          </p>
        </CardContent>
      </Card>

      {/* Tributação Federal */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Tributação Federal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/30 rounded">
            <div>
              <p className="text-xs text-muted-foreground">PIS/COFINS</p>
              <p className="text-sm font-medium">Nenhum - Não Retidos</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IRRF</p>
              <p className="text-sm font-medium">R$ 0,00</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contribuições Sociais Retidas</p>
              <p className="text-sm font-medium">R$ 0,00</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contribuição Previdenciária Retida</p>
              <p className="text-sm font-medium">R$ 0,00</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Valor Aproximado dos Tributos */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Valor Aproximado dos Tributos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-amber-50 rounded border border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-700">Alíquota Simples Nacional</p>
                <p className="text-sm font-bold text-amber-800">{fiscalSettings?.aliquotaSimplesNacional || "18,63"}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-amber-700">Valor Aproximado dos Tributos</p>
                <p className="text-sm font-bold text-amber-800">
                  {formatCurrency(Math.round(valorServicoCents * (parseFloat(String(fiscalSettings?.aliquotaSimplesNacional || "18.63").replace(",", ".")) / 100)))}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Etapa 4: Conferência e Emissão ─────────────────────────────────────────

  const renderStep4 = () => (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" />
            Conferência dos Dados - NFS-e
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ambiente */}
          <div className="flex items-center justify-between p-3 rounded border">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Ambiente de Emissão</Label>
              <Badge className={form.ambiente === "producao" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {form.ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Homologação</span>
              <Switch
                checked={form.ambiente === "producao"}
                onCheckedChange={(v) => setForm({ ...form, ambiente: v ? "producao" : "homologacao" })}
              />
              <span className="text-xs text-muted-foreground">Produção</span>
            </div>
          </div>

          {form.ambiente === "producao" && (
            <div className="p-3 bg-red-50 rounded border border-red-200">
              <p className="text-xs text-red-800 flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3 w-3" />
                ATENÇÃO: Esta NFS-e será emitida em ambiente de PRODUÇÃO e terá valor fiscal real.
              </p>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Emitente */}
            <div className="p-3 bg-muted/30 rounded">
              <p className="text-xs font-medium text-muted-foreground mb-2">EMITENTE</p>
              <p className="text-sm font-medium">{fiscalSettings?.razaoSocial || "Não configurado"}</p>
              <p className="text-xs text-muted-foreground">{fiscalSettings?.cnpj ? formatCpfCnpj(fiscalSettings.cnpj) : "-"}</p>
              <p className="text-xs text-muted-foreground">{fiscalSettings?.municipio || "Mogi Guaçu"}/{fiscalSettings?.uf || "SP"}</p>
            </div>

            {/* Tomador */}
            <div className="p-3 bg-muted/30 rounded">
              <p className="text-xs font-medium text-muted-foreground mb-2">TOMADOR</p>
              <p className="text-sm font-medium">{form.tomadorNome}</p>
              <p className="text-xs text-muted-foreground">{form.tomadorTipoDocumento.toUpperCase()}: {form.tomadorDocumento}</p>
              <p className="text-xs text-muted-foreground">{form.tomadorEmail || form.tomadorTelefone}</p>
              {form.tomadorMunicipio && <p className="text-xs text-muted-foreground">{form.tomadorMunicipio}/{form.tomadorUf}</p>}
            </div>
          </div>

          {/* Serviço */}
          <div className="p-3 bg-muted/30 rounded">
            <p className="text-xs font-medium text-muted-foreground mb-2">SERVIÇO</p>
            <p className="text-sm">{form.descricaoServico}</p>
            {form.complementoDescricao && <p className="text-xs text-muted-foreground mt-1">{form.complementoDescricao}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Pagamento: {form.formaPagamento.replace(/_/g, " ")} {form.detalhesPagamento ? `- ${form.detalhesPagamento}` : ""}
            </p>
          </div>

          {/* Valores */}
          <div className="p-4 bg-green-50 rounded border border-green-200">
            <p className="text-xs font-medium text-green-700 mb-3">VALORES</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-green-600">Serviço</p>
                <p className="text-sm font-bold text-green-800">{formatCurrency(valorServicoCents)}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Dedução</p>
                <p className="text-sm font-medium text-green-800">{formatCurrency(valorDeducaoCents)}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Desconto</p>
                <p className="text-sm font-medium text-green-800">{formatCurrency(valorDescontoCents)}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Valor Líquido</p>
                <p className="text-lg font-bold text-green-900">{formatCurrency(valorLiquido)}</p>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Data de Competência:</span>
            <span className="font-medium">{new Date(form.dataCompetencia + "T12:00:00").toLocaleDateString("pt-BR")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Histórico ──────────────────────────────────────────────────────────────

  const renderHistorico = () => (
    <div className="space-y-4">
      {loadingList ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : !nfseList || nfseList.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma NFS-e encontrada</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Emita sua primeira NFS-e na aba "Emitir NFS-e".</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {nfseList.map((nfse: any) => {
            const st = STATUS_MAP[nfse.status] || { label: nfse.status, color: "bg-gray-100 text-gray-700" };
            return (
              <Card key={nfse.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{nfse.tomadorNome}</span>
                        <Badge className={st.color}>{st.label}</Badge>
                        {nfse.ambiente === "homologacao" && (
                          <Badge variant="outline" className="text-xs">Homologação</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{nfse.tomadorTipoDocumento?.toUpperCase()}: {formatCpfCnpj(nfse.tomadorDocumento)}</span>
                        <span>{new Date(nfse.createdAt).toLocaleDateString("pt-BR")}</span>
                        {nfse.numeroNfse && <span>Nº {nfse.numeroNfse}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(nfse.valorServico)}</p>
                        <p className="text-xs text-muted-foreground">{nfse.formaPagamento?.replace(/_/g, " ")}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelectedNfse(nfse); setShowDetalhes(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {nfse.status === "rascunho" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => emitMutation.mutate({ id: nfse.id })}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {nfse.status === "emitida" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => { setSelectedNfse(nfse); setShowCancelar(true); }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Steps Navigation ───────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Pessoas", icon: Users },
    { num: 2, label: "Serviço", icon: FileText },
    { num: 3, label: "Valores", icon: DollarSign },
    { num: 4, label: "Emitir", icon: CheckCircle2 },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            NFS-e - Nota Fiscal de Serviço Eletrônica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emissão conforme Portal Nacional NFS-e (nfse.gov.br)
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="emitir" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />Emitir NFS-e
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emitir" className="mt-6">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => setStep(s.num)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    step === s.num
                      ? "bg-primary text-primary-foreground shadow-md"
                      : step > s.num
                      ? "bg-green-100 text-green-800"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <s.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.num}</span>
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />Anterior
            </Button>

            {step < 4 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !isStep1Valid) ||
                  (step === 2 && !isStep2Valid) ||
                  (step === 3 && !isStep3Valid)
                }
                className="btn-gold-gradient"
              >
                Próximo<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !isStep1Valid || !isStep2Valid || !isStep3Valid}
                className="btn-gold-gradient"
              >
                {createMutation.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Criar NFS-e
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-6">
          {renderHistorico()}
        </TabsContent>
      </Tabs>

      {/* Dialog: Detalhes da NFS-e */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalhes da NFS-e {selectedNfse?.numeroNfse ? `Nº ${selectedNfse.numeroNfse}` : "(Rascunho)"}
            </DialogTitle>
          </DialogHeader>
          {selectedNfse && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_MAP[selectedNfse.status]?.color || "bg-gray-100"}>
                  {STATUS_MAP[selectedNfse.status]?.label || selectedNfse.status}
                </Badge>
                {selectedNfse.ambiente === "homologacao" && <Badge variant="outline">Homologação</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Emitente</p>
                  <p className="text-sm font-medium">{selectedNfse.emitenteRazaoSocial}</p>
                  <p className="text-xs text-muted-foreground">{formatCpfCnpj(selectedNfse.emitenteCnpj)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tomador</p>
                  <p className="text-sm font-medium">{selectedNfse.tomadorNome}</p>
                  <p className="text-xs text-muted-foreground">{formatCpfCnpj(selectedNfse.tomadorDocumento)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Descrição do Serviço</p>
                <p className="text-sm whitespace-pre-wrap">{selectedNfse.descricaoServico}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 p-3 bg-green-50 rounded">
                <div>
                  <p className="text-xs text-green-600">Valor do Serviço</p>
                  <p className="text-sm font-bold text-green-800">{formatCurrency(selectedNfse.valorServico)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600">Deduções</p>
                  <p className="text-sm font-medium text-green-800">{formatCurrency((selectedNfse.valorDeducao || 0) + (selectedNfse.valorDescontoIncondicionado || 0))}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600">Valor Líquido</p>
                  <p className="text-sm font-bold text-green-900">{formatCurrency(selectedNfse.valorLiquido)}</p>
                </div>
              </div>

              {selectedNfse.chaveAcesso && (
                <div className="p-3 bg-muted/30 rounded">
                  <p className="text-xs text-muted-foreground">Chave de Acesso</p>
                  <p className="text-xs font-mono">{selectedNfse.chaveAcesso}</p>
                  {selectedNfse.codigoVerificacao && (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">Código de Verificação</p>
                      <p className="text-xs font-mono">{selectedNfse.codigoVerificacao}</p>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Competência: {selectedNfse.dataCompetencia}</span>
                <span>Criada: {new Date(selectedNfse.createdAt).toLocaleString("pt-BR")}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Cancelar NFS-e */}
      <Dialog open={showCancelar} onOpenChange={setShowCancelar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Cancelar NFS-e
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Tem certeza que deseja cancelar a NFS-e {selectedNfse?.numeroNfse ? `Nº ${selectedNfse.numeroNfse}` : ""} de <strong>{selectedNfse?.tomadorNome}</strong>?
            </p>
            <div>
              <Label>Motivo do Cancelamento *</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelar(false)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!motivoCancelamento || cancelMutation.isPending}
              onClick={() => selectedNfse && cancelMutation.mutate({ id: selectedNfse.id, motivo: motivoCancelamento })}
            >
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
