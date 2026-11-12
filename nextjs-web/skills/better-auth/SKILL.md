---
name: better-auth
description: Authentication and authorisation in this project with better-auth, stored in our own Postgres through Drizzle - config, roles and permissions, the one super admin synced from env, user management, temporary passwords and resets, session reads with Cache Components, proxy.ts, and regenerating the auth schema. Use when touching sign-in, passwords, sessions, protected routes, roles, permissions, users or the auth tables.
---

# better-auth

Auth runs inside the app: better-auth stores users, sessions and accounts in our database through the Drizzle adapter. There is no hosted auth provider and no public sign-up.

```text
src/features/auth/server.ts        the betterAuth instance and the super-admin guard (server-only)
src/features/auth/session.ts       getCurrentUser() and requirePermission(): the data access layer's entry points
src/features/auth/permissions.ts   roles, permissions and hasPermission / permissionsFor
src/features/auth/super-admin.ts   syncSuperAdmin, used by scripts/seed.ts
src/features/auth/temporary-password.ts         the temporary-password plugin and generateTemporaryPassword (server-only)
src/features/auth/temporary-password-schema.ts  its error code and body schema, shared with the login form
src/features/auth/client.ts        authClient for Client Components
src/features/users/*               user management behind users:manage
src/db/repositories/users.ts       the app's reads of the user table
src/app/api/auth/[...all]/route.ts better-auth's HTTP handler; expires the cached user list after a password change
tests/temporary-password.test.ts   the temporary-password boundary, over HTTP on an in-memory Postgres
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
    temporaryPassword(), // no session until the person has replaced an admin-issued password
    nextCookies(), // keep last: lets Server Actions that call auth.api set cookies
  ],
})
```

- `disableSignUp`: accounts come from the seed (the super admin) and from `/admin/users`, with a temporary password (see below).
- `rateLimit.storage: 'database'`: serverless instances share no memory, so in-memory rate limits do not hold.
- `BETTER_AUTH_URL` must equal `NEXT_PUBLIC_APP_URL` (`src/env/server.ts` enforces it). Under `bun run dev` both are the checkout's portless URL, so better-auth accepts requests from it and refuses `http://localhost:3000`. Other origins that must reach the auth API go in `trustedOrigins`.

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
- Pages and Server Actions call `await requirePermission('…')`, which renders `forbidden()` (`src/app/forbidden.tsx`) when the user lacks it. Inside a streamed page that response is a 200 with the forbidden content, not a 403. Navigation items declare `permission` in `src/components/navigation/routes.ts` so users only see what they can open. Hiding an item is not authorisation; the page's check is.
- better-auth's own admin API (`/api/auth/admin/*`) is open to `super_admin` and `admin` (`adminRoles`), with its own checks.

## The super admin

There is exactly one `super_admin`, and the environment owns it:

- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` and `SUPER_ADMIN_PASSWORD` are required (`src/env/schema.ts`).
- `scripts/seed.ts` runs `syncSuperAdmin` on every build and on `bun run db:seed`. In one transaction, with the user and account tables locked, it creates the account or updates its name, role and password (re-hashed only when the password no longer verifies), unbans it, and demotes any other `super_admin` to `admin`. Changing the variables and redeploying renames the account or rotates its password. Changing the email creates a new super admin and demotes the old one.
- `protectSuperAdmin` in `server.ts` refuses any `/admin/*` call that targets the super admin or assigns the `super_admin` role, whoever makes it. The admin plugin's endpoints are public routes, so this check sits in the auth layer rather than the UI.
- The users page shows the super admin as "Set by environment", with no controls.

## User management

`src/features/users/`: `data.ts` (`getUsers`: permission check, then an unexported cached read tagged `users` through `src/db/repositories/users.ts`), `schema.ts` (zod, shared with the forms; roles limited to `assignableRoles`), `actions.ts` (create, reset password, change role, ban, unban). Every action goes through one helper:

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
  return run(newUserSchema, input, (body, h) => {
    const temporaryPassword = generateTemporaryPassword()
    return auth.api.createUser({ body: { ...body, password: temporaryPassword, data: { mustChangePassword: true, temporaryPassword } }, headers: h })
  })
}
```

Calling `auth.api.*` with the request's headers makes better-auth act as the signed-in user, so its role checks and the super-admin guard apply as well. The admin plugin spreads `data` into the new user, which is how the plugin's fields are set.

## Temporary passwords

Admins never choose or type passwords. Creating an account or resetting a password generates a temporary one, and the person replaces it before they get a session.

- **Issuing.** `createUser` and `resetPassword` (`src/features/users/actions.ts`) set the account's password to `generateTemporaryPassword()` (20 characters from an alphabet without look-alikes, in groups of five) and store it on the user: `temporaryPassword` (plain text) and `mustChangePassword = true`. `/admin/users` shows it with a copy button until it is used, so an admin cannot lose it before passing it on. `usersRepo.list` returns it only while the flag is set. It sits in the database and its backups until it is used; it is good only for the one step below, which clears it.
- **Resets.** `resetPassword` calls `setUserPassword`, then `adminUpdateUser` with the two fields, then `revokeUserSessions`, all as the signed-in admin. The old password stops working and the person is signed out everywhere. Nobody resets their own password there, and `protectSuperAdmin` refuses resets of the super admin like every other `/admin/*` call.
- **The boundary.** The plugin's `databaseHooks.session.create.before` refuses to create any session for a user with `mustChangePassword`, whatever creates it (sign-in, impersonation). So a correct temporary password at `/sign-in/email` answers 403 with `code: 'PASSWORD_CHANGE_REQUIRED'`, and no session row or cookie exists. `getCurrentUser()` also redirects a session whose user has the flag, as a second check.
- **Choosing a password.** The login form switches to a choose-a-password step on that code, keeping the email and temporary password in client state, and calls `authClient.temporaryPassword.change({ email, temporaryPassword, newPassword })`. That endpoint (`POST /api/auth/temporary-password/change`) verifies the temporary password against the stored hash again, requires the flag, refuses banned users, a password outside better-auth's length limits and the temporary password itself, then sets the new password, clears both fields, and only then creates the session and sets the cookie. Every wrong-credential case is the same 401, an unknown email is hashed anyway so it takes as long, and the path is limited to 5 attempts a minute.
- **Cache.** That endpoint is not a Server Action, so it cannot call `updateTag`. `src/app/api/auth/[...all]/route.ts` expires the `users` tag with `revalidateTag(usersTag, { expire: 0 })` after a successful change, so the list stops showing a used password.
- **Typing the client.** `client.ts` registers a client plugin with `$InferServerPlugin: {} as ReturnType<typeof temporaryPassword>`, which gives `authClient.temporaryPassword.change` its types. It imports the plugin only as a type, so no server code reaches the browser.
- **The super admin** is unaffected: the seed writes its row directly, and the flag defaults to false.

`tests/temporary-password.test.ts` drives `auth.handler` over HTTP against `betterAuth` with the admin plugin and this plugin on PGlite with the project's migrations (`tests/test-db.ts`): the right temporary password opens no session, a wrong one changes nothing, the change signs in and retires the temporary password, and it cannot be kept or reused. Run it with `bun run test` after upgrading better-auth. In better-auth 1.7, `internalAdapter.createUser` takes a provisioning source as its second argument (`{ method: 'admin' }`).

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
- The login form has two steps: sign-in, and choosing a password when sign-in answers `PASSWORD_CHANGE_REQUIRED` (see Temporary passwords).
- `authClient` includes `adminClient()`, so Client Components can call `authClient.admin.*`; prefer the Server Actions in `src/features/users`, which check permissions and refresh the cached list.

## Changing the auth schema

Plugins and `additionalFields` add tables and columns. After changing the config:

1. `bun run auth:schema` regenerates `src/db/schema/auth.ts` from the live config.
2. `bun run db:generate`, then `bun run db:migrate`.

`auth:schema` runs `scripts/auth-schema.ts` with `bun --conditions=react-server`. The better-auth CLI (`auth` package, same version as `better-auth`) cannot load a config whose imports include `server-only`, so the script imports the instance under the react-server condition and calls the CLI's `generateDrizzleSchema` API. If `src/db/schema/auth.ts` is missing, bootstrap it: write `export {};` to it, make `src/db/schema/index.ts` export only `./auth` while the script runs, then restore the index. Keep the `auth` dev dependency on the same version as `better-auth`; the old `@better-auth/cli` package is stuck at 1.4.
