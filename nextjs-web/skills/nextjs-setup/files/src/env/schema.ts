import { z } from "zod";

// Shared by env/client.ts, env/server.ts, next.config.ts and scripts. It must not import "server-only".

export const appEnvSchema = z.enum(["development", "staging", "production"]);

const isLocalUrl = (value: string) => {
  const { hostname } = new URL(value);
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
};

const postgresUrl = z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), "Use a Postgres connection URL.");

// Treats an empty string as unset, so `KEY=` in an env file means "not configured".
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const clientEnvSchema = z
  .object({
    NEXT_PUBLIC_APP_ENV: appEnvSchema,
    NEXT_PUBLIC_APP_URL: z.url(),
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_APP_ENV !== "development" && (isLocalUrl(env.NEXT_PUBLIC_APP_URL) || !env.NEXT_PUBLIC_APP_URL.startsWith("https://")))
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_APP_URL"], message: "Staging and production need a public HTTPS URL." });
  });

// Scripts and drizzle.config.ts need only the database; they parse this rather than the full server env.
export const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DATABASE_URL_UNPOOLED: postgresUrl,
});

export const serverEnvSchema = z
  .object({
    ...databaseEnvSchema.shape,
    NEXT_PUBLIC_APP_ENV: appEnvSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CRON_SECRET: z.string().min(16),
    RESEND_API_KEY: optional(z.string().min(1)),
  })
  .superRefine((env, ctx) => {
    if (env.NEXT_PUBLIC_APP_ENV === "development") return;
    for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "BETTER_AUTH_URL"] as const)
      if (isLocalUrl(env[key])) ctx.addIssue({ code: "custom", path: [key], message: "Local values cannot be used in staging or production." });
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
