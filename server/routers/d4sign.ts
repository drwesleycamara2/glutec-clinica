/**
 * D4Sign Router
 * Handles digital document signing operations
 */

import { protectedProcedure, router } from "../_core/trpc";
import { getD4SignClient } from "../_core/d4sign";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import * as db from "../db";
import { nanoid } from "nanoid";

export const d4signRouter = router({
  /**
   * Upload a document for signing
   */
  uploadDocument: protectedProcedure
    .input(
      z.object({
        documentName: z.string().min(1, "Nome do documento é obrigatório"),
        documentType: z.enum(["prescription", "exam_request", "attestation", "other"]),
        fileBase64: z.string().min(1, "Arquivo é obrigatório"),
        signers: z.array(
          z.object({
            email: z.string().email("Email inválido"),
            name: z.string().min(1, "Nome do signatário é obrigatório"),
            cpf: z.string().optional(),
          })
        ),
        patientId: z.number().optional(),
        resourceId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        // Generate unique UUID for this document
        const documentUuid = nanoid();

        // Upload to D4Sign
        const uploadedUuid = await d4sign.uploadDocument({
          uuid: documentUuid,
          name: input.documentName,
          file: input.fileBase64,
          signers: input.signers,
        });

        // Store document signature record in database
        await db.createDocumentSignature({
          resourceType: input.documentType,
          resourceId: input.resourceId || 0,
          d4signUuid: uploadedUuid,
          signers: JSON.stringify(input.signers),
          status: "enviado",
          patientId: input.patientId,
          createdBy: ctx.user.id,
          createdAt: new Date(),
        });

        return {
          success: true,
          uuid: uploadedUuid,
          message: "Documento enviado para assinatura com sucesso",
        };
      } catch (error) {
        console.error("[D4Sign Upload Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao enviar documento: ${error}`,
        });
      }
    }),

  /**
   * Get document signing status
   */
  getDocumentStatus: protectedProcedure
    .input(z.object({ d4signUuid: z.string() }))
    .query(async ({ input }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        const status = await d4sign.getDocumentStatus(input.d4signUuid);
        return status;
      } catch (error) {
        console.error("[D4Sign Status Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao obter status: ${error}`,
        });
      }
    }),

  /**
   * Download signed document
   */
  downloadSignedDocument: protectedProcedure
    .input(z.object({ d4signUuid: z.string() }))
    .query(async ({ input }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        const buffer = await d4sign.downloadSignedDocument(input.d4signUuid);
        return {
          success: true,
          file: buffer.toString("base64"),
          message: "Documento assinado baixado com sucesso",
        };
      } catch (error) {
        console.error("[D4Sign Download Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao baixar documento: ${error}`,
        });
      }
    }),

  /**
   * Cancel document signing
   */
  cancelDocument: protectedProcedure
    .input(z.object({ d4signUuid: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        const cancelled = await d4sign.cancelDocument(input.d4signUuid);

        if (cancelled) {
          // Update database record
          const signature = await db.getDocumentSignatureByResource(
            "other",
            0
          );
          if (signature) {
            await db.updateDocumentSignature(signature.id, {
              status: "cancelado",
            });
          }
        }

        return {
          success: cancelled,
          message: cancelled
            ? "Documento cancelado com sucesso"
            : "Erro ao cancelar documento",
        };
      } catch (error) {
        console.error("[D4Sign Cancel Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao cancelar documento: ${error}`,
        });
      }
    }),

  /**
   * List all documents
   */
  listDocuments: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        const documents = await d4sign.listDocuments(input.limit, input.offset);
        return documents;
      } catch (error) {
        console.error("[D4Sign List Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao listar documentos: ${error}`,
        });
      }
    }),

  /**
   * Send document for signature
   */
  sendForSignature: protectedProcedure
    .input(
      z.object({
        d4signUuid: z.string(),
        signers: z.array(
          z.object({
            email: z.string().email(),
            name: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const d4sign = getD4SignClient();
        if (!d4sign) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "D4Sign não está configurado",
          });
        }

        const sent = await d4sign.sendForSignature(
          input.d4signUuid,
          input.signers
        );

        if (sent) {
          // Update database record
          const signature = await db.getDocumentSignatureByResource(
            "other",
            0
          );
          if (signature) {
            await db.updateDocumentSignature(signature.id, {
              status: "enviado_para_assinatura",
            });
          }
        }

        return {
          success: sent,
          message: sent
            ? "Documento enviado para assinatura"
            : "Erro ao enviar documento",
        };
      } catch (error) {
        console.error("[D4Sign Send Error]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao enviar documento: ${error}`,
        });
      }
    }),
});
