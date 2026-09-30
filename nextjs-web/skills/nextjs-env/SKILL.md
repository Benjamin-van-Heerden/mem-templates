---
name: nextjs-env
description: The typed environment convention (src/env/schema.ts, client.ts, server.ts) that makes the app fail fast on missing or invalid configuration. Use when adding, renaming or reading an environment variable.
---

# Typed Environment

Code never reads `process.env` directly. It imports `clientEnv` or `serverEnv`, which are validated with zod, so a missing or malformed variable fails the build instead of a request in production.

```text
src/env/schema.ts   zod schemas only; imported by everything below, so it must not import "server-only"
src/env/client.ts   clientEnv: NEXT_PUBLIC_* values, safe in the browser
src/env/server.ts   serverEnv: secrets and server config; imports "server-only"
```

`nextjs-setup` has the full files. The shape:

```ts
// schema.ts
export const databaseEnvSchema = z.object({ DATABASE_URL: postgresUrl, DATABASE_URL_UNPOOLED: postgresUrl })
export const clientEnvSchema = z.object({ NEXT_PUBLIC_APP_ENV: appEnvSchema, NEXT_PUBLIC_APP_URL: z.url() }).superRefine(...)
export const serverEnvSchema = z.object({ ...databaseEnvSchema.shape, NEXT_PUBLIC_APP_ENV: appEnvSchema, BETTER_AUTH_SECRET: z.string().min(32), ... }).superRefine(...)

// client.ts: list each variable literally
export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
})

// server.ts
import 'server-only'
export const serverEnv = serverEnvSchema.parse(process.env)
```

## Rules

- **Client variables are listed one by one.** Next inlines `process.env.NEXT_PUBLIC_X` into the browser bundle only where it is written out literally, so passing `process.env` whole to the client schema yields `undefined` in the browser. The server schema can take `process.env` whole; zod drops unknown keys.
- **Secrets never get the `NEXT_PUBLIC_` prefix**, and only `server.ts` exposes them.
- **The build validates.** `next.config.ts` parses both schemas, so `bun run build` locally and on Vercel fails with a zod error naming the variable.
- **Scripts and tools parse the narrowest schema they need.** `scripts/migrate.ts` and `drizzle.config.ts` parse `databaseEnvSchema`. Zod 4 refuses `.pick()` on a refined schema, so shared subsets are separate plain objects spread into the full schema.
- **Optional integrations treat an empty string as unset**, so `KEY=` in an env file means "not configured":

  ```ts
  const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional())
  RESEND_API_KEY: optional(z.string().min(1)),
  ```

- **Required groups**: the database URLs (`databaseEnvSchema`), the auth secret and URL, `CRON_SECRET`, and the super admin (`superAdminEnvSchema`: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PASSWORD`, read by `scripts/seed.ts` through `seedEnvSchema`).
- **Environment names follow mem's branches**: `NEXT_PUBLIC_APP_ENV` is `development`, `staging` or `production`. Staging and production refuse local URLs and require HTTPS (`superRefine`). Put cross-variable checks there or at the bottom of `server.ts`, for example that `BETTER_AUTH_URL` matches `NEXT_PUBLIC_APP_URL`.

## Adding a variable

1. Add it to the right schema in `schema.ts` with the strictest type that fits (`z.url()`, `z.email()`, `z.enum`, `.min(32)` for secrets).
2. For a client variable, also add the literal line to `client.ts`.
3. Add it to `.env.example` with a comment, and to your `.env.local`.
4. Add it in Vercel's Production environment: `printf '%s' "<value>" | vercel env add NAME production --yes`. Keep `.env.local` pointing at development values; do not `vercel env pull` over it.
5. Read it as `serverEnv.NAME` or `clientEnv.NAME`.

## Loading `.env` files

- `next dev` and `next build` load `.env*` files themselves.
- `bun <script>` loads `.env`, `.env.local` and `.env.$NODE_ENV` itself.
- Tools that run under node, such as `drizzle-kit`, do not: `drizzle.config.ts` calls `loadEnvConfig(process.cwd())` from `@next/env` so it sees the same values Next does.
- On Vercel, variables come from the project settings; `.env.local` is never deployed.
