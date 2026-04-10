import type { Express } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
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
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || now - entry.lastReset > WINDOW_MS) {
    RATE_LIMIT.set(ip, { count: 1, lastReset: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
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
  app.post("/api/auth/login", async (req, res) => {
    const ip = req.ip || "unknown";

    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: "Muitas tentativas de login. Aguarde 15 minutos.",
      });
    }

    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha sao obrigatorios." });
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

    RATE_LIMIT.delete(ip);
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
      user.mustChangePassword ? 30 * 60 * 1000 : ONE_YEAR_MS
    );

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: user.mustChangePassword ? 30 * 60 * 1000 : ONE_YEAR_MS,
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
    const { tempToken, code } = req.body ?? {};
    if (!tempToken || !code) {
      return res.status(400).json({ error: "Token e codigo sao obrigatorios." });
    }

    const payload = await verifyTempTwoFactorToken(tempToken);
    if (!payload) {
      return res.status(401).json({ error: "Token invalido ou expirado. Faca login novamente." });
    }

    const user = await db.getUserById(payload.userId);
    if (!user || !user.twoFactorSecret) {
      return res.status(401).json({ error: "Usuario nao encontrado." });
    }

    if (!verifyTotpCode(code, user.twoFactorSecret)) {
      return res.status(401).json({ error: "Codigo invalido. Verifique o app autenticador." });
    }

    await db.updateUserLastSignedIn(user.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: true,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({ status: "ok", user: sanitizeUser((await db.getUserById(user.id)) ?? user) });
  });

  app.post("/api/auth/login/backup", async (req, res) => {
    const { tempToken, backupCode } = req.body ?? {};
    if (!tempToken || !backupCode) {
      return res.status(400).json({ error: "Token e codigo de backup sao obrigatorios." });
    }

    const payload = await verifyTempTwoFactorToken(tempToken);
    if (!payload) {
      return res.status(401).json({ error: "Token invalido ou expirado." });
    }

    const user = await db.getUserById(payload.userId);
    if (!user || !user.twoFactorBackupCodes) {
      return res.status(401).json({ error: "Usuario nao encontrado." });
    }

    const { valid, remainingCodesJson } = await verifyAndConsumeBackupCode(
      backupCode,
      user.twoFactorBackupCodes
    );

    if (!valid) {
      return res.status(401).json({ error: "Codigo de backup invalido." });
    }

    await db.updateUser2FABackupCodes(user.id, remainingCodesJson);
    await db.updateUserLastSignedIn(user.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: true,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({
      status: "ok",
      user: sanitizeUser((await db.getUserById(user.id)) ?? user),
      remainingBackupCodes: JSON.parse(remainingCodesJson).length,
    });
  });

  app.post("/api/auth/accept-invite", async (req, res) => {
    const { token, password, confirmPassword } = req.body ?? {};

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ error: "Token, senha e confirmacao sao obrigatorios." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "As senhas nao coincidem." });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, letra maiuscula, numero e caractere especial.",
      });
    }

    const invitation = await db.getInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: "Convite nao encontrado ou invalido." });
    }
    if (invitation.usedAt) {
      return res.status(409).json({ error: "Este convite ja foi utilizado." });
    }
    if (new Date() > invitation.expiresAt) {
      return res.status(410).json({ error: "Este convite expirou. Solicite um novo convite." });
    }

    const passwordHash = await hashPassword(password);
    const user = await db.createUserFromInvite({
      email: invitation.email,
      name: invitation.name ?? invitation.email,
      role: invitation.role,
      passwordHash,
    });

    if (!user) {
      return res.status(500).json({ error: "Erro ao criar conta. Tente novamente." });
    }

    await db.markInvitationUsed(invitation.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: false,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({ status: "requires_2fa_setup", user: sanitizeUser(user) });
  });

  app.post("/api/auth/change-password", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Sessao invalida. Faca login novamente." });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Nova senha e confirmacao sao obrigatorias." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "As senhas nao coincidem." });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, letra maiuscula, numero e caractere especial.",
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
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
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

    if (!invitation) return res.status(404).json({ error: "Convite nao encontrado." });
    if (invitation.usedAt) return res.status(409).json({ error: "Convite ja utilizado." });
    if (new Date() > invitation.expiresAt) return res.status(410).json({ error: "Convite expirado." });

    return res.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  });
}
