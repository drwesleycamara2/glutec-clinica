import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as dbComplete from "./db_complete";
import { TRPCError } from "@trpc/server";
import { clinicalEvolutionRouter } from "./routers/clinical-evolution";
import { twoFactorRouter } from "./routers/auth-secure";
import { generateSecureToken, verifyPassword } from "./_core/auth";
import { inviteEmailTemplate, sendEmail } from "./_core/mailer";
import { verifyTotpCode } from "./_core/totp";
import { createAuditLog } from "./features_special";
import { generateSecureSystemExport } from "./lib/system-export";
import { createD4SignService, getD4SignIntegrationStatus } from "./lib/d4sign-integration";
import { createWhatsAppService } from "./whatsapp";
import { createD4SignService as createSignatureDispatchService, SAFE_MAP } from "./d4sign";
import { createCloudSignatureClient, documentHash, type CloudSignatureProvider } from "./lib/cloud-signature";

const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
const INVITE_ROLES = ["user", "admin", "medico", "recepcionista", "enfermeiro", "gerente"] as const;
type InviteRole = (typeof INVITE_ROLES)[number];

function normalizeEmailForStorage(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeInviteRole(value?: string | null): InviteRole {
  return INVITE_ROLES.includes(value as InviteRole) ? (value as InviteRole) : "user";
}

function stripHtmlForSignature(value?: string | null) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(title: string, lines: string[]) {
  const sanitizedLines = lines.flatMap((line) => {
    const normalized = String(line ?? "").replace(/\r/g, "");
    if (!normalized) return [""];
    return normalized.split("\n");
  });

  const contentLines = [
    "BT",
    "/F1 14 Tf",
    "50 800 Td",
    "18 TL",
    `(${escapePdfText(title)}) Tj`,
    "T*",
    "/F1 11 Tf",
    ...sanitizedLines.map((line) => `(${escapePdfText(line)}) Tj\nT*`),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(contentLines, "latin1")} >> stream\n${contentLines}\nendstream\nendobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

const ALLOWED_APP_HOSTS = new Set<string>(
  String(process.env.APP_URL ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((url) => {
      try { return new URL(url).host.toLowerCase(); } catch { return ""; }
    })
    .filter(Boolean),
);

function getAppBaseUrl(req: { headers: Record<string, unknown>; secure?: boolean }) {
  // Prefere sempre APP_URL — única fonte confiável.
  // Cabeçalhos Host / X-Forwarded-Host vindos do cliente são manipuláveis e
  // não devem ser usados sozinhos para construir URLs de convite/recuperação.
  if (process.env.APP_URL) {
    const first = String(process.env.APP_URL).split(/[\s,]+/).find(Boolean);
    if (first) return first.replace(/\/$/, "");
  }

  // Fallback: aceita o Host do request apenas se ele estiver na allowlist.
  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost = forwardedHost || req.headers.host;
  const host = String((Array.isArray(rawHost) ? rawHost[0] : rawHost) || "").toLowerCase();

  if (ALLOWED_APP_HOSTS.size > 0 && !ALLOWED_APP_HOSTS.has(host)) {
    return "https://sistema.drwesleycamara.com.br";
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  const proto = Array.isArray(protocol) ? protocol[0] : String(protocol);
  return `${proto}://${host || "sistema.drwesleycamara.com.br"}`;
}

export const appRouter = router({
  system: systemRouter,

  // AUTH
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    updateMe: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        specialty: z.string().optional(),
        profession: z.string().optional(),
        crm: z.string().optional(),
        professionalLicenseType: z.enum(["CRM", "COREN"]).optional(),
        professionalLicenseState: z.string().length(2).optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Bloqueia que qualquer usuário troque o próprio e-mail para o do
        // super-administrador (defesa em profundidade contra escalada de
        // privilégio que dependa de comparação por e-mail).
        if (input.email) {
          const newEmail = normalizeEmailForStorage(input.email);
          const currentEmail = String(ctx.user.email ?? "").toLowerCase();
          if (newEmail === SUPER_ADMIN_EMAIL && currentEmail !== SUPER_ADMIN_EMAIL) {
            throw new Error("Esse e-mail está reservado e não pode ser usado.");
          }
        }
        await dbComplete.updateUserProfile(ctx.user.id, {
          ...input,
          email: input.email ? normalizeEmailForStorage(input.email) : undefined,
        });
        const updatedUser = await db.getUserById(ctx.user.id);
        return { success: true, user: updatedUser };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  twoFactor: twoFactorRouter,
  icd10: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return db.listIcd10(input?.limit);
      }),
    search: publicProcedure
      .input(z.object({ query: z.string().optional().default(""), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.searchIcd10(input.query, input.limit);
      }),
    getFavorites: protectedProcedure.query(({ ctx }) => {
      return db.getFavoriteIcds(ctx.user.id);
    }),
    addFavorite: protectedProcedure
      .input(z.object({ icd10CodeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.addFavoriteIcd(ctx.user.id, input.icd10CodeId);
        return { success: true };
      }),
    removeFavorite: protectedProcedure
      .input(z.object({ icd10CodeId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeFavoriteIcd(ctx.user.id, input.icd10CodeId);
        return { success: true };
      }),
    importData: protectedProcedure
      .input(z.object({ codes: z.array(z.object({ code: z.string(), description: z.string(), descriptionAbbrev: z.string().optional() })) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await db.insertIcd10Batch(input.codes);
        return { success: true, count: input.codes.length };
      }),
  }),

  // AUDIO
  audio: router({
    createTranscription: protectedProcedure
      .input(z.object({ audioUrl: z.string(), audioKey: z.string(), medicalRecordId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createAudioTranscription({
          userId: ctx.user.id,
          audioUrl: input.audioUrl,
          audioKey: input.audioKey,
          medicalRecordId: input.medicalRecordId,
          status: 'pending',
        });
        return result;
      }),
    getTranscription: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => {
        return db.getAudioTranscriptionById(input.id);
      }),
    updateTranscription: protectedProcedure
      .input(z.object({ id: z.number(), transcription: z.string(), status: z.enum(['pending', 'completed', 'failed']) }))
      .mutation(async ({ input }) => {
        await db.updateAudioTranscription(input.id, {
          transcription: input.transcription,
          status: input.status,
        });
        return { success: true };
      }),
  }),

  // CLINICAL EVOLUTION
  clinicalEvolution: clinicalEvolutionRouter,

  // ADMIN
  admin: router({
    getUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.getAllUsers();
    }),

    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.getAllUsers();
    }),

    getDoctors: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return dbComplete.getDoctors();
    }),

    getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return dbComplete.getDashboardStats();
    }),

    getAppointmentStats: protectedProcedure
      .input(z.object({ from: z.string().optional(), to: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.getAppointmentStats(input.from, input.to);
      }),

    getAuditLogs: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.getAuditLogs(input.limit);
      }),

    generateSystemExport: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        exportPassword: z.string().min(12),
        includeFiles: z.boolean().default(false),
        securityCode: z.string().optional(),
        reason: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

        const user = await db.getUserById(ctx.user.id);
        const storedPasswordHash = (user as any)?.passwordHash ?? (user as any)?.password;
        if (!user || !storedPasswordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário inválido." });
        }

        const passwordOk = await verifyPassword(input.currentPassword, storedPasswordHash);
        if (!passwordOk) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta." });
        }

        if (user.twoFactorEnabled) {
          if (!input.securityCode || !user.twoFactorSecret || !verifyTotpCode(input.securityCode, user.twoFactorSecret)) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Informe um código válido do autenticador para exportar os dados.",
            });
          }
        }

        const exported = await generateSecureSystemExport({
          exportPassword: input.exportPassword,
          includeFiles: input.includeFiles,
          reason: input.reason,
          requestedBy: {
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
          },
        });

        await createAuditLog({
          userId: ctx.user.id,
          action: "system_export_generated",
          entityType: "system_export",
          entityId: 0,
          details: `Exportação completa do sistema gerada. Tabelas: ${exported.tableCount}, registros: ${exported.rowCount}, arquivos: ${exported.fileCount}. Motivo: ${input.reason || "não informado"}.`,
          ipAddress: ctx.req.ip || null,
        });

        return {
          ...exported,
          downloadUrl: `/api/admin/system-export/${exported.token}`,
        };
      }),

    inviteUser: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string(),
        role: z.enum(['user', 'admin', 'medico', 'recepcionista', 'enfermeiro', 'gerente']),
        permissions: z.array(z.string()),
        jobTitles: z.array(z.enum([
          'medico',
          'gerente',
          'massoterapeuta',
          'tecnico_enfermagem',
          'enfermeiro',
          'secretaria',
          'apoio',
        ])).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const normalizedEmail = normalizeEmailForStorage(input.email);
        const existingUser = await db.getUserByEmail(normalizedEmail);
        if (existingUser && existingUser.status === 'active' && ((existingUser as any).passwordHash || (existingUser as any).password)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Já existe um usuário ativo com este e-mail.' });
        }

        await db.inviteUser({
          email: normalizedEmail,
          name: input.name,
          role: input.role,
          permissions: JSON.stringify(input.permissions),
          profession: input.jobTitles
            .map((jobTitle) => ({
              medico: 'Médica(o)',
              gerente: 'Gerente',
              massoterapeuta: 'Massoterapeuta',
              tecnico_enfermagem: 'Técnica(o) de enfermagem',
              enfermeiro: 'Enfermeira(o)',
              secretaria: 'Secretária(o)',
              apoio: 'Apoio',
            }[jobTitle] || jobTitle))
            .join(', '),
        });

        const token = generateSecureToken(32);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await db.expirePendingInvitationsByEmail(normalizedEmail);
        await db.createInvitation({
          email: normalizedEmail,
          name: input.name,
          role: input.role,
          token,
          invitedById: ctx.user.id,
          expiresAt,
        });

        const acceptUrl = `${getAppBaseUrl(ctx.req)}/aceitar-convite?token=${token}`;
        const { subject, html } = inviteEmailTemplate({
          name: input.name,
          inviterName: ctx.user.name || 'Administrador',
          role: input.role,
          jobTitles: input.jobTitles,
          acceptUrl,
          expiresIn: '48 horas',
        });

        const emailResult = await sendEmail({ to: normalizedEmail, subject, html });
        return {
          success: true,
          emailSent: emailResult.success,
          manualLink: emailResult.success ? null : acceptUrl,
          warning: emailResult.success ? null : `E-mail não enviado: ${emailResult.error}`,
        };
      }),

    resendInvitation: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const user = await db.getUserById(input.userId);
        if (!user || !String((user as any).openId ?? '').startsWith('invited_')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este usuário não possui convite pendente.' });
        }

        const normalizedEmail = normalizeEmailForStorage((user as any).email);
        if (!normalizedEmail) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'O usuário pendente não possui e-mail cadastrado.' });
        }

        await db.expirePendingInvitationsByEmail(normalizedEmail);
        const token = generateSecureToken(32);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const role = normalizeInviteRole((user as any).role);

        await db.createInvitation({
          email: normalizedEmail,
          name: String((user as any).name || normalizedEmail),
          role,
          token,
          invitedById: ctx.user.id,
          expiresAt,
        });

        const acceptUrl = `${getAppBaseUrl(ctx.req)}/aceitar-convite?token=${token}`;
        const { subject, html } = inviteEmailTemplate({
          name: String((user as any).name || normalizedEmail),
          inviterName: ctx.user.name || 'Administrador',
          role,
          acceptUrl,
          expiresIn: '48 horas',
        });

        const emailResult = await sendEmail({ to: normalizedEmail, subject, html });
        return {
          success: true,
          emailSent: emailResult.success,
          manualLink: acceptUrl,
          warning: emailResult.success ? null : `E-mail não enviado: ${emailResult.error}`,
        };
      }),

    copyInvitationLink: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const user = await db.getUserById(input.userId);
        if (!user || !String((user as any).openId ?? '').startsWith('invited_')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este usuário não possui convite pendente.' });
        }

        const normalizedEmail = normalizeEmailForStorage((user as any).email);
        if (!normalizedEmail) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'O usuário pendente não possui e-mail cadastrado.' });
        }

        let invitation = await db.getLatestPendingInvitationByEmail(normalizedEmail);
        if (!invitation) {
          const token = generateSecureToken(32);
          await db.createInvitation({
            email: normalizedEmail,
            name: String((user as any).name || normalizedEmail),
            role: normalizeInviteRole((user as any).role),
            token,
            invitedById: ctx.user.id,
            expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          });
          invitation = await db.getLatestPendingInvitationByEmail(normalizedEmail);
        }

        return {
          success: true,
          manualLink: `${getAppBaseUrl(ctx.req)}/aceitar-convite?token=${String((invitation as any).token)}`,
        };
      }),
    updateUserStatus: protectedProcedure
      .input(z.object({
        userId: z.number(),
        status: z.enum(['active', 'inactive', 'pending_password_change']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await db.updateUserStatus(input.userId, input.status);
        return { success: true };
      }),

    updateUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await db.updateUserPermissions(input.userId, input.permissions);
        return { success: true };
      }),

    deleteUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const isSuperAdmin = ctx.user.role === 'admin' && String(ctx.user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;
        if (!isSuperAdmin) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'A exclusão de cadastros só pode ser feita por Wésley Câmara.' });
        }
        await db.deleteUser(input.userId);
        return { success: true };
      }),

    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.getUserPermissions(input.userId);
      }),

    setUserPermission: protectedProcedure
      .input(z.object({
        userId: z.number(),
        module: z.string(),
        permission: z.object({
          canCreate: z.boolean(),
          canRead: z.boolean(),
          canUpdate: z.boolean(),
          canDelete: z.boolean(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await dbComplete.setUserPermission(input.userId, input.module, input.permission);
        return { success: true };
      }),

    updateUserProfile: protectedProcedure
      .input(z.object({
        userId: z.number(),
        name: z.string().optional(),
        specialty: z.string().optional(),
        crm: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await dbComplete.updateUserProfile(input.userId, input);
        return { success: true };
      }),

    updateUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin', 'medico', 'recepcionista', 'enfermeiro', 'gerente']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await dbComplete.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),

  // PATIENTS
  patients: router({
    list: protectedProcedure
      .input(
        z.object({
          query: z.string().optional(),
          limit: z.number().optional(),
          sort: z.enum(["name_asc", "name_desc", "created_desc", "created_asc"]).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        return dbComplete.listPatients(input.query, input.limit, input.sort);
      }),

    create: protectedProcedure
      .input(z.object({
        fullName: z.string(),
        cpf: z.string(),
        birthDate: z.string(),
        gender: z.string().optional(),
        biologicalSex: z.string().optional(),
        phone: z.string(),
        email: z.string().optional(),
        zipCode: z.string(),
        address: z.string(),
        addressNumber: z.string().optional(),
        neighborhood: z.string(),
        city: z.string(),
        state: z.string(),
        rg: z.string().optional(),
        bloodType: z.string().optional(),
        allergies: z.string().optional(),
        chronicConditions: z.string().optional(),
        insuranceName: z.string().optional(),
        insuranceNumber: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPatient(input, ctx.user.id);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPatientById(input.id);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        fullName: z.string().optional(),
        cpf: z.string().optional(),
        birthDate: z.string().optional(),
        gender: z.string().optional(),
        biologicalSex: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        zipCode: z.string().optional(),
        address: z.string().optional(),
        addressNumber: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        rg: z.string().optional(),
        bloodType: z.string().optional(),
        allergies: z.string().optional(),
        chronicConditions: z.string().optional(),
        insuranceName: z.string().optional(),
        insuranceNumber: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        return dbComplete.updatePatient(id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return dbComplete.deletePatient(input.id);
      }),
  }),

  // APPOINTMENTS
  appointments: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number(),
        scheduledAt: z.string(),
        durationMinutes: z.number(),
        room: z.string().min(1),
        type: z.string(),
        notes: z.string().optional(),
        isRetroactive: z.boolean().optional(),
        retroactiveJustification: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createAppointment(input, ctx.user.id);
      }),

    update: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
        patientId: z.number(),
        doctorId: z.number(),
        scheduledAt: z.string(),
        durationMinutes: z.number(),
        room: z.string().min(1),
        type: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { appointmentId, ...payload } = input;
        return dbComplete.updateAppointment(appointmentId, payload, ctx.user.id);
      }),

    getByDate: protectedProcedure
      .input(z.object({
        from: z.string(),
        to: z.string(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getAppointmentsByDateRange(input.from, input.to);
      }),

    getByPatient: protectedProcedure
      .input(z.object({
        patientId: z.number(),
      }))
      .query(async ({ input }) => {
        const history = await dbComplete.getPatientHistory(input.patientId);
        return history.appointments ?? [];
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
        status: z.enum(["agendada", "confirmada", "em_atendimento", "concluida", "cancelada", "falta"]),
        cancelledBy: z.enum(["clinica", "paciente", "sistema"]).optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return dbComplete.updateAppointmentStatus(input.appointmentId, {
          status: input.status,
          cancelledBy: input.cancelledBy,
          note: input.note,
        });
      }),
  }),

  appointmentBlocks: router({
    list: protectedProcedure
      .input(z.object({
        from: z.string(),
        to: z.string(),
      }))
      .query(async ({ input }) => {
        return dbComplete.listAppointmentBlocks(input.from, input.to);
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        notes: z.string().optional(),
        room: z.string().optional(),
        doctorId: z.number().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createAppointmentBlock(input, ctx.user.id);
      }),

    delete: protectedProcedure
      .input(z.object({
        blockId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return dbComplete.deleteAppointmentBlock(input.blockId);
      }),
  }),

  // PRESCRIPTIONS
  prescriptions: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        type: z.string(),
        content: z.string(),
        observations: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = Number(ctx.user.id ?? (ctx.user as any).userId);
        return dbComplete.createPrescription(input, userId);
      }),

    getByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPrescriptionsByPatient(input.patientId);
      }),

    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listPrescriptionTemplatesNormalized();
    }),

    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        content: z.string(),
        type: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPrescriptionTemplateNormalized(input, ctx.user.id);
      }),

    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return dbComplete.deleteTemplateNormalized(input.id);
      }),
  }),

  // EXAM REQUESTS
  exams: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        specialty: z.string().optional(),
        clinicalIndication: z.string().optional(),
        content: z.string(),
        observations: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createExamRequest(input, ctx.user.id);
      }),

    getByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getExamRequestsByPatient(input.patientId);
      }),

    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listExamTemplatesNormalized();
    }),

    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        content: z.string(),
        specialty: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createExamTemplateNormalized(input, ctx.user.id);
      }),

    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return dbComplete.deleteTemplateNormalized(input.id);
      }),
  }),

  examRequests: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        specialty: z.string().optional(),
        clinicalIndication: z.string().optional(),
        content: z.string(),
        observations: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createExamRequest(input, ctx.user.id);
      }),

    getByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getExamRequestsByPatient(input.patientId);
      }),

    listTemplates: protectedProcedure.query(async () => {
      return dbComplete.listExamTemplatesNormalized();
    }),

    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        content: z.string(),
        specialty: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createExamTemplateNormalized(input, ctx.user.id);
      }),
  }),

  // FINANCIAL
  financial: router({
    create: protectedProcedure
      .input(z.object({
        type: z.enum(['receita', 'despesa']),
        category: z.string(),
        description: z.string(),
        amountInCents: z.number(),
        paymentMethod: z.string().optional(),
        status: z.string().optional(),
        dueDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createFinancialTransaction(input, ctx.user.id);
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listFinancialTransactions();
    }),

    getSummary: protectedProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getFinancialSummary(input.from, input.to);
      }),
  }),

  // CATALOG
  catalog: router({
    searchTuss: protectedProcedure
      .input(z.object({
        query: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return dbComplete.searchTussCatalog(input.query, input.limit);
      }),

    listProcedures: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listProcedures();
    }),

    createProcedure: protectedProcedure
      .input(z.object({
        name: z.string(),
        category: z.string().optional(),
        description: z.string().optional(),
        estimatedSessionsMin: z.number().optional(),
        estimatedSessionsMax: z.number().optional(),
        sessionIntervalDays: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createProcedure(input, ctx.user.id);
      }),

    createArea: protectedProcedure
      .input(z.object({
        procedureId: z.number(),
        areaName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createProcedureArea(input);
      }),

    getAreas: protectedProcedure
      .input(z.object({ procedureId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getProcedureAreas(input.procedureId);
      }),

    getProcedure: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getProcedureById(input.id);
      }),

    getPrice: protectedProcedure
      .input(z.object({
        procedureId: z.number(),
        areaId: z.number(),
        complexity: z.string(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getProcedurePrice(input.procedureId, input.areaId, input.complexity);
      }),

    listPaymentPlans: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listPaymentPlans();
    }),

    createPaymentPlan: protectedProcedure
      .input(z.object({
        name: z.string(),
        type: z.string(),
        discountPercent: z.number().optional(),
        maxInstallments: z.number().optional(),
        interestRatePercent: z.number().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPaymentPlan(input);
      }),

    upsertPricing: protectedProcedure
      .input(z.object({
        procedureId: z.number(),
        areaId: z.number(),
        complexity: z.string(),
        priceInCents: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.upsertProcedurePrice(input);
      }),
  }),

  // INVENTORY
  inventory: router({
    listProducts: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listInventoryProducts();
    }),

    createProduct: protectedProcedure
      .input(z.object({
        name: z.string(),
        sku: z.string().optional(),
        brand: z.string().optional(),
        size: z.string().optional(),
        category: z.string(),
        description: z.string().optional(),
        unit: z.string(),
        currentStock: z.number(),
        minimumStock: z.number(),
        costPriceInCents: z.number().optional(),
        supplierName: z.string().optional(),
        supplierContact: z.string().optional(),
        expirationDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createInventoryProduct(input, ctx.user.id);
      }),

    getLowStock: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.getLowStockItems();
    }),

    createMovement: protectedProcedure
      .input(z.object({
        productId: z.number(),
        type: z.enum(['entrada', 'saida', 'ajuste']),
        quantity: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createInventoryMovement(input, ctx.user.id);
      }),
  }),

  // PHOTOS
  photos: router({
    getByPatient: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        category: z.string().optional(),
        folderId: z.number().nullable().optional(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getPatientPhotos(input.patientId, input.category, input.folderId);
      }),

    upload: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        folderId: z.number().nullable().optional(),
        category: z.string(),
        description: z.string().optional(),
        base64: z.string(),
        mimeType: z.string(),
        originalFileName: z.string().optional(),
        takenAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const payload = input.category === "perfil" && ctx.user.role !== "admin"
          ? { ...input, category: "evolucao" }
          : input;
        return dbComplete.uploadPatientPhoto(payload, ctx.user.id);
      }),

    delete: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.deletePatientPhoto(input.photoId);
      }),
  }),

  // CHAT
  chat: router({
    getMessages: protectedProcedure
      .input(z.object({
        channelId: z.string(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getChatMessages(input.channelId, input.limit);
      }),

    sendMessage: protectedProcedure
      .input(z.object({
        channelId: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createChatMessage(input.channelId, ctx.user.id, input.content);
      }),
  }),

  // CLINIC
  clinic: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.getClinicSettings();
    }),

    update: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        tradeName: z.string().optional(),
        cnpj: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        address: z.string().optional(),
        neighborhood: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        specialties: z.array(z.string()).optional(),
        structuralSectors: z.array(z.string().min(1)).optional(),
        patientAttachmentFolders: z.array(z.string().min(1)).optional(),
        openingHours: z.array(z.object({
          day: z.string(),
          open: z.string(),
          close: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.updateClinicSettings(input);
      }),
  }),

  // FISCAL
  fiscal: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.getFiscalSettings();
    }),

    upsert: protectedProcedure
      .input(z.object({
        cnpj: z.string().optional(),
        razaoSocial: z.string().optional(),
        nomeFantasia: z.string().optional(),
        inscricaoMunicipal: z.string().optional(),
        inscricaoEstadual: z.string().optional(),
        codigoMunicipio: z.string().optional(),
        telefone: z.string().optional(),
        email: z.string().optional(),
        cep: z.string().optional(),
        municipio: z.string().optional(),
        uf: z.string().optional(),
        bairro: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        complemento: z.string().optional(),
        optanteSimplesNacional: z.boolean().optional(),
        regimeApuracao: z.string().optional(),
        codigoTributacaoNacional: z.string().optional(),
        descricaoTributacao: z.string().optional(),
        itemNbs: z.string().optional(),
        descricaoNbs: z.string().optional(),
        aliquotaSimplesNacional: z.string().optional(),
        aliquotaIss: z.string().optional(),
        municipioIncidencia: z.string().optional(),
        ufIncidencia: z.string().optional(),
        descricaoServicoPadrao: z.string().optional(),
        textoLegalFixo: z.string().optional(),
        codigoServico: z.string().optional(),
        itemListaServico: z.string().optional(),
        cnaeServico: z.string().optional(),
        webserviceUrl: z.string().optional(),
        ambiente: z.enum(['homologacao', 'producao']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.upsertFiscalSettings(input);
      }),

    uploadCertificate: protectedProcedure
      .input(z.object({
        fileName: z.string().min(1),
        mimeType: z.string().optional(),
        fileBase64: z.string().min(16),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.saveFiscalCertificate(input);
      }),

    testNationalApi: protectedProcedure
      .input(z.object({
        ambiente: z.enum(['homologacao', 'producao']).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.testFiscalNationalApi(input?.ambiente);
      }),

    syncMunicipalParameters: protectedProcedure
      .input(z.object({
        ambiente: z.enum(['homologacao', 'producao']).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        return dbComplete.syncFiscalMunicipalParameters(input?.ambiente);
      }),
  }),

  // NFSE
  nfse: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listNfse();
    }),

    create: protectedProcedure
      .input(z.object({
        tomadorDocumento: z.string(),
        tomadorTipoDocumento: z.enum(["cpf", "cnpj"]).default("cpf"),
        tomadorNome: z.string(),
        tomadorEmail: z.string().optional(),
        tomadorTelefone: z.string().optional(),
        tomadorCep: z.string().optional(),
        tomadorMunicipio: z.string().optional(),
        tomadorUf: z.string().optional(),
        tomadorBairro: z.string().optional(),
        tomadorLogradouro: z.string().optional(),
        tomadorNumero: z.string().optional(),
        tomadorComplemento: z.string().optional(),
        patientId: z.number().optional(),
        budgetId: z.number().optional(),
        descricaoServico: z.string(),
        complementoDescricao: z.string().optional(),
        valorServico: z.number().min(1),
        valorDeducao: z.number().optional(),
        valorDescontoIncondicionado: z.number().optional(),
        formaPagamento: z.enum(["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "financiamento", "outro"]).default("pix"),
        detalhesPagamento: z.string().optional(),
        dataCompetencia: z.string().optional(),
        ambiente: z.enum(['homologacao', 'producao']).default('homologacao'),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createNfse(input, ctx.user.id);
      }),

    emit: protectedProcedure
      .input(z.object({ nfseId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.emitNfseThroughNationalApi(input.nfseId, ctx.user.id);
      }),

    cancel: protectedProcedure
      .input(z.object({
        nfseId: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.cancelNfse(input.nfseId, input.reason);
      }),
  }),

  // BUDGETS
  budgets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listBudgets();
    }),

    getByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.listBudgetsByPatient(input.patientId);
      }),

    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        clinicalNotes: z.string().optional(),
        items: z.array(z.object({
          procedureId: z.number(),
          areaId: z.number(),
          complexity: z.string(),
          quantity: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createBudget(input, ctx.user.id);
      }),

    emit: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.emitBudget(input.budgetId);
      }),

    approve: protectedProcedure
      .input(z.object({ budgetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.approveBudget(input.budgetId);
      }),

    emitNfse: protectedProcedure
      .input(z.object({
        budgetId: z.number(),
        formaPagamento: z.enum(["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "financiamento", "outro"]).default("pix"),
        detalhesPagamento: z.string().optional(),
        dataCompetencia: z.string().optional(),
        ambiente: z.enum(['homologacao', 'producao']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.emitBudgetNfse(input.budgetId, input, ctx.user.id);
      }),
  }),

  // CRM
  crm: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return dbComplete.listCrmIndications(input.limit);
      }),

    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        procedureName: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createCrmIndication(input, ctx.user.id);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          status: z.string().optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.updateCrmIndication(input.id, input.data);
      }),
  }),

  // SIGNATURES
  signatures: router({
    getIntegrationStatus: protectedProcedure.query(async ({ ctx }) => {
      return getD4SignIntegrationStatus();
    }),

    saveCredentials: protectedProcedure
      .input(z.object({
        tokenAPI: z.string().min(1),
        cryptKey: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await dbComplete.updateClinicSettings({
          d4signTokenApi: input.tokenAPI,
          d4signCryptKey: input.cryptKey,
        });
        return { success: true };
      }),
    testConnection: protectedProcedure.query(async ({ ctx }) => {
      const service = await createD4SignService();
      if (!service) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Credenciais D4Sign não configuradas no ambiente da clínica.",
        });
      }

      const safes = await service.listSafes();
      return {
        connected: true,
        safeCount: safes.length,
        checkedAt: new Date().toISOString(),
      };
    }),
    listSafes: protectedProcedure.query(async ({ ctx }) => {
      const service = await createD4SignService();
      if (!service) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Credenciais D4Sign não configuradas no ambiente da clínica.",
        });
      }

      const safes = await service.listSafes();
      return safes;
    }),
    sendForSignature: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        documentType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const service = await createSignatureDispatchService();
        if (!service) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Credenciais D4Sign não configuradas para envio.",
          });
        }

        if (!ctx.user.email) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "O usuário logado precisa ter um e-mail válido para assinar via D4Sign.",
          });
        }

        let patientId: number | null = null;
        let title = "";
        let body = "";

        if (input.documentType === "prescription") {
          const prescription = await dbComplete.getPrescriptionById(input.documentId);
          if (!prescription) throw new TRPCError({ code: "NOT_FOUND", message: "Prescrição não encontrada." });
          patientId = Number(prescription.patientId);
          title = "Prescrição médica";
          body = `${stripHtmlForSignature(prescription.content)}\n\nObservações: ${prescription.observations || "Não informadas."}`;
        } else if (input.documentType === "exam_request") {
          const examRequest = await dbComplete.getExamRequestById(input.documentId);
          if (!examRequest) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido de exames não encontrado." });
          patientId = Number(examRequest.patientId);
          title = "Pedido de exames";
          body = `${stripHtmlForSignature(examRequest.content)}\n\nObservações: ${examRequest.observations || "Não informadas."}`;
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este tipo de documento ainda não está habilitado para envio à D4Sign.",
          });
        }

        const patient = patientId ? await dbComplete.getPatientById(patientId) : null;
        const patientName = patient?.fullName || patient?.name || `Paciente ${patientId}`;
        const fileName = `${title.toLowerCase().replace(/\s+/g, "_")}_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
        const pdfBuffer = buildSimplePdfBuffer(title, [
          `Paciente: ${patientName}`,
          `Profissional: ${ctx.user.name || ctx.user.email}`,
          `Data: ${new Date().toLocaleString("pt-BR")}`,
          "",
          ...body.split("\n"),
        ]);

        const sent = await service.sendDocumentForSignature({
          safeUuid: SAFE_MAP.prontuario,
          base64Content: pdfBuffer.toString("base64"),
          fileName,
          signerEmail: ctx.user.email,
          signerName: ctx.user.name || ctx.user.email,
          message: `Documento ${title} disponível para assinatura em ${patientName}.`,
          useIcpBrasil: false,
        });

        await dbComplete.sendForSignature(input.documentId, input.documentType, ctx.user.id, {
          d4signDocumentKey: sent.documentUuid,
          d4signSafeKey: SAFE_MAP.prontuario,
          status: "enviado",
          signatureType: "eletronica",
        });

        return {
          success: true,
          documentUuid: sent.documentUuid,
        };
      }),
  }),

  // TEMPLATES
  // ─── CLOUD SIGNATURE (VIDaaS / BirdID) ──────────────────────────────────────
  cloudSignature: router({

    getConfig: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.getCloudSignatureConfig(ctx.user.id);
    }),

    saveConfig: protectedProcedure
      .input(z.object({
        provider: z.enum(["vidaas", "birdid"]),
        cpf: z.string().min(11),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        ambiente: z.enum(["producao", "homologacao"]).default("homologacao"),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.saveCloudSignatureConfig(ctx.user.id, input);
      }),

    initiateA3: protectedProcedure
      .input(z.object({
        documentType: z.enum(["evolucao", "atestado", "prescricao", "exame"]),
        documentId: z.number(),
        documentAlias: z.string(),
        documentHashBase64: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const config = await dbComplete.getCloudSignatureConfig(ctx.user.id);
        if (!config?.clientId || !config?.cpf) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Configure sua assinatura digital A3 em Perfil → Assinatura Digital.",
          });
        }

        const client = createCloudSignatureClient(
          config.provider as CloudSignatureProvider,
          config.cpf,
          config.clientId,
          config.clientSecret,
          `${process.env.APP_URL || "https://sistema.drwesleycamara.com.br"}/api/cloud-signature/callback`,
          (config.ambiente as "producao" | "homologacao") ?? "homologacao",
        );

        const { authorizeCode, codeVerifier } = await client.initiatePushSignature([
          { documentId: `doc-${input.documentId}`, alias: input.documentAlias, hashBase64: input.documentHashBase64 },
        ]);

        const sessionId = await dbComplete.createSignatureSession({
          userId: ctx.user.id,
          provider: config.provider as CloudSignatureProvider,
          documentType: input.documentType,
          documentId: input.documentId,
          documentAlias: input.documentAlias,
          documentHash: input.documentHashBase64,
          authorizeCode,
          codeVerifier,
          expiresInSeconds: 300,
        });

        const providerName = config.provider === "vidaas" ? "VIDaaS" : "BirdID";
        return { sessionId, status: "pendente", message: `Confirme no app ${providerName} no seu celular.` };
      }),

    pollA3: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const session = await dbComplete.getSignatureSession(input.sessionId);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
        if (session.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (session.status === "assinado") return { status: "assinado", sessionId: input.sessionId };
        if (session.status === "expirado" || session.status === "erro") {
          return { status: session.status, sessionId: input.sessionId, error: session.errorMessage };
        }
        if (new Date() > new Date(session.expiresAt)) {
          await dbComplete.updateSignatureSession(input.sessionId, { status: "expirado" });
          return { status: "expirado", sessionId: input.sessionId };
        }

        const config = await dbComplete.getCloudSignatureConfig(ctx.user.id);
        if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configuração não encontrada." });

        const client = createCloudSignatureClient(
          config.provider as CloudSignatureProvider,
          config.cpf,
          config.clientId,
          config.clientSecret,
          `${process.env.APP_URL || "https://sistema.drwesleycamara.com.br"}/api/cloud-signature/callback`,
          (config.ambiente as "producao" | "homologacao") ?? "homologacao",
        );

        try {
          const poll = await client.pollPushAuthorization(session.authorizeCode);
          if (!poll.done) return { status: "pendente", sessionId: input.sessionId };

          const tokenResult = await client.exchangeCodeForToken(poll.authorizationToken!, session.codeVerifier);
          const signatures = await client.signHashes(tokenResult.accessToken, [
            { documentId: `doc-${session.documentId}`, alias: session.documentAlias, hashBase64: session.documentHash },
          ]);

          const cms = signatures[0]?.signatureCms || "";
          const validationCode = Buffer.from(cms.slice(0, 48) || session.documentHash.slice(0, 48))
            .toString("hex").slice(0, 24).toUpperCase();

          await dbComplete.updateSignatureSession(input.sessionId, {
            status: "assinado", accessToken: tokenResult.accessToken, signatureCms: cms,
          });
          await dbComplete.applyDocumentSignature({
            documentType: session.documentType,
            documentId: session.documentId,
            sessionId: input.sessionId,
            provider: config.provider,
            signedByName: ctx.user.name || ctx.user.email,
            signatureCms: cms,
            validationCode,
          });

          return { status: "assinado", sessionId: input.sessionId, validationCode };
        } catch (err: any) {
          const msg = err?.message || "Erro ao verificar assinatura.";
          await dbComplete.updateSignatureSession(input.sessionId, { status: "erro", errorMessage: msg });
          return { status: "erro", sessionId: input.sessionId, error: msg };
        }
      }),

    /**
     * Gera QR code com a URL de autorização OAuth2+PKCE.
     * O médico escaneia com o app VIDaaS ou BirdID no celular.
     * O callback em /api/cloud-signature/callback completa a assinatura.
     */
    generateQrCode: protectedProcedure
      .input(z.object({
        documentType: z.enum(["evolucao", "atestado", "prescricao", "exame"]),
        documentId: z.number(),
        documentAlias: z.string(),
        documentHashBase64: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const config = await dbComplete.getCloudSignatureConfig(ctx.user.id);
        if (!config?.clientId || !config?.cpf) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Configure sua assinatura digital A3 em Perfil → Assinatura Digital.",
          });
        }

        const appUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";
        const redirectUri = `${appUrl}/api/cloud-signature/callback`;

        const client = createCloudSignatureClient(
          config.provider as CloudSignatureProvider,
          config.cpf,
          config.clientId,
          config.clientSecret,
          redirectUri,
          (config.ambiente as "producao" | "homologacao") ?? "homologacao",
        );

        // Cria a sessão antes de gerar a URL para ter o sessionId como state
        const sessionId = await dbComplete.createSignatureSession({
          userId: ctx.user.id,
          provider: config.provider as CloudSignatureProvider,
          documentType: input.documentType,
          documentId: input.documentId,
          documentAlias: input.documentAlias,
          documentHash: input.documentHashBase64,
          authorizeCode: "",
          codeVerifier: "",
          expiresInSeconds: 300,
        });

        // Gera URL com state=sessionId para o callback recuperar a sessão
        const { authorizeUrl, codeVerifier } = client.buildAuthorizeUrl(
          [{ documentId: `doc-${input.documentId}`, alias: input.documentAlias, hashBase64: input.documentHashBase64 }],
          "multi_signature",
          300,
          String(sessionId),
        );

        // Salva o codeVerifier na sessão (necessário para trocar o code)
        await dbComplete.updateSignatureSession(sessionId, { codeVerifier });

        // Gera o QR code como data URL (PNG base64)
        const QRCode = await import("qrcode");
        const qrDataUrl: string = await QRCode.toDataURL(authorizeUrl, {
          width: 256,
          margin: 2,
          color: { dark: "#1a1a1a", light: "#ffffff" },
        });

        const providerName = config.provider === "vidaas" ? "VIDaaS" : "BirdID";
        return {
          sessionId,
          qrDataUrl,
          authorizeUrl,
          providerName,
          expiresIn: 300,
          message: `Abra o app ${providerName} e escaneie o QR code para assinar o documento.`,
        };
      }),

    listSessions: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listSignatureSessions(ctx.user.id);
    }),
  }),

  // ─── Certillion (agregador VIDAAS / BirdID / CERTILLION_SIGNER) ───────────
  certillion: router({
    getConfig: protectedProcedure.query(async () => {
      const cfg = await dbComplete.getCertillionConfig();
      if (!cfg) return { configured: false as const };
      return {
        configured: true as const,
        clientId: cfg.clientId,
        // nunca devolve o secret em claro
        clientSecretMasked: cfg.clientSecret
          ? "•••••••••••••" + cfg.clientSecret.slice(-4)
          : "",
        redirectUri: cfg.redirectUri,
        baseUrl: cfg.baseUrl,
        defaultPsc: cfg.defaultPsc,
        enabled: cfg.enabled,
      };
    }),

    saveConfig: protectedProcedure
      .input(z.object({
        clientId: z.string().min(3),
        clientSecret: z.string().min(3).optional(),
        redirectUri: z.string().url().optional(),
        baseUrl: z.string().url().optional(),
        defaultPsc: z.enum([
          "VIDAAS", "BIRDID", "CERTILLION_SIGNER", "SERPRO", "SAFEID", "SOLUTI",
        ]).optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const appUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";
        // Se o usuário não enviou um novo secret, preserva o atual
        let finalSecret = input.clientSecret;
        if (!finalSecret) {
          const existing = await dbComplete.getCertillionConfig();
          if (!existing?.clientSecret) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Client Secret é obrigatório no primeiro cadastro.",
            });
          }
          finalSecret = existing.clientSecret;
        }
        await dbComplete.saveCertillionConfig({
          ...input,
          clientSecret: finalSecret,
          redirectUri: input.redirectUri || `${appUrl}/api/certillion/callback`,
        });
        return { success: true };
      }),

    testConnection: protectedProcedure.mutation(async () => {
      const cfg = await dbComplete.getCertillionConfig();
      if (!cfg) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Certillion não configurado." });
      const { createCertillionClient } = await import("./lib/certillion");
      const client = createCertillionClient({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: cfg.redirectUri,
        baseUrl: cfg.baseUrl,
      });
      const token = await client.getClientToken();
      return { success: true, expiresIn: token.expiresIn };
    }),

    findPscAccounts: protectedProcedure
      .input(z.object({ cpfOrCnpj: z.string().min(11) }))
      .mutation(async ({ input }) => {
        const cfg = await dbComplete.getCertillionConfig();
        if (!cfg) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Certillion não configurado." });
        const { createCertillionClient } = await import("./lib/certillion");
        const client = createCertillionClient({
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          redirectUri: cfg.redirectUri,
          baseUrl: cfg.baseUrl,
        });
        const { accessToken } = await client.getClientToken();
        return client.findPscAccounts(accessToken, input.cpfOrCnpj);
      }),

    initiate: protectedProcedure
      .input(z.object({
        documentType: z.enum(["evolucao", "prescricao", "exame", "atestado", "outro"]),
        documentId: z.number().int().positive(),
        documentAlias: z.string().min(1).max(120),
        /** SHA-256 do conteúdo em base64 */
        documentHashBase64: z.string().min(20),
        psc: z.enum([
          "VIDAAS", "BIRDID", "CERTILLION_SIGNER", "SERPRO", "SAFEID", "SOLUTI",
        ]).optional(),
        signerCpf: z.string().min(11).max(14),
      }))
      .mutation(async ({ ctx, input }) => {
        const cfg = await dbComplete.getCertillionConfig();
        if (!cfg) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Certillion não configurado. Vá em Configurações → Assinaturas." });

        const { createCertillionClient } = await import("./lib/certillion");
        const appUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";
        const redirectUri = cfg.redirectUri || `${appUrl}/api/certillion/callback`;

        const client = createCertillionClient({
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          redirectUri,
          baseUrl: cfg.baseUrl,
        });

        const psc = input.psc || (cfg.defaultPsc as any) || "VIDAAS";
        const stateNonce = require("crypto").randomBytes(24).toString("hex");

        const { authorizeUrl, codeVerifier } = client.buildAuthorizeUrl({
          psc,
          alias: input.documentAlias,
          cpf: input.signerCpf.replace(/\D/g, ""),
          state: stateNonce,
          scope: "signature_session",
          lifetimeSeconds: 600,
        });

        const sessionId = await dbComplete.createCertillionSession({
          userId: ctx.user.id,
          psc,
          documentType: input.documentType,
          documentId: input.documentId,
          documentAlias: input.documentAlias,
          documentHash: input.documentHashBase64,
          codeVerifier,
          stateNonce,
          signerCpf: input.signerCpf,
          expiresInSeconds: 600,
        });

        // QR code para A3 push flow
        const QRCode = await import("qrcode");
        const qrDataUrl = await QRCode.toDataURL(authorizeUrl, {
          width: 256,
          margin: 2,
          color: { dark: "#1a1a1a", light: "#ffffff" },
        });

        return {
          sessionId,
          authorizeUrl,
          qrDataUrl,
          psc,
          expiresIn: 600,
          message: `Abra o app ${psc} e confirme a assinatura ou escaneie o QR code.`,
        };
      }),

    getSessionStatus: protectedProcedure
      .input(z.object({ sessionId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const s = await dbComplete.getSignatureSession(input.sessionId);
        if (!s || s.userId !== ctx.user.id) return null;
        return {
          id: s.id,
          status: s.status,
          psc: s.psc,
          errorMessage: s.errorMessage,
          expiresAt: s.expiresAt,
        };
      }),
  }),

  templates: router({
    list: protectedProcedure.query(async () => {
      return dbComplete.listTemplatesNormalized();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        specialty: z.string().optional(),
        group: z.string().optional(),
        description: z.string().optional(),
        sections: z.array(z.object({
          title: z.string(),
          type: z.string().optional(),
          content: z.string().optional(),
          fields: z.array(z.any()).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createTemplateNormalized(input, ctx.user.id);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string(),
        specialty: z.string().optional(),
        group: z.string().optional(),
        description: z.string().optional(),
        sections: z.array(z.object({
          title: z.string(),
          type: z.string().optional(),
          content: z.string().optional(),
          fields: z.array(z.any()).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.updateTemplateNormalized(input.id, input, ctx.user.id);
      }),

    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return dbComplete.deleteTemplateNormalized(input.id);
      }),
  }),
  // MEDICAL RECORDS
  medicalRecords: router({
    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listMedicalRecordTemplatesNormalized();
    }),
    getHistory: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPatientHistory(input.patientId);
      }),
    getDocuments: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPatientDocuments(input.patientId);
      }),
    listContracts: protectedProcedure
      .input(z.object({ query: z.string().optional(), limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return dbComplete.listContractDocuments(input?.query, input?.limit);
      }),
    uploadDocument: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        type: z.string().min(1),
        folderLabel: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        base64: z.string().min(16),
        mimeType: z.string().optional(),
        originalFileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.uploadPatientDocument(input, ctx.user.id);
      }),
  }),

  // WHATSAPP
  whatsapp: router({
    sendMessage: protectedProcedure
      .input(z.object({
        phoneNumber: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.sendWhatsAppMessage(input.phoneNumber, input.message);
      }),
    sendAnamnesisRequest: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        title: z.string().optional(),
        expiresInDays: z.number().min(1).max(60).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.sendPatientAnamnesisRequestViaWhatsApp(
          input.patientId,
          ctx.user.id,
          getAppBaseUrl(ctx.req),
          {
            title: input.title,
            expiresInDays: input.expiresInDays,
          },
        );
      }),
    sendAppointmentReminder: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
        customMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.sendAppointmentReminderViaWhatsApp(
          input.appointmentId,
          ctx.user.id,
          getAppBaseUrl(ctx.req),
          input.customMessage,
        );
      }),
    sendTomorrowReminders: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        return dbComplete.sendTomorrowAppointmentReminders(ctx.user.id, getAppBaseUrl(ctx.req));
      }),

    // ─── Envio de documentos em PDF via WhatsApp ─────────────────────────────
    sendDocumentToPatient: protectedProcedure
      .input(z.object({
        documentType: z.enum(["prescricao", "exame", "orcamento", "atestado", "nfse"]),
        documentId: z.number(),
        phone: z.string().optional(), // sobrescreve o telefone do paciente se informado
      }))
      .mutation(async ({ ctx, input }) => {
        const wa = await createWhatsAppService();
        if (!wa) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WhatsApp não configurado. Configure o Access Token e Phone Number ID nas configurações da clínica." });

        const { documentType, documentId } = input;
        let phone = input.phone ?? "";
        let pdfBuffer: Buffer;
        let filename: string;
        let caption: string;

        // ── Prescrição ────────────────────────────────────────────────────────
        if (documentType === "prescricao") {
          const rx = await dbComplete.getPrescriptionById(documentId);
          if (!rx) throw new TRPCError({ code: "NOT_FOUND", message: "Prescrição não encontrada." });
          if (!phone) phone = rx.patientPhone ?? rx.phone ?? "";

          const content = stripHtmlForSignature(rx.content ?? rx.medicamentos ?? "");
          pdfBuffer = buildSimplePdfBuffer("PRESCRIÇÃO MÉDICA", [
            `Paciente: ${rx.patientName ?? ""}`,
            `Data: ${new Date(rx.date ?? rx.createdAt).toLocaleDateString("pt-BR")}`,
            `CRM: ${rx.doctorCrm ?? ""}`,
            "",
            content,
            "",
            `Dr(a). ${rx.doctorName ?? ctx.user.name}`,
          ]);
          filename = `prescricao_${documentId}.pdf`;
          caption = `Prescrição médica — Clínica Glutée`;
        }

        // ── Pedido de Exames ──────────────────────────────────────────────────
        else if (documentType === "exame") {
          const exam = await dbComplete.getExamRequestById(documentId);
          if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido de exames não encontrado." });
          if (!phone) phone = exam.patientPhone ?? exam.phone ?? "";

          const exams = Array.isArray(exam.exams) ? exam.exams.join(", ") : String(exam.exams ?? exam.content ?? "");
          pdfBuffer = buildSimplePdfBuffer("PEDIDO DE EXAMES", [
            `Paciente: ${exam.patientName ?? ""}`,
            `Data: ${new Date(exam.date ?? exam.createdAt).toLocaleDateString("pt-BR")}`,
            "",
            "Exames solicitados:",
            exams,
            exam.clinicalIndication ? `\nIndicação clínica: ${exam.clinicalIndication}` : "",
            "",
            `Dr(a). ${exam.doctorName ?? ctx.user.name}`,
          ]);
          filename = `pedido_exames_${documentId}.pdf`;
          caption = `Pedido de exames — Clínica Glutée`;
        }

        // ── Orçamento ─────────────────────────────────────────────────────────
        else if (documentType === "orcamento") {
          const budget = await dbComplete.getBudgetById(documentId);
          if (!budget) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado." });
          if (!phone) phone = budget.patientPhone ?? "";

          const total = (budget.totalInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const itemLines = (budget.items ?? []).map((item: any) =>
            `- ${item.procedureName ?? item.areaName ?? "Item"}: R$ ${((item.unitPriceInCents ?? 0) / 100 * (item.quantity ?? 1)).toFixed(2).replace(".", ",")}`,
          );
          pdfBuffer = buildSimplePdfBuffer("ORÇAMENTO", [
            `Paciente: ${budget.patientName}`,
            `Data: ${new Date(budget.createdAt).toLocaleDateString("pt-BR")}`,
            "",
            "Procedimentos:",
            ...itemLines,
            "",
            `Total: ${total}`,
            budget.validUntil ? `Validade: ${new Date(budget.validUntil).toLocaleDateString("pt-BR")}` : "",
            "",
            "Clínica Glutée",
          ]);
          filename = `orcamento_${documentId}.pdf`;
          caption = `Orçamento — Clínica Glutée`;
        }

        // ── Atestado / Documento do Paciente ──────────────────────────────────
        else if (documentType === "atestado") {
          const doc = await dbComplete.getPatientDocumentById(documentId);
          if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
          if (!phone) phone = (doc as any).patientPhone ?? "";

          const docContent = stripHtmlForSignature((doc as any).content ?? (doc as any).text ?? "");
          pdfBuffer = buildSimplePdfBuffer(((doc as any).title ?? "ATESTADO MÉDICO").toUpperCase(), [
            `Paciente: ${(doc as any).patientName ?? ""}`,
            `Data: ${new Date((doc as any).date ?? (doc as any).createdAt).toLocaleDateString("pt-BR")}`,
            "",
            docContent,
            "",
            `Dr(a). ${(doc as any).doctorName ?? ctx.user.name}`,
          ]);
          filename = `atestado_${documentId}.pdf`;
          caption = `${(doc as any).title ?? "Atestado"} — Clínica Glutée`;
        }

        // ── NFSe ─────────────────────────────────────────────────────────────
        else if (documentType === "nfse") {
          const nfse = await dbComplete.getNfseById(documentId);
          if (!nfse) throw new TRPCError({ code: "NOT_FOUND", message: "Nota Fiscal não encontrada." });
          if (!phone) phone = (nfse as any).patientPhone ?? "";

          const valor = ((nfse as any).valorServicos ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          pdfBuffer = buildSimplePdfBuffer("NOTA FISCAL DE SERVIÇO ELETRÔNICA (NFS-e)", [
            `Número: ${(nfse as any).numero ?? (nfse as any).rpsNumero ?? ""}`,
            `Data: ${new Date((nfse as any).dataEmissao ?? (nfse as any).createdAt).toLocaleDateString("pt-BR")}`,
            `Tomador: ${(nfse as any).tomadorNome ?? (nfse as any).patientName ?? ""}`,
            `Valor: ${valor}`,
            "",
            `Descrição: ${(nfse as any).descricaoServico ?? ""}`,
            "",
            "Clínica Glutée — CNPJ 37.249.024/0001-40",
          ]);
          filename = `nfse_${documentId}.pdf`;
          caption = `NFS-e nº ${(nfse as any).numero ?? documentId} — Clínica Glutée`;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de documento inválido." });
        }

        if (!phone) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Telefone do paciente não encontrado. Informe o número antes de enviar." });

        // Upload do PDF e envio
        const mediaId = await wa.uploadMedia(pdfBuffer!, filename!, "application/pdf");
        await wa.sendDocument(phone, mediaId, filename!, caption!);

        return { success: true, phone, filename };
      }),
  }),

  // AI
  ai: router({
    chat: protectedProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.string(),
          content: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.invokeAI(input.messages);
      }),
  }),

  // RETROACTIVE APPOINTMENTS
  retroactiveAppointments: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number(),
        scheduledAt: z.string(),
        durationMinutes: z.number(),
        type: z.string(),
        notes: z.string().optional(),
        retroactiveJustification: z.string().min(10, "Justificativa deve ter no mínimo 10 caracteres"),
        originalAppointmentDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const special = await import("./features_special");
        return special.createRetroactiveAppointment(input as any, ctx.user.id);
      }),

    list: protectedProcedure
      .input(z.object({ patientId: z.number().optional() }))
      .query(async ({ input }) => {
        const special = await import("./features_special");
        return special.getRetroactiveAppointments(input.patientId);
      }),
  }),

  // ADVANCED PHOTO GALLERY
  photoGallery: router({
    createFolder: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        name: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPhotoFolder(input.patientId, input.name, input.description, ctx.user.id);
      }),

    getFolders: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPhotoFolders(input.patientId);
      }),

    updateFolder: protectedProcedure
      .input(z.object({
        folderId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.updatePhotoFolder(input.folderId, { name: input.name, description: input.description });
      }),

    deleteFolder: protectedProcedure
      .input(z.object({ folderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.deletePhotoFolder(input.folderId);
      }),

    uploadToFolder: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        folderId: z.number().nullable(),
        category: z.string(),
        description: z.string().optional(),
        base64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.uploadPatientPhoto(
          {
            patientId: input.patientId,
            folderId: input.folderId,
            category: input.category,
            description: input.description,
            base64: input.base64,
            mimeType: input.mimeType,
          },
          ctx.user.id,
        );
      }),

    getByFolder: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        folderId: z.number().nullable(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getPatientPhotos(input.patientId, undefined, input.folderId);
      }),

    createComparison: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        photoIds: z.array(z.number()).min(2).max(4),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPhotoComparison(input.patientId, input.photoIds, ctx.user.id);
      }),

    createUploadLink: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        folderId: z.number().nullable().optional(),
        title: z.string().optional(),
        allowVideos: z.boolean().optional(),
        expiresInDays: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPatientMediaUploadLink(
          input,
          ctx.user.id,
          getAppBaseUrl(ctx.req),
        );
      }),

    listUploadLinks: protectedProcedure
      .input(z.object({
        patientId: z.number(),
      }))
      .query(async ({ input }) => {
        return dbComplete.listPatientMediaUploadLinks(input.patientId);
      }),

    revokeUploadLink: protectedProcedure
      .input(z.object({
        linkId: z.number(),
      }))
      .mutation(async ({ input }) => {
        return dbComplete.revokePatientMediaUploadLink(input.linkId);
      }),
  }),

  anamnesisShare: router({
    createLink: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        title: z.string().optional(),
        templateName: z.string().optional(),
        anamnesisDate: z.string().optional(),
        expiresInDays: z.number().optional(),
        questions: z.array(z.object({
          id: z.string().optional(),
          text: z.string(),
          type: z.string(),
          options: z.array(z.string()).optional(),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          followUp: z.object({
            prompt: z.string(),
            triggerValues: z.array(z.string()),
            required: z.boolean().optional(),
            placeholder: z.string().optional(),
          }).optional(),
          visibleWhen: z.object({
            questionId: z.string(),
            values: z.array(z.string()),
          }).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createAnamnesisShareLink(
          input,
          ctx.user.id,
          getAppBaseUrl(ctx.req),
        );
      }),
  }),

  anamneses: router({
    listByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        return dbComplete.listPatientAnamneses(input.patientId, ctx.user.role);
      }),

    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        title: z.string().min(1),
        templateName: z.string().optional(),
        anamnesisDate: z.string().optional(),
        respondentName: z.string().optional(),
        questions: z.array(z.object({
          id: z.string().optional(),
          text: z.string(),
          type: z.string(),
          options: z.array(z.string()).optional(),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          followUp: z.object({
            prompt: z.string(),
            triggerValues: z.array(z.string()),
            required: z.boolean().optional(),
            placeholder: z.string().optional(),
          }).optional(),
          visibleWhen: z.object({
            questionId: z.string(),
            values: z.array(z.string()),
          }).optional(),
        })),
        answers: z.record(z.string(), z.string()),
        profilePhotoBase64: z.string().optional(),
        profilePhotoMimeType: z.string().optional(),
        profilePhotoFileName: z.string().optional(),
        profilePhotoDeclarationAccepted: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const payload = ctx.user.role === "admin"
          ? input
          : {
              ...input,
              profilePhotoBase64: undefined,
              profilePhotoMimeType: undefined,
              profilePhotoFileName: undefined,
              profilePhotoDeclarationAccepted: undefined,
            };
        return dbComplete.createPatientAnamnesis(payload as any, ctx.user.id);
      }),
  }),

  // INTELLIGENT PATIENT SEARCH
  patientSearch: router({
    autocomplete: protectedProcedure
      .input(z.object({
        query: z.string(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const special = await import("./features_special");
        return special.searchPatientsAutocomplete(input.query, input.limit);
      }),
  }),

  // CUSTOMIZABLE PERMISSIONS
  permissions: router({
    checkPermission: protectedProcedure
      .input(z.object({
        userId: z.number(),
        module: z.string(),
        action: z.enum(['create', 'read', 'update', 'delete']),
      }))
      .query(async ({ input }) => {
        const special = await import("./features_special");
        return special.checkUserPermission(input.userId, input.module, input.action);
      }),

    getUserMatrix: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.id !== input.userId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const special = await import("./features_special");
        return special.getUserPermissionMatrix(input.userId);
      }),

    setModulePermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        module: z.string(),
        permissions: z.object({
          canCreate: z.boolean().optional(),
          canRead: z.boolean().optional(),
          canUpdate: z.boolean().optional(),
          canDelete: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const special = await import("./features_special");
        return special.setUserModulePermissions(input.userId, input.module, input.permissions);
      }),

    copyPermissions: protectedProcedure
      .input(z.object({
        fromUserId: z.number(),
        toUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const special = await import("./features_special");
        return special.copyUserPermissions(input.fromUserId, input.toUserId);
      }),

    getUserAuditLog: protectedProcedure
      .input(z.object({
        userId: z.number(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.id !== input.userId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const special = await import("./features_special");
        return special.getUserAuditLog(input.userId, input.limit);
      }),

    getResourceAuditLog: protectedProcedure
      .input(z.object({
        resourceType: z.string(),
        resourceId: z.number(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        const special = await import("./features_special");
        return special.getResourceAuditLog(input.resourceType, input.resourceId, input.limit);
      }),
  }),

  // ─── CERTIFICADO A1 PF (assinatura de documentos) ──────────────────────────
  a1Certificate: router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.getUserA1CertificateStatus(ctx.user.id);
    }),

    upload: protectedProcedure
      .input(z.object({
        fileName: z.string().min(1),
        fileBase64: z.string().min(16),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Valida o PFX antes de salvar
        const { inspectPfx } = await import("./lib/a1-pdf-signer");
        const info = inspectPfx(input.fileBase64, input.password);
        await dbComplete.saveUserA1Certificate(ctx.user.id, input);
        return { success: true, fileName: input.fileName, commonName: info.commonName, validTo: info.validTo.toISOString() };
      }),

    signDocument: protectedProcedure
      .input(z.object({
        pdfBase64: z.string().min(16),
        signerName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const certRaw = await dbComplete.getUserA1CertificateRaw(ctx.user.id);
        if (!certRaw?.fileBase64) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Certificado A1 PF não configurado. Faça o upload em Perfil → Certificado Digital.",
          });
        }
        const { signPdfWithA1 } = await import("./lib/a1-pdf-signer");
        const result = await signPdfWithA1(
          input.pdfBase64,
          certRaw.fileBase64,
          certRaw.password,
          input.signerName ?? ctx.user.name ?? undefined,
        );
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
