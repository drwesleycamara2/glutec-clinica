import type { Express } from "express";
import { randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import { passwordResetEmailTemplate, sendEmail } from "./mailerSafePtbr";
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
const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;

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

function getRequestBaseUrl(req: any) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host || "localhost:3000";
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const safeProtocol = Array.isArray(protocol) ? protocol[0] : protocol;
  const safeHost = Array.isArray(host) ? host[0] : host;
  return `${safeProtocol}://${safeHost}`;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/forgot-password", async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ error: "Informe o e-mail de acesso." });
    }

    const genericResponse = {
      message:
        "Se houver uma conta compatível com esse e-mail, você receberá um link seguro para redefinir a senha.",
    };

    const smtpSettings = await db.getSmtpSettings();
    if (!smtpSettings) {
      return res.json({
        ...genericResponse,
        warning:
          "A recuperação por e-mail ainda não está configurada neste ambiente. Contate o administrador do sistema.",
      });
    }

    const user = await db.getUserByEmail(email);
    const storedPasswordHash = (user as any)?.passwordHash ?? (user as any)?.password;
    if (!user || !storedPasswordHash || user.status === "inactive") {
      return res.json(genericResponse);
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = db.hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_WINDOW_MS);

    await db.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedIp: req.ip || null,
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 255) || null,
    });

    const resetUrl = `${getRequestBaseUrl(req)}/redefinir-senha/${rawToken}`;
    const { subject, html } = passwordResetEmailTemplate({
      name: user.name,
      resetUrl,
      expiresIn: "1 hora",
    });

    const result = await sendEmail({ to: email, subject, html });
    if (!result.success) {
      return res.json({
        ...genericResponse,
        warning:
          "Não foi possível enviar o e-mail de recuperação neste momento. Tente novamente em alguns minutos.",
      });
    }

    return res.json(genericResponse);
  });

  app.get("/api/auth/password-reset/:token", async (req, res) => {
    const rawToken = String(req.params?.token ?? "").trim();
    if (!rawToken) {
      return res.status(400).json({ error: "Link de recuperação inválido." });
    }

    const tokenRecord = await db.getPasswordResetTokenByHash(db.hashPasswordResetToken(rawToken));
    if (!tokenRecord) {
      return res.status(404).json({ error: "Link de recuperação inválido ou expirado." });
    }

    if (tokenRecord.usedAt) {
      return res.status(410).json({ error: "Esse link já foi utilizado." });
    }

    if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: "Esse link expirou. Solicite uma nova recuperação." });
    }

    if (tokenRecord.userStatus === "inactive") {
      return res.status(403).json({ error: "A conta vinculada está desativada." });
    }

    return res.json({ valid: true });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body ?? {};

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Token, nova senha e confirmação são obrigatórios." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "As senhas não coincidem." });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 8 caracteres, letra maiúscula, número e caractere especial.",
      });
    }

    const tokenRecord = await db.getPasswordResetTokenByHash(db.hashPasswordResetToken(String(token)));
    if (!tokenRecord) {
      return res.status(404).json({ error: "Link de recuperação inválido ou expirado." });
    }

    if (tokenRecord.usedAt) {
      return res.status(410).json({ error: "Esse link já foi utilizado." });
    }

    if (new Date(tokenRecord.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ error: "Esse link expirou. Solicite uma nova recuperação." });
    }

    const user = await db.getUserById(Number(tokenRecord.userId));
    if (!user || user.status === "inactive") {
      return res.status(404).json({ error: "Conta não encontrada para redefinição." });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.updateUserPassword(user.id, passwordHash);
    await db.markPasswordResetTokenUsed(Number(tokenRecord.id));
    await db.invalidatePasswordResetTokensForUser(user.id);

    return res.json({
      success: true,
      message: "Senha redefinida com sucesso. Faça login novamente para continuar.",
    });
  });

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
