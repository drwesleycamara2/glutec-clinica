/**
 * Integração com Certillion — agregador de PSCs ICP-Brasil
 *
 * Documentação: https://certillion.com/certillion-api/
 *
 * Fluxo OAuth2 + PKCE:
 *   1) oauth/client_token    — autentica a aplicação (client_credentials)
 *   2) oauth/document        — upload opcional (pulamos: enviamos só hash)
 *   3) oauth/authorize       — URL p/ usuário autenticar no PSC (VIDAAS/BirdID)
 *   4) oauth/token           — troca "code" por access_token (com code_verifier)
 *   5) oauth/signature       — envia hash, recebe assinatura CMS
 *   6) oauth/document        — download opcional (PDF assinado)
 *   7) oauth/find-psc-accounts — descobre PSCs em que o CPF tem certificado
 *
 * Endpoints:
 *   - cloud.certillion.com      → PSCs em nuvem (VIDAAS, BirdID, etc.)
 *   - cloud-ws.certillion.com   → CERTILLION_SIGNER (A1/A3 local)
 */

import axios from "axios";
import { createHash, randomBytes } from "crypto";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CertillionPsc =
  | "VIDAAS"
  | "BIRDID"
  | "CERTILLION_SIGNER"
  | "SERPRO"
  | "SAFEID"
  | "SOLUTI";

export interface CertillionConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** cloud.certillion.com (padrão) ou cloud-ws.certillion.com (CERTILLION_SIGNER) */
  baseUrl?: string;
}

export interface SignatureHashRequest {
  /** SHA-256 do documento em base64 */
  hash: string;
  /** Rótulo legível exibido no app do usuário */
  alias: string;
}

export interface CertillionAuthorizeResult {
  authorizeUrl: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64URLEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash("sha256").update(verifier).digest());
}

/** SHA-256(content) em base64 (não base64url) — padrão Certillion */
export function documentHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("base64");
}

// ─── Cliente principal ────────────────────────────────────────────────────────

const DEFAULT_BASE = "https://cloud.certillion.com";

function extractApiError(data: any, status: number) {
  if (typeof data === "string" && data.trim()) return data.trim();
  return (
    data?.error_description ||
    data?.error ||
    data?.message ||
    data?.detail ||
    `HTTP ${status}`
  );
}

function buildFormBody(values: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params;
}

export class CertillionClient {
  private baseUrl: string;

  constructor(private config: CertillionConfig) {
    this.baseUrl = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  private oauthUrl(path: string) {
    return `${this.baseUrl}/css/restful/application/oauth/${path.replace(/^\/+/, "")}`;
  }

  /**
   * Etapa 1: token da aplicação (client_credentials).
   * Usado para chamadas que não exigem usuário (upload/download/find-psc-accounts).
   */
  async getClientToken(): Promise<{ accessToken: string; expiresIn: number }> {
    const body = buildFormBody({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
      lifetime: 300,
    });

    const resp = await axios.post(
      this.oauthUrl("client_token"),
      body.toString(),
      {
        timeout: 15000,
        validateStatus: () => true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    if (resp.status >= 400) {
      const msg = extractApiError(resp.data, resp.status);
      throw new Error(`Certillion /client_token: ${msg}`);
    }

    return {
      accessToken: resp.data.access_token,
      expiresIn: resp.data.expires_in ?? 3600,
    };
  }

  /**
   * Etapa 2 (opcional): upload do documento ao Certillion.
   * Retorna um document_id. Normalmente pulamos essa etapa e assinamos só pelo hash.
   */
  async uploadDocument(
    clientToken: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType = "application/pdf",
  ): Promise<{ documentId: string }> {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", fileBuffer, { filename: fileName, contentType: mimeType });

    const resp = await axios.post(this.oauthUrl("document"), form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${clientToken}` },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      const msg = extractApiError(resp.data, resp.status);
      throw new Error(`Certillion /document upload: ${msg}`);
    }

    return { documentId: resp.data.document_id || resp.data.id || "" };
  }

  /**
   * Etapa 3: constroi a URL de autorização.
   * O usuário deve abrir esta URL no navegador; o PSC exibe a tela de login /
   * push no app móvel. Ao aprovar, redireciona para redirectUri?code=...&state=...
   *
   * @param psc nome do PSC (VIDAAS, BIRDID, CERTILLION_SIGNER, etc.)
   * @param alias rótulo visível no aplicativo do PSC (ex: "Assinar prescrição #123")
   * @param cpf CPF do signatário (login_hint)
   * @param state identificador local da sessão (retorna no callback)
   */
  buildAuthorizeUrl(opts: {
    psc: CertillionPsc;
    alias: string;
    cpf: string;
    state: string;
    scope?: string;
    lifetimeSeconds?: number;
  }): CertillionAuthorizeResult {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: "code",
      manager_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: opts.scope || "signature_session",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: opts.state,
      psc: opts.psc,
      alias: opts.alias,
      login_hint: opts.cpf,
      lifetime: String(opts.lifetimeSeconds || 600),
    });

    return {
      authorizeUrl: `${this.oauthUrl("authorize")}?${params.toString()}`,
      codeVerifier,
      codeChallenge,
      state: opts.state,
    };
  }

  /**
   * Etapa 4: troca o `code` do callback por access_token.
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    psc?: CertillionPsc,
  ): Promise<{ accessToken: string; expiresIn: number; authorizedIdentification?: string }> {
    const body = buildFormBody({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      manager_id: this.config.clientId,
      manager_secret: this.config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
      psc: psc || undefined,
    });

    const resp = await axios.post(
      this.oauthUrl("token"),
      body.toString(),
      {
        timeout: 15000,
        validateStatus: () => true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      },
    );

    if (resp.status >= 400) {
      const msg = extractApiError(resp.data, resp.status);
      throw new Error(`Certillion /token: ${msg}`);
    }

    return {
      accessToken: resp.data.access_token,
      expiresIn: resp.data.expires_in ?? 600,
      authorizedIdentification: resp.data.authorized_identification,
    };
  }

  /**
   * Etapa 5: assina um ou mais hashes.
   * Retorna CMS (PKCS#7 detached) em base64 para cada hash enviado.
   */
  async signHashes(
    accessToken: string,
    hashes: SignatureHashRequest[],
    opts: { signatureFormat?: "CMS" | "PAdES" } = {},
  ): Promise<
    Array<{
      signatureCms: string;
      certificate?: string;
      alias?: string;
      hash?: string;
    }>
  > {
    const payload = {
      hashes: hashes.map((h, i) => ({
        id: `h${i}`,
        alias: h.alias,
        hash: h.hash,
        hash_algorithm: "2.16.840.1.101.3.4.2.1", // SHA-256 OID
        signature_format: opts.signatureFormat || "CMS",
      })),
    };

    const resp = await axios.post(this.oauthUrl("signature"), payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 60000,
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      const msg = extractApiError(resp.data, resp.status);
      throw new Error(`Certillion /signature: ${msg}`);
    }

    const signatures = Array.isArray(resp.data?.signatures)
      ? resp.data.signatures
      : Array.isArray(resp.data)
      ? resp.data
      : [resp.data];

    return signatures.map((s: any, i: number) => ({
      signatureCms: s.signature || s.cms || s.content || "",
      certificate: s.certificate || s.certificateInfo || "",
      alias: s.alias || hashes[i]?.alias,
      hash: s.hash || hashes[i]?.hash,
    }));
  }

  /**
   * Etapa 6 (opcional): baixa o documento assinado.
   * Só funciona se o upload foi feito via /oauth/document.
   */
  async downloadDocument(clientToken: string, documentId: string): Promise<Buffer> {
    const resp = await axios.get(`${this.oauthUrl(`document/${encodeURIComponent(documentId)}`)}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      responseType: "arraybuffer",
      timeout: 60000,
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      throw new Error(`Certillion /document download: HTTP ${resp.status}`);
    }
    return Buffer.from(resp.data);
  }

  /**
   * Etapa 7: descobre em quais PSCs um CPF/CNPJ tem certificado.
   */
  async findPscAccounts(
    clientToken: string,
    cpfOrCnpj: string,
  ): Promise<Array<{ psc: string; subject?: string; validity?: string }>> {
    const digits = cpfOrCnpj.replace(/\D/g, "");
    const documentType = digits.length > 11 ? "CNPJ" : "CPF";
    const resp = await axios.post(
      this.oauthUrl("user-discovery"),
      {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        user_cpf_cnpj: documentType,
        val_cpf_cnpj: digits,
      },
      {
        headers: {
          Authorization: `Bearer ${clientToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000,
        validateStatus: () => true,
      },
    );

    if (resp.status >= 400) {
      const msg = extractApiError(resp.data, resp.status);
      throw new Error(`Certillion /find-psc-accounts: ${msg}`);
    }

    return Array.isArray(resp.data?.accounts) ? resp.data.accounts : resp.data || [];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCertillionClient(opts?: Partial<CertillionConfig>): CertillionClient {
  const clientId = opts?.clientId || process.env.CERTILLION_CLIENT_ID;
  const clientSecret = opts?.clientSecret || process.env.CERTILLION_CLIENT_SECRET;
  const redirectUri = opts?.redirectUri || process.env.CERTILLION_REDIRECT_URI;
  const baseUrl = opts?.baseUrl || process.env.CERTILLION_BASE_URL || DEFAULT_BASE;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Certillion não configurado. Defina CERTILLION_CLIENT_ID, CERTILLION_CLIENT_SECRET e CERTILLION_REDIRECT_URI no .env do backend.",
    );
  }

  return new CertillionClient({ clientId, clientSecret, redirectUri, baseUrl });
}
