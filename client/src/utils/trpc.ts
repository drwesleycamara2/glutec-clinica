import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/_core";

export const trpc = createTRPCReact<AppRouter>();
