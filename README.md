# mem-templates

Project templates for [mem](https://github.com/Benjamin-van-Heerden/mem). Each template supplies memories, skills and docs for a kind of project; mem draws them into a project and keeps them in sync at every onboard.

| Template | For |
| --- | --- |
| `nextjs-web` | Next.js App Router web application |
| `tanstack-start` | TanStack Start with Drizzle, React Query and TanStack Form |
| `python` | Python project managed with uv |
| `rust` | Rust crate or workspace |
| `phoenix` | Elixir and Phoenix web application |

## Use

```sh
mem init --template nextjs-web --template-source https://github.com/Benjamin-van-Heerden/mem-templates.git
mem template use python          # add a template to an existing project
mem template list                # templates here, and the state of a project's items
```

Put `template_source = "https://github.com/Benjamin-van-Heerden/mem-templates.git"` in `~/.config/mem/config.toml` to leave out `--template-source`.

A project sends improvements back with `mem template promote <memory|skill|doc> <name>`; every project that uses the template receives them at its next `mem onboard`.

## Layout

```text
<template>/template.toml         description = "…"
<template>/memories/<name>.md    a project convention, added to AGENTS.md
<template>/skills/<name>/        SKILL.md and supporting files, installed in .agents/skills/<name>/
<template>/docs/<name>.md        a project doc, installed in .mem/docs/ and printed at every onboard
```

Prefer skills over docs for framework guides: skills load when relevant, docs are read in full every session.
