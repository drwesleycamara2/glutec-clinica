import { z } from "zod";
import { protectedProcedure, router, requireModule } from "../_core/trpc";
import { auditPatientRead } from "../_core/auditLog";

// Aliases locais para gating por módulo
const prontuariosProcedure = requireModule("prontuarios");
const anotacoesProcedure = requireModule("prontuarios", "prontuarios_anotacoes");
import { TRPCError } from "@trpc/server";
import * as db from "../db_clinical_evolution";
import * as coreDb from "../db";
import { structureTranscriptForClinicalEvolution } from "../lib/clinical-transcription";

function escapeHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildClinicalEvolutionHtmlFromSections(sections: {
  queixaPrincipal: string;
  historiaAtualPregressa: string;
  exameFisico: string;
  hipoteseDiagnostica: string;
  conduta: string;
  observacoes: string;
}) {
  const renderParagraphs = (text: string) =>
    escapeHtml(text || "")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
      .join("") || "<p></p>";

  return [
    ["Queixa principal", sections.queixaPrincipal],
    ["História Atual e Pregressa", sections.historiaAtualPregressa],
    ["Exame físico", sections.exameFisico],
    ["Hipótese diagnóstica", sections.hipoteseDiagnostica],
    ["Conduta", sections.conduta],
    ["Observações", sections.observacoes],
  ]
    .map(([title, content]) => `<p><strong>${title}:</strong></p>${renderParagraphs(content as string)}`)
    .join("");
}

export const clinicalEvolutionRouter = router({
  // Create clinical evolution
  create: prontuariosProcedure
    .input(
      z.object({
        patientId: z.number(),
        attendanceType: z.enum(["presencial", "online"]),
        icdCode: z.string().optional().default(""),
        icdDescription: z.string().optional().default(""),
        clinicalNotes: z.string(),
        secretaryNotes: z.string().optional(),
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
      if (ctx.user.role === "recepcionista" || ctx.user.role === "secretaria") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A secretaria deve usar o registro administrativo próprio do prontuário.",
        });
      }
      if ((input.status === "finalizado" || input.status === "assinado") && (!input.icdCode?.trim() || !input.icdDescription?.trim())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione um CID-10 para finalizar a consulta.",
        });
      }

      try {
        const evolution = await db.createClinicalEvolution({
          patientId: input.patientId,
          attendanceType: input.attendanceType,
          doctorId: ctx.user.id,
          assistantName: input.assistantName.trim(),
          assistantUserId: input.assistantUserId ?? null,
          icdCode: input.icdCode,
          icdDescription: input.icdDescription,
          clinicalNotes: input.clinicalNotes,
          secretaryNotes: input.secretaryNotes,
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

  // Get clinical evolution by ID — handler já filtra por role; mantemos aberto
  // para quem tem prontuarios OU prontuarios_anotacoes (handler retorna apenas
  // o que cada role pode ver).
  getById: anotacoesProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.getClinicalEvolutionById(input.id, ctx.user?.role, ctx.user?.id);
    }),

  // Get clinical evolutions by patient — idem: handler filtra registros
  // clínicos vs administrativos a partir do role do usuário.
  getByPatient: anotacoesProcedure
    .input(z.object({ patientId: z.number() }))
    .query(async ({ ctx, input }) => {
      void auditPatientRead(ctx, input.patientId, "clinical_evolution_list_read");
      return db.getClinicalEvolutionsByPatient(input.patientId, ctx.user?.role, ctx.user?.id);
    }),

  // Update clinical evolution
  update: prontuariosProcedure
    .input(
      z.object({
        id: z.number(),
        attendanceType: z.enum(["presencial", "online"]).optional(),
        icdCode: z.string().optional(),
        icdDescription: z.string().optional(),
        clinicalNotes: z.string().optional(),
        secretaryNotes: z.string().optional(),
        assistantName: z.string().min(1).optional(),
        assistantUserId: z.number().optional().nullable(),
        audioTranscription: z.string().optional(),
        status: z.enum(["rascunho", "finalizado", "assinado", "cancelado"]).optional(),
        startedAt: z.string().optional(),
        endedAt: z.string().optional(),
        finalizedAt: z.string().optional(),
        isRetroactive: z.boolean().optional(),
        retroactiveJustification: z.string().optional(),
        // Justificativa obrigatória quando a evolução já está finalizada/assinada.
        // Registrada no clinical_evolution_edit_log junto com snapshot antes/depois.
        editJustification: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role === "recepcionista" || ctx.user.role === "secretaria") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A secretaria deve usar o registro administrativo próprio do prontuário.",
        });
      }
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

        const previousStatus = String(evolution.status || "rascunho");
        const nextStatus = String(input.status || previousStatus);
        const nextIcdCode = String(input.icdCode ?? evolution.icdCode ?? "").trim();
        const nextIcdDescription = String(input.icdDescription ?? evolution.icdDescription ?? "").trim();
        if ((nextStatus === "finalizado" || nextStatus === "assinado") && (!nextIcdCode || !nextIcdDescription)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selecione um CID-10 para finalizar a consulta.",
          });
        }
        const isFinalizedOrSigned = previousStatus === "finalizado" || previousStatus === "assinado";
        const justification = (input.editJustification || "").trim();

        // Regra de auditoria: ao editar uma evolução finalizada ou assinada,
        // a justificativa é obrigatória (mín. 10 caracteres).
        if (isFinalizedOrSigned) {
          if (!justification || justification.length < 10) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Esta consulta já foi finalizada. Informe uma justificativa (mín. 10 caracteres) para registrar a edição no log de auditoria.",
            });
          }
        }

        const previousSnapshot = db.buildEvolutionSnapshot(evolution as any);

        await db.updateClinicalEvolution(input.id, {
          doctorId: ctx.user.id,
          attendanceType: input.attendanceType,
          icdCode: input.icdCode,
          icdDescription: input.icdDescription,
          clinicalNotes: input.clinicalNotes,
          secretaryNotes: input.secretaryNotes,
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

        // Registra no log de auditoria toda edição que trouxer justificativa
        // (obrigatória em finalizado/assinado; opcional mas aceita em rascunho).
        if (justification) {
          const updated = await db.getClinicalEvolutionById(input.id);
          const newSnapshot = db.buildEvolutionSnapshot(updated as any);
          const changedFields = db.diffSnapshots(previousSnapshot, newSnapshot);

          await db.createClinicalEvolutionEditLog({
            clinicalEvolutionId: input.id,
            editedByUserId: ctx.user.id,
            editedByUserName: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
            editedByUserRole: ctx.user.role ?? null,
            previousStatus,
            newStatus: String((updated as any)?.status ?? input.status ?? previousStatus),
            justification,
            changedFields: changedFields.length ? changedFields : null,
            previousSnapshot,
            newSnapshot,
            ipAddress: ctx.req?.ip ?? null,
            userAgent: (ctx.req?.headers?.["user-agent"] as string) ?? null,
          });
        }

        return { success: true, requiredJustification: isFinalizedOrSigned };
      } catch (error) {
        console.error("Error updating clinical evolution:", error);
        throw error;
      }
    }),

  updateSecretaryNotes: anotacoesProcedure
    .input(
      z.object({
        id: z.number().optional(),
        patientId: z.number(),
        secretaryNotes: z.string(),
        editJustification: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

      const allowedRoles = new Set(["admin", "medico", "enfermeiro", "recepcionista", "secretaria"]);
      if (!allowedRoles.has(String(ctx.user.role || ""))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você não tem permissão para alterar observações da secretaria.",
        });
      }

      const previous = input.id ? await db.getClinicalEvolutionById(input.id) : null;
      if (input.id && !previous) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro clínico não encontrado.",
        });
      }

      const previousStatus = String((previous as any)?.status || "rascunho");
      const isFinalizedOrSigned = previousStatus === "finalizado" || previousStatus === "assinado";
      const justification = (input.editJustification || "").trim();

      if (isFinalizedOrSigned && justification.length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta consulta já foi finalizada. Informe uma justificativa (mín. 10 caracteres) para editar a observação da secretaria.",
        });
      }

      const previousSnapshot = previous ? db.buildEvolutionSnapshot(previous as any) : null;
      const updated = await db.updateSecretaryNotes({
        id: input.id,
        patientId: input.patientId,
        secretaryNotes: input.secretaryNotes,
        userId: ctx.user.id,
      });

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível salvar as observações da secretaria.",
        });
      }

      const hasChanged = !previous || String((previous as any)?.secretaryNotes || "") !== String((updated as any)?.secretaryNotes || "");
      if (hasChanged) {
        const newSnapshot = db.buildEvolutionSnapshot(updated as any);
        const changedFields = db.diffSnapshots(previousSnapshot || {}, newSnapshot);
        await db.createClinicalEvolutionEditLog({
          clinicalEvolutionId: updated.id,
          editedByUserId: ctx.user.id,
          editedByUserName: ctx.user.name || ctx.user.email || `Usuário ${ctx.user.id}`,
          editedByUserRole: ctx.user.role ?? null,
          previousStatus,
          newStatus: String((updated as any)?.status ?? previousStatus),
          justification: justification || "Atualização das observações da secretaria.",
          changedFields: changedFields.length ? changedFields : ["secretaryNotes"],
          previousSnapshot,
          newSnapshot,
          ipAddress: ctx.req?.ip ?? null,
          userAgent: (ctx.req?.headers?.["user-agent"] as string) ?? null,
        });
      }

      return {
        success: true,
        id: updated.id,
        requiredJustification: isFinalizedOrSigned,
      };
    }),

  // Lista histórico de edições auditáveis de uma evolução
  incorporateTranscription: prontuariosProcedure
    .input(
      z.object({
        transcription: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role === "recepcionista" || ctx.user.role === "secretaria") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A incorporação inteligente da transcrição é restrita aos profissionais de saúde.",
        });
      }

      const structured = await structureTranscriptForClinicalEvolution(input.transcription);
      return {
        ...structured,
        clinicalNotesHtml: buildClinicalEvolutionHtmlFromSections(structured),
      };
    }),

  getEditHistory: prontuariosProcedure
    .input(z.object({ evolutionId: z.number() }))
    .query(async ({ input }) => {
      return db.getClinicalEvolutionEditLogs(input.evolutionId);
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
        profession: user.profession,
        specialty: user.specialty,
        professionalLicenseType: user.professionalLicenseType,
        professionalLicenseState: user.professionalLicenseState,
      }))
      .sort((left: any, right: any) => String(left.name).localeCompare(String(right.name), "pt-BR"));
  }),

  // Delete clinical evolution
  delete: prontuariosProcedure
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
  sign: prontuariosProcedure
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

        if (input.signatureMethod === "eletronica") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Atendimentos clínicos exigem certificado digital pessoa física ICP-Brasil.",
          });
        }

        const externalDocumentKey = String(input.d4signDocumentKey ?? "").trim();
        const provider = String(input.signatureProvider ?? "").trim();
        const providerKey = provider.toLowerCase();
        const certificateLabel = String(input.signatureCertificateLabel ?? "").trim();
        const validationCode = String(input.signatureValidationCode ?? "").trim();

        if (!externalDocumentKey || externalDocumentKey.toLowerCase().startsWith("local-")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A assinatura clínica precisa de sessão/documento validado por provedor ICP-Brasil.",
          });
        }

        if (!provider || providerKey.includes("local") || providerKey === "certificado_local_a1") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Assinatura local ou simulada não é aceita para documentos clínicos.",
          });
        }

        if (!certificateLabel || !validationCode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe certificado pessoa física e código de validação retornados pelo provedor.",
          });
        }

        const auditLog = await db.signClinicalEvolution(
          input.id,
          ctx.user.id,
          ctx.user.name || "Unknown",
          ctx.user.specialty,
          externalDocumentKey,
          input.signatureMethod,
          provider,
          certificateLabel,
          validationCode,
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
  getSignatureAuditLog: prontuariosProcedure
    .input(z.object({ evolutionId: z.number() }))
    .query(async ({ input }) => {
      return db.getSignatureAuditLog(input.evolutionId);
    }),

  // Get pending signatures for doctor
  getPendingSignatures: prontuariosProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return db.getPendingSignatures(ctx.user.id);
  }),

  // Verify signature
  verifySignature: prontuariosProcedure
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
