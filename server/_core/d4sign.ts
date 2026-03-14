/**
 * D4Sign Integration Client
 * Handles digital document signing via D4Sign API
 * Documentation: http://docapi.d4sign.com.br/
 */

import crypto from "crypto";
// Use native fetch from Node.js 18+
const fetch = globalThis.fetch;

interface D4SignConfig {
  tokenAPI: string;
  cryptKey: string;
}

interface D4SignDocument {
  uuid: string;
  name: string;
  file: Buffer | string; // Base64 or Buffer
  signers: Array<{
    email: string;
    name: string;
    cpf?: string;
  }>;
}

interface D4SignResponse {
  status: number;
  message: string;
  data?: any;
}

export class D4SignClient {
  private config: D4SignConfig;
  private baseUrl = "https://api.d4sign.com.br/api/v1";

  constructor(tokenAPI: string, cryptKey: string) {
    if (!tokenAPI || !cryptKey) {
      throw new Error("D4Sign credentials are required (tokenAPI and cryptKey)");
    }
    this.config = { tokenAPI, cryptKey };
  }

  /**
   * Encrypt data using the crypto key
   */
  private encrypt(data: string): string {
    const cipher = crypto.createCipher("aes-256-cbc", this.config.cryptKey);
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
  }

  /**
   * Decrypt data using the crypto key
   */
  private decrypt(encryptedData: string): string {
    const decipher = crypto.createDecipher("aes-256-cbc", this.config.cryptKey);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Make authenticated request to D4Sign API
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<D4SignResponse> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.tokenAPI}`,
      };

      const options: any = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      return {
        status: response.status,
        message: response.statusText,
        data,
      };
    } catch (error) {
      console.error("[D4Sign API Error]", error);
      throw new Error(`D4Sign API request failed: ${error}`);
    }
  }

  /**
   * Upload a document to D4Sign
   */
  async uploadDocument(doc: D4SignDocument): Promise<string> {
    try {
      // Convert file to base64 if it's a Buffer
      const fileBase64 =
        typeof doc.file === "string" ? doc.file : doc.file.toString("base64");

      const payload = {
        uuid: doc.uuid,
        name: doc.name,
        file: fileBase64,
        signers: doc.signers.map((signer) => ({
          email: signer.email,
          name: signer.name,
          cpf: signer.cpf || "",
        })),
      };

      const response = await this.makeRequest("POST", "/documents", payload);

      if (response.status >= 200 && response.status < 300) {
        return response.data?.uuid || doc.uuid;
      } else {
        throw new Error(
          `Failed to upload document: ${response.message} - ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      console.error("[D4Sign Upload Error]", error);
      throw error;
    }
  }

  /**
   * Get document status
   */
  async getDocumentStatus(documentUuid: string): Promise<any> {
    try {
      const response = await this.makeRequest(
        "GET",
        `/documents/${documentUuid}`
      );

      if (response.status >= 200 && response.status < 300) {
        return response.data;
      } else {
        throw new Error(
          `Failed to get document status: ${response.message}`
        );
      }
    } catch (error) {
      console.error("[D4Sign Status Error]", error);
      throw error;
    }
  }

  /**
   * Download signed document
   */
  async downloadSignedDocument(documentUuid: string): Promise<Buffer> {
    try {
      const url = `${this.baseUrl}/documents/${documentUuid}/download`;
      const headers = {
        Authorization: `Bearer ${this.config.tokenAPI}`,
      };

      const response = await fetch(url, { headers });

      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error(
          `Failed to download document: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error("[D4Sign Download Error]", error);
      throw error;
    }
  }

  /**
   * Cancel a document signing process
   */
  async cancelDocument(documentUuid: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        "DELETE",
        `/documents/${documentUuid}`
      );

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error("[D4Sign Cancel Error]", error);
      throw error;
    }
  }

  /**
   * List all documents
   */
  async listDocuments(limit = 50, offset = 0): Promise<any[]> {
    try {
      const response = await this.makeRequest(
        "GET",
        `/documents?limit=${limit}&offset=${offset}`
      );

      if (response.status >= 200 && response.status < 300) {
        return response.data?.documents || [];
      } else {
        throw new Error(`Failed to list documents: ${response.message}`);
      }
    } catch (error) {
      console.error("[D4Sign List Error]", error);
      throw error;
    }
  }

  /**
   * Send document for signature
   */
  async sendForSignature(
    documentUuid: string,
    signers: Array<{ email: string; name: string }>
  ): Promise<boolean> {
    try {
      const payload = {
        signers: signers.map((signer) => ({
          email: signer.email,
          name: signer.name,
        })),
      };

      const response = await this.makeRequest(
        "POST",
        `/documents/${documentUuid}/send`,
        payload
      );

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error("[D4Sign Send Error]", error);
      throw error;
    }
  }
}

// Singleton instance
let d4signClient: D4SignClient | null = null;

export function initD4SignClient(tokenAPI: string, cryptKey: string): D4SignClient {
  if (!d4signClient) {
    d4signClient = new D4SignClient(tokenAPI, cryptKey);
  }
  return d4signClient;
}

export function getD4SignClient(): D4SignClient | null {
  return d4signClient;
}
