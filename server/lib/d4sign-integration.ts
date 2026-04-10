import axios, { AxiosInstance } from "axios";
import { getClinicSettings } from "../db_complete";

export const SAFE_MAP = {
  prontuario: "5287ea3b-602f-4434-a577-866f09879e35",
  adendo: "1b2c284d-536a-47b8-8c15-fb6336d73678",
  paciente_modelo: "05560654-b565-432a-ba6c-102663fbd30d",
  distrato: "f7c3e322-a9d6-4c3b-a5e2-7e08d260fbb5",
  terceiros: "cb3e7aa4-11cb-4448-8b8a-072f3a6fd6bd",
  termo_consentimento: "4f0472f9-fe0c-446b-88c7-5a463b3414b5",
  contrato_padrao: "e9a2f92f-6e01-43d7-8830-01979cb21cfd",
} as const;

export interface D4SignConfig {
  tokenAPI: string;
  cryptKey: string;
  baseUrl: string;
}

export interface D4SignSafe {
  uuid_safe: string;
  "name-safe": string;
}

export interface D4SignIntegrationStatus {
  configured: boolean;
  baseUrl: string;
  tokenPreview: string | null;
  cryptKeyPreview: string | null;
  hasClinicToken: boolean;
  hasClinicCryptKey: boolean;
  hasEnvToken: boolean;
  hasEnvCryptKey: boolean;
  defaultSafes: typeof SAFE_MAP;
}

function previewSecret(value?: string | null) {
  if (!value) return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

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
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  private get authParams() {
    return {
      tokenAPI: this.tokenAPI,
      cryptKey: this.cryptKey,
    };
  }

  async listSafes(): Promise<D4SignSafe[]> {
    const response = await this.client.get("/safes", { params: this.authParams });
    return response.data;
  }

  async getDocumentStatus(documentUuid: string) {
    const response = await this.client.get(`/documents/${documentUuid}`, {
      params: this.authParams,
    });
    return response.data;
  }
}

export async function createD4SignService(): Promise<D4SignService | null> {
  const clinic = await getClinicSettings();
  const tokenAPI = clinic?.d4signTokenApi || process.env.D4SIGN_TOKEN_API;
  const cryptKey = clinic?.d4signCryptKey || process.env.D4SIGN_CRYPT_KEY;
  const baseUrl = process.env.D4SIGN_BASE_URL || "https://secure.d4sign.com.br/api/v1";

  if (!tokenAPI || !cryptKey) {
    return null;
  }

  return new D4SignService({ tokenAPI, cryptKey, baseUrl });
}

export async function getD4SignIntegrationStatus(): Promise<D4SignIntegrationStatus> {
  const clinic = await getClinicSettings();
  const tokenAPI = clinic?.d4signTokenApi || process.env.D4SIGN_TOKEN_API || null;
  const cryptKey = clinic?.d4signCryptKey || process.env.D4SIGN_CRYPT_KEY || null;
  const baseUrl = process.env.D4SIGN_BASE_URL || "https://secure.d4sign.com.br/api/v1";

  return {
    configured: Boolean(tokenAPI && cryptKey),
    baseUrl,
    tokenPreview: previewSecret(tokenAPI),
    cryptKeyPreview: previewSecret(cryptKey),
    hasClinicToken: Boolean(clinic?.d4signTokenApi),
    hasClinicCryptKey: Boolean(clinic?.d4signCryptKey),
    hasEnvToken: Boolean(process.env.D4SIGN_TOKEN_API),
    hasEnvCryptKey: Boolean(process.env.D4SIGN_CRYPT_KEY),
    defaultSafes: SAFE_MAP,
  };
}
