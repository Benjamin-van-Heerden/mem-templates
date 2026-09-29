---
name: nextjs-caching
description: How this project caches server data with Next.js 16 Cache Components ("use cache", cacheTag, cacheLife, updateTag, "use cache: private" and "remote"). Use when adding a cached read, invalidating after a write, or when a build fails over request data outside Suspense.
---

# Caching Server Data

This project enables `cacheComponents: true`. It is the only supported way to cache server functions in Next 16: `unstable_cache` is replaced by `use cache`, and the old segment configs (`dynamic`, `revalidate`, `fetchCache`) are removed. Never use them.

Checked against `next@16.3.7`. The deeper reference is the `next-cache-components` skill and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`.

## The model

- Everything is dynamic unless you cache it. Next prerenders a static shell of whatever does not read the request; cached content joins the shell; request reads stream in behind `<Suspense>`.
- Reading `cookies()`, `headers()`, `searchParams` or the session outside a Suspense boundary is a build error. Wrap the smallest component that reads it.
- `use cache` caches a function's output keyed by its arguments and captured variables. Arguments and return values must be serializable.

## Cached reads

Put cached reads in the feature's server-only data module. The exported function resolves the user; an unexported cached function does the query, so no caller can request another user's data by passing an id.

```ts
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'

export const notesTag = (userId: string) => `notes:${userId}`

export async function getNotes() {
  const user = await getCurrentUser()
  return notesByUser(user.id)
}

async function notesByUser(userId: string) {
  'use cache'
  cacheTag(notesTag(userId))
  cacheLife('minutes')
  return db.select().from(note).where(eq(note.userId, userId))
}
```

Rules:

- Always set a `cacheLife` profile and at least one `cacheTag`. Export tag builders (`notesTag`) so writers invalidate the same tags readers set.
- Never call `cookies()`, `headers()` or `getCurrentUser()` inside plain `use cache`. Read outside and pass the value in.
- Key and tag on stable ids. Keys and tags are stored in plain text: no emails, tokens or other personal data.
- Cache data functions, not whole pages. Cache a component only when its whole output is shared.

`cacheLife` presets (`stale` / `revalidate` / `expire`):

| Profile   | Use for                        | stale | revalidate | expire  |
| --------- | ------------------------------ | ----- | ---------- | ------- |
| `seconds` | near real-time                 | 30s   | 1s         | 1 min   |
| `minutes` | frequently updated             | 5 min | 1 min      | 1 h     |
| `hours`   | updated several times a day    | 5 min | 1 h        | 1 day   |
| `days`    | updated daily                  | 5 min | 1 day      | 1 week  |
| `weeks`   | updated weekly                 | 5 min | 1 week     | 30 days |
| `max`     | rarely changes                 | 5 min | 30 days    | 1 year  |

Keep `stale` at 30 seconds or more, or the entry drops out of prefetching.

## Invalidation

- In a Server Action after a write: `updateTag(tag)`. The next request waits for fresh data, so the user sees their own change.
- Outside actions (Route Handlers, webhooks, workflow steps that call a route): `revalidateTag(tag, 'max')`, which serves stale content while refreshing in the background.
- `revalidatePath(path)` only when tags are impractical.
- Invalidate every tag the write affects, including list and detail tags.

## The session

The session read uses `'use cache: private'` (see `better-auth`). A private scope may read `cookies()` and `headers()`; its result is cached only in the browser, never on the server. Components call `getCurrentUser()` freely: within a request and across prefetches it resolves once.

## Where cache entries live

- Plain `use cache` stores entries in memory per server instance. On Vercel, instances are short-lived and not shared, so treat it as a best-effort cache that mostly improves prerendering and prefetching.
- `'use cache: remote'` stores entries in the platform's shared cache (Vercel provides the handler): durable across instances, but with a network lookup and platform cost. Use it only for expensive reads that many users share, for example slow third-party APIs or heavy aggregates.
- Every deploy starts with an empty cache: the build id is part of the key.

## Build errors and fixes

- A blocking-route error (build output or dev overlay, naming the component): wrap the component that reads request data in `<Suspense>`, or move the read into a cached function if it does not depend on the request.
- A layout that awaits the session holds the whole segment: move the read into a child component inside a boundary.
- `export const dynamic`, `revalidate` or `fetchCache`: remove them; they are not allowed with Cache Components.
- A route that must stay blocking while you restructure it: `export const instant = false` on that page or layout.
