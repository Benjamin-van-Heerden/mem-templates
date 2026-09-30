---
name: nextjs-setup
description: The verified starter files for this template's stack (bun, Next 16 with Cache Components, Drizzle, Postgres/Neon, better-auth, shadcn, Workflow, Vercel), how to add a missing piece to an existing project, and how to deploy on Vercel. Use when env, db, auth, proxy, cron or workflow wiring is missing, when deploying, or when following the template's setup.
---

# Project Setup

`files/` holds a small working app on this stack: typed env, db client and migrations, better-auth with a protected dashboard, a cached feature with a Server Action and form, a workflow started by cron, and the public/app route groups. It was built and exercised end to end (`bun run build`, sign-in, cached reads with `updateTag`, cron starting a workflow) with next 16.3.7, better-auth 1.7.6, drizzle-orm 0.45, workflow 4.8 and shadcn 4.21 (`radix-nova`).

Copy files rather than retyping them, then adapt the names. The `notes` feature is an example of a feature's shape; replace it with the project's first real feature.

## New project

A new project is set up by the template's setup: `mem init --template nextjs-web` puts it in `.mem/setup.md`, and onboard walks through it step by step. Its steps copy the files below, and `files/` is what they copy.

## What `files/` contains

- `next.config.ts`: Cache Components, `agentRules: false` (keeps an agent-run `next dev` out of `AGENTS.md`), Workflow, and the env schemas parsed so a bad environment fails the build.
- `vercel.json`: bun install and build, the example cron.
- `.env.example`, `src/env/*`: the typed environment (`nextjs-env`).
- `drizzle.config.ts`, `src/db/*`, `scripts/migrate.ts`: the database and migrations (`drizzle-neon`).
- `src/features/auth/*`, `src/app/api/auth/[...all]/route.ts`, `src/proxy.ts`, `scripts/auth-schema.ts`, `src/app/(site)/login/`: auth (`better-auth`).
- `src/app/layout.tsx`, `src/app/(site)/*`, `src/app/(app)/*`: the root layout with font variables, the public and signed-in route groups (`design-system`).
- `src/features/notes/*`, `src/app/(app)/dashboard/page.tsx`, `src/app/api/cron/digest/route.ts`: an example feature with a cached read, a Server Action, a form, and a workflow started by cron (`nextjs-caching`, `background-jobs`). It shows a feature's shape: `data.ts` (server-only, cached reads), `actions.ts`, `schema.ts` (zod, shared with the form), components, and `<name>-workflow.ts`/`<name>-steps.ts`.

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
