# Setup: nextjs-web

Turns this repository into a deployed Next.js 16 app: bun, Cache Components, Drizzle on Neon, better-auth with roles and one super admin, shadcn on Radix, a responsive signed-in shell, Workflow and Vercel. The verified starter files are in `.agents/skills/nextjs-setup/files/`, and the template's skills explain each part (`nextjs-setup`, `drizzle-neon`, `better-auth`, `design-system`, `nextjs-caching`, `background-jobs`).

Run commands from the repository root. Steps marked **(you)** need the user: ask for what the step names, then continue. Tick a step's box when its "Done when" holds, and commit.

## [ ] 1. Scaffold the Next.js app

If `package.json` already exists, the app was scaffolded before `mem init`: skip the commands, delete `CLAUDE.md` if create-next-app made one, remove the `<!-- BEGIN:nextjs-agent-rules -->` … `<!-- END:nextjs-agent-rules -->` block from `AGENTS.md`, and continue with the last paragraph.

Otherwise scaffold into a temporary directory (create-next-app refuses a directory that already holds `.mem/`, `.agents/` or `AGENTS.md`) and move the result in, keeping a README the repository already has. `--no-agents-md` stops create-next-app from writing its own `AGENTS.md` and `CLAUDE.md`: mem owns `AGENTS.md`, and Claude Code reads it without a `CLAUDE.md`.

```sh
bunx create-next-app@latest scaffold-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-bun --yes --skip-install --disable-git --no-agents-md
cat scaffold-tmp/.gitignore >> .gitignore && rm scaffold-tmp/.gitignore
[ -e README.md ] && rm scaffold-tmp/README.md
mv scaffold-tmp/* . && rmdir scaffold-tmp
bun -e 'const f = "package.json"; const p = await Bun.file(f).json(); p.name = require("path").basename(process.cwd()); await Bun.write(f, JSON.stringify(p, null, 2) + "\n")'
bun install
```

Then add `agentRules: false` to the config object in `next.config.ts`. When an agent runs `next dev`, Next otherwise appends its own block to `AGENTS.md`.

Done when: `package.json` carries the repository's name, `bun install` succeeded, there is no `CLAUDE.md`, `AGENTS.md` has no `nextjs-agent-rules` block, and `next.config.ts` sets `agentRules: false`.

## [ ] 2. Install the stack and shadcn

```sh
bun add drizzle-orm pg better-auth zod server-only workflow @vercel/functions react-hook-form @hookform/resolvers
bun add -d drizzle-kit @types/pg @types/bun auth @next/env@$(bun -e 'console.log(require("next/package.json").version)')
bunx shadcn@latest init -d --base radix
bunx shadcn@latest add button input label field card sheet tooltip table select dialog badge dropdown-menu separator avatar
```

`auth` is better-auth's CLI package and must stay on the same version as `better-auth`. Without `--base radix`, `shadcn init -d` picks Base UI.

Done when: the commands succeeded, `@next/env` has the same version as `next`, and `components.json` has `"style": "radix-nova"`.

## [ ] 3. Copy the starter files

```sh
cp -R .agents/skills/nextjs-setup/files/. .
rm src/app/page.tsx
bun -e 'const f = "package.json"; const p = await Bun.file(f).json(); p.scripts = { dev: "next dev", build: "bun scripts/migrate.ts && bun scripts/seed.ts && next build", start: "next start", lint: "eslint", typecheck: "next typegen && tsc --noEmit", "db:generate": "drizzle-kit generate", "db:migrate": "bun scripts/migrate.ts", "db:seed": "bun scripts/seed.ts", "db:studio": "drizzle-kit studio", "auth:schema": "bun --conditions=react-server scripts/auth-schema.ts" }; await Bun.write(f, JSON.stringify(p, null, 2) + "\n")'
```

The copied `src/app/layout.tsx` names the font variables `--font-sans` and `--font-mono`, as the shadcn tokens expect: in `src/app/globals.css`, change `--font-mono: var(--font-geist-mono);` to `--font-mono: var(--font-mono);`. Then append the signed-in backgrounds to `src/app/globals.css`:

```css
/* Signed-in backgrounds, chosen in step 11. Built on tokens, so they follow the brand and dark mode. */
@utility bg-dot-grid {
  background-color: var(--background);
  background-image: radial-gradient(color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1.2px);
  background-size: 18px 18px;
}

@utility bg-hatch {
  background-color: var(--background);
  background-image: repeating-linear-gradient(-45deg, color-mix(in oklch, var(--foreground) 7%, transparent) 0 1px, transparent 1px 7px);
}
```

In `.gitignore`, add `!.env.example` on the line after `.env*`, and add `/.workflow-data/` and `/.swc`.

In `vercel.json`, make `git.deploymentEnabled` list the development and staging branches from `.mem/config.toml` (`dev` and `test` by default), so only the production branch deploys.

Done when: `src/env/`, `src/db/`, `src/features/`, `src/components/navigation/`, `src/proxy.ts`, `scripts/` and `vercel.json` exist, `src/app/page.tsx` is gone, `globals.css` has no `geist` variable and has both utilities, and `git check-ignore .env.example` prints nothing.

## [ ] 4. Neon database

Development and production both run on Neon: one project per app, branch `main` for production and `dev` for development. There is no local Postgres.

Check the CLI, then create the project near the Vercel region in `vercel.json` (`fra1` → `aws-eu-central-1`):

```sh
neon me                      # (you) if this fails: run `neon auth` and log in
neon orgs list               # pick the organization if there is more than one
neon projects create --name <app> --region-id aws-eu-central-1 --org-id <org> -o json
neon branches create --project-id <project id> --name dev
```

**(you)** Ask for the super admin's email and name. Then write `.env.local` from `.env.example`, filling the Neon URLs and generated secrets without printing them:

```sh
PID=<project id>
cp .env.example .env.local
bun -e '
const [pooled, direct] = process.argv.slice(1);
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
let env = await Bun.file(".env.local").text();
const set = (key, value) => { env = env.replace(new RegExp(`^${key}=.*$`, "m"), () => `${key}=${value}`); };
set("DATABASE_URL", pooled); set("DATABASE_URL_UNPOOLED", direct);
set("BETTER_AUTH_SECRET", hex(32)); set("CRON_SECRET", hex(16)); set("SUPER_ADMIN_PASSWORD", hex(12));
await Bun.write(".env.local", env);
' "$(neon connection-string dev --project-id $PID --pooled)" "$(neon connection-string dev --project-id $PID)"
```

Fill in `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_NAME`, and tell the user their initial password is `SUPER_ADMIN_PASSWORD` in `.env.local`. Then create the schema and the super admin:

```sh
bun run db:generate && bun run db:migrate && bun run db:seed
bun run typecheck
```

Done when: `drizzle/` holds the first migration, `bun run db:seed` prints that the super admin is in place, a second run reports no creation, and typecheck passes.

## [ ] 5. Auth barriers and route groups

The starter files already separate the public site from the app:

- `src/app/(site)/`: public pages (home, `/login`); bespoke design on the tokens.
- `src/app/(app)/`: the signed-in app (`/dashboard`, `/admin/users`), inside the shell in `src/app/(app)/layout.tsx`.
- `src/proxy.ts`: redirects requests to app URL prefixes without a session cookie to `/login`. Add every new app prefix to its `matcher`.
- `src/features/auth/session.ts`: `getCurrentUser()` and `requirePermission()`, the real checks. Every page read, Server Action and Route Handler that touches user data starts with one of them.
- Sign-up is off (`disableSignUp`): accounts come from the seed and from `/admin/users`.

Verify it:

```sh
bun run build && bun run start
```

Done when: `/dashboard` without a session redirects to `/login`; `curl -X POST localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"x@example.com","password":"aaaaaaaaaaaa","name":"x"}'` is refused; and the super admin can sign in at `/login` and reaches `/dashboard`.

## [ ] 6. Branding (you)

Ask the user for the logo and the app's name, then the design questions, and apply the answers:

- **Logo:** an SVG is best. Save it as `public/logo.svg` (for a PNG, save `public/logo.png` and change `/logo.svg` to it in `src/components/navigation/app-sidebar.tsx`, `app-mobile-menu.tsx` and `src/app/(site)/`). Copy it to `src/app/icon.svg` (or `icon.png`) for the favicon, and delete `src/app/favicon.ico`.
- **Name:** `metadata` in `src/app/layout.tsx` (`title.default`, `title.template`, `description`), and the sheet title in `app-mobile-menu.tsx`.
- **Corners:** sharp (`--radius: 0rem`), slightly rounded (`0.375rem`) or rounded (`0.625rem`), in `:root` in `globals.css`.
- **Fonts:** sans only, or a serif display face with a sans or mono interface, for example `Geist` + `Geist_Mono`, `Inter` + `JetBrains_Mono`, or `IBM_Plex_Serif` headings with `IBM_Plex_Mono` UI. Load them with `next/font/google` in `src/app/layout.tsx` as `--font-sans`, `--font-mono` and, for a display face, `--font-heading` (add `--font-heading: var(--font-heading);` in `@theme inline` in place of `var(--font-sans)`).
- **Accent colour:** set `--primary` (and `--ring`, and `--sidebar-primary`) in `:root` and `.dark` to the brand colour in `oklch()`, with `--primary-foreground` readable on it.
- **Light, dark or both:** for dark only, add `className="dark"` to `<html>` in `src/app/layout.tsx`; for both, add a theme toggle (`next-themes`) with the user.

Record the decisions for later sessions in `.mem/docs/design.md`, which onboard prints every session:

```markdown
# Design decisions

- Logo: public/logo.svg
- Corners: sharp (--radius: 0)
- Fonts: IBM Plex Serif (headings), IBM Plex Mono (interface)
- Accent: oklch(0.58 0.16 35), a rust red
- Theme: dark only
- Signed-in background: diagonal hatch (bg-hatch)
```

Done when: the logo shows in the rail, the mobile menu, the home page, the login page and the browser tab; the tokens hold the answers; `.mem/docs/design.md` records them; and the user is happy with a screenshot of `/login` and `/dashboard`.

## [ ] 7. Home page and login page

Keep both small. Replace the placeholder copy on `src/app/(site)/page.tsx` with the app's name and a one- or two-sentence pitch, keeping the logo and the sign-in link, and style it with the chosen fonts and tokens in `site.module.css`. The login page (`src/app/(site)/login/page.tsx`) needs only the logo and the card. Public pages may use bespoke CSS, but only on the tokens (see `design-system`).

Done when: both pages look right to the user at desktop and phone widths, in the chosen theme.

## [ ] 8. Deploy to production

Only production deploys for now; previews and staging can come later. The repository must be on GitHub, and everything committed and pushed.

```sh
git remote get-url origin    # the GitHub repository
vercel whoami                # (you) if this fails: run `vercel login`
vercel project add <app>
vercel link --yes --project <app>
vercel git connect           # (you) if Vercel's GitHub app lacks access to the repository, grant it
```

Set the production variables from Neon's `main` branch and new secrets. The production URL is the project's domain, `https://<app>.vercel.app` unless the user adds a custom domain:

```sh
PID=<project id>; URL=https://<app>.vercel.app
add() { printf '%s' "$2" | vercel env add "$1" production --yes >/dev/null && echo "set $1"; }
add NEXT_PUBLIC_APP_ENV production
add NEXT_PUBLIC_APP_URL "$URL"
add BETTER_AUTH_URL "$URL"
add DATABASE_URL "$(neon connection-string main --project-id $PID --pooled)"
add DATABASE_URL_UNPOOLED "$(neon connection-string main --project-id $PID)"
add BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
add CRON_SECRET "$(openssl rand -hex 16)"
add SUPER_ADMIN_EMAIL "<email>"
add SUPER_ADMIN_NAME "<name>"
add SUPER_ADMIN_PASSWORD "$(openssl rand -hex 12)"
```

Tell the user the production super admin password lives in Vercel's environment settings (`vercel env pull` retrieves it), and that changing it there and redeploying rotates it.

Deploy through mem's release flow, which pushes the production branch that Vercel builds:

```sh
mem promote staging
mem promote production
```

Follow each command's instructions. Watch the build with `vercel ls` and `vercel inspect <deployment url> --logs`. The build migrates and seeds the production database before `next build`.

Done when: the production URL serves the home page, and the super admin signs in there.

## [ ] 9. Migrations and seed data

Every build runs `bun scripts/migrate.ts && bun scripts/seed.ts && next build` against the environment's database:

- `scripts/migrate.ts` applies pending migrations from `drizzle/` over the unpooled URL, under an advisory lock. Migrations must be additive: the database changes before the new code is live (see `drizzle-neon`).
- `scripts/seed.ts` runs in one transaction and must stay idempotent. It keeps the super admin in sync with `SUPER_ADMIN_*`; add other reference data below that call, with upserts.
- By hand: `bun run db:generate` after a schema change, `bun run db:migrate`, `bun run db:seed`, and `bun run db:studio` to browse the development branch.

Done when: after changing `SUPER_ADMIN_PASSWORD` in `.env.local`, `bun run db:seed` makes the old password fail and the new one work at `/login` (then tell the user the new one).

## [ ] 10. Roles and user management

Roles are `super_admin` (exactly one, from `SUPER_ADMIN_*`), `admin` and `member`. Permissions live in `src/features/auth/permissions.ts`; the app checks permissions, never role names:

```ts
export type Permission = "app:use" | "users:manage" | "reports:read";   // add a permission here…
const grants: Record<Role, readonly Permission[]> = {
  super_admin: ["app:use", "users:manage", "reports:read"],           // …and grant it here
  admin: ["app:use", "users:manage", "reports:read"],
  member: ["app:use"],
};
```

Pages and actions call `requirePermission("…")`; navigation items take `permission` in `src/components/navigation/routes.ts`. No admin, not even the super admin, can change the super admin through the app or the auth API: the guard in `src/features/auth/server.ts` refuses it.

Done when: signed in as the super admin, `/admin/users` creates a member; the member can sign in and use `/dashboard` but gets "No access" on `/admin/users` and does not see Users in the navigation.

## [ ] 11. Dashboard and navigation (you)

Ask the user which signed-in background they prefer: a **dot grid** (`bg-dot-grid`) or **diagonal hatch** (`bg-hatch`). Set it on the shell in `src/app/(app)/layout.tsx` (`<div className="bg-dot-grid …">`) and in `.mem/docs/design.md`.

The shell is the icon rail with tooltips on desktop, the header with the page title, the user and sign-out, and the sheet menu on phones. Add each app page to `src/components/navigation/routes.ts` with a lucide icon, and its prefix to the `matcher` in `src/proxy.ts`. Replace the dashboard's placeholder metrics with the app's first real, cached reads when there are some, and remove the `notes` example once the first real feature exists.

Done when: the user has seen the dashboard at desktop and phone widths, with the rail, tooltips, sheet menu and the chosen background.

## [ ] 12. Verify and deploy again

```sh
bun run typecheck && bun run build
git push
mem promote staging
mem promote production
```

Done when: production serves the branded app, the super admin signs in on production and can create a user there, and `.mem/docs/design.md` is committed. Then delete this file, commit and push: the project is set up.
