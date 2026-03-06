import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import * as db from "./db";
import { createAuditLog } from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import axios from "axios";

// ─── Role Middleware ──────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
  return next({ ctx });
});

const medicalProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowed = ["admin", "medico", "enfermeiro"];
  if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a profissionais de saúde." });
  return next({ ctx });
});

const doctorProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowed = ["admin", "medico"];
  if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a médicos." });
  return next({ ctx });
});

// ─── Audit Helper ─────────────────────────────────────────────────────────────

async function audit(
  userId: number,
  action: string,
  resourceType: string,
  resourceId?: number,
  patientId?: number,
  details?: Record<string, unknown>,
  req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }
) {
  await createAuditLog({
    userId,
    action,
    resourceType,
    resourceId,
    patientId,
    details,
    ipAddress: req?.ip ?? undefined,
    userAgent: typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
  });
}

// ─── Patients Router ──────────────────────────────────────────────────────────

const patientsRouter = router({
  list: protectedProcedure
    .input(z.object({ query: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.query && input.query.trim()) return db.searchPatients(input.query.trim(), input.limit ?? 20);
      return db.listPatients(input.limit ?? 50, input.offset ?? 0);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const patient = await db.getPatientById(input.id);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND" });
      await audit(ctx.user.id, "VIEW_PATIENT", "patient", input.id, input.id, {}, ctx.req as any);
      return patient;
    }),

  create: protectedProcedure
    .input(z.object({
      fullName: z.string().min(2),
      birthDate: z.string().optional(),
      gender: z.enum(["masculino", "feminino", "outro", "nao_informado"]).optional(),
      cpf: z.string().optional(),
      rg: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      insuranceName: z.string().optional(),
      insuranceNumber: z.string().optional(),
      bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"]).optional(),
      allergies: z.string().optional(),
      chronicConditions: z.string().optional(),
      emergencyContactName: z.string().optional(),
      emergencyContactPhone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { birthDate, ...rest } = input;
      await db.createPatient({ ...rest, birthDate: birthDate ? new Date(birthDate) : undefined, createdBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_PATIENT", "patient", undefined, undefined, { name: input.fullName }, ctx.req as any);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updatePatient(input.id, input.data);
      await audit(ctx.user.id, "UPDATE_PATIENT", "patient", input.id, input.id, {}, ctx.req as any);
      return { success: true };
    }),

  uploadPhoto: protectedProcedure
    .input(z.object({ patientId: z.number(), base64: z.string(), mimeType: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `patients/${input.patientId}/photo-${nanoid(8)}.${input.mimeType.split("/")[1] ?? "jpg"}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updatePatient(input.patientId, { photoUrl: url, photoKey: key });
      await audit(ctx.user.id, "UPLOAD_PHOTO", "patient", input.patientId, input.patientId, {}, ctx.req as any);
      return { url };
    }),
});

// ─── Appointments Router ──────────────────────────────────────────────────────

const appointmentsRouter = router({
  getByDoctor: protectedProcedure
    .input(z.object({ doctorId: z.number(), from: z.string(), to: z.string() }))
    .query(async ({ input }) => {
      return db.getAppointmentsByDoctor(input.doctorId, new Date(input.from), new Date(input.to));
    }),

  getByDate: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input }) => {
      return db.getAppointmentsByDate(new Date(input.from), new Date(input.to));
    }),

  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getAppointmentsByPatient(input.patientId)),

  create: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      doctorId: z.number(),
      scheduledAt: z.string(),
      durationMinutes: z.number().optional(),
      type: z.enum(["consulta", "retorno", "exame", "procedimento", "teleconsulta"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createAppointment({ ...input, scheduledAt: new Date(input.scheduledAt), createdBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_APPOINTMENT", "appointment", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.updateAppointmentStatus(input.id, input.status, input.reason);
      await audit(ctx.user.id, "UPDATE_APPOINTMENT_STATUS", "appointment", input.id, undefined, { status: input.status }, ctx.req as any);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateAppointment(input.id, input.data);
      return { success: true };
    }),

  createBlock: protectedProcedure
    .input(z.object({ doctorId: z.number(), startAt: z.string(), endAt: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.createScheduleBlock({ ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt), createdBy: ctx.user.id });
      return { success: true };
    }),

  getBlocks: protectedProcedure
    .input(z.object({ doctorId: z.number(), from: z.string(), to: z.string() }))
    .query(async ({ input }) => {
      return db.getScheduleBlocksByDoctor(input.doctorId, new Date(input.from), new Date(input.to));
    }),

  deleteBlock: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteScheduleBlock(input.id);
      return { success: true };
    }),
});

// ─── Medical Records Router ───────────────────────────────────────────────────

const medicalRecordsRouter = router({
  getByPatient: medicalProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input, ctx }) => {
      await audit(ctx.user.id, "VIEW_MEDICAL_RECORDS", "medical_record", undefined, input.patientId, {}, ctx.req as any);
      return db.getMedicalRecordsByPatient(input.patientId);
    }),

  getById: medicalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const record = await db.getMedicalRecordById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      await audit(ctx.user.id, "VIEW_MEDICAL_RECORD", "medical_record", input.id, record.patientId, {}, ctx.req as any);
      return record;
    }),

  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      appointmentId: z.number().optional(),
      chiefComplaint: z.string().optional(),
      historyOfPresentIllness: z.string().optional(),
      pastMedicalHistory: z.string().optional(),
      familyHistory: z.string().optional(),
      socialHistory: z.string().optional(),
      currentMedications: z.string().optional(),
      allergies: z.string().optional(),
      physicalExam: z.string().optional(),
      vitalSigns: z.record(z.string(), z.any()).optional(),
      diagnosis: z.string().optional(),
      icdCode: z.string().optional(),
      clinicalEvolution: z.string().optional(),
      treatmentPlan: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createMedicalRecord({ ...input, doctorId: ctx.user.id });
      await audit(ctx.user.id, "CREATE_MEDICAL_RECORD", "medical_record", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getMedicalRecordById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.doctorId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente o médico responsável pode editar este prontuário." });
      }
      await db.updateMedicalRecord(input.id, input.data);
      await audit(ctx.user.id, "UPDATE_MEDICAL_RECORD", "medical_record", input.id, record.patientId, {}, ctx.req as any);
      return { success: true };
    }),
});

// ─── Prescriptions Router ─────────────────────────────────────────────────────

const prescriptionsRouter = router({
  getByPatient: medicalProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getPrescriptionsByPatient(input.patientId)),

  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      medicalRecordId: z.number().optional(),
      appointmentId: z.number().optional(),
      type: z.enum(["simples", "especial_azul", "especial_amarelo", "antimicrobiano"]),
      items: z.array(z.object({
        medication: z.string(),
        dosage: z.string(),
        frequency: z.string(),
        duration: z.string().optional(),
        instructions: z.string().optional(),
      })),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createPrescription({ ...input, doctorId: ctx.user.id });
      await audit(ctx.user.id, "CREATE_PRESCRIPTION", "prescription", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updatePrescription(input.id, input.data);
      return { success: true };
    }),
});

// ─── Exam Requests Router ─────────────────────────────────────────────────────

const examRequestsRouter = router({
  getByPatient: medicalProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getExamRequestsByPatient(input.patientId)),

  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      medicalRecordId: z.number().optional(),
      appointmentId: z.number().optional(),
      specialty: z.string().optional(),
      exams: z.array(z.object({
        name: z.string(),
        code: z.string().optional(),
        instructions: z.string().optional(),
        urgency: z.enum(["rotina", "urgente", "emergencia"]).optional(),
      })),
      clinicalIndication: z.string().optional(),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createExamRequest({ ...input, doctorId: ctx.user.id });
      await audit(ctx.user.id, "CREATE_EXAM_REQUEST", "exam_request", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateExamRequest(input.id, input.data);
      return { success: true };
    }),
});

// ─── D4Sign / Signatures Router ───────────────────────────────────────────────

const D4SIGN_API = "https://sandbox.d4sign.com.br/api/v1";

const signaturesRouter = router({
  sendForSignature: doctorProcedure
    .input(z.object({
      resourceType: z.enum(["prescription", "exam_request", "medical_record"]),
      resourceId: z.number(),
      documentBase64: z.string(),
      documentName: z.string(),
      signerEmail: z.string(),
      signerName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tokenAPI = process.env.D4SIGN_TOKEN_API;
      const cryptKey = process.env.D4SIGN_CRYPT_KEY;
      const safeKey = process.env.D4SIGN_SAFE_KEY;

      if (!tokenAPI || !cryptKey) {
        // Modo simulado quando não há credenciais D4Sign configuradas
        const sig = await db.createDocumentSignature({
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          doctorId: ctx.user.id,
          d4signDocumentKey: `simulated-${nanoid(12)}`,
          status: "enviado",
          signatureType: "eletronica",
        });
        await audit(ctx.user.id, "SEND_FOR_SIGNATURE_SIMULATED", input.resourceType, input.resourceId, undefined, {}, ctx.req as any);
        return { success: true, simulated: true, message: "Documento enviado para assinatura (modo simulado - configure as credenciais D4Sign)." };
      }

      try {
        // 1. Upload do documento
        const uploadRes = await axios.post(
          `${D4SIGN_API}/documents/${safeKey}/upload`,
          { base64_binary_file: input.documentBase64, mime_type: "application/pdf", name: input.documentName },
          { params: { tokenAPI, cryptKey } }
        );
        const documentKey = uploadRes.data?.uuid;

        // 2. Cadastrar signatário
        await axios.post(
          `${D4SIGN_API}/documents/${documentKey}/createlist`,
          { signers: [{ email: input.signerEmail, act: "1", foreign: "0", certificadoicpbr: "0", assinatura_presencial: "0", docauth: "0", docauthandselfie: "0", embed_methodauth: "email", embed_smsnumber: "" }] },
          { params: { tokenAPI, cryptKey } }
        );

        // 3. Enviar para assinatura
        await axios.post(
          `${D4SIGN_API}/documents/${documentKey}/sendtosigner`,
          { message: `Por favor, assine o documento: ${input.documentName}`, workflow: "0" },
          { params: { tokenAPI, cryptKey } }
        );

        await db.createDocumentSignature({
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          doctorId: ctx.user.id,
          d4signDocumentKey: documentKey,
          d4signSafeKey: safeKey,
          status: "enviado",
          signatureType: "eletronica",
        });

        await audit(ctx.user.id, "SEND_FOR_SIGNATURE", input.resourceType, input.resourceId, undefined, { documentKey }, ctx.req as any);
        return { success: true, documentKey };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao enviar para D4Sign: ${err.message}` });
      }
    }),

  getStatus: protectedProcedure
    .input(z.object({ resourceType: z.string(), resourceId: z.number() }))
    .query(async ({ input }) => {
      return db.getDocumentSignatureByResource(input.resourceType, input.resourceId);
    }),
});

// ─── Admin Router ─────────────────────────────────────────────────────────────

const adminRouter = router({
  getDashboardStats: protectedProcedure.query(async () => db.getDashboardStats()),

  listUsers: adminProcedure.query(async () => db.getAllUsers()),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "medico", "recepcionista", "enfermeiro", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateUserRole(input.userId, input.role);
      await audit(ctx.user.id, "UPDATE_USER_ROLE", "user", input.userId, undefined, { role: input.role }, ctx.req as any);
      return { success: true };
    }),

  updateUserProfile: adminProcedure
    .input(z.object({
      userId: z.number(),
      name: z.string().optional(),
      specialty: z.string().optional(),
      crm: z.string().optional(),
      phone: z.string().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { userId, ...data } = input;
      await db.updateUserProfile(userId, data);
      return { success: true };
    }),

  getAuditLogs: adminProcedure
    .input(z.object({ patientId: z.number().optional(), userId: z.number().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.patientId) return db.getAuditLogsByPatient(input.patientId, input.limit ?? 50);
      if (input.userId) return db.getAuditLogsByUser(input.userId, input.limit ?? 100);
      return db.getRecentAuditLogs(input.limit ?? 100);
    }),

  getAppointmentStats: adminProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input }) => db.getAppointmentStatsByDoctor(new Date(input.from), new Date(input.to))),

  getDoctors: protectedProcedure.query(async () => db.getDoctors()),
});

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  patients: patientsRouter,
  appointments: appointmentsRouter,
  medicalRecords: medicalRecordsRouter,
  prescriptions: prescriptionsRouter,
  examRequests: examRequestsRouter,
  signatures: signaturesRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
