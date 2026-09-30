# Setup: nextjs-web

Turns this repository into a working Next.js 16 app on the template's stack: bun, Cache Components, Drizzle with Postgres (Neon when deployed), better-auth, shadcn on Radix, Workflow and Vercel Cron. The `nextjs-setup` skill holds the verified starter files (`.agents/skills/nextjs-setup/files/`) and explains them; the template's other skills explain each part.

Run every command from the repository root. Needs bun and a local Postgres (`createdb` on the PATH). Tick a step's box when its "Done when" holds, and commit.

## [ ] 1. Scaffold the Next.js app

If `package.json` already exists, the app was scaffolded before `mem init`: skip the commands, delete `CLAUDE.md` if create-next-app made one, remove the `<!-- BEGIN:nextjs-agent-rules -->` … `<!-- END:nextjs-agent-rules -->` block from `AGENTS.md`, and continue with the last paragraph.

Otherwise scaffold into a temporary directory (create-next-app refuses a directory that already holds `.mem/`, `.agents/` or `AGENTS.md`) and move the result in. `--no-agents-md` stops create-next-app from writing its own `AGENTS.md` and `CLAUDE.md`: mem owns `AGENTS.md`, and Claude Code reads it without a `CLAUDE.md`.

```sh
bunx create-next-app@latest scaffold-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-bun --yes --skip-install --disable-git --no-agents-md
cat scaffold-tmp/.gitignore >> .gitignore && rm scaffold-tmp/.gitignore
mv scaffold-tmp/* . && rmdir scaffold-tmp
bun -e 'const f = "package.json"; const p = await Bun.file(f).json(); p.name = require("path").basename(process.cwd()); await Bun.write(f, JSON.stringify(p, null, 2) + "\n")'
bun install
```

Then add `agentRules: false` to the config object in `next.config.ts`. When an agent runs `next dev`, Next otherwise appends its own block to `AGENTS.md`.

Done when: `package.json` carries the repository's name, `bun install` succeeded, there is no `CLAUDE.md`, `AGENTS.md` has no `nextjs-agent-rules` block, and `next.config.ts` sets `agentRules: false`.

## [ ] 2. Install the stack

```sh
bun add drizzle-orm pg better-auth zod server-only workflow @vercel/functions react-hook-form @hookform/resolvers
bun add -d drizzle-kit @types/pg @types/bun auth @next/env@$(bun -e 'console.log(require("next/package.json").version)')
```

`auth` is better-auth's CLI package and must stay on the same version as `better-auth`.

Done when: both commands succeeded and `@next/env` has the same version as `next` in `package.json`.

## [ ] 3. Initialise shadcn on Radix

```sh
bunx shadcn@latest init -d --base radix
bunx shadcn@latest add button input label field card
```

Without `--base radix`, `-d` picks Base UI.

Done when: `components.json` has `"style": "radix-nova"` and `src/components/ui/` holds the five components.

## [ ] 4. Copy the starter files

```sh
cp -R .agents/skills/nextjs-setup/files/. .
rm src/app/page.tsx
```

The public home is `src/app/(site)/page.tsx`. The copied `src/app/layout.tsx` names the font variables `--font-sans` and `--font-mono`, as the shadcn tokens expect; in `src/app/globals.css`, change `--font-mono: var(--font-geist-mono);` to `--font-mono: var(--font-mono);`.

Done when: `src/env/`, `src/db/`, `src/features/`, `src/proxy.ts`, `scripts/` and `vercel.json` exist, `src/app/page.tsx` is gone, `globals.css` has no `geist` variable, and `next.config.ts` still sets `agentRules: false`.

## [ ] 5. Scripts and ignores

```sh
bun -e 'const f = "package.json"; const p = await Bun.file(f).json(); p.scripts = { dev: "next dev", build: "bun scripts/migrate.ts && next build", start: "next start", lint: "eslint", typecheck: "next typegen && tsc --noEmit", "db:generate": "drizzle-kit generate", "db:migrate": "bun scripts/migrate.ts", "db:studio": "drizzle-kit studio", "auth:schema": "bun --conditions=react-server scripts/auth-schema.ts" }; await Bun.write(f, JSON.stringify(p, null, 2) + "\n")'
```

In `.gitignore`, add `!.env.example` on the line after `.env*`, and add `/.workflow-data/`.

Done when: `git check-ignore .env.example` prints nothing, and `git check-ignore .env.local` prints `.env.local`.

## [ ] 6. Local database and environment

```sh
createdb <repository name>
cp .env.example .env.local
```

In `.env.local`, point both database URLs at the new database (for example `postgres://<your user>@localhost:5432/<repository name>`), and fill in `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) and `CRON_SECRET` (`openssl rand -hex 16`).

Done when: `psql "$DATABASE_URL" -c 'select 1'` succeeds with the URL from `.env.local`, and neither secret is empty.

## [ ] 7. Auth tables and the first migration

`src/db/schema/index.ts` re-exports `notes.ts`, which references the generated `user` table, so generate the auth schema with auth alone first:

```sh
echo 'export {};' > src/db/schema/auth.ts
echo 'export * from "./auth";' > src/db/schema/index.ts
bun run auth:schema
printf 'export * from "./auth";\nexport * from "./notes";\n' > src/db/schema/index.ts
bun run db:generate && bun run db:migrate
```

Done when: `src/db/schema/auth.ts` defines `user`, `session`, `account`, `verification` and `rateLimit`, `drizzle/` holds one migration, and `bun run db:migrate` reports the database up to date.

## [ ] 8. Verify locally

```sh
bun run typecheck && bun run build
```

Then `bun run start` and check that `/dashboard` redirects to `/login`, that a user can sign up (`POST /api/auth/sign-up/email` with an email, a 12+ character password and a name) and sign in, and that the dashboard shows their name. Stop the server.

Done when: typecheck and build pass, the checks above hold, and `AGENTS.md` still has no `nextjs-agent-rules` block.

## [ ] 9. Make it yours (you)

With the user: the app's name, title and description in `src/app/layout.tsx`; the brand tokens in `src/app/globals.css` and the fonts (see `design-system`); the public home in `src/app/(site)/`; and the first real feature, replacing the example `notes` feature (see `nextjs-setup` for a feature's shape). Delete what the app does not need.

Done when: the user is happy with the name and brand, `notes` is replaced or removed, and typecheck and build still pass.

## [ ] 10. Deploy on Vercel (you)

The user links the Vercel project, installs Neon from the Vercel Marketplace, creates the Neon `staging` branch and sets each environment's variables, following "Deploying on Vercel" in the `nextjs-setup` skill. Then create the first user against each environment (see `better-auth`), and release with `mem promote staging` and `mem promote production`.

Done when: staging and production deployments are live and the first user can sign in on both, or the user decides to deploy later (then tick it and say so in the commit).
