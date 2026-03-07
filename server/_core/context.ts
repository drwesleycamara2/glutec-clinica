import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Demo user for development without OAuth
const DEMO_USER: User = {
  id: 1,
  openId: "demo-admin-001",
  name: "Dr. Wésley Câmara",
  email: "contato@drwesleycamara.com.br",
  role: "admin",
  loginMethod: "demo",
  lastSignedIn: new Date(),
  createdAt: new Date(),
  failedLoginAttempts: 0,
  lockedUntil: null,
};

const isDemoMode = !ENV.oAuthServerUrl;

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Demo mode: inject mock admin user when OAuth is not configured
  if (isDemoMode) {
    user = DEMO_USER;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
