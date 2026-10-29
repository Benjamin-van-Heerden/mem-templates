# React Compiler through the Rust port in Turbopack

The template now turns on the React Compiler, run as its Rust port inside Turbopack rather than through `babel-plugin-react-compiler`. The `nextjs` skill describes it as on, so a project without the setting has a skill that says otherwise.

In an existing project:

1. Check that `next` is 16.3 or later (`experimental.turbopackRustReactCompiler` arrived in 16.3.0); upgrade first if not (`next-upgrade` skill).
2. In `next.config.ts`, add to the config object:

   ```ts
   // Memoizes components and hooks. The guarantee setting is explicit because its default can differ between compiler implementations.
   reactCompiler: { environment: { enablePreserveExistingMemoizationGuarantees: true } },
   ```

   and to `experimental`, beside what is there (`authInterrupts: true` in the template):

   ```ts
   // Runs the React Compiler as the Rust port inside Turbopack instead of through babel-plugin-react-compiler.
   turbopackRustReactCompiler: true,
   ```

3. If `babel-plugin-react-compiler` is installed, remove it (`bun remove babel-plugin-react-compiler`).
4. Run `bun run lint`. `eslint-plugin-react-hooks` (from `eslint-config-next`) reports the components and hooks the compiler skips. Fix them, for example react-hook-form's `form.watch()` becomes `useWatch({ control: form.control, name })`. Leave existing `useMemo`, `useCallback` and `memo` in place.
5. Run `bun run typecheck` and `bun run build`. `next build` lists `turbopackRustReactCompiler` under Experiments.
6. Ask the user to check the interactive parts of the UI (forms, menus, dialogs) in `bun run dev`.

Does not apply when the project builds with webpack (`next build --webpack`): the Rust port only runs under Turbopack, and Next refuses the option there. Tell the user, and ask whether to move to Turbopack or leave the compiler off.
