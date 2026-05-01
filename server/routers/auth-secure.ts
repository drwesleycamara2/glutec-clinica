/**
 * auth-secure.ts — Rotas tRPC para 2FA, convites e configurações SMTP
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import {
  generateTotpSecret,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
} from "../_core/totp";
import { createSessionToken, generateSecureToken } from "../_core/auth";
import { COOKIE_NAME, SESSION_DURATION_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sendEmail, inviteEmailTemplate, testSmtpConnection } from "../_core/mailerSafePtbr";

const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";

// ─── 2FA Router ───────────────────────────────────────────────────────────────
export const twoFactorRouter = router({

  /** Iniciar setup do 2FA — gera secret e retorna QR code */
  setup: protectedProcedure.mutation(async ({ ctx }) => {
    const secret = generateTotpSecret();
    const qrCodeUrl = await generateQrCodeDataUrl(ctx.user.email!, secret);

    // Retorna o secret para o frontend salvar temporariamente
    // Só é confirmado em db após verificação do código
    return { secret, qrCodeUrl };
  }),

  /** Confirmar 2FA — verificar código e habilitar */
  confirm: protectedProcedure
    .input(z.object({
      secret: z.string().min(16),
      code: z.string().length(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const isValid = verifyTotpCode(input.code, input.secret);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Código inválido. Verifique o app autenticador e tente novamente.",
        });
      }

      const backupCodes = generateBackupCodes();
      const hashedCodesJson = await hashBackupCodes(backupCodes);

      await db.setUser2FA(ctx.user.id, {
        secret: input.secret,
        enabled: true,
        backupCodesJson: hashedCodesJson,
      });

      const refreshedUser = (await db.getUserById(ctx.user.id)) ?? ctx.user;
      const sessionToken = await createSessionToken({
        userId: refreshedUser.id,
        email: refreshedUser.email!,
        role: refreshedUser.role,
        twoFactorVerified: true,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });

      return {
        success: true,
        backupCodes, // Retornado UMA vez para o usuário salvar
        message: "Autenticação em dois fatores ativada com sucesso!",
      };
    }),

  /** Desabilitar 2FA — requer código do app para confirmar */
  disable: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.twoFactorSecret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "2FA não está habilitado." });
      }

      const isValid = verifyTotpCode(input.code, user.twoFactorSecret);
      if (!isValid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código inválido." });
      }

      await db.disableUser2FA(ctx.user.id);
      return { success: true, message: "2FA desabilitado com sucesso." };
    }),

  /** Obter status do 2FA do usuário */
  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    const backupCodesCount = user?.twoFactorBackupCodes
      ? JSON.parse(user.twoFactorBackupCodes).length
      : 0;

    return {
      enabled: !!user?.twoFactorEnabled,
      backupCodesRemaining: backupCodesCount,
    };
  }),

  /** Gerar novos códigos de backup */
  regenerateBackupCodes: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user?.twoFactorSecret || !user.twoFactorEnabled) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "2FA não está habilitado." });
      }

      const isValid = verifyTotpCode(input.code, user.twoFactorSecret);
      if (!isValid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Código inválido." });
      }

      const backupCodes = generateBackupCodes();
      const hashedCodesJson = await hashBackupCodes(backupCodes);
      await db.updateUser2FABackupCodes(ctx.user.id, hashedCodesJson);

      return { backupCodes };
    }),
});

// ─── Invitations Router (admin) ───────────────────────────────────────────────
export const invitationsRouter = router({

  /** Convidar usuário — envia e-mail com link de ativação */
  send: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(2),
      role: z.enum(["user", "admin", "medico", "recepcionista", "enfermeiro", "gerente"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Apenas admin pode convidar
      if (ctx.user.role !== "admin" && ctx.user.email !== SUPER_ADMIN_EMAIL) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem convidar usuários." });
      }

      // Verificar se já existe usuário com esse e-mail
      const existingUser = await db.getUserByEmail(input.email.toLowerCase());
      if (existingUser && existingUser.status === "active" && existingUser.passwordHash) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário ativo com este e-mail." });
      }

      // Gerar token seguro
      const token = generateSecureToken(32);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas

      await db.createInvitation({
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        token,
        invitedById: ctx.user.id,
        expiresAt,
      });

      // Enviar e-mail com link de convite
      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      const acceptUrl = `${baseUrl}/aceitar-convite?token=${token}`;

      const { subject, html } = inviteEmailTemplate({
        name: input.name,
        inviterName: ctx.user.name || "Administrador",
        role: input.role,
        acceptUrl,
        expiresIn: "48 horas",
      });

      const result = await sendEmail({ to: input.email, subject, html });

      if (!result.success) {
        // Convite foi criado mas e-mail falhou — retornar link manualmente
        return {
          success: true,
          emailSent: false,
          manualLink: acceptUrl,
          warning: `E-mail não enviado: ${result.error}. Copie o link abaixo e envie manualmente.`,
        };
      }

      return { success: true, emailSent: true };
    }),

  /** Listar convites pendentes */
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.email !== SUPER_ADMIN_EMAIL) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return db.getPendingInvitations();
  }),
});

// ─── SMTP Router (admin) ──────────────────────────────────────────────────────
export const smtpRouter = router({

  /** Obter configurações SMTP (sem senha) */
  get: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.email !== SUPER_ADMIN_EMAIL) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const settings = await db.getSmtpSettings();
    if (!settings) return null;
    const { password, ...safe } = settings;
    return { ...safe, hasPassword: !!password };
  }),

  /** Testar conexão SMTP sem salvar */
  test: protectedProcedure
    .input(z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.email !== SUPER_ADMIN_EMAIL) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return testSmtpConnection(input);
    }),

  /** Salvar configurações SMTP */
  save: protectedProcedure
    .input(z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().min(1),
      password: z.string().min(1),
      fromName: z.string().optional(),
      fromEmail: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.email !== SUPER_ADMIN_EMAIL) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.saveSmtpSettings(input);
      return { success: true };
    }),
});
