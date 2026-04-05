import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, CheckCircle2, AlertCircle, Shield, Smartphone, FileText, Settings, AlertTriangle, Zap } from "lucide-react";

interface CertificateConfig {
  id: number;
  type: "A1_PJ" | "VIDAAS_PF";
  name: string;
  status: "ativo" | "inativo" | "expirado";
  expiresAt: string;
  uploadedAt: string;
  issuer: string;
}

interface FiscalConfig {
  cnpj: string;
  companyName: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  cnae: string;
  issAliquot: number;
  nfseProvider: string;
}

export function ConfiguracoesFiscais() {
  const [environment, setEnvironment] = useState<"homologacao" | "producao">("homologacao");
  const [certificates, setCertificates] = useState<CertificateConfig[]>([
    {
      id: 1,
      type: "A1_PJ",
      name: "Clínica Glutée (PJ)",
      status: "inativo",
      expiresAt: "2026-12-31",
      uploadedAt: "2024-01-15",
      issuer: "Certificadora Padrão",
    },
  ]);

  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfig>({
    cnpj: "",
    companyName: "Clínica Glutée",
    address: "",
    city: "Mogi Guaçu",
    state: "SP",
    phone: "",
    email: "",
    cnae: "86.21-1-00",
    issAliquot: 5,
    nfseProvider: "nfse.gov.br",
  });

  const [showUploadCertificate, setShowUploadCertificate] = useState(false);
  const [showConfigureFiscal, setShowConfigureFiscal] = useState(false);
  const [showVidaasConfig, setShowVidaasConfig] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    certificateType: "A1_PJ",
    file: null as File | null,
    password: "",
  });

  const [vidaasForm, setVidaasForm] = useState({
    cpf: "",
    email: "",
    phone: "",
    vidaasAppStatus: "nao_configurado",
  });

  const handleUploadCertificate = () => {
    if (!uploadForm.file || !uploadForm.password) {
      toast.error("Selecione o arquivo e informe a senha");
      return;
    }

    const newCertificate: CertificateConfig = {
      id: certificates.length + 1,
      type: uploadForm.certificateType as "A1_PJ" | "VIDAAS_PF",
      name: uploadForm.file.name,
      status: "ativo",
      expiresAt: "2026-12-31",
      uploadedAt: new Date().toISOString().split("T")[0],
      issuer: "ICP-Brasil",
    };

    setCertificates([...certificates, newCertificate]);
    setUploadForm({ certificateType: "A1_PJ", file: null, password: "" });
    setShowUploadCertificate(false);
    toast.success("Certificado enviado com sucesso!");
  };

  const handleSaveFiscalConfig = () => {
    if (!fiscalConfig.cnpj || !fiscalConfig.address || !fiscalConfig.phone) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setShowConfigureFiscal(false);
    toast.success("Configurações fiscais salvas com sucesso!");
  };

  const handleConfigureVidaas = () => {
    if (!vidaasForm.cpf || !vidaasForm.email) {
      toast.error("Preencha CPF e email");
      return;
    }

    setVidaasForm({ ...vidaasForm, vidaasAppStatus: "configurado" });
    setShowVidaasConfig(false);
    toast.success("VIDAAS configurado com sucesso! Verifique seu email.");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ativo":
        return "bg-[#C9A55B]/15 text-[#6B5B2A]";
      case "inativo":
        return "bg-yellow-100 text-yellow-700";
      case "expirado":
        return "bg-[#2F2F2F]/10 text-[#2F2F2F]";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ativo":
        return <CheckCircle2 className="h-4 w-4" />;
      case "expirado":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Environment Alert */}
      {environment === "homologacao" && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900">Modo Homologação (Testes)</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Você está em ambiente de testes. As NFS-es emitidas aqui NÃO têm valor fiscal e são apenas para validação.
              </p>
            </div>
          </div>
        </div>
      )}

      {environment === "producao" && (
        <div className="bg-[#6B6B6B]/5 border-l-4 border-[#6B6B6B]/40 p-4 rounded">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#2F2F2F] mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-[#2F2F2F]">🔴 Modo Produção (Real)</h3>
              <p className="text-sm text-[#2F2F2F] mt-1">
                Você está em ambiente de produção. As NFS-es emitidas aqui têm valor fiscal. Verifique todos os dados antes de emitir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configurações Fiscais e Digitais</h1>
        <p className="text-gray-600">
          Gerencie seus certificados digitais e configurações de emissão de Notas Fiscais (Mogi Guaçu-SP 2026)
        </p>
      </div>

      {/* Environment Selector */}
      <Card className="border-gray-300 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#C9A55B]" />
            Ambiente de Emissão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Homologação */}
            <div
              onClick={() => setEnvironment("homologacao")}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                environment === "homologacao"
                  ? "border-yellow-400 bg-yellow-50"
                  : "border-gray-200 bg-white hover:border-yellow-300"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">Homologação (Testes)</h3>
                {environment === "homologacao" && (
                  <Badge className="bg-yellow-100 text-yellow-700">Ativo</Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Ambiente para testes. NFS-es emitidas aqui não têm valor fiscal.
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>✓ Sem valor fiscal</li>
                <li>✓ Ideal para validação</li>
                <li>✓ Sem limite de emissões</li>
              </ul>
            </div>

            {/* Produção */}
            <div
              onClick={() => setEnvironment("producao")}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                environment === "producao"
                  ? "border-[#C9A55B]/40 bg-green-50"
                  : "border-gray-200 bg-white hover:border-[#C9A55B]/30"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">Produção (Real)</h3>
                {environment === "producao" && (
                  <Badge className="bg-[#C9A55B]/15 text-[#6B5B2A]">Ativo</Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Ambiente de produção. NFS-es emitidas aqui têm valor fiscal.
              </p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>✓ Valor fiscal</li>
                <li>✓ Emissão oficial</li>
                <li>✓ Válido para SEFAZ</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Configuration Card */}
      <Card className={`border-2 ${
        environment === "homologacao" ? "border-yellow-200 bg-yellow-50" : "border-[#C9A55B]/25 bg-green-50"
      }`}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-amber-600" />
              Configuração Fiscal
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              Dados da clínica para emissão de NFS-e ({environment === "homologacao" ? "Homologação" : "Produção"})
            </p>
          </div>
          <Button onClick={() => setShowConfigureFiscal(true)} className="btn-gold-gradient">
            Editar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">CNPJ</p>
              <p className="font-semibold text-gray-900">{fiscalConfig.cnpj || "Não configurado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Empresa</p>
              <p className="font-semibold text-gray-900">{fiscalConfig.companyName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Endereço</p>
              <p className="font-semibold text-gray-900">{fiscalConfig.address || "Não configurado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Cidade/UF</p>
              <p className="font-semibold text-gray-900">
                {fiscalConfig.city}/{fiscalConfig.state}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">CNAE</p>
              <p className="font-semibold text-gray-900">{fiscalConfig.cnae}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Alíquota ISS</p>
              <p className="font-semibold text-gray-900">{fiscalConfig.issAliquot}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certificates Section */}
      <Card className="border-gray-300">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#C9A55B]" />
              Certificados Digitais
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">Certificados para assinatura de documentos e emissão de NFS-e</p>
          </div>
          <Button onClick={() => setShowUploadCertificate(true)} className="btn-gold-gradient">
            <Upload className="h-4 w-4 mr-2" />
            Novo Certificado
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-start justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{cert.name}</h3>
                    <Badge className={`text-xs font-medium ${getStatusColor(cert.status)} flex items-center gap-1`}>
                      {getStatusIcon(cert.status)}
                      {cert.status === "ativo" ? "Ativo" : cert.status === "inativo" ? "Inativo" : "Expirado"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Tipo</p>
                      <p className="font-semibold text-gray-900">
                        {cert.type === "A1_PJ" ? "Certificado A1 (PJ)" : "VIDAAS (PF)"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Emitido em</p>
                      <p className="font-semibold text-gray-900">{cert.uploadedAt}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Expira em</p>
                      <p className="font-semibold text-gray-900">{cert.expiresAt}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button size="sm" variant="outline" className="border-gray-300">
                    Detalhes
                  </Button>
                  <Button size="sm" variant="outline" className="border-[#6B6B6B]/30 text-[#2F2F2F] hover:bg-[#6B6B6B]/5">
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* VIDAAS Configuration Card */}
      <Card className="border-gray-300 bg-gradient-to-br from-blue-50 to-blue-100">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-[#C9A55B]" />
              Assinatura Digital em Nuvem (VIDAAS - CFM)
            </CardTitle>
            <p className="text-sm text-gray-600 mt-1">Para assinatura de prescrições, atestados e exames</p>
          </div>
          <Button onClick={() => setShowVidaasConfig(true)} className="btn-gold-gradient">
            Configurar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="bg-white p-4 rounded-lg border border-[#C9A55B]/25">
            {vidaasForm.vidaasAppStatus === "nao_configurado" ? (
              <div className="text-center py-4">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 text-yellow-600" />
                <p className="text-gray-700 font-semibold mb-2">VIDAAS não configurado</p>
                <p className="text-sm text-gray-600">
                  Configure seu certificado em nuvem para assinar documentos clínicos digitalmente.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-[#8A6526]" />
                  <span className="font-semibold text-[#6B5B2A]">VIDAAS Configurado</span>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>CPF:</strong> {vidaasForm.cpf}
                </p>
                <p className="text-sm text-gray-700">
                  <strong>Email:</strong> {vidaasForm.email}
                </p>
                <p className="text-sm text-gray-600 mt-3">
                  Ao assinar documentos, você receberá uma notificação no app VIDAAS para confirmar a assinatura.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* NFS-e Information Card */}
      <Card className={`border-2 ${
        environment === "homologacao"
          ? "border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100"
          : "border-[#C9A55B]/25 bg-gradient-to-br from-[#C9A55B]/5 to-[#C9A55B]/10"
      }`}>
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#8A6526]" />
            Emissão de NFS-e (Mogi Guaçu-SP 2026)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Padrão Nacional</p>
              <p className="text-sm text-gray-700">
                Portal de Gestão do Governo Federal - <strong>nfse.gov.br</strong>
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Ambiente Ativo</p>
              <Badge className={`${
                environment === "homologacao"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-[#C9A55B]/15 text-[#6B5B2A]"
              }`}>
                {environment === "homologacao" ? "Homologação (Testes)" : "Produção (Real)"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Autenticação</p>
              <p className="text-sm text-gray-700">Certificado Digital A1 (PJ) - Arquivo .pfx/.p12</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Status da Configuração</p>
              <Badge className="bg-yellow-100 text-yellow-700">
                {fiscalConfig.cnpj ? "Pronto para emitir" : "Aguardando configuração"}
              </Badge>
            </div>
            <div className={`p-3 rounded border mt-3 ${
              environment === "homologacao"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-[#6B6B6B]/5 border-[#6B6B6B]/25"
            }`}>
              <p className={`text-xs ${
                environment === "homologacao"
                  ? "text-yellow-900"
                  : "text-[#2F2F2F]"
              }`}>
                <strong>Nota:</strong> Você está emitindo em <strong>{environment === "homologacao" ? "HOMOLOGAÇÃO" : "PRODUÇÃO"}</strong>. 
                {environment === "homologacao" 
                  ? " As NFS-es aqui são apenas para testes e não têm valor fiscal."
                  : " As NFS-es aqui têm valor fiscal e são válidas para SEFAZ."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Upload Certificate */}
      <Dialog open={showUploadCertificate} onOpenChange={setShowUploadCertificate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Certificado Digital</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Tipo de Certificado</Label>
              <Select
                value={uploadForm.certificateType}
                onValueChange={(v) => setUploadForm({ ...uploadForm, certificateType: v })}
              >
                <SelectTrigger className="border-gray-300 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A1_PJ">Certificado A1 (PJ) - NFS-e</SelectItem>
                  <SelectItem value="VIDAAS_PF">VIDAAS (PF) - Documentos Clínicos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold">Arquivo (.pfx ou .p12)</Label>
              <Input
                type="file"
                accept=".pfx,.p12"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                className="border-gray-300 mt-1"
              />
              {uploadForm.file && (
                <p className="text-xs text-[#8A6526] mt-1">✓ {uploadForm.file.name}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold">Senha do Certificado</Label>
              <Input
                type="password"
                value={uploadForm.password}
                onChange={(e) => setUploadForm({ ...uploadForm, password: e.target.value })}
                placeholder="Digite a senha"
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
              <p className="text-xs text-yellow-900">
                <strong>Segurança:</strong> A senha será criptografada e armazenada com segurança.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadCertificate(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleUploadCertificate} className="btn-gold-gradient">
              <Upload className="h-4 w-4 mr-2" />
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configure Fiscal */}
      <Dialog open={showConfigureFiscal} onOpenChange={setShowConfigureFiscal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configuração Fiscal</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
            <div>
              <Label className="text-sm font-semibold">CNPJ</Label>
              <Input
                value={fiscalConfig.cnpj}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, cnpj: e.target.value })}
                placeholder="XX.XXX.XXX/0001-XX"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Razão Social</Label>
              <Input
                value={fiscalConfig.companyName}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, companyName: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label className="text-sm font-semibold">Endereço</Label>
              <Input
                value={fiscalConfig.address}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, address: e.target.value })}
                placeholder="Rua/Avenida, Número - Complemento"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Cidade</Label>
              <Input
                value={fiscalConfig.city}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, city: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">UF</Label>
              <Input
                value={fiscalConfig.state}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, state: e.target.value })}
                maxLength={2}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Telefone</Label>
              <Input
                value={fiscalConfig.phone}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, phone: e.target.value })}
                placeholder="(XX) XXXXX-XXXX"
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label className="text-sm font-semibold">Email</Label>
              <Input
                type="email"
                value={fiscalConfig.email}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, email: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">CNAE</Label>
              <Input
                value={fiscalConfig.cnae}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, cnae: e.target.value })}
                placeholder="86.21-1-00"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Alíquota ISS (%)</Label>
              <Input
                type="number"
                value={fiscalConfig.issAliquot}
                onChange={(e) => setFiscalConfig({ ...fiscalConfig, issAliquot: parseFloat(e.target.value) })}
                className="border-gray-300 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfigureFiscal(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveFiscalConfig} className="btn-gold-gradient">
              Salvar Configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Configure VIDAAS */}
      <Dialog open={showVidaasConfig} onOpenChange={setShowVidaasConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar VIDAAS (CFM)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">CPF</Label>
              <Input
                value={vidaasForm.cpf}
                onChange={(e) => setVidaasForm({ ...vidaasForm, cpf: e.target.value })}
                placeholder="XXX.XXX.XXX-XX"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Email (Cadastrado no CFM)</Label>
              <Input
                type="email"
                value={vidaasForm.email}
                onChange={(e) => setVidaasForm({ ...vidaasForm, email: e.target.value })}
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Telefone (Opcional)</Label>
              <Input
                value={vidaasForm.phone}
                onChange={(e) => setVidaasForm({ ...vidaasForm, phone: e.target.value })}
                placeholder="(XX) XXXXX-XXXX"
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="bg-[#C9A55B]/5 p-3 rounded border border-[#C9A55B]/25">
              <p className="text-xs text-[#8A6526]">
                <strong>Próximo passo:</strong> Após salvar, você receberá um email de confirmação. Acesse o link para
                ativar o VIDAAS no seu celular.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowVidaasConfig(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleConfigureVidaas} className="btn-gold-gradient">
              <Smartphone className="h-4 w-4 mr-2" />
              Configurar VIDAAS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
