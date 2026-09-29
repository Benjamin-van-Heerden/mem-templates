---
name: background-jobs
description: Background, scheduled and recurring work in this project - Vercel Workflow for durable tasks (steps, retries, sleep, waiting on events) and Vercel Cron for timed triggers. Use when work must outlive a request, run later, repeat on a schedule, or survive failures.
---

# Background Jobs

- **Work that outlives a request, or must survive crashes and retries**: a Workflow.
- **Work that runs later** ("remind them in 3 days", "expire this at midnight"): a Workflow that calls `sleep`.
- **Work on a timetable**: a Vercel Cron entry that calls a route handler, which starts Workflows.
- **Work that waits on a person or an external system**: a Workflow with a hook or webhook.

Never do long work inside a request, a Server Action or a cron handler. Start a workflow and return.

## Workflow

The Workflow SDK (`workflow` package, `withWorkflow()` in `next.config.ts`) runs durable functions. A workflow function orchestrates; step functions do the I/O. Each step's result is recorded, so after a crash, redeploy or retry the workflow replays from its log and continues where it stopped.

```ts
// src/features/notes/digest-workflow.ts
import { sleep } from 'workflow'
import { countNotesSince, recordDigest } from './digest-steps'

export async function sendDigest(userId: string) {
  'use workflow'
  const count = await countNotesSince(userId, 24)
  await recordDigest(userId, count)
  await sleep('1 day')
  await recordDigest(userId, await countNotesSince(userId, 24))
}
```

```ts
// src/features/notes/digest-steps.ts
export async function countNotesSince(userId: string, hours: number) {
  'use step'
  const since = new Date(Date.now() - hours * 3600_000)
  const [row] = await db.select({ n: count() }).from(note).where(and(eq(note.userId, userId), gte(note.createdAt, since)))
  return row.n
}
```

Start it from server code with `start` from `workflow/api`:

```ts
import { start } from 'workflow/api'
const run = await start(sendDigest, [user.id])   // returns at once; run.runId identifies it
```

### Rules

- **Workflow functions are deterministic.** No database calls, `fetch`, `Date.now()`, `Math.random()` or environment reads in the `'use workflow'` body. Anything that touches the outside world, or differs between runs, goes in a step.
- **Steps are retried**: 3 retries by default; set `stepFn.maxRetries = n` to change it. Make them idempotent: upserts, unique constraints, or check-then-write inside a transaction.
- **Errors control retries**: throw `FatalError` (from `workflow`) for failures that retrying cannot fix, such as invalid input, and `RetryableError` with `{ retryAfter: '5m' }` to back off from rate limits. Any other error is retried.
- **Arguments and return values are serialized.** Pass ids and plain data, not database rows with methods, class instances or connections. Steps re-read what they need.
- **Keep steps coarse enough to be meaningful and small enough to retry cheaply.** One external call or one transaction per step is a good default.
- **Record a job's state in our own tables** when the UI needs it (queued, running, done, failed, plus the `runId`). Set it from steps, and make the job row the guard against starting the same work twice (see `pg_advisory_xact_lock` in `drizzle-neon`).
- **Put workflow and step files in the feature folder** (`<name>-workflow.ts`, `<name>-steps.ts`). A workflow file imports only its steps and `workflow` APIs; steps may import server-only modules such as `db`.

### Time and events

- `sleep('3 days')`, `sleep(new Date(...))` or `sleep(ms)` suspend the workflow durably. Nothing runs, and no compute is billed, while it sleeps.
- `createHook()` inside a workflow waits for `resumeHook(token, payload)` from our own code, for example an approval Server Action. `createWebhook()` gives an external service a URL to call. `getWorkflowMetadata().workflowRunId` identifies the current run.
- Scheduling "later" means starting a workflow now that sleeps until then. Store the `runId` if the user may cancel it (`bunx wf cancel`, or check a cancelled flag in a step before acting).

### Operations

- Locally, workflows run inside `next dev` / `next start` against a local store. `bunx wf inspect runs` lists local runs; `bunx wf inspect runs -b vercel -e production` lists deployed ones. Runs also appear in the Vercel project's dashboard.
- Steps run as functions under `/.well-known/workflow/v1/step`. Raise their time limit in `vercel.json` when a step needs it:

  ```json
  { "functions": { "src/app/.well-known/workflow/v1/step/route.js": { "maxDuration": 300 } } }
  ```

- `/.well-known/workflow/` routes are generated at build time and are not committed.
- For hooks, streaming, testing (`@workflow/vitest`) and the full API, see the `workflow` skill.

## Cron

Cron jobs are entries in `vercel.json` that call a route with GET:

```json
{ "crons": [{ "path": "/api/cron/digest", "schedule": "0 6 * * *" }] }
```

```ts
// src/app/api/cron/digest/route.ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${serverEnv.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })
  const users = await db.select({ id: user.id }).from(user)
  const runs = await Promise.all(users.map((u) => start(sendDigest, [u.id])))
  return Response.json({ started: runs.length })
}
```

- Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in the project. Always check it; the route is otherwise public.
- Schedules are UTC cron expressions.
- **Cron runs only on the production deployment.** Staging and previews never fire it. Test a cron route by calling it with the secret: `curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/digest`.
- A cron handler only finds work and starts workflows. Delivery can be late, and occasionally duplicated, so the work must tolerate both: the idempotency rules above apply.
- For many items, start workflows in batches, or start one workflow that fans out.
