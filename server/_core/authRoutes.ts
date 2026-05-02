import type { Express } from "express";
import {
  COOKIE_NAME,
  MUST_CHANGE_PASSWORD_SESSION_MS,
  SESSION_DURATION_MS,
} from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import {
  authenticateRequest,
  createSessionToken,
  createTempTwoFactorToken,
  hashPassword,
  verifyPassword,
  verifyTempTwoFactorToken,
} from "./auth";
import { verifyAndConsumeBackupCode, verifyTotpCode } from "./totp";

const RATE_LIMIT = new Map<string, { count: number; lastReset: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_BUCKETS = {
  login: 5,
  "2fa": 10,
  backup: 10,
  "accept-invite": 8,
} as const;

type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS;

function checkRateLimit(ip: string, bucket: RateLimitBucket): boolean {
  const key = `${bucket}:${ip}`;
  const max = RATE_LIMIT_BUCKETS[bucket];
  const now = Date.now();
  const entry = RATE_LIMIT.get(key);
  if (!entry || now - entry.lastReset > WINDOW_MS) {
    RATE_LIMIT.set(key, { count: 1, lastReset: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

function clearRateLimit(ip: string, bucket: RateLimitBucket) {
  RATE_LIMIT.delete(`${bucket}:${ip}`);
}

const ALLOWED_ORIGINS = new Set<string>(
  String(process.env.APP_URL ?? "")
    .split(/[\s,]+/)
    .filter(Boolean),
);

function requestSameOrigin(req: import("express").Request): boolean {
  const origin = String(req.headers.origin ?? "");
  if (!origin) {
    // Sem header Origin: aceita só requisição mesma-origem implícita
    // (via Referer alinhado ao Host).
    const referer = String(req.headers.referer ?? "");
    if (!referer) return true;
    try {
      const url = new URL(referer);
      const host = String(req.headers.host ?? "");
      return url.host === host;
    } catch {
      return false;
    }
  }
  if (ALLOWED_ORIGINS.size > 0 && ALLOWED_ORIGINS.has(origin)) return true;
  // Fallback: aceitar quando o Origin coincide com o Host do request (mesmo domínio).
  try {
    const url = new URL(origin);
    const host = String(req.headers.host ?? "");
    return url.host === host;
  } catch {
    return false;
  }
}

function isStrongPassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function sanitizeUser(user: any) {
  const { passwordHash, password, twoFactorSecret, twoFactorBackupCodes, ...safe } = user;
  return safe;
}

export function registerAuthRoutes(app: Express) {
  // Bloqueia POST/PUT/PATCH/DELETE em /api/auth/* vindos de outra origem
  // (defesa em profundidade contra CSRF, complementando SameSite=lax).
  app.use("/api/auth", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    if (!requestSameOrigin(req)) {
      return res.status(403).json({ error: "Origem da requisição não permitida." });
    }
    return next();
  });

  app.post("/api/auth/login", async (req, res) => {
    const ip = req.ip || "unknown";

    if (!checkRateLimit(ip, "login")) {
      return res.status(429).json({
        error: "Muitas tentativas de login. Aguarde 15 minutos.",
      });
    }

    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await db.getUserByEmail(String(email).toLowerCase().trim());
    const storedPasswordHash = (user as any)?.passwordHash ?? (user as any)?.password;
    const genericError = { error: "E-mail ou senha incorretos." };

    if (!user || !storedPasswordHash) return res.status(401).json(genericError);
    if (user.status === "inactive") {
      return res.status(403).json({ error: "Sua conta foi desativada. Contate o administrador." });
    }

    const passwordOk = await verifyPassword(password, storedPasswordHash);
    if (!passwordOk) return res.status(401).json(genericError);

    clearRateLimit(ip, "login");
    await db.updateUserLastSignedIn(user.id);

    if (user.twoFactorEnabled) {
      const tempToken = await createTempTwoFactorToken(user.id);
      return res.json({ status: "requires_2fa", tempToken });
    }

    const sessionToken = await createSessionToken(
      {
        userId: user.id,
        email: user.email!,
        role: user.role,
        twoFactorVerified: false,
      },
      user.mustChangePassword
        ? MUST_CHANGE_PASSWORD_SESSION_MS
        : SESSION_DURATION_MS
    );

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: user.mustChangePassword ? MUST_CHANGE_PASSWORD_SESSION_MS : SESSION_DURATION_MS,
    });

    if (user.mustChangePassword) {
      return res.json({ status: "must_change_password" });
    }

    return res.json({
      status: "requires_2fa_setup",
      user: sanitizeUser(user),
    });
  });

  app.post("/api/auth/login/2fa", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip, "2fa")) {
      return res.status(429).json({
        error: "Muitas tentativas de verificação 2FA. Aguarde 15 minutos.",
      });
    }

    const { tempToken, code } = req.body ?? {};
    if (!tempToken || !code) {
      return res.status(400).json({ error: "Token e código são obrigatórios." });
    }

    const payload = await verifyTempTwoFactorToken(tempToken);
    if (!payload) {
      return res.status(401).json({ error: "Token inválido ou expirado. Faça login novamente." });
    }

    const user = await db.getUserById(payload.userId);
    if (!user || !user.twoFactorSecret) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }

    if (!verifyTotpCode(code, user.twoFactorSecret)) {
      return res.status(401).json({ error: "Código inválido. Verifique o aplicativo autenticador." });
    }

    clearRateLimit(ip, "2fa");
    await db.updateUserLastSignedIn(user.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: true,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
    return res.json({ status: "ok", user: sanitizeUser((await db.getUserById(user.id)) ?? user) });
  });

  app.post("/api/auth/login/backup", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip, "backup")) {
      return res.status(429).json({
        error: "Muitas tentativas com códigos de backup. Aguarde 15 minutos.",
      });
    }

    const { tempToken, backupCode } = req.body ?? {};
    if (!tempToken || !backupCode) {
      return res.status(400).json({ error: "Token e código de backup são obrigatórios." });
    }

    const payload = await verifyTempTwoFactorToken(tempToken);
    if (!payload) {
      return res.status(401).json({ error: "Token inválido ou expirado." });
    }

    const user = await db.getUserById(payload.userId);
    if (!user || !user.twoFactorBackupCodes) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }

    const { valid, remainingCodesJson } = await verifyAndConsumeBackupCode(
      backupCode,
      user.twoFactorBackupCodes
    );

    if (!valid) {
      return res.status(401).json({ error: "Código de backup inválido." });
    }

    await db.updateUser2FABackupCodes(user.id, remainingCodesJson);
    clearRateLimit(ip, "backup");
    await db.updateUserLastSignedIn(user.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: true,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
    return res.json({
      status: "ok",
      user: sanitizeUser((await db.getUserById(user.id)) ?? user),
      remainingBackupCodes: JSON.parse(remainingCodesJson).length,
    });
  });

  app.post("/api/auth/accept-invite", async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkRateLimit(ip, "accept-invite")) {
      return res.status(429).json({
        error: "Muitas tentativas de uso de convite. Aguarde 15 minutos.",
      });
    }

    const { token, password, confirmPassword } = req.body ?? {};

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ error: "Token, senha e confirmação são obrigatórios." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "As senhas não coincidem." });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, letra maiúscula, número e caractere especial.",
      });
    }

    const invitation = await db.getInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: "Convite não encontrado ou inválido." });
    }
    if (invitation.usedAt) {
      return res.status(409).json({ error: "Este convite já foi utilizado." });
    }
    if (new Date() > invitation.expiresAt) {
      return res.status(410).json({ error: "Este convite expirou. Solicite um novo convite." });
    }

    const invitedUser = await db.getUserByEmail(invitation.email);
    const passwordHash = await hashPassword(password);
    const user = await db.createUserFromInvite({
      email: invitation.email,
      name: invitation.name ?? invitation.email,
      role: invitation.role,
      passwordHash,
      profession: invitedUser?.profession ?? null,
    });

    if (!user) {
      return res.status(500).json({ error: "Erro ao criar a conta. Tente novamente." });
    }

    await db.markInvitationUsed(invitation.id);
    clearRateLimit(ip, "accept-invite");

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: false,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
    return res.json({ status: "requires_2fa_setup", user: sanitizeUser(user) });
  });

  app.post("/api/auth/change-password", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Nova senha e confirmação são obrigatórias." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "As senhas não coincidem." });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, letra maiúscula, número e caractere especial.",
      });
    }

    const storedPasswordHash = (user as any).passwordHash ?? (user as any).password;
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Informe sua senha atual." });
      }
      if (!storedPasswordHash || !(await verifyPassword(currentPassword, storedPasswordHash))) {
        return res.status(401).json({ error: "Senha atual incorreta." });
      }
    }

    const passwordHash = await hashPassword(newPassword);
    await db.updateUserPassword(user.id, passwordHash);
    const updatedUser = (await db.getUserById(user.id)) ?? user;

    const sessionToken = await createSessionToken({
      userId: updatedUser.id,
      email: updatedUser.email!,
      role: updatedUser.role,
      twoFactorVerified: false,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
    return res.json({
      status: updatedUser.twoFactorEnabled ? "ok" : "requires_2fa_setup",
      user: sanitizeUser(updatedUser),
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ user: null });
    return res.json({ user: sanitizeUser(user) });
  });

  app.get("/api/auth/invite/:token", async (req, res) => {
    const invitation = await db.getInvitationByToken(req.params.token);

    if (!invitation) return res.status(404).json({ error: "Convite não encontrado." });
    if (invitation.usedAt) return res.status(409).json({ error: "Convite já utilizado." });
    if (new Date() > invitation.expiresAt) return res.status(410).json({ error: "Convite expirado." });

    const invitedUser = await db.getUserByEmail(invitation.email);
    const jobTitles = String(invitedUser?.profession ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return res.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      jobTitles,
      expiresAt: invitation.expiresAt,
    });
  });
}
