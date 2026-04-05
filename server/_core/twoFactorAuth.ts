import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { TRPCError } from "@trpc/server";

const generate2FACode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

const send2FACodeByEmail = async (email: string, code: string): Promise<void> => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Seu Código de Verificação de Dois Fatores",
    html: `<p>Seu código de verificação de dois fatores é: <strong>${code}</strong></p><p>Este código é válido por 10 minutos.</p>`,
  });
};

export const generateAndSend2FACode = async (userId: string, email: string): Promise<void> => {
  const code = generate2FACode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  await db.update(users).set({ twoFactorCode: code, twoFactorExpiresAt: expiresAt }).where(eq(users.id, userId));
  await send2FACodeByEmail(email, code);
};

export const verify2FACode = async (userId: string, code: string): Promise<boolean> => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user || !user.twoFactorCode || !user.twoFactorExpiresAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Código de 2FA não encontrado ou expirado.",
    });
  }

  if (user.twoFactorCode !== code) {
    return false;
  }

  if (user.twoFactorExpiresAt < new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Código de 2FA expirado.",
    });
  }

  // Clear the 2FA code after successful verification
  await db.update(users).set({ twoFactorCode: null, twoFactorExpiresAt: null }).where(eq(users.id, userId));
  return true;
};
