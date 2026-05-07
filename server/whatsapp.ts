/**
 * WhatsApp Meta Cloud API Integration Service
 * Serviço para envio de mensagens via API oficial da Meta
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import { getClinicSettings } from "./db_complete";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
}

export interface WhatsAppMessagePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "text" | "template";
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
}

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private accessToken: string;

  constructor(config: WhatsAppConfig) {
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/v20.0/${this.phoneNumberId}`,
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Envia uma mensagem de texto simples
   */
  async sendTextMessage(to: string, text: string): Promise<any> {
    const payload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "text",
      text: { body: text, preview_url: true },
    };

    try {
      const response = await this.client.post("/messages", payload);
      return response.data;
    } catch (error: any) {
      console.error("[WhatsApp API Error]", error.response?.data || error.message);
      throw new Error(`Erro ao enviar mensagem WhatsApp: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Envia uma mensagem baseada em template (necessário para iniciar conversas)
   */
  async sendTemplateMessage(to: string, templateName: string, languageCode: string = "pt_BR", components: any[] = []): Promise<any> {
    const payload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };

    try {
      const response = await this.client.post("/messages", payload);
      return response.data;
    } catch (error: any) {
      console.error("[WhatsApp API Error]", error.response?.data || error.message);
      throw new Error(`Erro ao enviar template WhatsApp: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Faz upload de um arquivo de mídia para a API da Meta e retorna o media_id
   * Necessário para enviar documentos/imagens iniciados pela empresa
   */
  async uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", buffer, { filename, contentType: mimeType });

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v20.0/${this.phoneNumberId}/media`,
        form,
        {
          headers: {
            "Authorization": `Bearer ${this.accessToken}`,
            ...form.getHeaders(),
          },
          timeout: 60000,
        },
      );
      const mediaId = response.data?.id;
      if (!mediaId) throw new Error("Media ID não retornado pela API.");
      return String(mediaId);
    } catch (error: any) {
      console.error("[WhatsApp Upload Error]", error.response?.data || error.message);
      throw new Error(`Erro ao fazer upload de mídia: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Envia um documento (PDF) via media_id previamente obtido pelo uploadMedia()
   */
  async sendDocument(to: string, mediaId: string, filename: string, caption?: string): Promise<any> {
    const payload: any = {
      messaging_product: "whatsapp",
      to: this.formatPhoneNumber(to),
      type: "document",
      document: {
        id: mediaId,
        filename,
        ...(caption ? { caption } : {}),
      },
    };

    try {
      const response = await this.client.post("/messages", payload);
      return response.data;
    } catch (error: any) {
      console.error("[WhatsApp Send Document Error]", error.response?.data || error.message);
      throw new Error(`Erro ao enviar documento WhatsApp: ${JSON.stringify(error.response?.data || error.message)}`);
    }
  }

  /**
   * Formata o número de telefone para o padrão internacional (E.164) sem o sinal de +
   */
  private formatPhoneNumber(phone: string): string {
    // Remove tudo que não for dígito
    const cleaned = phone.replace(/\D/g, "");
    
    // Se não tiver o DDI (55 para Brasil), assume Brasil
    if (cleaned.length <= 11) {
      return `55${cleaned}`;
    }
    
    return cleaned;
  }
}

/**
 * Factory para criar o serviço de WhatsApp com base nas configurações da clínica
 */
export async function createWhatsAppService(): Promise<WhatsAppService | null> {
  const clinic = await getClinicSettings();

  const accessToken = clinic?.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = clinic?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = clinic?.whatsappBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !phoneNumberId || !businessAccountId) {
    console.warn("[WhatsApp] Configurações ausentes (Token, Phone ID ou Business Account ID).");
    return null;
  }

  return new WhatsAppService({
    accessToken,
    phoneNumberId,
    businessAccountId,
  });
}
