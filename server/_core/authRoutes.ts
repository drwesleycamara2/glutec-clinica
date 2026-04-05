/**
 * authRoutes.ts — Rotas Express para autenticação local
 *
 * POST /api/auth/login           — Login com e-mail + senha
 * POST /api/auth/login/2fa       — Verificar código 2FA após login
 * POST /api/auth/login/backup    — Login com código de backup 2FA
 * POST /api/auth/accept-invite   — Aceitar convite e definir senha
 * POST /api/auth/logout          — Logout
 * GET  /api/auth/me              — Retornar usuário atual (JSON)
 */

import type { Express } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import {
  verifyPassword,
  createSessionToken,
  createTempTwoFactorToken,
  verifyTempTwoFactorToken,
  hashPassword,
  generateSecureToken,
  authenticateRequest,
} from "./auth";
import { verifyTotpCode, verifyAndConsumeBackupCode } from "./totp";

const RATE_LIMIT = new Map<string, { count: number; lastReset: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);
  if (!entry || now - entry.lastReset > WINDOW_MS) {
    RATE_LIMIT.set(ip, { count: 1, lastReset: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export function registerAuthRoutes(app: Express) {
  // ─── Login com e-mail + senha ───────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const ip = req.ip || "unknown";

    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: "Muitas tentativas de login. Aguarde 15 minutos.",
      });
    }

    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await db.getUserByEmail(email.toLowerCase().trim());

    // Mensagem genérica para não revelar se o e-mail existe
    const genericError = { error: "E-mail ou senha incorretos." };

    if (!user) return res.status(401).json(genericError);
    if (!user.passwordHash) return res.status(401).json(genericError);
    if (user.status === "inactive") {
      return res.status(403).json({ error: "Sua conta foi desativada. Contate o administrador." });
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) return res.status(401).json(genericError);

    // Limpar rate limit após login bem-sucedido
    RATE_LIMIT.delete(ip);
    await db.updateUserLastSignedIn(user.id);

    // ── Verificar se precisa de 2FA ──────────────────────────────────────────
    if (user.twoFactorEnabled) {
      const tempToken = await createTempTwoFactorToken(user.id);
      return res.json({ status: "requires_2fa", tempToken });
    }

    // ── Verificar se precisa trocar senha ───────────────────────────────────
    if (user.mustChangePassword) {
      const sessionToken = await createSessionToken({
        userId: user.id,
        email: user.email!,
        role: user.role,
        twoFactorVerified: false,
      }, 30 * 60 * 1000); // 30 minutos para trocar senha

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 30 * 60 * 1000 });
      return res.json({ status: "must_change_password" });
    }

    // ── Login completo ───────────────────────────────────────────────────────
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: false,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({ status: "ok", user: sanitizeUser(user) });
  });

  // ─── Verificar código 2FA ───────────────────────────────────────────────────
  app.post("/api/auth/login/2fa", async (req, res) => {
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

    const isValid = verifyTotpCode(code, user.twoFactorSecret);
    if (!isValid) {
      return res.status(401).json({ error: "Código inválido. Verifique o app autenticador." });
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
    return res.json({ status: "ok", user: sanitizeUser(user) });
  });

  // ─── Login com código de backup 2FA ────────────────────────────────────────
  app.post("/api/auth/login/backup", async (req, res) => {
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

    // Salvar códigos atualizados (o usado foi removido)
    await db.updateUser2FABackupCodes(user.id, remainingCodesJson);
    await db.updateUserLastSignedIn(user.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: true,
    });

    const cookieOptions = getSessionCookieOptions(req);
    const remainingCodes = JSON.parse(remainingCodesJson).length;
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({
      status: "ok",
      user: sanitizeUser(user),
      remainingBackupCodes: remainingCodes,
    });
  });

  // ─── Aceitar convite e definir senha ───────────────────────────────────────
  app.post("/api/auth/accept-invite", async (req, res) => {
    const { token, password, confirmPassword } = req.body ?? {};

    if (!token || !password) {
      return res.status(400).json({ error: "Token e senha são obrigatórios." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "As senhas não coincidem." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres." });
    }

    // Verificar força da senha
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUppercase || !hasNumber) {
      return res.status(400).json({
        error: "A senha deve conter pelo menos uma letra maiúscula e um número.",
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

    const passwordHash = await hashPassword(password);

    // Criar ou atualizar o usuário
    const user = await db.createUserFromInvite({
      email: invitation.email,
      name: invitation.name ?? invitation.email,
      role: invitation.role,
      passwordHash,
    });

    if (!user) {
      return res.status(500).json({ error: "Erro ao criar conta. Tente novamente." });
    }

    // Marcar convite como usado
    await db.markInvitationUsed(invitation.id);

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email!,
      role: user.role,
      twoFactorVerified: false,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    return res.json({ status: "ok", user: sanitizeUser(user) });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });

  // ─── Me (usuário atual) ─────────────────────────────────────────────────────
  app.get("/api/auth/me", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ user: null });
    return res.json({ user: sanitizeUser(user) });
  });

  // ─── Verificar convite ──────────────────────────────────────────────────────
  app.get("/api/auth/invite/:token", async (req, res) => {
    const invitation = await db.getInvitationByToken(req.params.token);

    if (!invitation) return res.status(404).json({ error: "Convite não encontrado." });
    if (invitation.usedAt) return res.status(409).json({ error: "Convite já utilizado." });
    if (new Date() > invitation.expiresAt) return res.status(410).json({ error: "Convite expirado." });

    return res.json({
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  });
}

// Remover campos sensíveis do objeto usuário antes de enviar ao cliente
function sanitizeUser(user: any) {
  const { passwordHash, twoFactorSecret, twoFactorBackupCodes, ...safe } = user;
  return safe;
}
