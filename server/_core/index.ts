import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { setupVite } from "./vite";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";

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

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Bypass route for emergency access
  app.get("/api/auth/bypass", (req, res) => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcGVuSWQiOiJpbnZpdGVkX2NvbnRhdG9AZHJ3ZXNsZXljYW1hcmEuY29tLmJyIiwiYXBwSWQiOiJnbHV0ZWMtY2xpbmljYSIsIm5hbWUiOiJXXHUwMDU5c2xleSBDXHUwMGUybWFyYSIsImV4cCI6MTgwNTU5ODcyMn0.N1EIyswOt_MavEnB_J6qEd_tLIsDXc8DQK8h9lz-GnQ";
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.redirect(302, "/");
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

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
    const distPath = path.resolve(import.meta.dirname, "../..", "dist", "public");
    
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
