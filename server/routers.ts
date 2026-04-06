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
import { generateSecureToken } from "./_core/auth";
import { inviteEmailTemplate, sendEmail } from "./_core/mailer";

function getAppBaseUrl(req: { headers: Record<string, unknown>; secure?: boolean }) {
  if (process.env.APP_URL) return process.env.APP_URL;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host;
  const protocol = forwardedProto || (req.secure ? "https" : "http");

  if (Array.isArray(host)) {
    return `${Array.isArray(protocol) ? protocol[0] : protocol}://${host[0]}`;
  }

  return `${Array.isArray(protocol) ? protocol[0] : protocol}://${host || "localhost:3000"}`;
}

export const appRouter = router({
  system: systemRouter,

  // AUTH
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    updateMe: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        specialty: z.string().optional(),
        crm: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbComplete.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  twoFactor: twoFactorRouter,
  icd10: router({
    search: publicProcedure
      .input(z.object({ query: z.string().min(1), limit: z.number().optional() }))
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

  // â”€â”€â”€ AUDIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ CLINICAL EVOLUTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  clinicalEvolution: clinicalEvolutionRouter,

  // â”€â”€â”€ ADMIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    inviteUser: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string(),
        role: z.enum(['user', 'admin', 'medico', 'recepcionista', 'enfermeiro']),
        permissions: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

        const normalizedEmail = input.email.toLowerCase().trim();
        const existingUser = await db.getUserByEmail(normalizedEmail);
        if (existingUser && existingUser.status === 'active' && ((existingUser as any).passwordHash || (existingUser as any).password)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Ja existe um usuario ativo com este e-mail.' });
        }

        await db.inviteUser({
          email: normalizedEmail,
          name: input.name,
          role: input.role,
          permissions: input.permissions,
        });

        const token = generateSecureToken(32);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
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
          acceptUrl,
          expiresIn: '48 horas',
        });

        const emailResult = await sendEmail({ to: normalizedEmail, subject, html });
        return {
          success: true,
          emailSent: emailResult.success,
          manualLink: emailResult.success ? null : acceptUrl,
          warning: emailResult.success ? null : `E-mail nao enviado: ${emailResult.error}`,
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
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
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
        role: z.enum(['user', 'admin', 'medico', 'recepcionista', 'enfermeiro']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
        await dbComplete.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),

  // â”€â”€â”€ PATIENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  patients: router({
    list: protectedProcedure
      .input(z.object({ query: z.string().optional(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return dbComplete.listPatients(input.query, input.limit);
      }),

    create: protectedProcedure
      .input(z.object({
        fullName: z.string(),
        cpf: z.string(),
        birthDate: z.string(),
        gender: z.string().optional(),
        phone: z.string(),
        email: z.string().optional(),
        zipCode: z.string(),
        address: z.string(),
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
  }),

  // â”€â”€â”€ APPOINTMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  appointments: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number(),
        scheduledAt: z.string(),
        durationMinutes: z.number(),
        type: z.string(),
        notes: z.string().optional(),
        isRetroactive: z.boolean().optional(),
        retroactiveJustification: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createAppointment(input, ctx.user.id);
      }),

    getByDate: protectedProcedure
      .input(z.object({
        from: z.string(),
        to: z.string(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getAppointmentsByDateRange(input.from, input.to);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
        status: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.updateAppointmentStatus(input.appointmentId, input.status);
      }),
  }),

  // â”€â”€â”€ PRESCRIPTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  prescriptions: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        type: z.string(),
        content: z.string(),
        observations: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPrescription(input, ctx.user.id);
      }),

    getByPatient: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        return dbComplete.getPrescriptionsByPatient(input.patientId);
      }),

    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listPrescriptionTemplates();
    }),

    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createPrescriptionTemplate(input, ctx.user.id);
      }),
  }),

  // â”€â”€â”€ EXAM REQUESTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      return dbComplete.listExamTemplates();
    }),

    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createExamTemplate(input, ctx.user.id);
      }),
  }),

  // â”€â”€â”€ FINANCIAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ CATALOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  catalog: router({
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

  // â”€â”€â”€ INVENTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ PHOTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  photos: router({
    getByPatient: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        category: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return dbComplete.getPatientPhotos(input.patientId, input.category);
      }),

    upload: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        category: z.string(),
        description: z.string().optional(),
        base64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.uploadPatientPhoto(input, ctx.user.id);
      }),

    delete: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.deletePatientPhoto(input.photoId);
      }),
  }),

  // â”€â”€â”€ CHAT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ CLINIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ FISCAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ NFSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ BUDGETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  budgets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listBudgets();
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
  }),

  // â”€â”€â”€ CRM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ SIGNATURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  signatures: router({
    sendForSignature: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        documentType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.sendForSignature(input.documentId, input.documentType, ctx.user.id);
      }),
  }),

  // â”€â”€â”€ TEMPLATES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listTemplates();
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        specialty: z.string().optional(),
        description: z.string().optional(),
        sections: z.array(z.object({
          title: z.string(),
          fields: z.array(z.any()),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.createTemplate(input, ctx.user.id);
      }),
  }),

  // â”€â”€â”€ MEDICAL RECORDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  medicalRecords: router({
    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      return dbComplete.listMedicalRecordTemplates();
    }),
  }),

  // â”€â”€â”€ WHATSAPP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  whatsapp: router({
    sendMessage: protectedProcedure
      .input(z.object({
        phoneNumber: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return dbComplete.sendWhatsAppMessage(input.phoneNumber, input.message);
      }),
  }),

  // â”€â”€â”€ AI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ RETROACTIVE APPOINTMENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  retroactiveAppointments: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        doctorId: z.number(),
        scheduledAt: z.string(),
        durationMinutes: z.number(),
        type: z.string(),
        notes: z.string().optional(),
        retroactiveJustification: z.string().min(10, "Justificativa deve ter no mÃ­nimo 10 caracteres"),
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

  // â”€â”€â”€ ADVANCED PHOTO GALLERY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  photoGallery: router({
    createFolder: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        name: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const special = await import("./features_special");
        return special.createPhotoFolder(input.patientId, input.name, input.description, ctx.user.id);
      }),

    getFolders: protectedProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ input }) => {
        const special = await import("./features_special");
        return special.getPhotoFolders(input.patientId);
      }),

    updateFolder: protectedProcedure
      .input(z.object({
        folderId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const special = await import("./features_special");
        return special.updatePhotoFolder(input.folderId, { name: input.name, description: input.description });
      }),

    deleteFolder: protectedProcedure
      .input(z.object({ folderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const special = await import("./features_special");
        return special.deletePhotoFolder(input.folderId);
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
        // Aqui vocÃª faria upload para storage e obteria photoUrl e photoKey
        const special = await import("./features_special");
        return special.uploadPhotoToFolder(
          input.patientId,
          input.folderId,
          input.category,
          input.description || null,
          "https://example.com/photo.jpg", // photoUrl
          "photo_key_123", // photoKey
          ctx.user.id
        );
      }),

    getByFolder: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        folderId: z.number().nullable(),
      }))
      .query(async ({ input }) => {
        const special = await import("./features_special");
        return special.getPhotosByFolder(input.folderId, input.patientId);
      }),

    createComparison: protectedProcedure
      .input(z.object({
        patientId: z.number(),
        photoIds: z.array(z.number()).min(2).max(4),
      }))
      .mutation(async ({ ctx, input }) => {
        const special = await import("./features_special");
        return special.createPhotoComparison(input.patientId, input.photoIds, ctx.user.id);
      }),
  }),

  // â”€â”€â”€ INTELLIGENT PATIENT SEARCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ CUSTOMIZABLE PERMISSIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
});

export type AppRouter = typeof appRouter;




