---
name: nextjs-setup
description: Set up a new Next.js project on this template's stack (bun, Next 16 with Cache Components, Drizzle, Postgres/Neon, better-auth, shadcn, Workflow, Vercel), or add a missing piece of it to an existing one. Contains verified starter files. Use when creating the project, or when env, db, auth, proxy, cron or workflow wiring is missing.
---

# Project Setup

`files/` holds a small working app on this stack: typed env, db client and migrations, better-auth with a protected dashboard, a cached feature with a Server Action and form, a workflow started by cron, and the public/app route groups. It was built and exercised end to end (`bun run build`, sign-in, cached reads with `updateTag`, cron starting a workflow) with next 16.3.7, better-auth 1.7.6, drizzle-orm 0.45, workflow 4.8 and shadcn 4.21 (`radix-nova`).

Copy files rather than retyping them, then adapt the names. The `notes` feature is an example of a feature's shape; replace it with the project's first real feature.

## New project

Run from the repository root, after `mem init`:

1. Scaffold. create-next-app refuses a directory that already holds `.mem/`, `.agents/` or `AGENTS.md`, so scaffold into a temporary directory and move the result in:

   ```sh
   bunx create-next-app@latest scaffold-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-bun --yes --skip-install --disable-git
   cat scaffold-tmp/.gitignore >> .gitignore
   rm scaffold-tmp/.gitignore scaffold-tmp/AGENTS.md scaffold-tmp/CLAUDE.md
   mv scaffold-tmp/* . && rmdir scaffold-tmp
   sed -i '' "s/\"name\": \"scaffold-tmp\"/\"name\": \"$(basename "$PWD")\"/" package.json
   bun install
   ```

   Leave `AGENTS.md` to mem, and do not add a `CLAUDE.md`: Claude Code reads `AGENTS.md`. `next dev` inserts its own Next.js block into `AGENTS.md`; commit it when it appears. On Linux, drop the `''` after `sed -i`.

2. Dependencies:

   ```sh
   bun add drizzle-orm pg better-auth zod server-only workflow @vercel/functions react-hook-form @hookform/resolvers
   bun add -d drizzle-kit @types/pg @types/bun auth @next/env@<same version as next>
   ```

   `auth` is better-auth's CLI package; keep it on the same version as `better-auth`.

3. shadcn:

   ```sh
   bunx shadcn@latest init -d --base radix
   bunx shadcn@latest add button input label field card
   ```

4. Copy the files into the project, keeping their paths, and remove the generated home page (the public home is `src/app/(site)/page.tsx`):

   ```sh
   cp -R .agents/skills/nextjs-setup/files/. .
   rm src/app/page.tsx
   ```

   `files/src/app/layout.tsx` replaces the generated root layout, whose `--font-geist-*` variable names break the shadcn tokens. In `src/app/globals.css`, change `--font-mono: var(--font-geist-mono);` to `--font-mono: var(--font-mono);`.

5. `package.json` scripts:

   ```json
   {
     "dev": "next dev",
     "build": "bun scripts/migrate.ts && next build",
     "start": "next start",
     "lint": "eslint",
     "typecheck": "next typegen && tsc --noEmit",
     "db:generate": "drizzle-kit generate",
     "db:migrate": "bun scripts/migrate.ts",
     "db:studio": "drizzle-kit studio",
     "auth:schema": "bun --conditions=react-server scripts/auth-schema.ts"
   }
   ```

6. `.gitignore`: add `!.env.example` below the generated `.env*` line, and add `/.workflow-data/`.

7. Local environment: `createdb <name>`, `cp .env.example .env.local`, then fill in both database URLs, `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) and `CRON_SECRET` (`openssl rand -hex 16`).

8. Generate the auth tables and the first migration. `src/db/schema/index.ts` re-exports `notes.ts`, which references the generated `user` table, so bootstrap with auth alone:

   ```sh
   echo 'export {};' > src/db/schema/auth.ts
   echo 'export * from "./auth";' > src/db/schema/index.ts
   bun run auth:schema
   printf 'export * from "./auth";\nexport * from "./notes";\n' > src/db/schema/index.ts
   bun run db:generate && bun run db:migrate
   ```

9. Verify: `bun run typecheck && bun run build`, then `bun run start`. Check that `/dashboard` redirects to `/login`, sign-up works (`POST /api/auth/sign-up/email`, or a sign-up form), and the dashboard renders the user.

10. Replace the example: rename `notes` to the first real feature, set the title and description in the root layout, and set the brand tokens in `globals.css` (see `design-system`).

## Deploying on Vercel

1. `vercel link`, then set the project to install with bun. The committed `vercel.json` sets `installCommand` and `buildCommand`; also set a `regions` entry near the database.
2. Install Neon from the Vercel Marketplace and connect it to the project. It provides `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Create a `staging` branch in Neon. In Vercel's Preview environment, scoped to mem's staging git branch (`test` unless the project configured another), set that Neon branch's two URLs.
4. For each environment, set `NEXT_PUBLIC_APP_ENV` (`staging` / `production`), `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` (the same HTTPS URL), `BETTER_AUTH_SECRET` (a different one per environment) and `CRON_SECRET`.
5. In Vercel, set the production branch to mem's production branch (`main` by default). Releases then deploy through `mem promote staging` and `mem promote production`. Every build migrates its own database before `next build` runs.
6. Create the first user with a hand-run script against the environment (see `better-auth`).

## Adding a piece to an existing project

Each piece is independent. Copy its files, add its dependencies, and read its skill:

| Piece | Files | Skill |
| --- | --- | --- |
| Typed env | `src/env/*`, the parse lines in `next.config.ts`, `.env.example` | `nextjs-env` |
| Database | `src/db/*`, `drizzle.config.ts`, `scripts/migrate.ts`, build and db scripts | `drizzle-neon` |
| Auth | `src/features/auth/*`, `src/app/api/auth/[...all]/route.ts`, `src/proxy.ts`, `scripts/auth-schema.ts` | `better-auth` |
| Caching | `cacheComponents: true` in `next.config.ts`, then fix blocking-route errors | `nextjs-caching` |
| Jobs and cron | `withWorkflow` in `next.config.ts`, a workflow and steps, `src/app/api/cron/*`, `crons` in `vercel.json` | `background-jobs` |
| UI | `bunx shadcn@latest init`, the `(app)` and `(site)` route groups | `design-system` |

Enabling Cache Components in an existing app is a migration, not a copy: read `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` first.

## Known sharp edges

- `drizzle-kit` runs under node and does not read `.env*`; `drizzle.config.ts` loads them through `@next/env`. `bun` scripts load them without help.
- Zod 4 refuses `.pick()` on a refined schema; shared subsets such as `databaseEnvSchema` are separate objects.
- The better-auth CLI cannot load configs that import `server-only`; `auth:schema` works around it.
- `shadcn init -d` alone picks Base UI (`base-nova`); this template uses Radix, so always pass `--base radix` (style `radix-nova`).
- `bun install` blocks some packages' postinstall scripts (esbuild inside workflow's tooling). Builds work without them; do not add `trustedDependencies` unless something fails.
