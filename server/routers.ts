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

const D4SIGN_API = process.env.D4SIGN_BASE_URL || "https://secure.d4sign.com.br/api/v1";

const signaturesRouter = router({
  sendForSignature: doctorProcedure
    .input(z.object({
      resourceType: z.enum(["prescription", "exam_request", "medical_record", "budget"]),
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
        const uploadRes = await axios.post(
          `${D4SIGN_API}/documents/${safeKey}/upload`,
          { base64_binary_file: input.documentBase64, mime_type: "application/pdf", name: input.documentName },
          { params: { tokenAPI, cryptKey } }
        );
        const documentKey = uploadRes.data?.uuid;

        await axios.post(
          `${D4SIGN_API}/documents/${documentKey}/createlist`,
          { signers: [{ email: input.signerEmail, act: "1", foreign: "0", certificadoicpbr: "0", assinatura_presencial: "0", docauth: "0", docauthandselfie: "0", embed_methodauth: "email", embed_smsnumber: "" }] },
          { params: { tokenAPI, cryptKey } }
        );

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

  listSafes: doctorProcedure.query(async () => {
    const tokenAPI = process.env.D4SIGN_TOKEN_API;
    const cryptKey = process.env.D4SIGN_CRYPT_KEY;
    if (!tokenAPI || !cryptKey) return { safes: [], configured: false };
    try {
      const res = await axios.get(`${D4SIGN_API}/safes`, { params: { tokenAPI, cryptKey } });
      return { safes: res.data, configured: true };
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao listar cofres D4Sign: ${err.message}` });
    }
  }),

  listDocuments: doctorProcedure
    .input(z.object({ safeUuid: z.string() }))
    .query(async ({ input }) => {
      const tokenAPI = process.env.D4SIGN_TOKEN_API;
      const cryptKey = process.env.D4SIGN_CRYPT_KEY;
      if (!tokenAPI || !cryptKey) return { documents: [], configured: false };
      try {
        const res = await axios.get(`${D4SIGN_API}/documents/${input.safeUuid}/list`, { params: { tokenAPI, cryptKey } });
        return { documents: res.data, configured: true };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao listar documentos D4Sign: ${err.message}` });
      }
    }),

  getDocumentStatus: doctorProcedure
    .input(z.object({ documentUuid: z.string() }))
    .query(async ({ input }) => {
      const tokenAPI = process.env.D4SIGN_TOKEN_API;
      const cryptKey = process.env.D4SIGN_CRYPT_KEY;
      if (!tokenAPI || !cryptKey) return { status: "not_configured" };
      try {
        const res = await axios.get(`${D4SIGN_API}/documents/${input.documentUuid}`, { params: { tokenAPI, cryptKey } });
        return res.data;
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao consultar status D4Sign: ${err.message}` });
      }
    }),

  cancelDocument: doctorProcedure
    .input(z.object({ documentUuid: z.string(), comment: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const tokenAPI = process.env.D4SIGN_TOKEN_API;
      const cryptKey = process.env.D4SIGN_CRYPT_KEY;
      if (!tokenAPI || !cryptKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "D4Sign n\u00e3o configurado" });
      try {
        const res = await axios.post(
          `${D4SIGN_API}/documents/${input.documentUuid}/cancel`,
          { comment: input.comment || "Cancelado pelo sistema" },
          { params: { tokenAPI, cryptKey } }
        );
        await audit(ctx.user.id, "CANCEL_D4SIGN_DOCUMENT", "document_signature", undefined, undefined, { documentUuid: input.documentUuid }, ctx.req as any);
        return { success: true, data: res.data };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao cancelar documento D4Sign: ${err.message}` });
      }
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
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
