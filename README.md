# mem-templates

Project templates for [mem](https://github.com/Benjamin-van-Heerden/mem). Each template supplies memories, skills and docs for a kind of project; mem draws them into a project and keeps them in sync at every onboard.

| Template | For |
| --- | --- |
| `nextjs-web` | Next.js 16 on Vercel: bun, Cache Components, Drizzle with Neon, better-auth, shadcn, Workflow and Cron |
| `tanstack-start` | TanStack Start with Drizzle, React Query and TanStack Form |
| `python` | Python project managed with uv |
| `rust` | Rust crate or workspace |
| `phoenix` | Elixir and Phoenix web application |

## Use

```sh
mem init --template nextjs-web
mem template use python          # add a template to an existing project
mem template list                # templates here, and the state of a project's items
```

This is mem's default library; `--template-source <git url>` points a project at another one.

A project sends improvements back with `mem template promote <memory|skill|doc> <name>`; every project that uses the template receives them at its next `mem onboard`.

## Layout

```text
<template>/template.toml         description = "…"
<template>/memories/<name>.md    a project convention, added to AGENTS.md
<template>/skills/<name>/        SKILL.md and supporting files, installed in .agents/skills/<name>/
<template>/docs/<name>.md        a project doc, installed in .mem/docs/ and printed at every onboard
<template>/setup.md              optional one-time setup for new projects, installed by `mem init` in .mem/setup.md
```

Prefer skills over docs for framework guides: skills load when relevant, docs are read in full every session.

## Setup

A template that scaffolds code has a `setup.md`: ordered steps as checkbox headings, each ending in a "Done when" line.

```markdown
# Setup: <template>

## [ ] 1. Scaffold the app

Commands and instructions.

Done when: what must hold before the box is ticked.

## [ ] 9. Link the hosting provider (you)
```

`mem init --template <name>` copies it to `.mem/setup.md`. While that file exists, onboard puts it first and the agent works through it with the user, ticking and committing each step; it deletes the file when every step is done. Mark steps that need the user (accounts, secrets, choices) with `(you)` and put them last. Keep the knowledge in skills and let the steps point to them; a setup is followed once, skills are used for the life of the project. `mem template use` does not run a setup on an existing project.

Skills copied from other projects keep their licence: the skill's frontmatter names the licence and the source commit, and a `LICENSE` file sits beside `SKILL.md` where the licence requires one. Refresh them from the recorded source rather than editing them, and record any local change under `metadata.modified`.
