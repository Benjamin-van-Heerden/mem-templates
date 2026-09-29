import "server-only";
import { clientEnv } from "./client";
import { serverEnvSchema } from "./schema";

export const serverEnv = serverEnvSchema.parse(process.env);

if (serverEnv.BETTER_AUTH_URL !== clientEnv.NEXT_PUBLIC_APP_URL) throw new Error("BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must match.");
