import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ─── Helper: gating por módulo (alias-aware) ─────────────────────────────────
// Backend espelhando a checagem do client (canAccessModule). O servidor NÃO
// pode confiar somente na UI para impedir leitura/escrita por usuário sem
// permissão — chamadas tRPC podem ser disparadas direto via DevTools.

const LEGACY_MODULE_ALIASES: Record<string, string[]> = {
  prontuarios: ["prontuarios"],
  prontuarios_anotacoes: ["prontuarios_anotacoes", "prontuarios"],
  documentos_identificacao: ["documentos_identificacao", "documentos"],
  contratos_termos: ["contratos_termos", "documentos"],
};

function parsePermissionList(raw: unknown): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function userHasAnyModule(
  user: { role?: string | null; permissions?: unknown } | null | undefined,
  ...modules: string[]
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const granted = parsePermissionList(user.permissions);
  return modules.some((m) => {
    const aliases = LEGACY_MODULE_ALIASES[m] ?? [m];
    return aliases.some((id) => granted.includes(id));
  });
}

/**
 * Cria um procedimento que exige autenticação E que o usuário tenha pelo menos
 * uma das permissões de módulo informadas (ou seja admin).
 */
export function requireModule(...modules: string[]) {
  return protectedProcedure.use(
    t.middleware(async (opts) => {
      const { ctx, next } = opts;
      if (!userHasAnyModule(ctx.user as any, ...modules)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem permissão de acesso a este módulo.",
        });
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    }),
  );
}
