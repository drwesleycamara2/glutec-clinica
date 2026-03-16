import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { clinicalEvolutionRouter } from "./routers/clinical-evolution";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

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

  clinicalEvolution: clinicalEvolutionRouter,

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
