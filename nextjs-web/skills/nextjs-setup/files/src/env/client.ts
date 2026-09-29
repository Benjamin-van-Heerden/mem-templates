import { clientEnvSchema } from "./schema";

// Next inlines NEXT_PUBLIC_* only where they are written out literally, so list each one; never pass process.env whole.
export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
