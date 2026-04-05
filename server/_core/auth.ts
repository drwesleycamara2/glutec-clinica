/**
 * auth.ts — Módulo de autenticação local próprio
 *
 * Gerencia login com e-mail + senha, hash bcrypt, JWT,
 * e integração com 2FA (TOTP).
 */

import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import * as db from "../db";
import type { User } from "../../drizzle/schema";

const BCRYPT_ROUNDS = 12;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LocalSessionPayload = {
  userId: number;
  email: string;
  role: string;
  twoFactorVerified: boolean;
};

export type LoginResult =
  | { status: "ok"; user: User; sessionToken: string }
  | { status: "requires_2fa"; tempToken: string }
  | { status: "must_change_password"; sessionToken: string }
  | { status: "error"; message: string };

// ─── Helpers de Secret ────────────────────────────────────────────────────────

function getSecretKey(): Uint8Array {
  const secret = ENV.cookieSecret || "glutec-fallback-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

// ─── Hash de Senha ────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Tokens Seguros ───────────────────────────────────────────────────────────

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

// ─── JWT de Sessão ────────────────────────────────────────────────────────────

export async function createSessionToken(
  payload: LocalSessionPayload,
  expiresInMs: number = ONE_YEAR_MS
): Promise<string> {
  const expiresIn = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ ...payload, type: "session" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

/** Token temporário de 2FA — dura apenas 5 minutos */
export async function createTempTwoFactorToken(userId: number): Promise<string> {
  const expiresIn = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);
  return new SignJWT({ userId, type: "2fa_pending" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

export async function verifyTempTwoFactorToken(
  token: string
): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.type !== "2fa_pending" || !payload.userId) return null;
    return { userId: payload.userId as number };
  } catch {
    return null;
  }
}

export async function verifySessionToken(
  token: string
): Promise<LocalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.type !== "session") return null;
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      role: payload.role as string,
      twoFactorVerified: payload.twoFactorVerified as boolean,
    };
  } catch {
    return null;
  }
}

// ─── Autenticar Request ───────────────────────────────────────────────────────

export async function authenticateRequest(req: Request): Promise<User | null> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = parseCookieHeader(cookieHeader);
  const sessionCookie = cookies[COOKIE_NAME];
  if (!sessionCookie) return null;

  const session = await verifySessionToken(sessionCookie);
  if (!session) return null;

  // Se 2FA está habilitado mas o token ainda não foi verificado com 2FA, bloqueia
  const user = await db.getUserById(session.userId);
  if (!user) return null;

  if (user.twoFactorEnabled && !session.twoFactorVerified) return null;

  // Bloqueia usuários inativos (exceto super admin)
  const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
  if (user.email !== SUPER_ADMIN_EMAIL && user.status === "inactive") return null;

  return user;
}
