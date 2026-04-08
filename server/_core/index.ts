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
