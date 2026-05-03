/**
 * auditLog.ts — Registro append-only de leituras e ações sensíveis (PHI/LGPD).
 *
 * Princípios:
 *  - Nunca propaga exceção: se o INSERT falhar, apenas registra no console.
 *  - Não bloqueia a resposta: o caller pode usar `void auditPatientRead(...)`
 *    para fire-and-forget.
 *  - Aceita usuário em diferentes formatos (Drizzle, contexto tRPC) — só
 *    extrai os campos seguros (id, email, role).
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

type RequestLike = {
  ip?: string | null;
  socket?: { remoteAddress?: string | null } | null;
  headers?: Record<string, unknown> | undefined;
};

type UserLike =
  | {
      id?: number | string | null;
      email?: string | null;
      role?: string | null;
    }
  | null
  | undefined;

type AuditPayload = {
  user?: UserLike;
  req?: RequestLike;
  action: string;
  resourceType?: string | null;
  resourceId?: number | string | null;
  patientId?: number | string | null;
  metadata?: unknown;
};

function clientIpFrom(req?: RequestLike): string | null {
  if (!req) return null;
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() || null;
  }
  if (Array.isArray(fwd) && fwd.length > 0 && typeof fwd[0] === "string") {
    return String(fwd[0]).split(",")[0]?.trim() || null;
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function userAgentFrom(req?: RequestLike): string | null {
  const ua = req?.headers?.["user-agent"];
  if (typeof ua === "string") return ua.slice(0, 512);
  if (Array.isArray(ua) && typeof ua[0] === "string") return String(ua[0]).slice(0, 512);
  return null;
}

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Registra um evento de auditoria. Não lança — em qualquer falha apenas
 * imprime aviso no log. Pode ser chamada com `void auditEvent({...})`.
 */
export async function auditEvent(payload: AuditPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const userId = toIntOrNull(payload.user?.id);
    const userEmail = payload.user?.email ? String(payload.user.email).slice(0, 255) : null;
    const userRole = payload.user?.role ? String(payload.user.role).slice(0, 50) : null;
    const action = String(payload.action || "unknown_action").slice(0, 100);
    const resourceType = payload.resourceType ? String(payload.resourceType).slice(0, 50) : null;
    const resourceId = toIntOrNull(payload.resourceId);
    const patientId = toIntOrNull(payload.patientId);
    const metadata =
      payload.metadata !== undefined && payload.metadata !== null
        ? JSON.stringify(payload.metadata).slice(0, 4000)
        : null;
    const ipAddress = clientIpFrom(payload.req);
    const userAgent = userAgentFrom(payload.req);

    await db.execute(sql`
      INSERT INTO audit_logs
        (userId, userEmail, userRole, action, resourceType, resourceId, patientId, metadata, ipAddress, userAgent)
      VALUES
        (${userId}, ${userEmail}, ${userRole}, ${action}, ${resourceType}, ${resourceId}, ${patientId}, ${metadata}, ${ipAddress}, ${userAgent})
    `);
  } catch (error) {
    console.warn("[auditLog] Falha ao gravar:", (error as Error)?.message ?? error);
  }
}

/**
 * Atalho para registrar leitura de dados de um paciente.
 * Use `void auditPatientRead(...)` em handlers que não precisam aguardar.
 */
export function auditPatientRead(
  ctx: { user?: UserLike; req?: RequestLike },
  patientId: number | string | null | undefined,
  action: string,
  metadata?: unknown,
): Promise<void> {
  return auditEvent({
    user: ctx.user,
    req: ctx.req,
    action,
    resourceType: "patient",
    resourceId: patientId,
    patientId,
    metadata,
  });
}
