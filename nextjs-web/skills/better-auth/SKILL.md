---
name: better-auth
description: Authentication and authorisation in this project with better-auth, stored in our own Postgres through Drizzle - config, roles and permissions, the one super admin synced from env, user management, session reads with Cache Components, proxy.ts, and regenerating the auth schema. Use when touching sign-in, sessions, protected routes, roles, permissions, users or the auth tables.
---

# better-auth

Auth runs inside the app: better-auth stores users, sessions and accounts in our database through the Drizzle adapter. There is no hosted auth provider and no public sign-up.

```text
src/features/auth/server.ts        the betterAuth instance and the super-admin guard (server-only)
src/features/auth/session.ts       getCurrentUser() and requirePermission(): the data access layer's entry points
src/features/auth/permissions.ts   roles, permissions and hasPermission / permissionsFor
src/features/auth/super-admin.ts   syncSuperAdmin, used by scripts/seed.ts
src/features/auth/client.ts        authClient for Client Components
src/features/users/*               user management behind users:manage
src/app/api/auth/[...all]/route.ts better-auth's HTTP handler
src/proxy.ts                       optimistic redirect for protected URL prefixes
src/db/schema/auth.ts              generated tables; never edit by hand
```

## Config

```ts
export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: 'database' },
  hooks: { before: createAuthMiddleware(protectSuperAdmin) },
  plugins: [
    admin({ defaultRole: 'member', adminRoles: ['super_admin', 'admin'], roles: { super_admin: adminAc, admin: adminAc, member: userAc } }),
    nextCookies(), // keep last: lets Server Actions that call auth.api set cookies
  ],
})
```

- `disableSignUp`: accounts come from the seed (the super admin) and from `/admin/users`.
- `rateLimit.storage: 'database'`: serverless instances share no memory, so in-memory rate limits do not hold.
- `BETTER_AUTH_URL` must equal `NEXT_PUBLIC_APP_URL` (`src/env/server.ts` enforces it). Other origins that must reach the auth API go in `trustedOrigins`.

## Roles and permissions

| Role | Who | Permissions |
| --- | --- | --- |
| `super_admin` | exactly one account, from `SUPER_ADMIN_*` | everything |
| `admin` | created by an admin | `app:use`, `users:manage` |
| `member` | the default | `app:use` |

The app checks permissions, never role names:

```ts
// src/features/auth/permissions.ts
export type Permission = 'app:use' | 'users:manage'
const grants: Record<Role, readonly Permission[]> = {
  super_admin: ['app:use', 'users:manage'],
  admin: ['app:use', 'users:manage'],
  member: ['app:use'],
}
```

- A new capability is a new `Permission`, granted to roles in `grants`. A new role is added to `roles`, `grants`, `assignableRoles` (if admins may hand it out) and the admin plugin's `roles`.
- Pages and Server Actions call `await requirePermission('…')`, which renders `forbidden()` (`src/app/forbidden.tsx`) when the user lacks it. Navigation items declare `permission` in `src/components/navigation/routes.ts` so users only see what they can open. Hiding an item is not authorisation; the page's check is.
- better-auth's own admin API (`/api/auth/admin/*`) is open to `super_admin` and `admin` (`adminRoles`), with its own checks.

## The super admin

There is exactly one `super_admin`, and the environment owns it:

- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` and `SUPER_ADMIN_PASSWORD` are required (`src/env/schema.ts`).
- `scripts/seed.ts` runs `syncSuperAdmin` on every build and on `bun run db:seed`. In one transaction, with the user and account tables locked, it creates the account or updates its name, role and password (re-hashed only when the password no longer verifies), unbans it, and demotes any other `super_admin` to `admin`. Changing the variables and redeploying renames the account or rotates its password. Changing the email creates a new super admin and demotes the old one.
- `protectSuperAdmin` in `server.ts` refuses any `/admin/*` call that targets the super admin or assigns the `super_admin` role, whoever makes it. The admin plugin's endpoints are public routes, so this check sits in the auth layer rather than the UI.
- The users page shows the super admin as "Set by environment", with no controls.

## User management

`src/features/users/`: `data.ts` (`getUsers`: permission check, then an unexported cached read tagged `users`), `schema.ts` (zod, shared with the forms; roles limited to `assignableRoles`), `actions.ts` (create, change role, ban, unban). Every action goes through one helper:

```ts
async function run<S extends z.ZodType>(schema: S, input: unknown, call: (data: z.infer<S>, requestHeaders: Headers) => Promise<unknown>): Promise<ActionResult> {
  await requirePermission('users:manage')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  try { await call(parsed.data, await headers()) }
  catch (error) { if (error instanceof APIError) return { ok: false, error: error.message }; throw error }
  updateTag(usersTag)
  return { ok: true }
}

export async function createUser(input: unknown) {
  return run(newUserSchema, input, (body, h) => auth.api.createUser({ body, headers: h }))
}
```

Calling `auth.api.*` with the request's headers makes better-auth act as the signed-in user, so its role checks and the super-admin guard apply as well.

## Reading the session

```ts
export async function getCurrentUser(): Promise<CurrentUser> {
  'use cache: private'
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || session.user.banned) redirect('/login')
  return { id: session.user.id, name: session.user.name, email: session.user.email, role: session.user.role ?? 'member' }
}
```

- `'use cache: private'` may read headers. Its result is cached in the browser only, never on the server, so any number of components can call it and the session lookup runs once.
- It returns a narrow user, never the raw session. Never pass sessions or tokens to Client Components.
- A component that calls it reads the request, so it must sit inside `<Suspense>`. Layouts never await it at the top: the signed-in shell renders statically and streams the user's parts (see `design-system`).
- User-scoped cached data takes `user.id` as an argument to an unexported `use cache` function (see `nextjs-caching`). Never call `getCurrentUser()` inside plain `use cache`.
- Server Actions and Route Handlers call `getCurrentUser()` or `requirePermission()` themselves; proxy and layout checks do not protect them.

## Proxy

`src/proxy.ts` only checks that a session cookie exists and redirects to `/login` if not. It never touches the database.

```ts
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL('/login', request.url))
  return NextResponse.next()
}
export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] }
```

Every signed-in URL prefix goes in the matcher. Route groups do not protect anything.

## Client side

- Sign-in and sign-out go through `authClient` (`authClient.signIn.email(values)`, `authClient.signOut()`), then `router.push()` and `router.refresh()`. The login form uses react-hook-form with a zod schema and shows better-auth's `error.message` through `form.setError('root', …)`.
- `authClient` includes `adminClient()`, so Client Components can call `authClient.admin.*`; prefer the Server Actions in `src/features/users`, which check permissions and refresh the cached list.

## Changing the auth schema

Plugins and `additionalFields` add tables and columns. After changing the config:

1. `bun run auth:schema` regenerates `src/db/schema/auth.ts` from the live config.
2. `bun run db:generate`, then `bun run db:migrate`.

`auth:schema` runs `scripts/auth-schema.ts` with `bun --conditions=react-server`. The better-auth CLI (`auth` package, same version as `better-auth`) cannot load a config whose imports include `server-only`, so the script imports the instance under the react-server condition and calls the CLI's `generateDrizzleSchema` API. If `src/db/schema/auth.ts` is missing, bootstrap it: write `export {};` to it, make `src/db/schema/index.ts` export only `./auth` while the script runs, then restore the index. Keep the `auth` dev dependency on the same version as `better-auth`; the old `@better-auth/cli` package is stuck at 1.4.
