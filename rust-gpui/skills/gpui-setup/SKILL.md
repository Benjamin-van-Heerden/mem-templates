---
name: gpui-setup
description: The rust-gpui template's verified starter workspace (app, ui and core crates, gpui-kit startup, quit action and menu, behaviour and headless screenshot tests, hot-reload feature) and how a project grows from it. Use when setting up a new GPUI project, adding a crate, view or feature module, or when unsure where code belongs.
---

# GPUI Project Setup

`files/` holds a starter workspace that was built, tested and linted on 2026-10-26 with Rust 1.99.1, gpui-kit 0.8.1 and gpui-pre 0.3.10. The template's `.mem/setup.md` copies it in and renames `myapp` to the project's name.

## Layout

```text
Cargo.toml              workspace: members, default-members = app, exact gpui-kit pin, lints, dev profile
rust-toolchain.toml     Rust 1.99.1 with clippy, rustfmt, rust-src
crates/
  app/                  the binary, process concerns only
    src/main.rs         application().with_assets().with_quit_mode().run(): kit init, ui init, main window
    Cargo.toml          also the optional `hot-reload` feature (gpui-hot-reload skill)
  ui/                   everything GPUI: the only crate that depends on gpui-kit
    src/lib.rs          init (actions, key bindings, menus), open_main_window
    src/main_view.rs    the root view: focus handle, theme colours, a gpui-kit Button
    tests/main_view.rs  #[gpui_kit::test] behaviour test: real clicks on an offscreen window
    tests/screenshots.rs  harness = false: renders views headlessly into target/screenshots/*.png, as stills
                        (light, dark) and as a workflow (increment_flow: click twice, capture each step)
  core/                 domain logic, no GPUI: builds and tests in seconds
```

Why it looks like this:
- **`core` without GPUI** means domain work and its tests never compile the UI framework: `cargo test -q -p <name>-core` takes under a second warm.
- **A thin `app`** rarely changes, so UI edits relink the binary without recompiling startup code.
- **`ui` owns every GPUI type.** Other crates don't depend on gpui-kit, which keeps one GPUI version and one place where GPUI idioms live.
- **`default-members = ["crates/app"]`** makes a bare `cargo build` build the app and nothing else.
- **Tests:**
  - The behaviour test runs under libtest like any test.
  - The screenshot target needs the process's main thread (AppKit), hence `harness = false` and its own `main`.
  - Both use gpui-kit's `test-support` feature, which is a dev-dependency only. The first test build compiles GPUI a second time with it: about 20 s and 0.5 GB of `target/`.

## Measured on the starter (M4 Pro, 2026-10-26)

| Step | Time |
|---|---|
| Cold `cargo build` | 35 s |
| Cold `cargo test --workspace`, including both screenshots | 24 s |
| `cargo check -q -p <name>-ui` after a one-line edit | 0.3–0.6 s |
| `cargo build` after a one-line edit in ui | 0.8–1.5 s |

`target/` holds 2.7 GB after build, test and clippy. The `rust-checks` runnable warns above 10 GB.

## Growing the app

- **A new view or component** goes in `crates/ui/src/<feature>/`: a module per feature holding its views, its entity state and its actions. Follow the `gpui` and `gpui-kit` skills, and read the `gpui-kit-design-guides` skill before designing a screen.
- **A new screen gets a screenshot case** in `crates/ui/tests/screenshots.rs`, in light and dark (the `gpui-verify-ui` memory).
- **A user workflow** (open, click, type, confirm) gets a workflow case there too, modelled on `increment_flow`: act through `TestWindowExt` inside `update_window`, capture each step as `<flow>_<n>_<what>.png`, and assert on the state. The `gpui` skill's `testing` reference explains the API.
- **Domain types, parsing, file formats, storage and network clients** go in `core`, or in a new crate beside it when they compile and test on their own (`crates/<name>-<area>`). Keep GPUI types out of them: convert at the ui boundary (`String` to `SharedString`, domain errors to notifications).
- **App-wide state** lives in an `Entity` held by a `Global`, created in `ui::init` (the `gpui` skill's `app-architecture` reference).
- **New actions** are declared with `actions!(<name>, [...])` in the ui crate and bound in `init`. Action names must be unique in the binary.
- **Assets.** For the app's own icons and fonts, replace `gpui_kit::assets::Assets` in `main.rs` with a composite `AssetSource` that serves the app's files first and falls back to the Kit's (`elements-and-styling` reference).
- **New dependencies** need the user's agreement (the `crate-boundaries` memory). Add them to `[workspace.dependencies]` and use `dep.workspace = true` in the crate.

## Commands

```sh
cargo run                                              # the app (default member)
cargo check -q -p <name>-ui                            # while iterating on UI
cargo test -q -p <name>-ui                             # behaviour tests and screenshots
cargo test -q -p <name>-ui --test screenshots -- flow  # only the cases whose name contains "flow"
cargo clippy -q -p <name>-ui --all-targets -- -D warnings
```
