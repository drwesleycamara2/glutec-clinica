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
import * as dbComplete from "../db_complete";

function getRequestBaseUrl(req: express.Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host || "localhost:3000";
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const safeProtocol = Array.isArray(protocol) ? protocol[0] : protocol;
  const safeHost = Array.isArray(host) ? host[0] : host;
  return `${safeProtocol}://${safeHost}`;
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

function addNoIndexHeaders(res: express.Response) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
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
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(params.title)}" />
    <meta property="og:description" content="${escapeHtml(params.description)}" />
    <meta property="og:url" content="${escapeHtml(params.pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(params.imageUrl)}" />
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
        <img class="logo" src="${escapeHtml(params.imageUrl)}" alt="Clínica Glutée" />
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

  app.use((req, res, next) => {
    addNoIndexHeaders(res);
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/robots.txt", (_req, res) => {
    addNoIndexHeaders(res);
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  registerAuthRoutes(app);

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

    const result = await transcribeAudio({
      audioUrl,
      language: typeof language === "string" ? language : "pt",
      prompt: typeof prompt === "string" ? prompt : undefined,
    });

    if ("error" in result) {
      const detail = result.details ? ` ${result.details}` : "";
      return res.status(400).send(`${result.error}.${detail}`.trim());
    }

    return res.json(result);
  });

  app.get("/anamnese-publica/:token", async (req, res) => {
    addNoIndexHeaders(res);

    const token = String(req.params.token ?? "");
    const link = await dbComplete.getAnamnesisShareLinkByToken(token);
    if (!link) {
      return res.status(404).type("text/html").send("<h1>Link de anamnese não encontrado ou expirado.</h1>");
    }

    const baseUrl = getRequestBaseUrl(req);
    const pageUrl = `${baseUrl}/anamnese-publica/${token}`;
    const redirectUrl = `${baseUrl}/anamnese-preencher/${token}`;
    const imageUrl = `${baseUrl}/glutee-logo.png`;
    const title = link.title || "Preencher anamnese da Clínica Glutée";
    const description = `Clique para preencher sua anamnese com segurança antes do atendimento na Clínica Glutée.`;

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
    } = req.body ?? {};
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "Respostas da anamnese não informadas." });
    }

    try {
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
      );
      return res.json({ success: true });
    } catch (error: any) {
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
          category: typeof category === "string" && category.trim() ? category.trim() : "evolucao",
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

