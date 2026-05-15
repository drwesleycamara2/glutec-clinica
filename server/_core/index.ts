import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { setupVite } from "./vite";
import { registerAuthRoutes } from "./authRoutes";
import { authenticateRequest } from "./auth";
import { transcribeAudio } from "./voiceTranscription";
import { resolveSystemExport } from "../lib/system-export";
import { refineTranscriptToPtBr } from "../lib/clinical-transcription";
import * as dbComplete from "../db_complete";
import { storageGet } from "../storage";
import { verifyWhatsAppWebhookChallenge, verifyWhatsAppWebhookSignature } from "../whatsapp";

function getRequestBaseUrl(req: express.Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host || "localhost:3000";
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const rawProtocol = (Array.isArray(protocol) ? protocol[0] : protocol).split(",")[0]?.trim() || "https";
  const rawHost = (Array.isArray(host) ? host[0] : host).split(",")[0]?.trim() || "localhost:3000";
  const safeProtocol = rawProtocol.replace(/\\/g, "").replace(/:.+$/, "").toLowerCase();
  const safeHost = rawHost.replace(/\\/g, "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const normalizedProtocol = safeProtocol === "http" || safeProtocol === "https" ? safeProtocol : "https";
  return `${normalizedProtocol}://${safeHost || "localhost:3000"}`;
}

function sanitizeUploadKey(value?: string) {
  const fallback = `audio/${Date.now()}.webm`;
  const raw = String(value || fallback).replace(/\\/g, "/");
  const cleaned = raw
    .split("/")
    .filter(Boolean)
    .filter(segment => segment !== "." && segment !== "..")
    .map(segment => segment.replace(/[^a-zA-Z0-9._-]/g, ""))
    .filter(Boolean)
    .join("/");

  return cleaned || fallback;
}

function inferAudioMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
  };
  return map[extension] || "audio/webm";
}

function resolveProtectedUploadPath(audioUrl: string, req: express.Request) {
  let parsed: URL;
  try {
    parsed = new URL(audioUrl, getRequestBaseUrl(req));
  } catch {
    return null;
  }

  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").replace(/\\/g, "/");
  if (!relativePath.startsWith("uploads/")) return null;

  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
  const absolutePath = path.resolve(process.cwd(), "public", relativePath);
  if (absolutePath !== uploadRoot && !absolutePath.startsWith(`${uploadRoot}${path.sep}`)) return null;
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null;
  return absolutePath;
}

function addNoIndexHeaders(res: express.Response) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
}

function sanitizeClinicalHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*(javascript|vbscript):.*?\2/gi, "");
}

function renderClinicalDocumentHtml(document: any) {
  const type = String(document?.type ?? "").toLowerCase();
  const title =
    type.includes("declar") ? "Declaração" :
    type.includes("exame") || type.includes("solicitacao") ? "Solicitação de exames" :
    type.includes("laudo") ? "Laudo / relatório" :
    "Atestado médico";
  const content = sanitizeClinicalHtml(document?.content || document?.description || "");
  const patientName = document?.patientName ? `<p class="meta"><strong>Paciente:</strong> ${escapeHtml(document.patientName)}</p>` : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} - Clínica Glutée</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4efe4; font-family: Montserrat, Arial, sans-serif; color: #111827; }
    .sheet { position: relative; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 14mm 32mm 16mm; overflow: hidden; background: #fff; }
    .stripe { position: absolute; left: 0; top: 0; width: 7mm; height: 100%; background: linear-gradient(180deg, #8a6526, #f8dfa1 28%, #c79b38 56%, #7a561d); }
    .curve { position: absolute; left: -45mm; top: -55mm; width: 235mm; height: 98mm; background: radial-gradient(circle at 48% 52%, rgba(255,255,255,0.98) 0 46%, rgba(255,255,255,0) 47%), linear-gradient(110deg, #a77920, #f7d875 42%, #b98222 65%, #fff0b6); opacity: .95; border-radius: 0 0 85% 0; }
    header { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 18mm; align-items: flex-start; }
    .logo { width: 46mm; height: auto; }
    .doctor { text-align: right; padding-top: 4mm; }
    .doctor .name { font-family: Georgia, 'Times New Roman', serif; font-size: 20pt; font-style: italic; }
    .doctor .crm { margin-top: 2mm; font-size: 10pt; font-weight: 700; letter-spacing: 2px; }
    h1 { position: relative; z-index: 1; margin: 24mm 0 9mm; text-align: center; text-transform: uppercase; font-size: 19pt; }
    .content { position: relative; z-index: 1; font-size: 11.5pt; line-height: 1.36; text-align: justify; }
    .content p { margin: 0 0 2.2mm; }
    .content ul, .content ol { margin: 1.5mm 0 3mm 6mm; }
    .meta { font-size: 11pt; color: #374151; }
    .signature { position: absolute; left: 52mm; right: 25mm; bottom: 31mm; text-align: center; font-size: 10pt; }
    .line { border-top: 1.4px solid #111; margin: 0 0 2mm; }
    footer { position: absolute; left: 16mm; right: 14mm; bottom: 7mm; border-top: 1px solid #eadfca; padding-top: 2mm; font-size: 8.8pt; line-height: 1.25; color: #1f2937; }
    footer .clinic { font-weight: 700; color: #111827; }
    .actions { position: fixed; right: 18px; top: 18px; display: flex; gap: 8px; }
    .actions button { border: 1px solid #c79b38; border-radius: 8px; background: #fff8e5; padding: 8px 12px; cursor: pointer; font-weight: 700; }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; box-shadow: none; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir</button></div>
  <main class="sheet">
    <div class="stripe"></div>
    <div class="curve"></div>
    <header>
      <img class="logo" src="/logo-glutee.png" alt="Clínica Glutée" />
      <div class="doctor">
        <div class="name">Dr. Wésley de Sousa Câmara</div>
        <div class="crm">MÉDICO - CRM-SP: 174868</div>
      </div>
    </header>
    <h1>${escapeHtml(title)}</h1>
    <section class="content">
      ${patientName}
      ${content}
    </section>
    <section class="signature">
      <div class="line"></div>
      <div>Assinatura do profissional</div>
    </section>
    <footer>
      <div class="clinic">Clínica Glutée</div>
      <div>Tel/WhatsApp: (19) 99963-3913 · E-mail: contato@clinicaglutee.com.br · Instagram: @clinicaglutee</div>
      <div>Av. Marechal Castelo Branco, 282 - Morro do Ouro - Mogi Guaçu - SP</div>
    </footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAnamnesisPreviewPage(params: {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl: string;
  redirectUrl: string;
}) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
    <meta name="description" content="${escapeHtml(params.description)}" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/glutee-logo.png" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(params.title)}" />
    <meta property="og:description" content="${escapeHtml(params.description)}" />
    <meta property="og:url" content="${escapeHtml(params.pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(params.imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(params.imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Clínica Glutée" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(params.title)}" />
    <meta name="twitter:description" content="${escapeHtml(params.description)}" />
    <meta name="twitter:image" content="${escapeHtml(params.imageUrl)}" />
    <meta http-equiv="refresh" content="2;url=${escapeHtml(params.redirectUrl)}" />
    <style>
      body{margin:0;font-family:Montserrat,Arial,sans-serif;background:radial-gradient(circle at top right,rgba(201,165,91,.25),transparent 24%),linear-gradient(135deg,#050505,#141414 45%,#090909);color:#f6f1e6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .card{width:min(680px,100%);border:1px solid rgba(201,165,91,.28);background:linear-gradient(180deg,rgba(17,17,17,.96),rgba(8,8,8,.94));border-radius:28px;box-shadow:0 25px 80px rgba(0,0,0,.35);overflow:hidden}
      .hero{padding:28px 28px 18px;background:linear-gradient(135deg,rgba(201,165,91,.18),rgba(201,165,91,.02))}
      .logo{width:180px;max-width:70%;display:block;margin:0 auto 18px}
      h1{font-size:30px;line-height:1.15;margin:0 0 10px;text-align:center}
      p{margin:0;text-align:center;color:#d6cdbd;font-size:16px;line-height:1.7}
      .body{padding:22px 28px 28px}
      .cta{display:inline-flex;align-items:center;justify-content:center;margin:22px auto 0;padding:14px 22px;border-radius:999px;background:linear-gradient(135deg,#7f5b20,#d8b56a 54%,#9e7431);color:#1e1406;font-weight:700;text-decoration:none}
      .foot{margin-top:14px;font-size:13px;color:#ab9c84}
    </style>
  </head>
  <body>
    <main class="card">
      <section class="hero">
        <img class="logo" src="/glutee-logo.png" alt="Clínica Glutée" />
        <h1>${escapeHtml(params.title)}</h1>
        <p>${escapeHtml(params.description)}</p>
      </section>
      <section class="body">
        <div style="text-align:center">
          <a class="cta" href="${escapeHtml(params.redirectUrl)}">Clique para preencher a anamnese</a>
          <p class="foot">Você será redirecionado automaticamente em instantes.</p>
        </div>
      </section>
    </main>
    <script>setTimeout(function(){window.location.href=${JSON.stringify(params.redirectUrl)};},1200);</script>
  </body>
</html>`;
}

function serveProtectedDirectory(app: express.Express, routePath: string, absolutePath: string) {
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }

  const staticHandler = express.static(absolutePath, {
    fallthrough: false,
    setHeaders(res) {
      addNoIndexHeaders(res);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  });

  app.use(routePath, async (req, res, next) => {
    try {
      const user = await authenticateRequest(req);
      if (!user) {
        addNoIndexHeaders(res);
        return res.status(401).send("Sessão inválida. Faça login novamente.");
      }

      return staticHandler(req, res, next);
    } catch (error) {
      return next(error);
    }
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");

  app.use((req, res, next) => {
    addNoIndexHeaders(res);
    // Páginas/endpoints públicos com token na URL (anamnese, envio de mídia)
    // não devem vazar o token via header Referer para recursos externos.
    const path = req.path || req.url || "";
    const isPublicTokenRoute =
      path.startsWith("/formulario-seguro/") ||
      path.startsWith("/anamnese-publica/") ||
      path.startsWith("/anamnese-preencher/") ||
      path.startsWith("/envio-midias/") ||
      path.startsWith("/api/public/");
    res.setHeader("Referrer-Policy", isPublicTokenRoute ? "no-referrer" : "same-origin");
    // Cabeçalhos básicos de segurança (substituem helmet básico).
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(self), camera=(self)");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // Rate limit em endpoints públicos com token na URL: tokens podem ser
  // enumerados/probados sem autenticação. Limita 60 requisições por IP a cada
  // 15 minutos para o conjunto /api/public/*.
  const PUBLIC_RATE = new Map<string, { count: number; ts: number }>();
  const PUBLIC_WINDOW_MS = 15 * 60 * 1000;
  const PUBLIC_MAX = 60;
  app.use("/api/public", (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const entry = PUBLIC_RATE.get(ip);
    if (!entry || now - entry.ts > PUBLIC_WINDOW_MS) {
      PUBLIC_RATE.set(ip, { count: 1, ts: now });
      return next();
    }
    if (entry.count >= PUBLIC_MAX) {
      return res.status(429).json({ error: "Muitas requisições. Aguarde alguns minutos." });
    }
    entry.count += 1;
    return next();
  });

  // Configure body parser with larger size limit for file uploads.
  // Keep raw body for Meta webhook signature verification.
  app.use(express.json({
    limit: "50mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/robots.txt", (_req, res) => {
    addNoIndexHeaders(res);
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  registerAuthRoutes(app);

  app.get("/api/whatsapp/webhook", (req, res) => {
    addNoIndexHeaders(res);

    const challenge = verifyWhatsAppWebhookChallenge(
      req.query["hub.mode"],
      req.query["hub.verify_token"],
      req.query["hub.challenge"],
    );

    if (!challenge) {
      return res.status(403).send("Webhook do WhatsApp nao autorizado.");
    }

    return res.status(200).send(challenge);
  });

  app.post("/api/whatsapp/webhook", async (req: any, res) => {
    addNoIndexHeaders(res);

    if (!verifyWhatsAppWebhookSignature(req.rawBody, req.headers["x-hub-signature-256"])) {
      return res.status(403).json({ error: "Assinatura do webhook invalida." });
    }

    try {
      const result = await dbComplete.processWhatsAppWebhookPayload(req.body);
      return res.json(result);
    } catch (error) {
      console.error("[WhatsAppWebhook] Failed:", error);
      return res.status(500).json({ error: "Nao foi possivel processar o webhook do WhatsApp." });
    }
  });

  // ─── Cloud Signature OAuth2 Callback ─────────────────────────────────────
  app.get("/api/cloud-signature/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      return res.send(`<html><body><script>
        window.opener?.postMessage({ type: 'SIGNATURE_ERROR', error: '${error}' }, '*');
        window.close();
      </script><p>Erro: ${error}. Pode fechar esta janela.</p></body></html>`);
    }

    if (!code || !state) {
      return res.send(`<html><body><p>Parâmetros inválidos. Feche esta janela.</p></body></html>`);
    }

    const sessionId = parseInt(state, 10);
    if (!sessionId) {
      return res.send(`<html><body><p>Sessão inválida. Feche esta janela.</p></body></html>`);
    }

    try {
      const dbComplete = await import("../db_complete");
      const { createCloudSignatureClient } = await import("../lib/cloud-signature");

      const session = await dbComplete.getSignatureSession(sessionId);
      if (!session) throw new Error("Sessão não encontrada.");

      const config = await dbComplete.getCloudSignatureConfig(session.userId);
      if (!config) throw new Error("Configuração de assinatura não encontrada.");

      const appUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";
      const client = createCloudSignatureClient(
        config.provider, config.cpf, config.clientId, config.clientSecret,
        `${appUrl}/api/cloud-signature/callback`,
        config.ambiente ?? "homologacao",
      );

      const tokenResult = await client.exchangeCodeForToken(code, session.codeVerifier);
      const signatures = await client.signHashes(tokenResult.accessToken, [
        { documentId: `doc-${session.documentId}`, alias: session.documentAlias, hashBase64: session.documentHash },
      ]);

      const cms = signatures[0]?.signatureCms || "";
      const validationCode = Buffer.from(session.documentHash.slice(0, 48))
        .toString("hex").slice(0, 24).toUpperCase();

      await dbComplete.updateSignatureSession(sessionId, {
        status: "assinado", accessToken: tokenResult.accessToken, signatureCms: cms,
      });

      // Busca nome do usuário
      const userRows: any[] = [];
      try {
        const db2 = await import("../db");
        const getDb = db2.getDb;
        const { sql } = await import("drizzle-orm");
        const dbConn = await getDb();
        if (dbConn) {
          const rows = await dbConn.execute(sql`select name, email from users where id = ${session.userId} limit 1`);
          const arr = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
          if (arr[0]) userRows.push(arr[0]);
        }
      } catch {}
      const signedByName = userRows[0]?.name || userRows[0]?.email || "Médico";

      await dbComplete.applyDocumentSignature({
        documentType: session.documentType,
        documentId: session.documentId,
        sessionId,
        provider: config.provider,
        signedByName,
        signatureCms: cms,
        validationCode,
      });

      return res.send(`<html><head><meta charset="utf-8"></head><body><script>
        window.opener?.postMessage({ type: 'SIGNATURE_DONE', sessionId: ${sessionId}, validationCode: '${validationCode}' }, '*');
        setTimeout(() => window.close(), 1500);
      </script>
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#2d7a2d">✓ Documento assinado com sucesso!</h2>
        <p>Código de validação: <strong>${validationCode}</strong></p>
        <p>Esta janela fechará automaticamente.</p>
      </div></body></html>`);
    } catch (err: any) {
      const msg = err?.message || "Erro ao processar assinatura.";
      try {
        const dbComplete = await import("../db_complete");
        await dbComplete.updateSignatureSession(sessionId, { status: "erro", errorMessage: msg });
      } catch {}
      return res.send(`<html><head><meta charset="utf-8"></head><body><script>
        window.opener?.postMessage({ type: 'SIGNATURE_ERROR', error: '${msg.replace(/'/g, "\\'")}', sessionId: ${sessionId} }, '*');
        setTimeout(() => window.close(), 3000);
      </script>
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#c00">Erro na assinatura</h2>
        <p>${msg}</p>
        <p>Esta janela fechará automaticamente.</p>
      </div></body></html>`);
    }
  });

  // ─── Certillion OAuth2 Callback ──────────────────────────────────────────
  // Retorno do PSC (VIDAAS, BirdID, etc.) após autorização do usuário.
  // URL: /api/certillion/callback?code=...&state=<nonce>
  app.get("/api/certillion/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string>;
    if (error) {
      const msg = error_description || error;
      return res.send(`<html><body><script>
        window.opener?.postMessage({ type: 'CERTILLION_ERROR', error: '${String(msg).replace(/'/g, "\\'")}' }, '*');
        setTimeout(() => window.close(), 3000);
      </script><p>Erro: ${msg}</p></body></html>`);
    }
    if (!code || !state) {
      return res.send(`<html><body><p>Parâmetros inválidos. Feche esta janela.</p></body></html>`);
    }

    try {
      const dbComplete = await import("../db_complete");
      const { createCertillionClient } = await import("../lib/certillion");

      const session = await dbComplete.getSignatureSessionByState(state);
      if (!session) throw new Error("Sessão Certillion não encontrada para este state.");
      if (new Date(session.expiresAt) < new Date()) {
        await dbComplete.updateCertillionSession(session.id, { status: "expirado" });
        throw new Error("Sessão expirada. Inicie novamente a assinatura.");
      }

      const cfg = await dbComplete.getCertillionConfig();
      if (!cfg) throw new Error("Certillion não configurado no sistema.");

      const appUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";
      const redirectUri = cfg.redirectUri || `${appUrl}/api/certillion/callback`;

      const client = createCertillionClient({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri,
        baseUrl: cfg.baseUrl,
      });

      const tok = await client.exchangeCodeForToken(
        code,
        session.codeVerifier,
        session.psc as any,
      );
      const sigs = await client.signHashes(tok.accessToken, [
        { hash: session.documentHash, alias: session.documentAlias },
      ]);
      const cms = sigs[0]?.signatureCms || "";
      if (!cms) throw new Error("Certillion não retornou assinatura CMS.");

      const validationCode = Buffer.from(session.documentHash.slice(0, 48))
        .toString("hex")
        .slice(0, 24)
        .toUpperCase();

      await dbComplete.updateCertillionSession(session.id, {
        status: "assinado",
        accessToken: tok.accessToken,
        authorizeCode: code,
        signatureCms: cms,
      });

      // nome do usuário
      let signedByName = "Médico";
      try {
        const { getDb } = await import("../db");
        const { sql } = await import("drizzle-orm");
        const dbConn = await getDb();
        if (dbConn) {
          const r: any = await dbConn.execute(
            sql`select name, email from users where id = ${session.userId} limit 1`,
          );
          const arr = Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : [];
          signedByName = arr[0]?.name || arr[0]?.email || "Médico";
        }
      } catch {}

      await dbComplete.applyDocumentSignature({
        documentType: session.documentType,
        documentId: session.documentId,
        sessionId: session.id,
        provider: `certillion:${session.psc || "VIDAAS"}`,
        signedByName,
        signatureCms: cms,
        validationCode,
      });

      return res.send(`<html><head><meta charset="utf-8"></head><body><script>
        window.opener?.postMessage({ type: 'CERTILLION_DONE', sessionId: ${session.id}, validationCode: '${validationCode}' }, '*');
        setTimeout(() => window.close(), 1500);
      </script>
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#2d7a2d">✓ Documento assinado via Certillion</h2>
        <p>PSC: <strong>${session.psc || "-"}</strong></p>
        <p>Código de validação: <strong>${validationCode}</strong></p>
        <p>Esta janela fechará automaticamente.</p>
      </div></body></html>`);
    } catch (err: any) {
      const msg = err?.message || "Erro ao processar assinatura Certillion.";
      try {
        const dbComplete = await import("../db_complete");
        const s = await dbComplete.getSignatureSessionByState(state);
        if (s) await dbComplete.updateCertillionSession(s.id, { status: "erro", errorMessage: msg });
      } catch {}
      return res.send(`<html><head><meta charset="utf-8"></head><body><script>
        window.opener?.postMessage({ type: 'CERTILLION_ERROR', error: '${msg.replace(/'/g, "\\'")}' }, '*');
        setTimeout(() => window.close(), 3000);
      </script>
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#c00">Erro na assinatura (Certillion)</h2>
        <p>${msg}</p>
      </div></body></html>`);
    }
  });

  app.post("/api/upload", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).send("Sessão inválida. Faça login novamente.");
    }

    const { fileBase64, key, mimeType, fileName } = req.body ?? {};
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return res.status(400).send("Nenhum arquivo de áudio foi enviado.");
    }

    try {
      const safeKey = sanitizeUploadKey(key || fileName);
      const relativePath = path.join("uploads", safeKey);
      const absolutePath = path.resolve(process.cwd(), "public", relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

      const buffer = Buffer.from(fileBase64, "base64");
      const sizeInMb = buffer.byteLength / (1024 * 1024);
      if (sizeInMb > 16) {
        return res.status(400).send("Arquivo muito grande (máximo 16MB).");
      }

      fs.writeFileSync(absolutePath, buffer);

      return res.json({
        success: true,
        url: `${getRequestBaseUrl(req)}/${relativePath.replace(/\\/g, "/")}`,
        key: safeKey,
        mimeType: mimeType || "audio/webm",
      });
    } catch (error) {
      console.error("[AudioUpload] Failed:", error);
      return res.status(500).send("Não foi possível salvar o áudio no servidor.");
    }
  });

  app.post("/api/transcribe", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).send("Sessão inválida. Faça login novamente.");
    }

    const { audioUrl, language, prompt } = req.body ?? {};
    if (!audioUrl || typeof audioUrl !== "string") {
      return res.status(400).send("URL do áudio não informada.");
    }

    const localAudioPath = resolveProtectedUploadPath(audioUrl, req);
    const result = await transcribeAudio({
      audioUrl,
      audioBuffer: localAudioPath ? fs.readFileSync(localAudioPath) : undefined,
      mimeType: localAudioPath ? inferAudioMimeType(localAudioPath) : undefined,
      language: typeof language === "string" ? language : "pt",
      prompt: typeof prompt === "string" ? prompt : undefined,
    });

    if ("error" in result) {
      const detail = result.details ? ` ${result.details}` : "";
      return res.status(400).send(`${result.error}.${detail}`.trim());
    }

    try {
      const refinedTranscript = await refineTranscriptToPtBr(result.text || "");
      return res.json({
        ...result,
        text: refinedTranscript || result.text || "",
        refinedTranscript: refinedTranscript || result.text || "",
      });
    } catch (error) {
      console.warn("Falha ao refinar a transcrição clínica em PT-BR:", error);
      return res.json({
        ...result,
        refinedTranscript: result.text || "",
      });
    }
  });

  app.get("/anamnese-publica/:token", async (req, res) => {
    addNoIndexHeaders(res);
    return res.redirect(301, `/formulario-seguro/${encodeURIComponent(String(req.params.token ?? ""))}`);
  });

  app.get("/formulario-seguro/:token", async (req, res) => {
    addNoIndexHeaders(res);

    const token = String(req.params.token ?? "");
    const link = await dbComplete.getAnamnesisShareLinkByToken(token);
    if (!link) {
      return res.status(404).type("text/html").send("<h1>Link de anamnese não encontrado ou expirado.</h1>");
    }

    const baseUrl = getRequestBaseUrl(req);
    const pageUrl = `${baseUrl}/formulario-seguro/${token}`;
    const redirectUrl = `${baseUrl}/formulario-seguro/preencher/${token}`;
    const imageUrl = `${baseUrl}/logo-glutee.png?v=20260515`;
    const title = "Formulário seguro | Clínica Glutée";
    const description = "Preencha suas informações de saúde com segurança antes do atendimento na Clínica Glutée.";

    res.type("text/html").send(
      renderAnamnesisPreviewPage({
        title,
        description,
        imageUrl,
        pageUrl,
        redirectUrl,
      }),
    );
  });

  app.get("/api/public/anamnese/:token", async (req, res) => {
    addNoIndexHeaders(res);

    const link = await dbComplete.getAnamnesisShareLinkByToken(String(req.params.token ?? ""));
    if (!link) {
      return res.status(404).json({ error: "Link de anamnese não encontrado ou expirado." });
    }

    return res.json({
      patientName: link.patientName,
      title: link.title ?? "Preencher anamnese da Clínica Glutée",
      templateName: link.templateName ?? null,
      anamnesisDate: link.anamnesisDate ?? null,
      expiresAt: link.expiresAt,
      questions: link.questions ?? [],
      submittedAt: link.submittedAt ?? null,
      answers: link.answers ?? null,
      profilePhotoUrl: link.profilePhotoUrl ?? null,
    });
  });

  app.post("/api/public/anamnese/:token/submit", async (req, res) => {
    addNoIndexHeaders(res);

    const {
      answers,
      respondentName,
      profilePhotoBase64,
      profilePhotoMimeType,
      profilePhotoFileName,
      profilePhotoDeclarationAccepted,
      truthDeclarationAccepted,
    } = req.body ?? {};
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Respostas da anamnese não informadas." });
    }
    if (!truthDeclarationAccepted) {
      return res.status(400).json({ error: "Confirme a declaração de veracidade antes de enviar a anamnese." });
    }

    try {
      const forwardedFor = req.headers["x-forwarded-for"];
      const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || "").split(",")[0].trim();
      await dbComplete.submitAnamnesisShareLink(
        String(req.params.token ?? ""),
        answers as Record<string, string>,
        typeof respondentName === "string" ? respondentName : null,
        {
          base64: typeof profilePhotoBase64 === "string" ? profilePhotoBase64 : null,
          mimeType: typeof profilePhotoMimeType === "string" ? profilePhotoMimeType : null,
          fileName: typeof profilePhotoFileName === "string" ? profilePhotoFileName : null,
          declarationAccepted: Boolean(profilePhotoDeclarationAccepted),
        },
        {
          ipAddress: forwardedIp || req.socket.remoteAddress || null,
          userAgent: req.get("user-agent") || null,
          acceptedAt: new Date().toISOString(),
          method: "assinatura_eletronica_simples",
        },
      );
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[PublicAnamnesisSubmit] Failed:", error);
      return res.status(400).json({ error: error?.message || "Não foi possível enviar a anamnese." });
    }
  });

  app.get("/api/public/patient-media/:token", async (req, res) => {
    addNoIndexHeaders(res);

    const link = await dbComplete.getPatientMediaUploadLinkByToken(String(req.params.token ?? ""));
    if (!link) {
      return res.status(404).json({ error: "Link de envio não encontrado ou expirado." });
    }

    return res.json({
      patientName: link.patientName,
      folderName: link.folderName ?? null,
      allowVideos: Boolean(link.allowVideos),
      expiresAt: link.expiresAt,
      title: link.title ?? "Envio de imagens do paciente",
    });
  });

  app.post("/api/public/patient-media/:token/upload", async (req, res) => {
    addNoIndexHeaders(res);

    const link = await dbComplete.getPatientMediaUploadLinkByToken(String(req.params.token ?? ""));
    if (!link) {
      return res.status(404).json({ error: "Link de envio não encontrado ou expirado." });
    }

    const { base64, mimeType, description, category, originalFileName, takenAt } = req.body ?? {};
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ error: "Nenhum arquivo foi enviado." });
    }

    const normalizedMimeType = String(mimeType ?? "").toLowerCase();
    const isVideo = normalizedMimeType.startsWith("video/");
    if (isVideo && !link.allowVideos) {
      return res.status(400).json({ error: "Este link aceita somente imagens." });
    }

    try {
      const uploaded = await dbComplete.uploadPatientPhoto(
        {
          patientId: link.patientId,
          folderId: link.folderId ?? null,
          category: typeof category === "string" && category.trim() && category.trim() !== "perfil" ? category.trim() : "evolucao",
          description: typeof description === "string" ? description : null,
          base64,
          mimeType: typeof mimeType === "string" ? mimeType : "image/jpeg",
          originalFileName: typeof originalFileName === "string" ? originalFileName : null,
          takenAt: typeof takenAt === "string" ? takenAt : null,
          mediaSource: "patient",
        },
        Number(link.createdBy || 1),
      );

      return res.json({ success: true, media: uploaded });
    } catch (error) {
      console.error("[PatientMediaUpload] Failed:", error);
      return res.status(500).json({ error: "Não foi possível salvar a mídia enviada." });
    }
  });

  const importsPath = path.resolve(process.cwd(), "public", "imports");
  serveProtectedDirectory(app, "/imports", importsPath);

  const uploadsPath = path.resolve(process.cwd(), "public", "uploads");
  serveProtectedDirectory(app, "/uploads", uploadsPath);


  app.get("/api/patient-documents/:id/download", async (req, res) => {
    addNoIndexHeaders(res);

    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).send("Sessão inválida. Faça login novamente.");
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).send("Documento inválido.");
    }

    const document = await dbComplete.getPatientDocumentById(id);
    if (!document) {
      return res.status(404).send("Documento não encontrado.");
    }

    const fileKey = String((document as any).fileKey ?? "").replace(/^\/+/, "").trim();
    const rawFileUrl = String((document as any).rawFileUrl ?? "").trim();
    const fallbackUrl = String((document as any).url ?? (document as any).fileUrl ?? "").trim();
    const fileName = `${String((document as any).name || `documento-${id}`).replace(/[\\/:*?"<>|]+/g, "-").trim() || `documento-${id}`}.pdf`;
    const mimeType = String((document as any).mimeType ?? "").toLowerCase();
    const isClinicalTextDocument = Boolean((document as any).content)
      && (
        mimeType.includes("text/html")
        || mimeType.includes("text/plain")
        || ["atestado", "declaracao", "laudo", "solicitacao_exames"].includes(String((document as any).type ?? "").toLowerCase())
      );

    try {
      if (isClinicalTextDocument) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/\.pdf$/i, ".html")}"`);
        return res.send(renderClinicalDocumentHtml(document));
      }

      if (fileKey) {
        const publicRoot = path.resolve(process.cwd(), "public");
        const localCandidates = [fileKey];
        const legacyMatch = fileKey.match(/^legacy\/verde\/(.+)$/i);
        if (legacyMatch?.[1]) {
          localCandidates.unshift(`imports/prontuario-verde/${legacyMatch[1]}`);
        }

        for (const candidate of Array.from(new Set(localCandidates))) {
          if (!/^(imports|uploads)\//i.test(candidate)) continue;
          const absolutePath = path.resolve(publicRoot, candidate);
          const isInsidePublic = absolutePath === publicRoot || absolutePath.startsWith(`${publicRoot}${path.sep}`);
          if (!isInsidePublic || !fs.existsSync(absolutePath)) continue;

          res.setHeader("Content-Type", (document as any).mimeType || "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
          return res.sendFile(absolutePath);
        }

        const signed = await storageGet(fileKey);
        return res.redirect(signed.url);
      }

      const externalUrl = rawFileUrl || fallbackUrl;
      if (/^https?:\/\//i.test(externalUrl)) {
        return res.redirect(externalUrl);
      }

      return res.status(404).send("Arquivo do documento não encontrado.");
    } catch (error) {
      console.error("[PatientDocumentDownload] Failed:", { id, fileKey, error });
      return res.status(500).send("Não foi possível abrir o PDF deste documento.");
    }
  });


  app.get("/api/employee-documents/:id/download", async (req, res) => {
    addNoIndexHeaders(res);

    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).send("Sessão inválida. Faça login novamente.");
    }
    if (!dbComplete.canAccessEmployeeRecords(user)) {
      return res.status(403).send("Acesso restrito ao administrador sênior e à gerência.");
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).send("Documento inválido.");
    }

    try {
      const document = await dbComplete.getEmployeeDocumentById(id);
      if (!document || document.deletedAt) {
        return res.status(404).send("Documento não encontrado.");
      }

      const privateRoot = path.resolve(process.cwd(), "private", "employee-records");
      const absolutePath = path.resolve(process.cwd(), String(document.filePath ?? ""));
      if (absolutePath !== privateRoot && !absolutePath.startsWith(`${privateRoot}${path.sep}`)) {
        return res.status(403).send("Caminho de documento inválido.");
      }
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        return res.status(404).send("Arquivo do documento não encontrado.");
      }

      const fileName = String(document.originalFileName || document.title || `documento-${id}.pdf`).replace(/["\r\n]/g, "");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      return res.sendFile(absolutePath);
    } catch (error) {
      console.error("[EmployeeDocumentDownload] Failed:", { id, error });
      return res.status(500).send("Não foi possível abrir este documento funcional.");
    }
  });


  app.get("/api/admin/system-export/:token", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user || user.role !== "admin") {
      addNoIndexHeaders(res);
      return res.status(401).send("Sessão inválida. Faça login novamente.");
    }

    const exportItem = resolveSystemExport(String(req.params.token ?? ""), user.id);
    if (!exportItem) {
      addNoIndexHeaders(res);
      return res.status(404).send("Pacote de exportação não encontrado ou expirado.");
    }

    addNoIndexHeaders(res);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/octet-stream");
    return res.download(exportItem.filePath, exportItem.fileName);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    // Serve static files
    const distPath = path.resolve(process.cwd(), "dist", "public");

    if (!fs.existsSync(distPath)) {
      console.error(
        `Could not find the build directory: ${distPath}, make sure to build the client first`
      );
    }

    // Serve static files with custom skip function
    app.use((req, res, next) => {
      // Skip static file serving for API routes
      if (req.path.startsWith("/api/")) {
        return next();
      }
      // For non-API routes, try to serve static files
      express.static(distPath)(req, res, next);
    });

    // Fall through to index.html for SPA routing (only for non-API routes)
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Not found" });
      }
      // Serve index.html for all other routes (SPA routing)
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  const host = process.env.BIND_HOST || process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
