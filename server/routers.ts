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
import { createD4SignService, selectSafe, SAFE_MAP } from "./d4sign";

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

const financialProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowed = ["admin", "medico", "recepcionista"];
  if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito." });
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
      referralSource: z.string().optional(),
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

// ─── Medical Record Templates Router ─────────────────────────────────────────

const templatesRouter = router({
  list: protectedProcedure.query(async () => db.listMedicalRecordTemplates()),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const template = await db.getMedicalRecordTemplateById(input.id);
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      return template;
    }),

  create: doctorProcedure
    .input(z.object({
      name: z.string().min(2),
      specialty: z.string().optional(),
      description: z.string().optional(),
      sections: z.array(z.object({
        title: z.string(),
        fields: z.array(z.object({
          label: z.string(),
          type: z.enum(["text", "textarea", "radio", "select", "multi_select", "checkbox", "number", "date"]),
          options: z.array(z.string()).optional(),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          defaultValue: z.string().optional(),
        })),
      })),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createMedicalRecordTemplate({ ...input, createdBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_TEMPLATE", "medical_record_template", undefined, undefined, { name: input.name }, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateMedicalRecordTemplate(input.id, input.data);
      await audit(ctx.user.id, "UPDATE_TEMPLATE", "medical_record_template", input.id, undefined, {}, ctx.req as any);
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
      // Fetch chaperones
      const chaperones = await db.getChaperonesByRecord(input.id);
      return { ...record, chaperones };
    }),

  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      appointmentId: z.number().optional(),
      templateId: z.number().optional(),
      templateResponses: z.record(z.string(), z.any()).optional(),
      recordType: z.enum(["livre", "template", "misto"]).optional(),
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
      // Chaperone (obrigatório para exames íntimos - CFM)
      chaperoneUserId: z.number().optional(),
      chaperoneRole: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { chaperoneUserId, chaperoneRole, ...recordData } = input;
      const result = await db.createMedicalRecord({ ...recordData, doctorId: ctx.user.id });
      // Add chaperone if provided
      if (chaperoneUserId && result?.insertId) {
        await db.addChaperone({
          medicalRecordId: result.insertId,
          userId: chaperoneUserId,
          role: chaperoneRole ?? "assistente",
        });
      }
      await audit(ctx.user.id, "CREATE_MEDICAL_RECORD", "medical_record", undefined, input.patientId, {
        templateId: input.templateId,
        hasChaperone: !!chaperoneUserId,
      }, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ 
      id: z.number(), 
      data: z.record(z.string(), z.any()),
      justification: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getMedicalRecordById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      
      // Bloqueio Jurídico: Se estiver bloqueado, exige justificativa e muda status para 'alterado'
      if (record.isLocked) {
        if (!input.justification) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "Este prontuário está encerrado. Uma justificativa é obrigatória para qualquer alteração." 
          });
        }
        
        // Auditoria Completa: Registrar valor anterior e novo valor
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "CORRECTION_AFTER_LOCK",
          resourceType: "medical_record",
          resourceId: input.id,
          patientId: record.patientId,
          details: { justification: input.justification },
          dataBefore: record,
          dataAfter: { ...record, ...input.data },
          ipAddress: (ctx.req as any)?.ip,
          userAgent: (ctx.req as any)?.headers?.["user-agent"]
        });

        // Atualiza com status 'alterado' e salva a justificativa no registro
        await db.updateMedicalRecord(input.id, { 
          ...input.data, 
          status: "alterado",
          lastChangeJustification: input.justification 
        });
      } else {
        // Fluxo normal para rascunho/salvo
        if (record.doctorId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Somente o médico responsável pode editar este prontuário." });
        }
        await db.updateMedicalRecord(input.id, input.data);
        await audit(ctx.user.id, "UPDATE_MEDICAL_RECORD", "medical_record", input.id, record.patientId, {}, ctx.req as any);
      }
      
      return { success: true };
    }),

  lock: doctorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const record = await db.getMedicalRecordById(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      
      await db.updateMedicalRecord(input.id, { 
        isLocked: true, 
        lockedAt: new Date(), 
        lockedByUserId: ctx.user.id,
        status: "encerrado"
      });
      
      await audit(ctx.user.id, "LOCK_MEDICAL_RECORD", "medical_record", input.id, record.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  addChaperone: doctorProcedure
    .input(z.object({ medicalRecordId: z.number(), userId: z.number(), role: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.addChaperone({ medicalRecordId: input.medicalRecordId, userId: input.userId, role: input.role ?? "assistente" });
      await audit(ctx.user.id, "ADD_CHAPERONE", "medical_record", input.medicalRecordId, undefined, { chaperoneUserId: input.userId }, ctx.req as any);
      return { success: true };
    }),

  getChaperones: medicalProcedure
    .input(z.object({ medicalRecordId: z.number() }))
    .query(async ({ input }) => db.getChaperonesByRecord(input.medicalRecordId)),

  exportReport: medicalProcedure
    .input(z.object({
      patientId: z.number(),
      include: z.object({
        cadastro: z.boolean().default(true),
        anamnese: z.boolean().default(true),
        evolucao: z.boolean().default(true),
        prescricoes: z.boolean().default(true),
        exames: z.boolean().default(true),
        fotos: z.boolean().default(true),
        documentos: z.boolean().default(true),
        auditoria: z.boolean().default(false),
      })
    }))
    .mutation(async ({ input, ctx }) => {
      const patient = await db.getPatientById(input.patientId);
      if (!patient) throw new TRPCError({ code: "NOT_FOUND" });

      const reportData: any = { patient };

      if (input.include.anamnese || input.include.evolucao) {
        reportData.medicalRecords = await db.getMedicalRecordsByPatient(input.patientId);
      }
      if (input.include.prescricoes) {
        reportData.prescriptions = await db.getPrescriptionsByPatient(input.patientId);
      }
      if (input.include.exames) {
        reportData.examRequests = await db.getExamRequestsByPatient(input.patientId);
      }
      if (input.include.fotos) {
        reportData.photos = await db.getPatientPhotos(input.patientId);
      }
      if (input.include.documentos) {
        reportData.documents = await db.getPatientDocuments(input.patientId);
      }
      if (input.include.auditoria) {
        reportData.auditLogs = await db.getAuditLogsByPatient(input.patientId);
      }

      await audit(ctx.user.id, "EXPORT_PATIENT_REPORT", "patient", input.patientId, input.patientId, { include: input.include }, ctx.req as any);
      
      // Retorna os dados para o frontend gerar o PDF (usando jspdf/react-pdf já instalados)
      return reportData;
    }),
});

// ─── Patient Photos Router ───────────────────────────────────────────────────

const photosRouter = router({
  getByPatient: medicalProcedure
    .input(z.object({ patientId: z.number(), category: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await audit(ctx.user.id, "VIEW_PATIENT_PHOTOS", "patient_photo", undefined, input.patientId, {}, ctx.req as any);
      return db.getPatientPhotos(input.patientId, input.category);
    }),

  upload: medicalProcedure
    .input(z.object({
      patientId: z.number(),
      medicalRecordId: z.number().optional(),
      category: z.enum(["antes", "depois", "evolucao", "exame", "documento", "outro"]),
      description: z.string().optional(),
      base64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `patients/${input.patientId}/photos/${input.category}-${nanoid(8)}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.createPatientPhoto({
        patientId: input.patientId,
        medicalRecordId: input.medicalRecordId,
        category: input.category,
        description: input.description,
        photoUrl: url,
        photoKey: key,
        uploadedBy: ctx.user.id,
      });
      await audit(ctx.user.id, "UPLOAD_PATIENT_PHOTO", "patient_photo", undefined, input.patientId, { category: input.category }, ctx.req as any);
      return { success: true, url };
    }),

  delete: doctorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deletePatientPhoto(input.id);
      await audit(ctx.user.id, "DELETE_PATIENT_PHOTO", "patient_photo", input.id, undefined, {}, ctx.req as any);
      return { success: true };
    }),
});

// ─── Patient Documents Router ────────────────────────────────────────────────

const documentsRouter = router({
  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getPatientDocuments(input.patientId)),

  upload: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      type: z.enum(["exame_pdf", "exame_imagem", "video", "rg", "cpf", "convenio", "termo", "outro"]),
      title: z.string(),
      description: z.string().optional(),
      base64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "bin";
      const key = `patients/${input.patientId}/docs/${input.type}-${nanoid(8)}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.createPatientDocument({
        patientId: input.patientId,
        type: input.type,
        title: input.title,
        description: input.description,
        fileUrl: url,
        fileKey: key,
        mimeType: input.mimeType,
        fileSizeBytes: buffer.length,
        uploadedBy: ctx.user.id,
      });
      await audit(ctx.user.id, "UPLOAD_DOCUMENT", "patient_document", undefined, input.patientId, { type: input.type }, ctx.req as any);
      return { success: true, url };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.deletePatientDocument(input.id);
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
      })).optional(),
      content: z.string().optional(),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createPrescription({ ...input, doctorId: ctx.user.id });
      await audit(ctx.user.id, "CREATE_PRESCRIPTION", "prescription", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  listTemplates: medicalProcedure.query(async () => db.listPrescriptionTemplates()),

  createTemplate: doctorProcedure
    .input(z.object({
      name: z.string(),
      content: z.string(),
      type: z.enum(["simples", "especial_azul", "especial_amarelo", "antimicrobiano"]),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createPrescriptionTemplate({ ...input, createdBy: ctx.user.id });
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
      })).optional(),
      content: z.string().optional(),
      clinicalIndication: z.string().optional(),
      observations: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createExamRequest({ ...input, doctorId: ctx.user.id });
      await audit(ctx.user.id, "CREATE_EXAM_REQUEST", "exam_request", undefined, input.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  listTemplates: medicalProcedure.query(async () => db.listExamRequestTemplates()),

  createTemplate: doctorProcedure
    .input(z.object({
      name: z.string(),
      content: z.string(),
      specialty: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createExamRequestTemplate({ ...input, createdBy: ctx.user.id });
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateExamRequest(input.id, input.data);
      return { success: true };
    }),
});

// ─── Inventory / Estoque Router ──────────────────────────────────────────────

const inventoryRouter = router({
  listProducts: protectedProcedure.query(async () => db.listInventoryProducts()),

  getProduct: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const product = await db.getInventoryProductById(input.id);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      return product;
    }),

  createProduct: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      sku: z.string().optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      unit: z.string().optional(),
      currentStock: z.number().optional(),
      minimumStock: z.number().optional(),
      costPriceInCents: z.number().optional(),
      supplierName: z.string().optional(),
      supplierContact: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createInventoryProduct({ ...input, createdBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_INVENTORY_PRODUCT", "inventory_product", undefined, undefined, { name: input.name }, ctx.req as any);
      return { success: true };
    }),

  updateProduct: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateInventoryProduct(input.id, input.data);
      return { success: true };
    }),

  createMovement: protectedProcedure
    .input(z.object({
      productId: z.number(),
      type: z.enum(["entrada", "saida", "ajuste"]),
      quantity: z.number().min(1),
      reason: z.string().optional(),
      patientId: z.number().optional(),
      appointmentId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createInventoryMovement({ ...input, createdBy: ctx.user.id });
      await audit(ctx.user.id, "INVENTORY_MOVEMENT", "inventory_movement", undefined, input.patientId, { type: input.type, quantity: input.quantity }, ctx.req as any);
      return { success: true };
    }),

  getMovements: protectedProcedure
    .input(z.object({ productId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => db.getInventoryMovements(input.productId, input.limit ?? 50)),

  getLowStock: protectedProcedure.query(async () => db.getLowStockProducts()),
});

// ─── CRM / Indicações Router ─────────────────────────────────────────────────

const crmRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => db.listCrmIndications(input.status, input.limit ?? 50)),

  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getCrmIndicationsByPatient(input.patientId)),

  create: protectedProcedure
    .input(z.object({
      patientId: z.number(),
      procedureName: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createCrmIndication({ ...input, indicatedBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_CRM_INDICATION", "crm_indication", undefined, input.patientId, { procedure: input.procedureName }, ctx.req as any);
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateCrmIndication(input.id, input.data);
      return { success: true };
    }),
});

// ─── Budget Catalog Router (Catálogo de Procedimentos) ───────────────────────

const catalogRouter = router({
  listProcedures: protectedProcedure.query(async () => db.listBudgetProcedures()),

  getProcedure: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const procedure = await db.getBudgetProcedureById(input.id);
      if (!procedure) throw new TRPCError({ code: "NOT_FOUND" });
      const areas = await db.getAreasByProcedure(input.id);
      const pricing = await db.getPricingByProcedure(input.id);
      return { ...procedure, areas, pricing };
    }),

  createProcedure: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      category: z.string().optional(),
      description: z.string().optional(),
      estimatedSessionsMin: z.number().optional(),
      estimatedSessionsMax: z.number().optional(),
      sessionIntervalDays: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createBudgetProcedure({ ...input, createdBy: ctx.user.id });
      await audit(ctx.user.id, "CREATE_BUDGET_PROCEDURE", "budget_procedure", undefined, undefined, { name: input.name }, ctx.req as any);
      return { success: true };
    }),

  updateProcedure: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateBudgetProcedure(input.id, input.data);
      return { success: true };
    }),

  createArea: adminProcedure
    .input(z.object({ procedureId: z.number(), areaName: z.string(), sortOrder: z.number().optional() }))
    .mutation(async ({ input }) => {
      await db.createBudgetProcedureArea(input);
      return { success: true };
    }),

  updateArea: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input }) => {
      await db.updateBudgetProcedureArea(input.id, input.data);
      return { success: true };
    }),

  upsertPricing: adminProcedure
    .input(z.object({
      procedureId: z.number(),
      areaId: z.number(),
      complexity: z.enum(["P", "M", "G"]),
      priceInCents: z.number(),
    }))
    .mutation(async ({ input }) => {
      await db.upsertBudgetPricing(input);
      return { success: true };
    }),

  getAreas: protectedProcedure
    .input(z.object({ procedureId: z.number() }))
    .query(async ({ input }) => db.getAreasByProcedure(input.procedureId)),

  getPricing: protectedProcedure
    .input(z.object({ procedureId: z.number() }))
    .query(async ({ input }) => db.getPricingByProcedure(input.procedureId)),

  getPrice: protectedProcedure
    .input(z.object({ procedureId: z.number(), areaId: z.number(), complexity: z.enum(["P", "M", "G"]) }))
    .query(async ({ input }) => {
      const price = await db.getPrice(input.procedureId, input.areaId, input.complexity);
      return price ?? null;
    }),

  // Payment Plans
  listPaymentPlans: protectedProcedure.query(async () => db.listPaymentPlans()),

  createPaymentPlan: adminProcedure
    .input(z.object({
      name: z.string(),
      type: z.enum(["a_vista", "parcelado_sem_juros", "parcelado_com_juros", "financiamento", "pagamento_programado"]),
      discountPercent: z.string().optional(),
      maxInstallments: z.number().optional(),
      interestRatePercent: z.string().optional(),
      description: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.createPaymentPlan(input);
      return { success: true };
    }),

  updatePaymentPlan: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input }) => {
      await db.updatePaymentPlan(input.id, input.data);
      return { success: true };
    }),
});

// ─── Budgets / Orçamentos Router ─────────────────────────────────────────────

const budgetsRouter = router({
  list: financialProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => db.listBudgets(input.status, input.limit ?? 50)),

  getByPatient: financialProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getBudgetsByPatient(input.patientId)),

  getById: financialProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const budget = await db.getBudgetById(input.id);
      if (!budget) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.getBudgetItems(input.id);
      const paymentPlans = await db.listPaymentPlans();
      await audit(ctx.user.id, "VIEW_BUDGET", "budget", input.id, budget.patientId, {}, ctx.req as any);
      return { ...budget, items, paymentPlans };
    }),

  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      clinicalNotes: z.string().optional(),
      validityDays: z.number().optional(),
      items: z.array(z.object({
        procedureId: z.number(),
        procedureName: z.string(),
        areaId: z.number(),
        areaName: z.string(),
        complexity: z.enum(["P", "M", "G"]),
        unitPriceInCents: z.number(),
        quantity: z.number().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      // Calculate totals
      let totalInCents = 0;
      const itemsWithSubtotal = input.items.map((item, idx) => {
        const qty = item.quantity ?? 1;
        const subtotal = item.unitPriceInCents * qty;
        totalInCents += subtotal;
        return { ...item, quantity: qty, subtotalInCents: subtotal, sortOrder: idx };
      });

      const validityDays = input.validityDays ?? 10;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);

      const result = await db.createBudget({
        patientId: input.patientId,
        doctorId: ctx.user.id,
        totalInCents,
        finalTotalInCents: totalInCents,
        clinicalNotes: input.clinicalNotes,
        validityDays,
        expiresAt,
        status: "rascunho",
      });

      // Add items
      if (result?.insertId) {
        for (const item of itemsWithSubtotal) {
          await db.addBudgetItem({ ...item, budgetId: result.insertId });
        }
      }

      await audit(ctx.user.id, "CREATE_BUDGET", "budget", undefined, input.patientId, { totalInCents, itemCount: input.items.length }, ctx.req as any);
      return { success: true };
    }),

  update: doctorProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateBudget(input.id, input.data);
      return { success: true };
    }),

  emit: doctorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const budget = await db.getBudgetById(input.id);
      if (!budget) throw new TRPCError({ code: "NOT_FOUND" });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (budget.validityDays ?? 10));
      await db.updateBudget(input.id, { status: "emitido", expiresAt });
      await audit(ctx.user.id, "EMIT_BUDGET", "budget", input.id, budget.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  approve: financialProcedure
    .input(z.object({ id: z.number(), selectedPaymentPlanId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      await db.updateBudget(input.id, { status: "aprovado", approvedAt: new Date(), selectedPaymentPlanId: input.selectedPaymentPlanId });
      const budget = await db.getBudgetById(input.id);
      await audit(ctx.user.id, "APPROVE_BUDGET", "budget", input.id, budget?.patientId, {}, ctx.req as any);
      return { success: true };
    }),

  reject: financialProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.updateBudget(input.id, { status: "rejeitado" });
      return { success: true };
    }),

  addItem: doctorProcedure
    .input(z.object({
      budgetId: z.number(),
      procedureId: z.number(),
      procedureName: z.string(),
      areaId: z.number(),
      areaName: z.string(),
      complexity: z.enum(["P", "M", "G"]),
      unitPriceInCents: z.number(),
      quantity: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const qty = input.quantity ?? 1;
      const subtotal = input.unitPriceInCents * qty;
      await db.addBudgetItem({ ...input, quantity: qty, subtotalInCents: subtotal });
      // Recalculate total
      const items = await db.getBudgetItems(input.budgetId);
      const total = items.reduce((sum, i) => sum + i.subtotalInCents, 0);
      await db.updateBudget(input.budgetId, { totalInCents: total, finalTotalInCents: total });
      return { success: true };
    }),

  removeItem: doctorProcedure
    .input(z.object({ id: z.number(), budgetId: z.number() }))
    .mutation(async ({ input }) => {
      await db.removeBudgetItem(input.id);
      const items = await db.getBudgetItems(input.budgetId);
      const total = items.reduce((sum, i) => sum + i.subtotalInCents, 0);
      await db.updateBudget(input.budgetId, { totalInCents: total, finalTotalInCents: total });
      return { success: true };
    }),
});

// ─── Financial / Financeiro Router ───────────────────────────────────────────

const financialRouter = router({
  list: adminProcedure
    .input(z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.listFinancialTransactions({
        type: input.type,
        status: input.status,
        from: input.from ? new Date(input.from) : undefined,
        to: input.to ? new Date(input.to) : undefined,
      }, input.limit ?? 100);
    }),

  create: adminProcedure
    .input(z.object({
      type: z.enum(["receita", "despesa"]),
      category: z.string(),
      description: z.string(),
      amountInCents: z.number(),
      paymentMethod: z.enum(["pix", "dinheiro", "cartao_credito", "cartao_debito", "transferencia", "boleto", "outro"]).optional(),
      patientId: z.number().optional(),
      budgetId: z.number().optional(),
      appointmentId: z.number().optional(),
      dueDate: z.string().optional(),
      status: z.enum(["pendente", "pago", "atrasado", "cancelado"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createFinancialTransaction({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdBy: ctx.user.id,
      });
      await audit(ctx.user.id, "CREATE_FINANCIAL_TRANSACTION", "financial_transaction", undefined, input.patientId, { type: input.type, amount: input.amountInCents }, ctx.req as any);
      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input, ctx }) => {
      await db.updateFinancialTransaction(input.id, input.data);
      return { success: true };
    }),

  getSummary: adminProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input }) => db.getFinancialSummary(new Date(input.from), new Date(input.to))),
});

// ─── Chat Router ─────────────────────────────────────────────────────────────

const chatRouter = router({
  getMessages: protectedProcedure
    .input(z.object({ channelId: z.string().optional(), limit: z.number().optional(), before: z.number().optional() }))
    .query(async ({ input }) => {
      return db.getChatMessages(input.channelId ?? "geral", input.limit ?? 50, input.before);
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      channelId: z.string().optional(),
      content: z.string().min(1),
      messageType: z.enum(["text", "file", "system"]).optional(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
      mentions: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.createChatMessage({
        channelId: input.channelId ?? "geral",
        senderId: ctx.user.id,
        content: input.content,
        messageType: input.messageType ?? "text",
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        mentions: input.mentions,
      });
      return { success: true };
    }),
});

// ─── Clinic Settings / Empresa Router ────────────────────────────────────────

const clinicRouter = router({
  get: protectedProcedure.query(async () => db.getClinicSettings()),

  update: adminProcedure
    .input(z.object({
      name: z.string().optional(),
      tradeName: z.string().optional(),
      cnpj: z.string().optional(),
      stateRegistration: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      neighborhood: z.string().optional(),
      specialties: z.array(z.string()).optional(),
      openingHours: z.array(z.object({ day: z.string(), open: z.string(), close: z.string() })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertClinicSettings(input as any);
      await audit(ctx.user.id, "UPDATE_CLINIC_SETTINGS", "clinic_settings", undefined, undefined, {}, ctx.req as any);
      return { success: true };
    }),

  uploadLogo: adminProcedure
    .input(z.object({ base64: z.string(), mimeType: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `clinic/logo-${nanoid(8)}.${input.mimeType.split("/")[1] ?? "png"}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.upsertClinicSettings({ name: "Clínica Glutée", logoUrl: url, logoKey: key } as any);
      return { success: true, url };
    }),
});

// ─── Anamnesis Links Router ──────────────────────────────────────────────────

const anamnesisRouter = router({
  create: doctorProcedure
    .input(z.object({
      patientId: z.number(),
      templateId: z.number(),
      expiresInHours: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const token = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (input.expiresInHours ?? 72));
      await db.createAnamnesisLink({
        patientId: input.patientId,
        templateId: input.templateId,
        token,
        expiresAt,
        createdBy: ctx.user.id,
      });
      return { success: true, token, link: `/anamnese/${token}` };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const link = await db.getAnamnesisLinkByToken(input.token);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      if (link.status === "expirado" || new Date() > link.expiresAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Link expirado." });
      }
      const template = await db.getMedicalRecordTemplateById(link.templateId);
      return { link, template };
    }),

  submitResponses: publicProcedure
    .input(z.object({ token: z.string(), responses: z.record(z.string(), z.any()) }))
    .mutation(async ({ input }) => {
      const link = await db.getAnamnesisLinkByToken(input.token);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      if (link.status !== "pendente") throw new TRPCError({ code: "FORBIDDEN", message: "Este formulário já foi preenchido." });
      await db.updateAnamnesisLink(link.id, { responses: input.responses, status: "preenchido", completedAt: new Date() });
      return { success: true };
    }),
});

// ─── D4Sign / Signatures Router ───────────────────────────────────────────────

const signaturesRouter = router({
  sendForSignature: doctorProcedure
    .input(z.object({
      resourceType: z.enum(["prescription", "exam_request", "medical_record", "budget", "nfe", "termo", "contrato"]),
      resourceId: z.number(),
      documentBase64: z.string(),
      documentName: z.string(),
      signerEmail: z.string(),
      signerName: z.string(),
      certificateType: z.enum(["eletronica", "icp_brasil_a1", "icp_brasil_a3"]).default("eletronica"),
      safeOverride: z.string().optional(), // UUID do cofre específico (opcional)
    }))
    .mutation(async ({ input, ctx }) => {
      const d4sign = await createD4SignService();
      const clinic = await db.getClinicSettings();
      const doctor = await db.getUserById(ctx.user.id);

      // Selecionar cofre automaticamente ou usar override
      const safeKey = input.safeOverride || selectSafe(input.resourceType, clinic, doctor);

      if (!d4sign) {
        // Modo simulado quando D4Sign não está configurado
        await db.createDocumentSignature({
          resourceType: ["nfe", "termo", "contrato"].includes(input.resourceType) ? "budget" : input.resourceType as any,
          resourceId: input.resourceId,
          doctorId: ctx.user.id,
          d4signDocumentKey: `simulated-${nanoid(12)}`,
          status: "enviado",
          signatureType: input.certificateType,
        });
        await audit(ctx.user.id, "SEND_FOR_SIGNATURE_SIMULATED", input.resourceType, input.resourceId, undefined, { safeKey }, ctx.req as any);
        return { success: true, simulated: true, message: "Modo simulado: credenciais D4Sign ausentes." };
      }

      try {
        const isICP = input.certificateType.startsWith("icp_brasil");
        const result = await d4sign.sendDocumentForSignature({
          safeUuid: safeKey,
          base64Content: input.documentBase64,
          fileName: input.documentName,
          signerEmail: input.signerEmail,
          signerName: input.signerName,
          message: `Clínica Glutée - Por favor, assine o documento: ${input.documentName}`,
          useIcpBrasil: isICP,
        });

        await db.createDocumentSignature({
          resourceType: ["nfe", "termo", "contrato"].includes(input.resourceType) ? "budget" : input.resourceType as any,
          resourceId: input.resourceId,
          doctorId: ctx.user.id,
          d4signDocumentKey: result.documentUuid,
          d4signSafeKey: safeKey,
          status: "enviado",
          signatureType: input.certificateType,
        });

        await audit(ctx.user.id, "SEND_FOR_SIGNATURE", input.resourceType, input.resourceId, undefined, { documentKey: result.documentUuid, safeKey }, ctx.req as any);
        return { success: true, documentKey: result.documentUuid };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao enviar para D4Sign: ${err.message}` });
      }
    }),

  getStatus: protectedProcedure
    .input(z.object({ resourceType: z.string(), resourceId: z.number() }))
    .query(async ({ input }) => {
      return db.getDocumentSignatureByResource(input.resourceType, input.resourceId);
    }),

  listSafes: doctorProcedure.query(async () => {
    try {
      const d4sign = await createD4SignService();
      if (!d4sign) return { safes: [], configured: false };
      const safes = await d4sign.listSafes();
      return { safes, configured: true };
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao listar cofres D4Sign: ${err.message}` });
    }
  }),

  listDocuments: doctorProcedure
    .input(z.object({ safeUuid: z.string() }))
    .query(async ({ input }) => {
      try {
        const d4sign = await createD4SignService();
        if (!d4sign) return { documents: [], configured: false };
        const documents = await d4sign.listDocuments(input.safeUuid);
        return { documents, configured: true };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao listar documentos D4Sign: ${err.message}` });
      }
    }),

  getDocumentStatus: doctorProcedure
    .input(z.object({ documentUuid: z.string() }))
    .query(async ({ input }) => {
      try {
        const d4sign = await createD4SignService();
        if (!d4sign) return { status: "not_configured" };
        return await d4sign.getDocumentStatus(input.documentUuid);
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao consultar status D4Sign: ${err.message}` });
      }
    }),

  cancelDocument: doctorProcedure
    .input(z.object({ documentUuid: z.string(), comment: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const d4sign = await createD4SignService();
        if (!d4sign) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "D4Sign não configurado" });
        const data = await d4sign.cancelDocument(input.documentUuid, input.comment || "Cancelado pelo sistema");
        await audit(ctx.user.id, "CANCEL_D4SIGN_DOCUMENT", "document_signature", undefined, undefined, { documentUuid: input.documentUuid }, ctx.req as any);
        return { success: true, data };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao cancelar documento D4Sign: ${err.message}` });
      }
    }),

  downloadDocument: doctorProcedure
    .input(z.object({ documentUuid: z.string() }))
    .query(async ({ input }) => {
      try {
        const d4sign = await createD4SignService();
        if (!d4sign) return { url: null, configured: false };
        const data = await d4sign.downloadDocument(input.documentUuid);
        return { url: data?.url || null, configured: true, data };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao baixar documento D4Sign: ${err.message}` });
      }
    }),

  getSafeMap: protectedProcedure.query(() => {
    return Object.entries(SAFE_MAP).map(([key, uuid]) => ({ key, uuid }));
  }),
});

// ─── NFS-e Router ────────────────────────────────────────────────────────────

const nfseRouter = router({
  list: financialProcedure
    .input(z.object({
      status: z.string().optional(),
      ambiente: z.string().optional(),
      patientId: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.listNfseEmissions(
        { status: input.status, ambiente: input.ambiente, patientId: input.patientId },
        input.limit ?? 50
      );
    }),

  getById: financialProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const nfse = await db.getNfseEmissionById(input.id);
      if (!nfse) throw new TRPCError({ code: "NOT_FOUND" });
      return nfse;
    }),

  getByPatient: financialProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => db.getNfseByPatient(input.patientId)),

  create: adminProcedure
    .input(z.object({
      // Tomador
      tomadorDocumento: z.string().min(1),
      tomadorTipoDocumento: z.enum(["cpf", "cnpj"]).default("cpf"),
      tomadorNome: z.string().min(1),
      tomadorEmail: z.string().optional(),
      tomadorTelefone: z.string().optional(),
      tomadorCep: z.string().optional(),
      tomadorMunicipio: z.string().optional(),
      tomadorUf: z.string().optional(),
      tomadorBairro: z.string().optional(),
      tomadorLogradouro: z.string().optional(),
      tomadorNumero: z.string().optional(),
      tomadorComplemento: z.string().optional(),
      // Vínculos
      patientId: z.number().optional(),
      budgetId: z.number().optional(),
      appointmentId: z.number().optional(),
      // Serviço
      descricaoServico: z.string().default("Procedimentos Médicos Ambulatoriais"),
      complementoDescricao: z.string().optional(),
      // Valores
      valorServico: z.number().min(1), // Em centavos
      valorDeducao: z.number().optional(),
      valorDescontoIncondicionado: z.number().optional(),
      // Pagamento
      formaPagamento: z.enum(["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "financiamento", "outro"]).default("pix"),
      detalhesPagamento: z.string().optional(),
      // Data
      dataCompetencia: z.string().optional(), // ISO date string
      // Ambiente
      ambiente: z.enum(["homologacao", "producao"]).default("homologacao"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Buscar configurações fiscais
      const fiscal = await db.getFiscalSettings();
      if (!fiscal) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure os dados fiscais antes de emitir NFS-e." });

      const valorServico = input.valorServico;
      const deducao = input.valorDeducao ?? 0;
      const descontoInc = input.valorDescontoIncondicionado ?? 0;
      const valorLiquido = valorServico - deducao - descontoInc;

      // Montar descrição completa
      const descricaoCompleta = [
        input.descricaoServico || fiscal.descricaoServicoPadrao || "Procedimentos Médicos Ambulatoriais",
        input.complementoDescricao ? `\n${input.complementoDescricao}` : "",
        `\n\n${fiscal.textoLegalFixo || "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS"}`,
      ].join("");

      const dataCompStr = input.dataCompetencia || new Date().toISOString().split("T")[0];
      const dataComp = new Date(dataCompStr + "T12:00:00");

      const result = await db.createNfseEmission({
        emitenteCnpj: fiscal.cnpj,
        emitenteRazaoSocial: fiscal.razaoSocial,
        tomadorDocumento: input.tomadorDocumento,
        tomadorTipoDocumento: input.tomadorTipoDocumento,
        tomadorNome: input.tomadorNome,
        tomadorEmail: input.tomadorEmail,
        tomadorTelefone: input.tomadorTelefone,
        tomadorCep: input.tomadorCep,
        tomadorMunicipio: input.tomadorMunicipio,
        tomadorUf: input.tomadorUf,
        tomadorBairro: input.tomadorBairro,
        tomadorLogradouro: input.tomadorLogradouro,
        tomadorNumero: input.tomadorNumero,
        tomadorComplemento: input.tomadorComplemento,
        patientId: input.patientId,
        budgetId: input.budgetId,
        appointmentId: input.appointmentId,
        codigoTributacaoNacional: fiscal.codigoTributacaoNacional || "04.03.03",
        descricaoServico: descricaoCompleta,
        complementoDescricao: input.complementoDescricao,
        textoLegalFixo: fiscal.textoLegalFixo,
        itemNbs: fiscal.itemNbs || "123012100",
        municipioIncidencia: fiscal.municipioIncidencia || "Mogi Guaçu",
        ufIncidencia: fiscal.ufIncidencia || "SP",
        valorServico,
        valorDeducao: deducao,
        valorDescontoIncondicionado: descontoInc,
        valorLiquido,
        tributacaoIssqn: "tributavel",
        aliquotaSimplesNacional: fiscal.aliquotaSimplesNacional || "18.63",
        formaPagamento: input.formaPagamento,
        detalhesPagamento: input.detalhesPagamento,
        dataCompetencia: dataComp,
        ambiente: input.ambiente,
        status: "rascunho",
        emitidaPor: ctx.user.id,
      });

      await audit(ctx.user.id, "CREATE_NFSE", "nfse", undefined, input.patientId, {
        valorServico,
        ambiente: input.ambiente,
        tomador: input.tomadorNome,
      }, ctx.req as any);

      return { success: true, id: result?.insertId };
    }),

  emit: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const nfse = await db.getNfseEmissionById(input.id);
      if (!nfse) throw new TRPCError({ code: "NOT_FOUND" });
      if (nfse.status !== "rascunho") throw new TRPCError({ code: "BAD_REQUEST", message: "NFS-e já foi emitida ou cancelada." });

      // Gerar número simulado (integração real com portal nacional seria aqui)
      const numeroNfse = String(Date.now()).slice(-8);
      const chaveAcesso = `3524${new Date().getFullYear()}${Math.random().toString(36).slice(2, 18)}`;
      const codigoVerificacao = Math.random().toString(36).slice(2, 10).toUpperCase();

      await db.updateNfseEmission(input.id, {
        status: "emitida",
        numeroNfse,
        chaveAcesso,
        codigoVerificacao,
        protocoloAutorizacao: `PROT-${numeroNfse}`,
      } as any);

      await audit(ctx.user.id, "EMIT_NFSE", "nfse", input.id, nfse.patientId ?? undefined, {
        numero: numeroNfse,
        ambiente: nfse.ambiente,
        valor: nfse.valorServico,
      }, ctx.req as any);

      return { success: true, numero: numeroNfse, chaveAcesso, codigoVerificacao };
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.number(), motivo: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const nfse = await db.getNfseEmissionById(input.id);
      if (!nfse) throw new TRPCError({ code: "NOT_FOUND" });
      if (nfse.status !== "emitida") throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas NFS-e emitidas podem ser canceladas." });

      await db.updateNfseEmission(input.id, {
        status: "cancelada",
        motivoCancelamento: input.motivo,
        canceladaEm: new Date(),
      } as any);

      await audit(ctx.user.id, "CANCEL_NFSE", "nfse", input.id, nfse.patientId ?? undefined, {
        motivo: input.motivo,
      }, ctx.req as any);

      return { success: true };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
    .mutation(async ({ input }) => {
      await db.updateNfseEmission(input.id, input.data);
      return { success: true };
    }),
});

// ─── Fiscal Settings Router ──────────────────────────────────────────────────

const fiscalRouter2 = router({
  get: protectedProcedure.query(async () => db.getFiscalSettings()),

  upsert: adminProcedure
    .input(z.object({
      cnpj: z.string().min(1),
      razaoSocial: z.string().min(1),
      nomeFantasia: z.string().optional(),
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
      ambiente: z.enum(["homologacao", "producao"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertFiscalSettings({ ...input, updatedBy: ctx.user.id } as any);
      await audit(ctx.user.id, "UPDATE_FISCAL_SETTINGS", "fiscal_settings", undefined, undefined, {}, ctx.req as any);
      return { success: true };
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

  getStaff: protectedProcedure
    .input(z.object({ roles: z.array(z.string()).optional() }))
    .query(async ({ input }) => {
      return db.getStaffByRoles(input.roles ?? ["admin", "medico", "enfermeiro", "recepcionista"]);
    }),

  // Permissions management
  getUserPermissions: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => db.getUserPermissions(input.userId)),

  setUserPermission: adminProcedure
    .input(z.object({
      userId: z.number(),
      module: z.string(),
      canCreate: z.boolean().optional(),
      canRead: z.boolean().optional(),
      canUpdate: z.boolean().optional(),
      canDelete: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.setUserPermission(input);
      await audit(ctx.user.id, "SET_USER_PERMISSION", "permission", undefined, undefined, { targetUserId: input.userId, module: input.module }, ctx.req as any);
      return { success: true };
    }),
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
  templates: templatesRouter,
  medicalRecords: medicalRecordsRouter,
  photos: photosRouter,
  documents: documentsRouter,
  prescriptions: prescriptionsRouter,
  examRequests: examRequestsRouter,
  inventory: inventoryRouter,
  crm: crmRouter,
  catalog: catalogRouter,
  budgets: budgetsRouter,
  financial: financialRouter,
  chat: chatRouter,
  clinic: clinicRouter,
  anamnesis: anamnesisRouter,
  signatures: signaturesRouter,
  nfse: nfseRouter,
  fiscal: fiscalRouter2,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
