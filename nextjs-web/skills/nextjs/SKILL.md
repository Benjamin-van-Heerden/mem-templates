---
name: nextjs
description: House rules for Next.js 16 App Router in this project (routing, layouts, Server/Client Components, request APIs, Server Actions, route handlers, proxy.ts, errors, metadata). Use before writing or changing Next.js code; it takes precedence over generic Next.js skills.
---

# Next.js Project Guide

This project uses current Next.js App Router conventions, which differ a lot from older Next.js. Do not rely on memory of earlier versions. Before framework-sensitive work, read the relevant local docs under `node_modules/next/dist/docs/`, and heed their deprecation notices.

This guide was checked against the local `next@16.3.7` docs. After a `next` upgrade, re-check the docs for anything this guide names (the `next-upgrade` skill covers the upgrade itself).

Related house skills:

- `nextjs-caching`: `use cache`, cache tags and invalidation. This project enables Cache Components.
- `nextjs-env`: typed environment variables.
- `drizzle-neon`: database access and migrations.
- `better-auth`: sessions, the data access layer and protected routes.
- `design-system`: tokens, shadcn for the app, bespoke CSS for public pages.
- `background-jobs`: Workflow and cron.
- `nextjs-setup`: the files a new project starts from.

## Version-Specific Rules

- Turbopack is the default for `next dev` and `next build`. Opt into Webpack with `--webpack` only for a concrete incompatibility.
- `middleware.ts` is deprecated. Use `proxy.ts` at the project root, or `src/proxy.ts` when the app uses `src/`.
- Request-time APIs are async. Always `await cookies()`, `headers()`, `draftMode()`, route `params` and page `searchParams`.
- `params` and `searchParams` props are Promises in pages, layouts, route handlers and generated metadata/image routes.
- Use the generated route helpers `PageProps<'/route'>`, `LayoutProps<'/route'>` and `RouteContext<'/route'>`. `next dev`, `next build` and `next typegen` generate them, so type-check with `next typegen && tsc --noEmit`.
- `cacheComponents: true` is on. With it, the segment configs `dynamic`, `dynamicParams`, `revalidate` and `fetchCache` are removed, `runtime = 'edge'` is not supported, and `unstable_cache` is replaced by `use cache`. See `nextjs-caching`.
- `revalidateTag` takes a second argument such as `'max'`. Use `updateTag` in Server Actions for read-your-own-writes.
- `error.tsx` receives a stable `retry` prop (it was `unstable_retry` in 16.2).
- Routes opt into or out of instant-navigation validation with `export const instant = true | false` (formerly `unstable_instant`).
- `forbidden()` and `unauthorized()` are experimental auth interrupts. They require `experimental.authInterrupts: true` and cannot be called in the root layout.
- React Compiler is stable but off by default. Do not assume its optimizations unless `reactCompiler` is configured and `babel-plugin-react-compiler` is installed.

## Project Structure

- `src/app/`: routes, layouts, route handlers and route-specific UI.
- `src/features/<domain>/`: a domain's server data, Server Actions, schemas and components, for example `src/features/notes/{data,actions,schema}.ts` and `note-form.tsx`.
- `src/components/ui/`: shadcn components. `src/components/` also holds shared app components.
- `src/db/`, `src/env/`: the database client and schema, and the typed environment.
- `src/proxy.ts`, `next.config.ts`, `public/`, `.env*` (never commit secrets).

Inside `app/`, folders define route segments. A folder is routable only once it has `page.tsx` or `route.ts`. Special files:

- `layout.tsx`: persistent shared UI for a segment.
- `template.tsx`: like a layout, but remounts when its segment changes.
- `page.tsx`: route UI, the leaf of a route subtree.
- `route.ts`: Route Handler for HTTP methods.
- `loading.tsx`: Suspense fallback for the page and child segments.
- `error.tsx`: Client Component error boundary.
- `not-found.tsx`, `forbidden.tsx`, `unauthorized.tsx`: UI for `notFound()`, `forbidden()`, `unauthorized()`.
- `default.tsx`: fallback for parallel route slots.

Colocating non-route files inside `app/` is allowed; prefix private folders with `_`. Prefer `src/features/` for anything reused beyond one route.

## Configuration

`next.config.ts` runs in Node during dev, build and server start. Keep it small and deterministic. It also validates the environment at build time (see `nextjs-env`).

```ts
import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
}

export default withWorkflow(nextConfig)
```

Add other options deliberately:

- `typedRoutes: true`: statically typed `Link` hrefs.
- `reactCompiler: true`: after installing `babel-plugin-react-compiler`.
- `experimental.authInterrupts: true`: enables `unauthorized()` and `forbidden()`.
- `turbopack`: top-level, not the old `experimental.turbo`.
- `images`: remote hosts must be configured before `next/image` can use remote URLs.
- `redirects`, `rewrites`, `headers`: static routing and response rules.
- `experimental.serverActions.bodySizeLimit`: raise only when a real payload needs it; the small default is intentional.
- `env`: never for secrets. Environment access goes through `src/env/`.
- `output`, `basePath`, `assetPrefix`, `trailingSlash`, `transpilePackages`, `serverExternalPackages`: only for a specific deployment or package need.

Route segment config that remains with Cache Components: `instant`, `prefetch`, `maxDuration` and `generateStaticParams()`. `preferredRegion` is deprecated; set the region in `vercel.json`. Prefer local cache and Suspense decisions over segment-wide config.

## Routing

```text
app/page.tsx                  -> /
app/dashboard/page.tsx        -> /dashboard
app/blog/[slug]/page.tsx      -> /blog/my-post
app/shop/[...slug]/page.tsx   -> /shop/a, /shop/a/b
app/docs/[[...slug]]/page.tsx -> /docs, /docs/a, /docs/a/b
```

```tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <article>{slug}</article>
}
```

In Client Components, unwrap prop promises with React `use()` or use the navigation hooks. Use `generateStaticParams()` when dynamic routes can be prerendered from known data.

## Layouts, Templates and Route Groups

The root layout is required and renders `<html>` and `<body>`. Do not add `<head>` tags by hand; use the Metadata API.

Layouts persist across navigation and do not re-render on it, so they cannot read fresh `pathname` or `searchParams` (use a Client Component with `usePathname()`/`useSearchParams()`). Templates remount when their segment changes; use them when an area needs per-navigation reset.

Route groups use parentheses and are left out of the URL. This project uses two:

```text
app/(site)/page.tsx            -> /          public pages, bespoke design
app/(site)/login/page.tsx      -> /login
app/(app)/dashboard/page.tsx   -> /dashboard  signed-in app, shadcn
```

- Route groups organise layouts. They do not protect routes and do not add URL prefixes.
- Two groups must not resolve to the same path.
- For fully separate root layouts, drop `app/layout.tsx` and give each group its own root layout; navigating between them is a full page load.

## Server and Client Components

Pages and layouts are Server Components by default. Use a Client Component only for state and event handlers, effects, browser APIs, or client hooks. Put `'use client'` at the top of the smallest file that needs it: everything it imports joins the client bundle.

Server Components fetch data directly, may use secrets, and pass only serializable props to Client Components. Server Components can be passed into Client Components as `children` or props, which keeps them out of the client bundle.

Mark every module that touches the database, secrets or the session with `import 'server-only'`. Client Components cannot import it, so the build fails instead of leaking.

## React Compiler and Memoization

This template does not enable React Compiler. Do not remove existing memoization assuming it is on. If you enable it, do so deliberately (`reactCompiler: true` plus `babel-plugin-react-compiler`) and verify the affected UI. With or without it:

- Do not add `memo`, `useMemo` or `useCallback` by habit; prefer simple, pure components.
- Keep `useMemo` for measured expensive work and `useCallback` where stable identity is an external contract.
- Follow the Rules of React; memoization is an optimisation, never correctness.

## Rendering and Streaming

Fetch data in Server Components. Use client-side fetching only for browser-local or highly interactive state.

With Cache Components, a route prerenders a static shell, cached content joins it, and anything that reads the request (cookies, headers, the session, `searchParams`) streams in behind a `<Suspense>` boundary. Reading request data outside a boundary is a build error.

- Put `<Suspense>` around the smallest part that reads request data. Keep the rest static or cached.
- Do not `await` the session or other request data at the top of a layout: it holds the whole segment, including `{children}`. Push the read into a component inside a boundary.
- `loading.tsx` does not cover dynamic work in the layout of the same segment.

See `nextjs-caching` for what to cache and how to invalidate it.

## Navigation

Use `next/link` for internal navigation; a plain `<a>` reloads the document. Routes that must navigate instantly can declare `export const instant = true`, which validates their Suspense boundaries and caching. For routes whose content depends on `params` or `searchParams`, `<Link prefetch={true}>` prefetches per link, at the cost of one server invocation per link.

## Request APIs

```tsx
import { cookies, headers } from 'next/headers'

const theme = (await cookies()).get('theme')?.value
const userAgent = (await headers()).get('user-agent')
```

- Reading cookies works in Server Components. Setting or deleting them works only in Server Actions and Route Handlers.
- Cookies cannot be set after streaming starts.
- `searchParams` is only a page prop. Query-dependent logic in a layout goes stale.

## Server Actions and Mutations

A Server Action is a public POST endpoint: anyone can call it directly, not only through your UI. Every action:

1. Resolves the user with `getCurrentUser()` (see `better-auth`) and checks authorisation.
2. Validates its input with the zod schema shared with the form.
3. Mutates on the server.
4. Invalidates affected caches with `updateTag` (or `revalidateTag`/`revalidatePath`).
5. Returns expected failures as values (`{ ok: false, error }`); throws only for bugs and infrastructure failures.

Call `redirect()` outside `try/catch`; it throws to interrupt. In actions it responds with 303.

```ts
'use server'
export async function addNote(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser()
  const parsed = newNoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  await db.insert(note).values({ userId: user.id, body: parsed.data.body })
  updateTag(notesTag(user.id))
  return { ok: true }
}
```

## Route Handlers

Use `route.ts` for HTTP endpoints that do not render React: webhooks, cron targets, callbacks, feeds. They use the Web `Request`/`Response` APIs.

```ts
export async function GET(_request: Request, ctx: RouteContext<'/api/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

- Supported exports: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`. Next implements `OPTIONS` when it is not exported.
- A request body can be read once; use `request.clone()` for two readers.
- Validate body, query, headers, cookies and params before use. Do not echo internal errors.
- Webhooks: read the raw body with `request.text()` so signature checks see the exact payload; make handlers idempotent, since providers retry.
- Route Handlers are public. Verify auth inside each one (the auth handler and cron routes carry their own checks).
- `GET` handlers are dynamic by default. Cache deliberately with `use cache` in the data they call.

## Proxy

`proxy.ts` runs before routes render. It may redirect, rewrite or set headers, and suits fast, optimistic checks. It is not authorisation.

- Keep it fast: no database reads. Checking for a session cookie is fine.
- Use a constant `matcher`, and only one `proxy.ts` (import helpers into it).
- Server Actions post to the route they are used on; if the matcher skips that path, Proxy does not see the action. Actions verify auth themselves anyway.
- Give protected areas stable URL prefixes (`/dashboard`, `/admin`) so the matcher and role checks stay simple.

`better-auth` shows this project's proxy and the real checks behind it.

## Data Security

- All database access lives in `server-only` modules under `src/features/<domain>/` and `src/db/`, and starts from `getCurrentUser()` when the data is user-scoped.
- Return narrow DTOs, not full rows. Client Component props are public: never pass rows, sessions, tokens or permission maps.
- Only `NEXT_PUBLIC_*` variables reach the browser. Never put a secret under that prefix.
- Do not put the only auth check in a layout; check where the data is read or changed.

## Errors and Redirects

- Expected failures are return values (Server Actions) or explicit status codes (Route Handlers).
- Unexpected errors throw and are caught by `error.tsx`, a Client Component that can call `retry()`.
- `notFound()` with `not-found.tsx` for 404s; `redirect()` (307, or 303 in actions); `permanentRedirect()` for 308.
- `unauthorized()`/`forbidden()` only with `authInterrupts` enabled.
- Once streaming starts the status is sent, so a redirect or not-found inside streamed content keeps a 200. Decide before streaming when a real status matters.

## Metadata, Images, Fonts and CSS

- Use `export const metadata` or `generateMetadata()` (its `params` are async); metadata exports are Server Component only.
- Special files: `favicon.ico`, `icon.*`, `apple-icon.*`, `opengraph-image.*`, `twitter-image.*`, `robots.txt`, `sitemap.xml`. Deeper files override broader ones.
- Use `next/image`, with remote hosts configured in `next.config.ts`. Files in `public/` are served from `/`.
- Load fonts with `next/font` in the root layout and expose them as the CSS variables the design tokens expect (`--font-sans`, `--font-mono`; see `design-system`).
- Global CSS is `src/app/globals.css`, imported by the root layout.

## Practical Defaults

- App Router only; no `pages/`.
- Server Components by default; `'use client'` at small interactive leaves.
- Server-only data modules per feature, starting from `getCurrentUser()`.
- Route groups for layouts, URL prefixes for protection, `proxy.ts` for optimistic redirects only.
- Re-check auth in every protected read, Server Action and Route Handler.
- Suspense around request-time reads; `use cache` with tags for data worth caching.
- `PageProps`, `LayoutProps` and `RouteContext` for typed async params.
