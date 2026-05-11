/**
 * WhatsApp Meta Cloud API integration.
 *
 * Runtime secrets intentionally live in environment variables, not in the app UI,
 * because this project handles sensitive health data.
 */

import crypto from "crypto";
import axios, { AxiosInstance } from "axios";
import FormData from "form-data";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  graphVersion: string;
  businessPhoneNumber?: string;
  appSecret?: string;
  verifyToken?: string;
}

export type WhatsAppMessageType = "text" | "template" | "document";

export interface WhatsAppTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "url" | "quick_reply" | "copy_code";
  index?: string;
  parameters?: Array<Record<string, unknown>>;
}

export interface WhatsAppMessagePayload {
  messaging_product: "whatsapp";
  to: string;
  type: WhatsAppMessageType;
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: WhatsAppTemplateComponent[];
  };
  document?: {
    id: string;
    filename: string;
    caption?: string;
  };
}

function getEnv(name: string) {
  return String(process.env[name] ?? "").trim();
}

function maskSecret(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length <= 8) return `${raw.slice(0, 2)}...`;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    accessToken: getEnv("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: getEnv("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: getEnv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    businessPhoneNumber: getEnv("WHATSAPP_BUSINESS_PHONE") || "+5519999633913",
    graphVersion: getEnv("WHATSAPP_GRAPH_VERSION") || "v23.0",
    appSecret: getEnv("WHATSAPP_APP_SECRET"),
    verifyToken: getEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  };
}

export function getWhatsAppConfigStatus() {
  const config = getWhatsAppConfig();
  const missing = [
    ["WHATSAPP_ACCESS_TOKEN", config.accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", config.phoneNumberId],
    ["WHATSAPP_BUSINESS_ACCOUNT_ID", config.businessAccountId],
    ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", config.verifyToken],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
    graphVersion: config.graphVersion,
    phoneNumberIdPreview: maskSecret(config.phoneNumberId),
    businessAccountIdPreview: maskSecret(config.businessAccountId),
    businessPhoneNumber: config.businessPhoneNumber,
    hasAccessToken: Boolean(config.accessToken),
    hasAppSecret: Boolean(config.appSecret),
    hasVerifyToken: Boolean(config.verifyToken),
    templates: {
      anamnesis: getEnv("WHATSAPP_TEMPLATE_ANAMNESIS") || null,
      appointmentReminder: getEnv("WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER") || null,
      document: getEnv("WHATSAPP_TEMPLATE_DOCUMENT") || null,
      language: getEnv("WHATSAPP_TEMPLATE_LANGUAGE") || "pt_BR",
    },
    webhookUrl: `${getEnv("APP_URL") || "https://sistema.drwesleycamara.com.br"}/api/whatsapp/webhook`,
  };
}

export function verifyWhatsAppWebhookChallenge(mode: unknown, token: unknown, challenge: unknown) {
  const expectedToken = getWhatsAppConfig().verifyToken;
  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return String(challenge);
  }
  return null;
}

export function verifyWhatsAppWebhookSignature(rawBody: string | Buffer | undefined, signature: unknown) {
  const appSecret = getWhatsAppConfig().appSecret;
  if (!appSecret) {
    return true;
  }

  const signatureValue = Array.isArray(signature) ? signature[0] : signature;
  const rawSignature = String(signatureValue ?? "");
  if (!rawBody || !rawSignature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(rawSignature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private accessToken: string;
  private graphVersion: string;

  constructor(config: WhatsAppConfig) {
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.graphVersion = config.graphVersion;
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async sendTextMessage(to: string, text: string): Promise<any> {
    const payload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "text",
      text: { body: text, preview_url: true },
    };

    return this.postMessage(payload);
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode = "pt_BR",
    components: WhatsAppTemplateComponent[] = [],
  ): Promise<any> {
    const payload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };

    return this.postMessage(payload);
  }

  async uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", buffer, { filename, contentType: mimeType });

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/media`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...form.getHeaders(),
          },
          timeout: 60000,
        },
      );
      const mediaId = response.data?.id;
      if (!mediaId) throw new Error("Meta did not return media id.");
      return String(mediaId);
    } catch (error: any) {
      const details = error.response?.data || error.message;
      console.error("[WhatsApp Upload Error]", details);
      throw new Error(`Falha ao enviar midia para o WhatsApp: ${JSON.stringify(details)}`);
    }
  }

  async sendDocument(to: string, mediaId: string, filename: string, caption?: string): Promise<any> {
    const payload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "document",
      document: {
        id: mediaId,
        filename,
        ...(caption ? { caption } : {}),
      },
    };

    return this.postMessage(payload);
  }

  formatPhoneNumber(phone: string): string {
    const cleaned = String(phone ?? "").replace(/\D/g, "");
    if (!cleaned) return "";
    if (cleaned.length <= 11) return `55${cleaned}`;
    return cleaned;
  }

  private async postMessage(payload: WhatsAppMessagePayload) {
    try {
      const response = await this.client.post("/messages", payload);
      return response.data;
    } catch (error: any) {
      const details = error.response?.data || error.message;
      console.error("[WhatsApp API Error]", details);
      throw new Error(`Falha ao enviar mensagem WhatsApp: ${JSON.stringify(details)}`);
    }
  }
}

export async function createWhatsAppService(): Promise<WhatsAppService | null> {
  const config = getWhatsAppConfig();

  if (!config.accessToken || !config.phoneNumberId || !config.businessAccountId) {
    console.warn("[WhatsApp] Missing Meta Cloud API configuration.");
    return null;
  }

  return new WhatsAppService(config);
}
