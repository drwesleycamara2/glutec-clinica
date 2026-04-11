/**
 * Integração com provedores de Assinatura Digital em Nuvem ICP-Brasil
 * Suporta: VIDaaS (Valid) e BirdID (Certisign/VaultID)
 *
 * Ambos implementam o mesmo contrato de API (IN PSC / ICP-Brasil):
 * - OAuth2 + PKCE (Authorization Code)
 * - Push notification para o app móvel do usuário
 * - Hash SHA-256 do documento enviado para assinatura
 * - Retorno de assinatura CMS (PKCS#7) para embutir no PDF
 */

import axios from "axios";
import { createHash, randomBytes } from "crypto";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CloudSignatureProvider = "vidaas" | "birdid";

export interface CloudSignatureConfig {
  provider: CloudSignatureProvider;
  clientId: string;
  clientSecret: string;
  /** CPF do signatário (11 dígitos, sem formatação) */
  signerCpf: string;
  /** URL de callback após autorização OAuth2 */
  redirectUri: string;
}

export interface SignatureRequest {
  /** ID único do documento no sistema */
  documentId: string;
  /** Rótulo legível exibido no app do usuário */
  alias: string;
  /** SHA-256 do conteúdo do documento em Base64 */
  hashBase64: string;
}

export interface InitiateResult {
  /** URL para redirecionar o usuário OU authorizeCode para push polling */
  authorizeUrl: string;
  /** PKCE code_verifier — guardar para trocar o token */
  codeVerifier: string;
  /** code_challenge enviado na URL */
  codeChallenge: string;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
  authorizedIdentification: string;
}

export interface SignatureResult {
  /** Assinatura CMS (PKCS#7 detached) em Base64 */
  signatureCms: string;
  /** Identificador do documento retornado pelo provedor */
  documentId: string;
  /** Informações do certificado */
  certificateInfo?: string;
}

// ─── URLs dos provedores ──────────────────────────────────────────────────────

const BASE_URLS: Record<CloudSignatureProvider, { prod: string; hml: string }> = {
  vidaas: {
    prod: "https://certificado.vidaas.com.br",
    hml: "https://hml-certificado.vidaas.com.br",
  },
  birdid: {
    prod: "https://api.birdid.com.br",
    hml: "https://apihom.birdid.com.br",
  },
};

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Calcula SHA-256 de um Buffer e retorna em Base64 */
export function documentHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("base64");
}

// ─── Cliente principal ────────────────────────────────────────────────────────

export class CloudSignatureClient {
  private baseUrl: string;

  constructor(
    private config: CloudSignatureConfig,
    private ambiente: "producao" | "homologacao" = "homologacao",
  ) {
    const urls = BASE_URLS[config.provider];
    this.baseUrl = ambiente === "producao" ? urls.prod : urls.hml;
  }

  /**
   * Gera a URL de autorização OAuth2 + PKCE para o provedor.
   * O usuário é redirecionado para esta URL; o app móvel exibe
   * uma notificação push para confirmar a assinatura.
   */
  buildAuthorizeUrl(
    requests: SignatureRequest[],
    scope: "single_signature" | "multi_signature" | "signature_session" = "multi_signature",
    lifetimeSeconds = 300,
  ): InitiateResult {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // O scope multi_signature permite assinar N hashes numa requisição
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope,
      login_hint: this.config.signerCpf,
      lifetime: String(lifetimeSeconds),
      redirect_uri: this.config.redirectUri,
    });

    const authorizeUrl = `${this.baseUrl}/v0/oauth/authorize?${params.toString()}`;

    return { authorizeUrl, codeVerifier, codeChallenge };
  }

  /**
   * Inicia o fluxo de assinatura via Push (sem redirect do navegador).
   * Retorna o authorize code para polling no backend.
   *
   * No push flow, o redirect_uri é "push://" e o app recebe uma notificação.
   * O backend faz polling em /valid/api/v1/trusted-services/authentications
   * até receber o authorizationToken.
   */
  async initiatePushSignature(
    requests: SignatureRequest[],
    scope: "single_signature" | "multi_signature" | "signature_session" = "multi_signature",
    lifetimeSeconds = 300,
  ): Promise<{ authorizeCode: string; codeVerifier: string; pollUrl: string }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope,
      login_hint: this.config.signerCpf,
      lifetime: String(lifetimeSeconds),
      redirect_uri: "push://",
    });

    // A chamada GET retorna imediatamente com o code que usaremos para polling
    const resp = await axios.get(`${this.baseUrl}/v0/oauth/authorize`, {
      params: Object.fromEntries(params),
      timeout: 15000,
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      const msg = resp.data?.error_description || resp.data?.error || `HTTP ${resp.status}`;
      throw new Error(`Erro ao iniciar assinatura push: ${msg}`);
    }

    // O authorize_code vem no redirect_uri ou no body dependendo do provedor
    const authorizeCode: string =
      resp.data?.code ||
      resp.data?.authorize_code ||
      resp.data?.authorizationCode ||
      (typeof resp.data === "string" ? resp.data : "");

    if (!authorizeCode) {
      throw new Error("Provedor não retornou código de autorização push.");
    }

    // URL de polling para Vidaas; BirdID usa callback (webhook)
    const pollUrl =
      this.config.provider === "vidaas"
        ? `${this.baseUrl}/valid/api/v1/trusted-services/authentications`
        : `${this.baseUrl}/v0/oauth/token`; // BirdID: tenta troca direta

    return { authorizeCode, codeVerifier, pollUrl };
  }

  /**
   * Faz polling para verificar se o usuário autorizou no app.
   * Retorna o authorizationToken quando aprovado, null quando pendente.
   */
  async pollPushAuthorization(
    authorizeCode: string,
  ): Promise<{ done: boolean; authorizationToken?: string }> {
    if (this.config.provider === "vidaas") {
      const resp = await axios.get(
        `${this.baseUrl}/valid/api/v1/trusted-services/authentications`,
        {
          params: { code: authorizeCode },
          timeout: 10000,
          validateStatus: () => true,
        },
      );

      if (resp.status === 200 && resp.data?.authorizationToken) {
        return { done: true, authorizationToken: resp.data.authorizationToken };
      }
      // 202 = ainda pendente
      return { done: false };
    }

    // BirdID: tenta trocar o code por token (responde 400 enquanto pendente)
    try {
      const token = await this.exchangeCodeForToken(authorizeCode, "pending-poll");
      return { done: true, authorizationToken: authorizeCode }; // code já serve de token
    } catch {
      return { done: false };
    }
  }

  /**
   * Troca o authorization code pelo access token.
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<TokenResult> {
    const resp = await axios.post(
      `${this.baseUrl}/v0/oauth/token`,
      {
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.config.redirectUri,
      },
      {
        timeout: 15000,
        validateStatus: () => true,
      },
    );

    if (resp.status >= 400) {
      const msg = resp.data?.error_description || resp.data?.error || `HTTP ${resp.status}`;
      throw new Error(`Erro ao obter token: ${msg}`);
    }

    return {
      accessToken: resp.data.access_token,
      expiresIn: resp.data.expires_in ?? 300,
      authorizedIdentification: resp.data.authorized_identification || "",
    };
  }

  /**
   * Envia os hashes para assinatura e retorna as assinaturas CMS.
   * O provider assina localmente no dispositivo do usuário e retorna
   * somente a assinatura — NUNCA o conteúdo do documento.
   */
  async signHashes(
    accessToken: string,
    requests: SignatureRequest[],
  ): Promise<SignatureResult[]> {
    const hashes = requests.map((r) => ({
      id: r.documentId,
      alias: r.alias,
      hash: r.hashBase64,
      hash_algorithm: "2.16.840.1.101.3.4.2.1", // SHA-256 OID
      signature_format: "CMS",
    }));

    const resp = await axios.post(
      `${this.baseUrl}/v0/oauth/signature`,
      { hashes },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000,
        validateStatus: () => true,
      },
    );

    if (resp.status >= 400) {
      const msg =
        resp.data?.error_description || resp.data?.error || resp.data?.message || `HTTP ${resp.status}`;
      throw new Error(`Erro ao assinar documento: ${msg}`);
    }

    const results = Array.isArray(resp.data?.signatures)
      ? resp.data.signatures
      : Array.isArray(resp.data)
      ? resp.data
      : [resp.data];

    return results.map((r: any, i: number) => ({
      signatureCms: r.signature || r.cms || r.content || "",
      documentId: r.id || requests[i]?.documentId || String(i),
      certificateInfo: r.certificate || r.certificateInfo || "",
    }));
  }
}

// ─── Factory com configuração do banco ───────────────────────────────────────

export function createCloudSignatureClient(
  provider: CloudSignatureProvider,
  signerCpf: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  ambiente: "producao" | "homologacao" = "homologacao",
): CloudSignatureClient {
  return new CloudSignatureClient(
    { provider, clientId, clientSecret, signerCpf, redirectUri },
    ambiente,
  );
}
