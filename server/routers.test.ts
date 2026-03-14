import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-id",
    email: "wesley@clinicaglutee.com",
    name: "Dr. Wésley Câmara",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createAuthContext(userOverrides?: Partial<AuthenticatedUser>): {
  ctx: TrpcContext;
  clearedCookies: Array<{ name: string; options: Record<string, unknown> }>;
} {
  const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
  const user = createMockUser(userOverrides);

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

// ─── Testes de Autenticação ──────────────────────────────────────────────────

describe("auth.logout", () => {
  it("deve limpar cookie de sessão e retornar sucesso", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("auth.me", () => {
  it("deve retornar dados do usuário autenticado", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.email).toBe("wesley@clinicaglutee.com");
    expect(result?.name).toBe("Dr. Wésley Câmara");
    expect(result?.role).toBe("admin");
  });

  it("deve retornar null para usuário não autenticado", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });
});

// ─── Testes de Estrutura do Router ───────────────────────────────────────────

describe("appRouter structure", () => {
  it("deve ter router de auth", () => {
    expect(appRouter._def.procedures).toBeDefined();
  });

  it("deve ter routers principais definidos", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    
    // Verificar que os routers principais existem
    const expectedPrefixes = ["auth", "patients"];
    for (const prefix of expectedPrefixes) {
      const hasRouter = routerKeys.some((k) => k.startsWith(prefix + "."));
      expect(hasRouter, `Router ${prefix} deve existir`).toBe(true);
    }
  });

  it("deve ter procedures de auth.me e auth.logout", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    expect(routerKeys).toContain("auth.me");
    expect(routerKeys).toContain("auth.logout");
  });
});

// ─── Testes de Roles e Permissões ────────────────────────────────────────────

describe("Roles e Permissões", () => {
  const validRoles = ["admin", "medico", "recepcionista", "enfermeiro", "user"];

  it("deve aceitar todos os roles válidos", () => {
    for (const role of validRoles) {
      const user = createMockUser({ role });
      expect(user.role).toBe(role);
    }
  });

  it("deve criar contexto autenticado com role admin", () => {
    const { ctx } = createAuthContext({ role: "admin" });
    expect(ctx.user?.role).toBe("admin");
  });

  it("deve criar contexto autenticado com role medico", () => {
    const { ctx } = createAuthContext({ role: "medico" });
    expect(ctx.user?.role).toBe("medico");
  });

  it("deve criar contexto autenticado com role recepcionista", () => {
    const { ctx } = createAuthContext({ role: "recepcionista" });
    expect(ctx.user?.role).toBe("recepcionista");
  });
});

// ─── Testes de Segurança ─────────────────────────────────────────────────────

describe("Segurança", () => {
  it("cookie de logout deve ter flags de segurança corretas", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.auth.logout();

    const cookieOptions = clearedCookies[0]?.options;
    expect(cookieOptions?.secure).toBe(true);
    expect(cookieOptions?.httpOnly).toBe(true);
    expect(cookieOptions?.sameSite).toBe("none");
    expect(cookieOptions?.path).toBe("/");
  });

  it("cookie de logout deve ter maxAge negativo para expirar imediatamente", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.auth.logout();

    expect(clearedCookies[0]?.options?.maxAge).toBe(-1);
  });
});
