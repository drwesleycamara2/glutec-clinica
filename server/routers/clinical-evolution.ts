import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db_clinical_evolution";
import * as coreDb from "../db";

export const clinicalEvolutionRouter = router({
  // Create clinical evolution
  create: protectedProcedure
    .input(
      z.object({
        patientId: z.number(),
        icdCode: z.string().min(1),
        icdDescription: z.string().min(1),
        clinicalNotes: z.string(),
        assistantName: z.string().min(1),
        assistantUserId: z.number().optional().nullable(),
        audioTranscription: z.string().optional(),
        audioUrl: z.string().optional(),
        audioKey: z.string().optional(),
        appointmentId: z.number().optional(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
        finalizedAt: z.string().optional(),
        isRetroactive: z.boolean().optional(),
        retroactiveJustification: z.string().optional(),
        status: z.enum(["rascunho", "finalizado", "assinado", "cancelado"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const evolution = await db.createClinicalEvolution({
          patientId: input.patientId,
          doctorId: ctx.user.id,
          assistantName: input.assistantName.trim(),
          assistantUserId: input.assistantUserId ?? null,
          icdCode: input.icdCode,
          icdDescription: input.icdDescription,
          clinicalNotes: input.clinicalNotes,
          audioTranscription: input.audioTranscription,
          audioUrl: input.audioUrl,
          audioKey: input.audioKey,
          appointmentId: input.appointmentId,
          startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
          endedAt: input.endedAt ? new Date(input.endedAt) : null,
          finalizedAt: input.finalizedAt ? new Date(input.finalizedAt) : null,
          isRetroactive: input.isRetroactive ? 1 : 0,
          retroactiveJustification: input.retroactiveJustification,
          status: input.status ?? "rascunho",
          createdBy: ctx.user.id,
        });

        if (!evolution) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create clinical evolution",
          });
        }

        return evolution;
      } catch (error) {
        console.error("Error creating clinical evolution:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create clinical evolution",
        });
      }
    }),

  // Get clinical evolution by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getClinicalEvolutionById(input.id);
    }),

  // Get clinical evolutions by patient
  getByPatient: protectedProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ input }) => {
      return db.getClinicalEvolutionsByPatient(input.patientId);
    }),

  // Update clinical evolution
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        icdCode: z.string().optional(),
        icdDescription: z.string().optional(),
        clinicalNotes: z.string().optional(),
        assistantName: z.string().min(1).optional(),
        assistantUserId: z.number().optional().nullable(),
        audioTranscription: z.string().optional(),
        status: z.enum(["rascunho", "finalizado", "assinado", "cancelado"]).optional(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
        finalizedAt: z.string().optional(),
        isRetroactive: z.boolean().optional(),
        retroactiveJustification: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const evolution = await db.getClinicalEvolutionById(input.id);

        if (!evolution) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Clinical evolution not found",
          });
        }

        // Check if user is the doctor who created this evolution
        if (evolution.doctorId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to update this evolution",
          });
        }

        // Cannot update if already signed
        if (evolution.status === "assinado") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot update a signed clinical evolution",
          });
        }

        await db.updateClinicalEvolution(input.id, {
          doctorId: ctx.user.id,
          icdCode: input.icdCode,
          icdDescription: input.icdDescription,
          clinicalNotes: input.clinicalNotes,
          assistantName: input.assistantName?.trim(),
          assistantUserId: input.assistantUserId === undefined ? undefined : (input.assistantUserId ?? null),
          audioTranscription: input.audioTranscription,
          status: input.status,
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          endedAt: input.endedAt ? new Date(input.endedAt) : undefined,
          finalizedAt: input.finalizedAt ? new Date(input.finalizedAt) : undefined,
          isRetroactive: input.isRetroactive === undefined ? undefined : (input.isRetroactive ? 1 : 0),
          retroactiveJustification: input.retroactiveJustification,
          updatedBy: ctx.user.id,
        });

        return { success: true };
      } catch (error) {
        console.error("Error updating clinical evolution:", error);
        throw error;
      }
    }),

  listAssistants: protectedProcedure.query(async () => {
    const users = await coreDb.getAllUsers();
    return users
      .filter((user: any) => user?.status !== "inactive")
      .map((user: any) => ({
        id: user.id,
        name: user.name || user.email || `Usuário ${user.id}`,
        role: user.role,
        email: user.email,
      }))
      .sort((left: any, right: any) => String(left.name).localeCompare(String(right.name), "pt-BR"));
  }),

  // Delete clinical evolution
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const evolution = await db.getClinicalEvolutionById(input.id);

        if (!evolution) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Clinical evolution not found",
          });
        }

        const isSuperAdmin = ctx.user.role === "admin" && String(ctx.user.email || "").toLowerCase() === "contato@drwesleycamara.com.br";
        if (!isSuperAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A exclusão de prontuários só pode ser feita pelo administrador principal.",
          });
        }

        // Cannot delete if already signed
        if (evolution.status === "assinado") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete a signed clinical evolution",
          });
        }

        await db.deleteClinicalEvolution(input.id);

        return { success: true };
      } catch (error) {
        console.error("Error deleting clinical evolution:", error);
        throw error;
      }
    }),

  // Sign clinical evolution
  sign: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        d4signDocumentKey: z.string().optional(),
        signatureMethod: z
          .enum(["eletronica", "icp_brasil_a1", "icp_brasil_a3"])
          .default("eletronica"),
        signatureProvider: z.string().optional(),
        signatureCertificateLabel: z.string().optional(),
        signatureValidationCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const evolution = await db.getClinicalEvolutionById(input.id);

        if (!evolution) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Clinical evolution not found",
          });
        }

        // Check if user is the doctor who created this evolution
        if (evolution.doctorId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to sign this evolution",
          });
        }

        // Cannot sign if already signed
        if (evolution.status === "assinado") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This clinical evolution is already signed",
          });
        }

        const auditLog = await db.signClinicalEvolution(
          input.id,
          ctx.user.id,
          ctx.user.name || "Unknown",
          ctx.user.specialty,
          input.d4signDocumentKey || `local-${input.signatureMethod}-${Date.now()}`,
          input.signatureMethod,
          input.signatureProvider,
          input.signatureCertificateLabel,
          input.signatureValidationCode,
          ctx.req.ip,
          ctx.req.headers["user-agent"]
        );

        if (!auditLog) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to sign clinical evolution",
          });
        }

        return { success: true, auditLog };
      } catch (error) {
        console.error("Error signing clinical evolution:", error);
        throw error;
      }
    }),

  // Get signature audit log
  getSignatureAuditLog: protectedProcedure
    .input(z.object({ evolutionId: z.number() }))
    .query(async ({ input }) => {
      return db.getSignatureAuditLog(input.evolutionId);
    }),

  // Get pending signatures for doctor
  getPendingSignatures: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return db.getPendingSignatures(ctx.user.id);
  }),

  // Verify signature
  verifySignature: protectedProcedure
    .input(
      z.object({
        evolutionId: z.number(),
        doctorId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const isValid = await db.verifySignature(input.evolutionId, input.doctorId);
      return { isValid };
    }),
});
