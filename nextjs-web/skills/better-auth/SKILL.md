---
name: better-auth
description: Authentication in this project with better-auth, stored in our own Postgres through Drizzle - config, session reads with Cache Components, the data access layer, proxy.ts, roles, schema regeneration and seeding the first admin. Use when touching sign-in, sessions, protected routes, permissions or the auth tables.
---

# better-auth

Auth runs inside the app: better-auth stores users, sessions and accounts in our database through the Drizzle adapter. There is no hosted auth provider.

```text
src/features/auth/server.ts     the betterAuth instance (server-only)
src/features/auth/session.ts    getCurrentUser(): the data access layer's entry point
src/features/auth/client.ts     authClient for Client Components
src/app/api/auth/[...all]/route.ts   better-auth's HTTP handler
src/proxy.ts                    optimistic redirect for protected URL prefixes
src/db/schema/auth.ts           generated tables; never edit by hand
```

## Config

```ts
import 'server-only'
export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: 'database' },
  plugins: [nextCookies()], // keep last: lets Server Actions that call auth.api set cookies
})
```

- `rateLimit.storage: 'database'`: serverless instances do not share memory, so in-memory rate limits do not hold.
- Internal tools usually set `emailAndPassword.disableSignUp: true` and create users through an admin screen or the seed script.
- `BETTER_AUTH_URL` must equal `NEXT_PUBLIC_APP_URL` (`src/env/server.ts` enforces it). Other origins that must reach the auth API, such as preview URLs, go in `trustedOrigins`.

## Reading the session

Every protected read and every Server Action starts with `getCurrentUser()`:

```ts
import 'server-only'
export async function getCurrentUser(): Promise<CurrentUser> {
  'use cache: private'
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  return { id: session.user.id, name: session.user.name, email: session.user.email }
}
```

- `'use cache: private'` may read headers. Its result is cached in the browser only, never on the server, so any number of components can call it and the session lookup runs once.
- It returns a narrow user, never the raw session. Never pass sessions or tokens to Client Components.
- A component that calls it reads the request, so it must sit inside `<Suspense>`. Do not await it at the top of a layout: the static shell renders and the user's details stream in.
- User-scoped cached data takes `user.id` as an argument to an unexported `use cache` function (see `nextjs-caching`). Never call `getCurrentUser()` inside plain `use cache`.
- Server Actions and Route Handlers call `getCurrentUser()` themselves. Proxy and layout checks do not protect them.

## Proxy

`src/proxy.ts` only checks that a session cookie exists and redirects to `/login` if not. It never touches the database; `getCurrentUser()` does the real check.

```ts
import { getSessionCookie } from 'better-auth/cookies'
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL('/login', request.url))
  return NextResponse.next()
}
export const config = { matcher: ['/dashboard/:path*'] }
```

Protected areas get stable URL prefixes, which the matcher lists. Route groups do not protect anything.

## Client side

- Sign in, sign up and sign out go through `authClient` from `src/features/auth/client.ts` (`authClient.signIn.email(values)`, `authClient.signOut()`), then `router.push()` or `router.refresh()`.
- Forms use react-hook-form with a zod schema (see `design-system` for the Field components). Show better-auth's `error.message` through `form.setError('root', ...)`.
- Server-side sign-in inside a Server Action is `auth.api.signInEmail({ body, headers: await headers() })`. `nextCookies()` sets the cookie.

## Roles and permissions

When the app needs roles, add better-auth's `admin` plugin (with `adminClient()` in `authClient`) and keep authorisation in one module:

```ts
// src/features/auth/permissions.ts
export type Permission = 'workspace:read' | 'settings:write'
const grants: Record<string, readonly Permission[]> = { admin: ['workspace:read', 'settings:write'], member: ['workspace:read'] }
export const hasPermission = (role: string | null | undefined, permission: Permission) => grants[role ?? '']?.includes(permission) ?? false
```

Extend `getCurrentUser()` to return `role`, and add a `requirePermission(p)` next to it that throws or redirects. Every Server Action names the permission it needs. Hiding a button is not authorisation.

## Changing the auth schema

Plugins and `additionalFields` add tables and columns. After changing the config:

1. `bun run auth:schema` regenerates `src/db/schema/auth.ts` from the live config.
2. `bun run db:generate`, then `bun run db:migrate`.

`auth:schema` runs `scripts/auth-schema.ts` with `bun --conditions=react-server`. The better-auth CLI (`auth` package, same version as `better-auth`) cannot load a config whose imports include `server-only`, so the script imports the instance under the react-server condition and calls the CLI's `generateDrizzleSchema` API. Keep the `auth` dev dependency on the same version as `better-auth`; the old `@better-auth/cli` package is stuck at 1.4.

## Seeding the first admin

Create the first account with a script run by hand, for example `scripts/bootstrap-admin.ts`, which reads the credentials from the environment and calls `auth.api.signUpEmail` (or `createUser` with the admin plugin). It is idempotent: it does nothing when the user already exists. Run it with `bun --conditions=react-server scripts/bootstrap-admin.ts` against the target environment. Never run it from the build.
