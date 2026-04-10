/**
 * D4Sign Integration Service
 * Serviço centralizado para integração com a API D4Sign
 * Credenciais de produção configuradas via variáveis de ambiente ou banco de dados
 *
 * Documentação: http://docapi.d4sign.com.br/
 * Fluxo: Upload → Cadastrar Signatários → Enviar para Assinatura
 */

import axios, { AxiosInstance } from "axios";
import { getClinicSettings } from "./db_complete";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface D4SignConfig {
  tokenAPI: string;
  cryptKey: string;
  baseUrl: string;
}

export interface D4SignSafe {
  uuid_safe: string;
  "name-safe": string;
}

export interface D4SignUploadResponse {
  uuid: string;
  name: string;
  pages: number;
  type: string;
}

export interface D4SignSigner {
  email: string;
  act: string; // "1" = assinar, "2" = aprovar, "3" = reconhecer, "4" = assinar como parte, "5" = assinar como testemunha
  foreign: string; // "0" = brasileiro, "1" = estrangeiro
  certificadoicpbr: string; // "0" = sem ICP-Brasil, "1" = com ICP-Brasil
  assinatura_presencial: string; // "0" = remota, "1" = presencial
  docauth: string; // "0" = sem doc auth, "1" = com doc auth
  docauthandselfie: string; // "0" = sem selfie, "1" = com selfie
  embed_methodauth: string; // "email", "sms", "whatsapp"
  embed_smsnumber?: string;
}

export interface D4SignDocumentStatus {
  uuid: string;
  name: string;
  status: string;
  statusId: string;
}

// ─── Mapeamento de Cofres ───────────────────────────────────────────────────

export const SAFE_MAP = {
  prontuario: "5287ea3b-602f-4434-a577-866f09879e35",         // Cópia de prontuário médico
  adendo: "1b2c284d-536a-47b8-8c15-fb6336d73678",             // Adendos contratuais
  paciente_modelo: "05560654-b565-432a-ba6c-102663fbd30d",     // Pacientes Modelo
  distrato: "f7c3e322-a9d6-4c3b-a5e2-7e08d260fbb5",           // Distratos
  terceiros: "cb3e7aa4-11cb-4448-8b8a-072f3a6fd6bd",           // Documentos de terceiros
  termo_consentimento: "4f0472f9-fe0c-446b-88c7-5a463b3414b5", // Termos de Consentimento Dr Wésley Câmara
  contrato_padrao: "e9a2f92f-6e01-43d7-8830-01979cb21cfd",     // Contratos Pacientes padrão
} as const;

export type SafeType = keyof typeof SAFE_MAP;

// ─── Classe D4Sign Service ──────────────────────────────────────────────────

export class D4SignService {
  private client: AxiosInstance;
  private tokenAPI: string;
  private cryptKey: string;

  constructor(config: D4SignConfig) {
    this.tokenAPI = config.tokenAPI;
    this.cryptKey = config.cryptKey;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Parâmetros de autenticação para todas as requisições
   */
  private get authParams() {
    return {
      tokenAPI: this.tokenAPI,
      cryptKey: this.cryptKey,
    };
  }

  /**
   * Lista todos os cofres disponíveis na conta
   */
  async listSafes(): Promise<D4SignSafe[]> {
    const response = await this.client.get("/safes", { params: this.authParams });
    return response.data;
  }

  /**
   * Upload de documento para um cofre específico
   * @param safeUuid UUID do cofre
   * @param base64Content Conteúdo do arquivo em base64
   * @param fileName Nome do arquivo
   * @param mimeType Tipo MIME (padrão: application/pdf)
   */
  async uploadDocument(
    safeUuid: string,
    base64Content: string,
    fileName: string,
    mimeType: string = "application/pdf"
  ): Promise<D4SignUploadResponse> {
    const response = await this.client.post(
      `/documents/${safeUuid}/upload`,
      {
        base64_binary_file: base64Content,
        mime_type: mimeType,
        name: fileName,
      },
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Cadastra signatários para um documento
   * @param documentUuid UUID do documento
   * @param signers Lista de signatários
   */
  async createSignerList(documentUuid: string, signers: D4SignSigner[]): Promise<any> {
    const response = await this.client.post(
      `/documents/${documentUuid}/createlist`,
      { signers },
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Envia documento para assinatura
   * @param documentUuid UUID do documento
   * @param message Mensagem para o signatário
   * @param workflow "0" = sem ordem, "1" = com ordem
   */
  async sendToSigner(
    documentUuid: string,
    message: string,
    workflow: string = "0"
  ): Promise<any> {
    const response = await this.client.post(
      `/documents/${documentUuid}/sendtosigner`,
      { message, workflow },
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Consulta status de um documento
   * @param documentUuid UUID do documento
   */
  async getDocumentStatus(documentUuid: string): Promise<D4SignDocumentStatus> {
    const response = await this.client.get(
      `/documents/${documentUuid}`,
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Lista documentos de um cofre
   * @param safeUuid UUID do cofre
   */
  async listDocuments(safeUuid: string): Promise<any[]> {
    const response = await this.client.get(
      `/documents/${safeUuid}/list`,
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Cancela um documento
   * @param documentUuid UUID do documento
   * @param comment Comentário do cancelamento
   */
  async cancelDocument(documentUuid: string, comment: string = "Cancelado pelo sistema"): Promise<any> {
    const response = await this.client.post(
      `/documents/${documentUuid}/cancel`,
      { comment },
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Baixa o documento assinado
   * @param documentUuid UUID do documento
   */
  async downloadDocument(documentUuid: string): Promise<any> {
    const response = await this.client.post(
      `/documents/${documentUuid}/download`,
      {},
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Registra webhook para receber notificações de status
   * @param documentUuid UUID do documento
   * @param webhookUrl URL do webhook
   */
  async registerWebhook(documentUuid: string, webhookUrl: string): Promise<any> {
    const response = await this.client.post(
      `/documents/${documentUuid}/webhooks`,
      { url: webhookUrl },
      { params: this.authParams }
    );
    return response.data;
  }

  /**
   * Fluxo completo: Upload → Signatários → Enviar para assinatura
   */
  async sendDocumentForSignature(params: {
    safeUuid: string;
    base64Content: string;
    fileName: string;
    signerEmail: string;
    signerName: string;
    message?: string;
    useIcpBrasil?: boolean;
    webhookUrl?: string;
  }): Promise<{ documentUuid: string; success: boolean }> {
    // 1. Upload do documento
    const uploadResult = await this.uploadDocument(
      params.safeUuid,
      params.base64Content,
      params.fileName
    );
    const documentUuid = uploadResult.uuid;

    // 2. Registrar webhook (opcional)
    if (params.webhookUrl) {
      await this.registerWebhook(documentUuid, params.webhookUrl);
    }

    // 3. Cadastrar signatário
    await this.createSignerList(documentUuid, [
      {
        email: params.signerEmail,
        act: "1", // Assinar
        foreign: "0",
        certificadoicpbr: params.useIcpBrasil ? "1" : "0",
        assinatura_presencial: "0",
        docauth: "0",
        docauthandselfie: "0",
        embed_methodauth: "email",
        embed_smsnumber: "",
      },
    ]);

    // 4. Enviar para assinatura
    await this.sendToSigner(
      documentUuid,
      params.message || `Por favor, assine o documento: ${params.fileName}`
    );

    return { documentUuid, success: true };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Cria instância do D4SignService usando credenciais do banco de dados ou variáveis de ambiente
 * Prioridade: Banco de Dados > Variáveis de Ambiente > Hardcoded (produção)
 */
export async function createD4SignService(): Promise<D4SignService | null> {
  // Tentar obter credenciais do banco de dados (clinic_settings)
  const clinic = await getClinicSettings();

  const tokenAPI =
    clinic?.d4signTokenApi ||
    process.env.D4SIGN_TOKEN_API;

  const cryptKey =
    clinic?.d4signCryptKey ||
    process.env.D4SIGN_CRYPT_KEY;

  const baseUrl =
    process.env.D4SIGN_BASE_URL ||
    "https://secure.d4sign.com.br/api/v1";

  if (!tokenAPI || !cryptKey) {
    console.warn("[D4Sign] Credenciais não configuradas.");
    return null;
  }

  return new D4SignService({ tokenAPI, cryptKey, baseUrl });
}

/**
 * Seleciona o cofre apropriado com base no tipo de recurso
 */
export function selectSafe(
  resourceType: string,
  clinicSettings?: any,
  doctorSettings?: any
): string {
  // Mapeamento de tipo de recurso para cofre
  switch (resourceType) {
    case "medical_record":
    case "prontuario":
      return clinicSettings?.d4signSafeKeyClinical || SAFE_MAP.prontuario;
    case "prescription":
    case "prescricao":
    case "exam_request":
    case "exame":
      return doctorSettings?.d4signSafeKey || SAFE_MAP.termo_consentimento;
    case "budget":
    case "orcamento":
    case "nfe":
    case "nfse":
      return clinicSettings?.d4signSafeKeyNfe || SAFE_MAP.contrato_padrao;
    case "termo":
    case "consentimento":
      return SAFE_MAP.termo_consentimento;
    case "contrato":
      return SAFE_MAP.contrato_padrao;
    case "distrato":
      return SAFE_MAP.distrato;
    case "adendo":
      return SAFE_MAP.adendo;
    default:
      return clinicSettings?.d4signSafeKey || SAFE_MAP.contrato_padrao;
  }
}
