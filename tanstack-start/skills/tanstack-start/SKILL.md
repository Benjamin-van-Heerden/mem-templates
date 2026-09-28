---
name: tanstack-start
description: Patterns for TanStack Start with Drizzle, React Query and TanStack Form. Use when adding routes, server functions, queries, mutations, forms or database access.
---

# TanStack Start + Drizzle + React Query + Form

Usage patterns for building full-stack TypeScript apps.

---

## Critical: Isomorphic Code

All code in TanStack Start runs on BOTH server and client unless in a server function.

```tsx
// WRONG - leaks secrets to client bundle
export const Route = createFileRoute('/users')({
  loader: () => {
    const secret = process.env.SECRET_KEY // Exposed!
    return fetch(`/api?key=${secret}`)
  },
})

// CORRECT - use server functions for secrets/DB
const getUsers = createServerFn().handler(async () => {
  return db.select().from(users) // Server-only
})

export const Route = createFileRoute('/users')({
  loader: () => getUsers(),
})
```

| Location | Runs On | Safe for Secrets? |
|----------|---------|-------------------|
| `loader` / `beforeLoad` | Server + Client | No |
| `createServerFn` handler | Server only | Yes |
| Component code | Client | No |

---

## Project Structure

```
src/
├── db/
│   ├── index.ts           # Drizzle client
│   └── schema.ts          # Table definitions
├── server/
│   └── users.functions.ts # Server functions
├── queries/
│   └── users.ts           # Query options
└── routes/
    ├── __root.tsx
    └── users/
        ├── index.tsx
        └── $userId.tsx
```

---

## Drizzle Schema

```ts
// src/db/schema.ts
import { pgTable, serial, text, varchar, timestamp, integer } from 'drizzle-orm/pg-core'
import { pgEnum } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['admin', 'user'])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: roleEnum('role').default('user'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Type inference
type User = typeof users.$inferSelect
type NewUser = typeof users.$inferInsert
```

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
export const db = drizzle(process.env.DATABASE_URL!)
```

### Common Column Types
```ts
id: serial('id').primaryKey()
id: uuid('id').defaultRandom().primaryKey()
name: text('name')
name: varchar('name', { length: 255 })
active: boolean('active').default(true)
createdAt: timestamp('created_at').defaultNow()
updatedAt: timestamp('updated_at').$onUpdate(() => new Date())
data: jsonb('metadata').$type<{ foo: string }>()
```

### Migrations
```bash
npx drizzle-kit push      # Dev: apply directly
npx drizzle-kit generate  # Prod: generate SQL
npx drizzle-kit migrate   # Prod: apply migrations
```

---

## Server Functions

```tsx
// src/server/users.functions.ts
import { createServerFn } from "@tanstack/react-start"
import { notFound } from "@tanstack/react-router"
import { z } from "zod"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

// GET - no input
export const getUsers = createServerFn().handler(async () => {
  return db.select().from(users)
})

// GET - with input validation
export const getUserById = createServerFn()
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const [result] = await db.select().from(users).where(eq(users.id, data.id))
    if (!result) throw notFound()
    return result
  })

// POST - with Zod schema
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(CreateUserSchema)
  .handler(async ({ data }) => {
    const [user] = await db.insert(users).values(data).returning()
    return user
  })

export const updateUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number(), name: z.string().optional() }))
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning()
    if (!updated) throw notFound()
    return updated
  })

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    await db.delete(users).where(eq(users.id, data.id))
    return { success: true }
  })
```

---

## Query Options

```tsx
// src/queries/users.ts
import { queryOptions } from "@tanstack/react-query"
import { getUsers, getUserById } from "@/server/users.functions"

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ["users"],
    queryFn: () => getUsers(),
  })

export const userQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["users", userId],
    queryFn: () => getUserById({ data: { id: userId } }),
  })
```

### Query Key Conventions
```tsx
["users"]                    // all users
["users", userId]            // single user
["users", { role: "admin" }] // filtered list
["users", userId, "posts"]   // user's posts
```

Invalidating `["users"]` invalidates all nested keys.

---

## Routes with Queries

```tsx
// src/routes/users/$userId.tsx
import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { userQueryOptions } from "@/queries/users"
import { updateUser, deleteUser } from "@/server/users.functions"

export const Route = createFileRoute("/users/$userId")({
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions(params.userId))
    return { user }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData.user.name} | Users` }],
  }),
  notFoundComponent: () => <div>User not found</div>,
  component: UserPage,
})

function UserPage() {
  const { userId } = Route.useParams()
  const { data: user } = useSuspenseQuery(userQueryOptions(userId))
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser({ data: { id: userId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  })

  return (
    <div>
      <h1>{user.name}</h1>
      <button onClick={() => deleteMutation.mutate()}>Delete</button>
    </div>
  )
}
```

---

## Mutations

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createUser, type CreateUserInput } from "@/server/users.functions"

function CreateUserForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (input: CreateUserInput) => createUser({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const fd = new FormData(e.currentTarget)
      mutation.mutate({
        name: fd.get("name") as string,
        email: fd.get("email") as string,
      })
    }}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button disabled={mutation.isPending}>
        {mutation.isPending ? "Creating..." : "Create"}
      </button>
    </form>
  )
}
```

### Optimistic Updates
```tsx
const mutation = useMutation({
  mutationFn: (input) => createUser({ data: input }),
  onMutate: async (newUser) => {
    await queryClient.cancelQueries({ queryKey: ["users"] })
    const previous = queryClient.getQueryData(["users"])
    queryClient.setQueryData(["users"], (old = []) => [...old, { ...newUser, id: `temp` }])
    return { previous }
  },
  onError: (err, _, context) => queryClient.setQueryData(["users"], context?.previous),
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
})
```

---

## TanStack Form + shadcn/ui

```tsx
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

function UserForm({ onSubmit }: { onSubmit: (data: z.infer<typeof schema>) => void }) {
  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => onSubmit(value),
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.Field name="name">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="email">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Email</FieldLabel>
              <Input
                id={field.name}
                type="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
```

### Field Patterns

```tsx
// Input/Textarea
<form.Field name="fieldName">
  {(field) => (
    <Input
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => field.handleChange(e.target.value)}
    />
  )}
</form.Field>

// Select
<form.Field name="role">
  {(field) => (
    <Select value={field.state.value} onValueChange={field.handleChange}>
      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="user">User</SelectItem>
      </SelectContent>
    </Select>
  )}
</form.Field>

// Checkbox
<form.Field name="terms">
  {(field) => (
    <Checkbox checked={field.state.value} onCheckedChange={field.handleChange} />
  )}
</form.Field>

// Switch
<form.Field name="enabled">
  {(field) => (
    <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
  )}
</form.Field>
```

### Validation Timing
```tsx
validators: {
  onChange: schema,   // Every keystroke
  onBlur: schema,     // On blur
  onSubmit: schema,   // On submit
}
```

### Field-Level Async Validation
```tsx
<form.Field
  name="email"
  validators={{
    onChangeAsync: async ({ value }) => {
      const taken = await checkEmailExists(value)
      return taken ? "Email already taken" : undefined
    },
    onChangeAsyncDebounceMs: 500,
  }}
>
  {(field) => /* ... */}
</form.Field>
```

---

## Drizzle Query Patterns

```ts
import { eq, and, or, gt, lt, like, ilike, inArray, desc, asc } from "drizzle-orm"

// Select all
const all = await db.select().from(users)

// Select with filter
const admins = await db.select().from(users).where(eq(users.role, "admin"))

// Multiple conditions
const filtered = await db.select().from(users).where(
  and(eq(users.role, "admin"), gt(users.createdAt, someDate))
)

// Select specific columns
const names = await db.select({ name: users.name, email: users.email }).from(users)

// Order and limit
const recent = await db.select().from(users)
  .orderBy(desc(users.createdAt))
  .limit(10).offset(20)

// Insert returning
const [user] = await db.insert(users).values({ name, email }).returning()

// Update returning
const [updated] = await db.update(users)
  .set({ name: "New Name" })
  .where(eq(users.id, id))
  .returning()

// Delete
await db.delete(users).where(eq(users.id, id))
```

### Filter Operators
| Operator | Usage |
|----------|-------|
| `eq` / `ne` | equals / not equals |
| `lt` / `lte` / `gt` / `gte` | comparisons |
| `like` / `ilike` | pattern matching |
| `isNull` / `isNotNull` | null checks |
| `inArray` / `notInArray` | array membership |
| `between` | range check |
| `and` / `or` / `not` | logical operators |

---

## Quick Reference

| Task | Pattern |
|------|---------|
| Server function (GET) | `createServerFn().handler(async () => ...)` |
| Server function (POST) | `createServerFn({ method: "POST" }).inputValidator(schema).handler(...)` |
| Query options | `queryOptions({ queryKey: [...], queryFn: () => serverFn() })` |
| SSR prefetch | `context.queryClient.ensureQueryData(options())` in loader |
| Component query | `useSuspenseQuery(options())` |
| Mutation | `useMutation({ mutationFn, onSuccess: () => invalidateQueries() })` |
| Form field | `<form.Field name="x">{(field) => <Input ... />}</form.Field>` |
| Field error | `field.state.meta.isTouched && !field.state.meta.isValid` |
| Submit button | `<form.Subscribe selector={(s) => s.canSubmit}>` |

**Import rule**: Always use `@/` paths (e.g., `@/db`, `@/server/users.functions`). Never use `../`.
