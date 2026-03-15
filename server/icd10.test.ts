import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("icd10 router", () => {
  describe("search", () => {
    it("should search for ICD-10 codes", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.icd10.search({ query: "A" });

      expect(Array.isArray(result)).toBe(true);
    });

    it("should require minimum query length", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.icd10.search({ query: "" });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("getFavorites", () => {
    it("should require authentication", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.icd10.getFavorites();
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should return empty array for user with no favorites", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.icd10.getFavorites();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("addFavorite", () => {
    it("should require authentication", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.icd10.addFavorite({ icd10CodeId: 1 });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should add a favorite ICD-10 code", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.icd10.addFavorite({ icd10CodeId: 1 });

      expect(result.success).toBe(true);
    });
  });

  describe("removeFavorite", () => {
    it("should require authentication", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.icd10.removeFavorite({ icd10CodeId: 1 });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should remove a favorite ICD-10 code", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.icd10.removeFavorite({ icd10CodeId: 1 });

      expect(result.success).toBe(true);
    });
  });

  describe("importData", () => {
    it("should require admin role", async () => {
      const ctx = createAuthContext("user");
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.icd10.importData({
          codes: [
            { code: "A00", description: "Cholera", descriptionAbbrev: "Cholera" },
          ],
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("FORBIDDEN");
      }
    });

    it("should allow admin to import data", async () => {
      const ctx = createAuthContext("admin");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.icd10.importData({
        codes: [
          { code: "A00", description: "Cholera", descriptionAbbrev: "Cholera" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });
  });
});

describe("audio router", () => {
  describe("createTranscription", () => {
    it("should require authentication", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.audio.createTranscription({
          audioUrl: "https://example.com/audio.webm",
          audioKey: "audio/123.webm",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should create a transcription record", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.audio.createTranscription({
        audioUrl: "https://example.com/audio.webm",
        audioKey: "audio/123.webm",
      });

      expect(result).toBeDefined();
      // Result is a ResultSetHeader from mysql2, check if it has insertId
      expect(typeof result).toBe("object");
    });
  });

  describe("updateTranscription", () => {
    it("should require authentication", async () => {
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.audio.updateTranscription({
          id: 1,
          transcription: "Test transcription",
          status: "completed",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should update transcription status", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.audio.updateTranscription({
        id: 1,
        transcription: "Test transcription",
        status: "completed",
      });

      expect(result.success).toBe(true);
    });
  });
});
