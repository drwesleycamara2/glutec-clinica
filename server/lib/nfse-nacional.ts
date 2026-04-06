import axios from "axios";
import https from "https";
import { createHash } from "crypto";
import { decryptSensitiveValue } from "./secure-storage";

export type NfseAmbiente = "homologacao" | "producao";

type FiscalLike = {
  ambiente?: NfseAmbiente | null;
  webserviceUrl?: string | null;
  codigoMunicipio?: string | null;
  codigoServico?: string | null;
  codigoTributacaoNacional?: string | null;
  itemListaServico?: string | null;
  cnaeServico?: string | null;
  descricaoServicoPadrao?: string | null;
  textoLegalFixo?: string | null;
  cnpj?: string | null;
  inscricaoMunicipal?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  email?: string | null;
  regimeTributario?: string | null;
  regimeApuracao?: string | null;
  optanteSimplesNacional?: boolean | number | null;
  certificadoDigital?: string | null;
  certificadoSenha?: string | null;
};

type NfseLike = {
  id: number;
  numeroRps: number;
  serieRps?: string | null;
  tipoRps?: string | null;
  dataCompetencia?: string | Date | null;
  tomadorNome?: string | null;
  tomadorCpfCnpj?: string | null;
  tomadorTipoDocumento?: string | null;
  tomadorEmail?: string | null;
  tomadorEndereco?: string | null;
  descricaoServico: string;
  codigoServico?: string | null;
  itemListaServico?: string | null;
  cnaeServico?: string | null;
  codigoMunicipioIncidencia?: string | null;
  valorServicos: number | string;
  valorDeducoes?: number | string | null;
  valorIss?: number | string | null;
  baseCalculo?: number | string | null;
  aliquota?: number | string | null;
  valorLiquidoNfse?: number | string | null;
};

const DEFAULT_BASE_URLS: Record<NfseAmbiente, string> = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  producao: "https://sefin.nfse.gov.br/SefinNacional",
};

const DEFAULT_PARAMS_URLS: Record<NfseAmbiente, string> = {
  homologacao: "https://adn.producaorestrita.nfse.gov.br",
  producao: "https://adn.nfse.gov.br",
};

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decimal(value: unknown, digits = 2) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(parsed)) return "0.00";
  return parsed.toFixed(digits);
}

function normalizeBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function parseTomadorAddress(raw: string | null | undefined) {
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, string | null>;
  } catch {
    return {};
  }
}

function getCertificateBundle(fiscal: FiscalLike) {
  const pfxBase64 = decryptSensitiveValue(fiscal.certificadoDigital);
  const passphrase = decryptSensitiveValue(fiscal.certificadoSenha);

  if (!pfxBase64 || !passphrase) {
    throw new Error("Certificado A1 da clínica não está configurado para a integração fiscal.");
  }

  return {
    pfx: Buffer.from(pfxBase64, "base64"),
    passphrase,
  };
}

function extractTagValue(xml: string, tagName: string) {
  const regex = new RegExp(`<(?:\\w+:)?${tagName}>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, "i");
  return xml.match(regex)?.[1]?.trim() ?? null;
}

function extractFaultMessage(xml: string) {
  return (
    extractTagValue(xml, "mensagem") ||
    extractTagValue(xml, "Mensagem") ||
    extractTagValue(xml, "faultstring") ||
    extractTagValue(xml, "faultcode")
  );
}

function buildDpsIdentifier(fiscal: FiscalLike, nfse: NfseLike) {
  const codigoMunicipio = onlyDigits(fiscal.codigoMunicipio || nfse.codigoMunicipioIncidencia).padStart(7, "0");
  const documentoPrestador = onlyDigits(fiscal.cnpj).padStart(14, "0");
  const serie = String(nfse.serieRps || "RPS").replace(/\s+/g, "").slice(0, 5).padEnd(5, "0");
  const numero = String(nfse.numeroRps).replace(/\D/g, "").padStart(15, "0");

  return `${codigoMunicipio}2${documentoPrestador}${serie}${numero}`;
}

export function buildDpsXml(fiscal: FiscalLike, nfse: NfseLike) {
  const tomadorEndereco = parseTomadorAddress(nfse.tomadorEndereco);
  const codigoServico =
    fiscal.codigoServico ||
    fiscal.codigoTributacaoNacional ||
    nfse.codigoServico ||
    "";
  const dataCompetencia = new Date(nfse.dataCompetencia || new Date()).toISOString().slice(0, 10);

  const signedPayloadHash = createHash("sha256")
    .update(`${nfse.id}:${nfse.numeroRps}:${nfse.tomadorCpfCnpj || ""}:${nfse.valorServicos}`)
    .digest("hex");

  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="https://www.gov.br/nfse">
  <infDPS Id="${xmlEscape(buildDpsIdentifier(fiscal, nfse))}">
    <tpAmb>${fiscal.ambiente === "producao" ? "2" : "1"}</tpAmb>
    <verAplic>GLUTEC-1.0</verAplic>
    <dhEmi>${new Date().toISOString()}</dhEmi>
    <prest>
      <CNPJ>${xmlEscape(onlyDigits(fiscal.cnpj))}</CNPJ>
      <xNome>${xmlEscape(fiscal.razaoSocial || fiscal.nomeFantasia || "Prestador")}</xNome>
      <IM>${xmlEscape(fiscal.inscricaoMunicipal || "")}</IM>
      <ender>
        <xLgr>${xmlEscape(fiscal.logradouro || "")}</xLgr>
        <nro>${xmlEscape(fiscal.numero || "S/N")}</nro>
        <xCpl>${xmlEscape(fiscal.complemento || "")}</xCpl>
        <xBairro>${xmlEscape(fiscal.bairro || "")}</xBairro>
        <cMun>${xmlEscape(onlyDigits(fiscal.codigoMunicipio))}</cMun>
        <xMun>${xmlEscape(fiscal.municipio || "")}</xMun>
        <UF>${xmlEscape(fiscal.uf || "")}</UF>
        <CEP>${xmlEscape(onlyDigits(fiscal.cep))}</CEP>
      </ender>
      <fone>${xmlEscape(onlyDigits(fiscal.telefone))}</fone>
      <email>${xmlEscape(fiscal.email || "")}</email>
    </prest>
    <tom>
      <tpInsc>${nfse.tomadorTipoDocumento === "cnpj" ? "2" : "1"}</tpInsc>
      <NifTom>${xmlEscape(onlyDigits(nfse.tomadorCpfCnpj))}</NifTom>
      <xNome>${xmlEscape(nfse.tomadorNome || "")}</xNome>
      <email>${xmlEscape(nfse.tomadorEmail || "")}</email>
      <ender>
        <xLgr>${xmlEscape(tomadorEndereco.logradouro || "")}</xLgr>
        <nro>${xmlEscape(tomadorEndereco.numero || "S/N")}</nro>
        <xCpl>${xmlEscape(tomadorEndereco.complemento || "")}</xCpl>
        <xBairro>${xmlEscape(tomadorEndereco.bairro || "")}</xBairro>
        <xMun>${xmlEscape(tomadorEndereco.municipio || "")}</xMun>
        <UF>${xmlEscape(tomadorEndereco.uf || "")}</UF>
        <CEP>${xmlEscape(onlyDigits(tomadorEndereco.cep || ""))}</CEP>
      </ender>
    </tom>
    <serv>
      <cServ>${xmlEscape(String(codigoServico))}</cServ>
      <cCnae>${xmlEscape(String(fiscal.cnaeServico || nfse.cnaeServico || ""))}</cCnae>
      <cListServ>${xmlEscape(String(fiscal.itemListaServico || nfse.itemListaServico || ""))}</cListServ>
      <xServ>${xmlEscape(nfse.descricaoServico)}</xServ>
      <vServ>${decimal(nfse.valorServicos)}</vServ>
      <vDeduc>${decimal(nfse.valorDeducoes)}</vDeduc>
      <vBC>${decimal(nfse.baseCalculo)}</vBC>
      <vAliq>${decimal(Number(nfse.aliquota || 0) * 100, 4)}</vAliq>
      <vISS>${decimal(nfse.valorIss)}</vISS>
      <vLiquido>${decimal(nfse.valorLiquidoNfse)}</vLiquido>
      <dtCompet>${dataCompetencia}</dtCompet>
    </serv>
    <regTrib>${xmlEscape(String(fiscal.regimeApuracao || fiscal.regimeTributario || ""))}</regTrib>
    <optSimples>${normalizeBoolean(fiscal.optanteSimplesNacional) ? "1" : "2"}</optSimples>
    <hashConteudo>${signedPayloadHash}</hashConteudo>
  </infDPS>
</DPS>`;
}

export async function fetchMunicipalParameters(
  codigoMunicipio: string,
  ambiente: NfseAmbiente,
) {
  const baseUrl = DEFAULT_PARAMS_URLS[ambiente];
  const normalizedCodigo = onlyDigits(codigoMunicipio);

  if (!normalizedCodigo) {
    throw new Error("Informe o código IBGE do município para consultar os parâmetros oficiais.");
  }

  const response = await axios.get(
    `${baseUrl}/parametros_municipais/${normalizedCodigo}/convenio`,
    {
      headers: { Accept: "application/json" },
      timeout: 30000,
      validateStatus: () => true,
    },
  );

  if (response.status >= 400) {
    throw new Error(
      typeof response.data === "string"
        ? response.data
        : `Falha ao consultar parâmetros municipais. HTTP ${response.status}.`,
    );
  }

  return response.data;
}

export async function testNationalApiConnection(fiscal: FiscalLike, ambiente: NfseAmbiente) {
  const baseUrl = (fiscal.webserviceUrl || DEFAULT_BASE_URLS[ambiente]).replace(/\/+$/, "");
  const { pfx, passphrase } = getCertificateBundle(fiscal);

  const response = await axios.head(`${baseUrl}/dps/000000000000000000000000000000000000000`, {
    timeout: 30000,
    httpsAgent: new https.Agent({
      pfx,
      passphrase,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    }),
    validateStatus: () => true,
    headers: {
      Accept: "application/xml, application/json, */*",
    },
  });

  return {
    ok: response.status > 0 && response.status < 500,
    status: response.status,
    baseUrl,
    message:
      response.status < 500
        ? "Conexão TLS com a API nacional realizada com sucesso."
        : `A API nacional respondeu com HTTP ${response.status}.`,
  };
}

export async function emitNfseWithNationalApi(fiscal: FiscalLike, nfse: NfseLike) {
  const ambiente = fiscal.ambiente === "producao" ? "producao" : "homologacao";
  const baseUrl = (fiscal.webserviceUrl || DEFAULT_BASE_URLS[ambiente]).replace(/\/+$/, "");
  const { pfx, passphrase } = getCertificateBundle(fiscal);
  const xml = buildDpsXml(fiscal, nfse);

  const response = await axios.post(`${baseUrl}/nfse`, xml, {
    timeout: 45000,
    httpsAgent: new https.Agent({
      pfx,
      passphrase,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    }),
    validateStatus: () => true,
    headers: {
      "Content-Type": "application/xml",
      Accept: "application/xml, application/json",
    },
  });

  const rawBody =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data, null, 2);

  if (response.status >= 400) {
    throw new Error(extractFaultMessage(rawBody) || `Falha ao emitir NFS-e. HTTP ${response.status}.`);
  }

  const chaveAcesso = extractTagValue(rawBody, "chNfse") || extractTagValue(rawBody, "chaveAcesso");
  const numeroNfse = extractTagValue(rawBody, "nNFSe") || extractTagValue(rawBody, "numero");
  const codigoVerificacao =
    extractTagValue(rawBody, "cVerif") || extractTagValue(rawBody, "codigoVerificacao");
  const linkNfse = extractTagValue(rawBody, "link") || extractTagValue(rawBody, "url");

  return {
    xmlEnviado: xml,
    xmlRetorno: rawBody,
    xmlNfse: rawBody,
    chaveAcesso,
    numeroNfse,
    codigoVerificacao,
    linkNfse,
    protocolo: extractTagValue(rawBody, "nProt") || extractTagValue(rawBody, "protocolo"),
    numeroDps: buildDpsIdentifier(fiscal, nfse),
    status: chaveAcesso || numeroNfse ? "autorizada" : "aguardando",
    message:
      chaveAcesso || numeroNfse
        ? "NFS-e emitida com sucesso na API nacional."
        : "DPS recebida pela API nacional. Consulte o status para acompanhar a autorização.",
    endpoint: `${baseUrl}/nfse`,
  };
}
