---
name: design-system
description: How this project's UI is built - the recorded design decisions, one set of design tokens in globals.css, the signed-in shell (icon rail, header, mobile sheet, background), shadcn components for the app, bespoke markup and CSS for public pages, and forms with react-hook-form, zod and shadcn Field. Use when building or restyling any page, component or form.
---

# Design System

One set of design tokens, two ways of building on it:

| Area | Route group | Built with |
| --- | --- | --- |
| Signed-in app: dashboards, settings, admin | `src/app/(app)/` | shadcn components in `src/components/ui/`, Tailwind utilities |
| Public pages: landing, marketing, docs, legal, login | `src/app/(site)/` | Bespoke components and CSS modules, Tailwind where it helps; shadcn only where it fits |

The app favours consistency and density: standard components, no one-off styling. Public pages favour expression: custom layout, typography, motion, complex CSS. Both use the same tokens, so the brand, dark mode and type scale stay consistent.

## Design decisions

The project's choices (logo, corners, fonts, accent colour, theme, signed-in background) are recorded in `.mem/docs/design.md`, which onboard prints every session. Follow them, and update the file when the user changes one. The template's setup asks for them; for an app without the file, ask the user before styling anything that depends on them.

## Tokens

The tokens are CSS variables in `src/app/globals.css`: shadcn's semantic colours (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--chart-*`, `--sidebar-*`), `--radius`, and the font variables, all mapped into Tailwind through `@theme inline`. Light values sit on `:root`, dark values on `.dark`.

- **No raw values outside the token definitions.** No hex, `rgb()`, `oklch()` literals, arbitrary Tailwind colours (`bg-[#123456]`) or one-off font sizes in components or CSS modules. Use `var(--primary)`, `bg-primary`, `text-muted-foreground`, and so on.
- Tints and shades derive from tokens: `color-mix(in oklch, var(--primary) 12%, var(--background))`, or Tailwind opacity modifiers such as `bg-primary/10`.
- Spacing uses Tailwind's scale or `calc(var(--spacing) * n)` in CSS modules. Radius uses `--radius` and its `rounded-*` steps.
- A new colour, size or font becomes a token first (in `:root`, `.dark` and `@theme inline`), then gets used.
- Brand changes are token changes. Changing `--primary` restyles both the app and the public pages.
- Fonts come from `next/font` in the root layout and are exposed as `--font-sans`, `--font-mono` and, when used, `--font-heading`. `shadcn init` expects exactly these names; create-next-app's `--font-geist-*` variables must be renamed, or text falls back to the browser's serif.

## The signed-in app: shadcn

- Add components with the CLI: `bunx shadcn@latest add <component>`. Do not hand-write what shadcn provides, and do not pull in another component library.
- Components are built on Radix (`radix-nova` style, the unified `radix-ui` package). Initialise with `bunx shadcn@latest init -d --base radix`: without `--base radix`, `-d` picks Base UI. `cn()` comes from shadcn's `cn` package, not `clsx` + `tailwind-merge`. Compose with `asChild`, for example `<Button asChild><Link href="...">Open</Link></Button>`, or style a `Link` with `buttonVariants()`. Never mix Radix and Base UI components in one project; Vercel's AI Elements also require Radix.
- The files in `src/components/ui/` are ours. Restyle through tokens first; edit a component's variants second. Compose app-specific pieces in `src/components/` or the feature folder rather than forking a ui component.
- Layout: page content in a centred `max-w-*` container, consistent `gap-*` rhythm, cards for grouped content, tables for records, the Sidebar block for navigation. Empty, loading and error states are part of every screen.
- Data display: shadcn `Table` for records, `Chart` (recharts) with the `--chart-*` tokens, `Badge` for status, `Skeleton` inside Suspense fallbacks.
- See the `shadcn` skill for the CLI, registries and component details.

## The signed-in shell

`src/app/(app)/layout.tsx` with `src/components/navigation/`:

- Desktop (`md` and up): a fixed 64px icon rail (`app-sidebar.tsx`) with the logo, one lucide icon per page, a tooltip with its label, and `aria-current` for the active page; a sticky header with the page title (`page-title.tsx`), the user's email and sign-out.
- Phones and tablets: the rail is hidden and a menu button in the header opens a left sheet (`app-mobile-menu.tsx`) with labelled items, the user and sign-out.
- `routes.ts` is the only list of pages: `{ href, label, icon, permission? }`. Adding a page means adding it there (and its prefix to `src/proxy.ts`). Items with a `permission` show only to users who have it.
- The shell prerenders without the session. The user-dependent parts (their email, permission-gated items) are separate server components inside `<Suspense>`, each falling back to the same client component without the user's data, so nothing shifts. The server passes only permission names to the client components; lucide icons are functions and cannot cross that boundary, so the client components read `routes.ts` themselves.
- Content sits in a `max-w-7xl` container with `px-3 sm:px-6` and `py-4 sm:py-6 lg:py-8`. Tables that do not fit a phone hide secondary columns below `sm` and fold their content into the first column rather than scrolling sideways.

**Backgrounds.** Two utilities in `globals.css`, built on tokens so they follow the brand and dark mode:

```css
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

The shell's root element carries the one the project chose. Cards and the header sit on `bg-background`/`bg-card`, so content stays readable over the pattern. Adjust the density (size, alpha) as tokens, not per page.

## Public pages: bespoke

- Build page-specific components next to the route or in `src/components/site/`. A CSS module per page or component (`page.module.css`) is the norm when the design needs more than utilities: grids, clamp-based type, layered backgrounds, scroll or entrance animation.
- Use tokens for every colour, font and radius. Type scale on public pages can go beyond the app's: use `clamp()` for fluid headings.
- Motion respects `@media (prefers-reduced-motion: reduce)`. Animate `transform` and `opacity`, not layout.
- shadcn components may appear where they fit (a button, a dialog), styled by the same tokens.
- Public pages are static or cached by default. Keep request-time reads (the session, for a "Go to dashboard" link) in a small component inside Suspense so the page still prerenders.
- Check every page at phone width, in dark mode, and with the keyboard.

## Forms

Forms use react-hook-form with a zod schema, rendered with shadcn's `Field` components. The schema lives in the feature's `schema.ts` and is shared with the Server Action, which validates again:

```tsx
const form = useForm({ resolver: zodResolver(newNoteSchema), defaultValues: { body: '' } })
const onSubmit = form.handleSubmit(async (values) => {
  const result = await addNote(values)
  if (!result.ok) return form.setError('body', { message: result.error })
  form.reset()
})

<Field data-invalid={!!form.formState.errors.body}>
  <FieldLabel htmlFor="body">Note</FieldLabel>
  <Input id="body" {...form.register('body')} />
  <FieldError errors={[form.formState.errors.body]} />
</Field>
```

- Disable submit while `formState.isSubmitting`. Show action failures through `setError` (a field, or `'root'` for the whole form).
- Every input has a label, even when it is visually hidden.
- Controlled components (Select, Checkbox, date pickers) use react-hook-form's `Controller`.

## Accessibility

Semantic elements first: `button` for actions, `a`/`Link` for navigation, headings in order, `main` per page, and a skip link in app layouts. Focus stays visible (`focus-visible:ring-*` is in the components). Text meets contrast in both themes. Never convey state with colour alone.
