---
name: gpui-hot-reload
description: Hot-patching GPUI render code while the app runs, with GPUI's hot-reload feature and Dioxus's dx tool (Subsecond) - setup, how to run it, what it costs in build time and disk, and the changes that crash a patched app. Use when iterating on UI layout or styling and rebuilding and restarting the app is the slow part.
---

# GPUI Hot Reload

GPUI can apply code patches to a running app: edit a view's `render`, save, and the window redraws with the new code while the app keeps its state. It uses Dioxus's Subsecond hot-patching and was added to GPUI on 2026-10-17 (zed-industries/zed#65738).

**Verified on 2026-10-26** with the template's starter app, gpui-pre 0.3.10, dioxus-cli 0.7.10 and macOS 27 on an M4 Pro:
- An edit to a string in `MainView::render` was patched 317–385 ms after saving.
- GPUI logged "GPUI hot reload applied", and the app kept running in the same process.

## How it works

- **The feature.** gpui-pre's `hot-reload` feature compiles in a client for the `dx` development server. GPUI's `build.rs` turns it on only in debug builds (`debug_assertions`), on macOS, Linux, Windows and iOS, so it can't ship in a release.
- **Connecting.** At startup `Application::run` connects to the server that `dx serve --hot-patch` started and logs "GPUI hot reload connected". Without a server, it logs "GPUI hot reload is enabled, but no dx development server was found" and the app runs normally.
- **Patching.** On save, `dx` recompiles the changed code and sends a patch. GPUI applies it between frames and refreshes every window.

## Setup

gpui-kit doesn't expose the feature, so the binary crate turns it on for the same `gpui-pre` crate. The starter files already do this:

```toml
# crates/app/Cargo.toml
[features]
# Subsecond hot-patching of render code; run with `dx serve --hot-patch`.
hot-reload = ["dep:gpui-hot-reload"]

[dependencies]
# Same crate gpui-kit uses; only here to switch on its hot-reload feature.
gpui-hot-reload = { package = "gpui-pre", version = "=0.3.10", features = ["hot-reload"], optional = true }
```

- **Versions.** The version must equal gpui-kit's `gpui-pre` pin, or Cargo builds a second GPUI (the `gpui-checks` runnable warns).
- **The `dx` tool** must match GPUI's Subsecond version: 0.7.10 for gpui-pre 0.3.10. It installs a program for the user's account, so ask the user first:

  ```sh
  cargo binstall -y dioxus-cli@0.7.10   # a prebuilt binary in seconds; or: cargo install dioxus-cli --version 0.7.10 --locked
  ```
- **Seeing GPUI's messages** ("connected", "applied", "requires a full application restart") needs a logger in `main`, such as `env_logger` or `tracing-subscriber` with its `log` bridge. `dx` shows the app's output, labelled `ERROR` because it comes from stderr.

## Use

From the workspace root, in the background:

```sh
dx serve --hot-patch --desktop --interactive false --package <binary crate> --features hot-reload
```

It builds, launches the app and watches the source.

**Cost.** `dx` builds with its own target triple and profile, into `target/aarch64-apple-darwin/` and `target/desktop-dev/`, separate from `target/debug/`:
- The starter's first `dx` build took 71 s and added 2.5 GB to `target/`. Later starts take about 5 s.
- Use hot reload for a stretch of UI work, not for every change.
- When `rust-checks` reports `target/` over its limit, `cargo clean` removes these directories too.

**What a patch can change:**
- **Safe:** function bodies, notably `render` of views and `RenderOnce` components and the code they call. Examples: text, styles, layout, which children are shown.
- **Crashes the app** — stop `dx` and start it again instead:
  - **Adding, removing or reordering fields of a struct** that already has live instances, such as a view's fields. Verified: `dx` patched the change, GPUI reported it applied, then the app aborted with a panic in gpui-pre's `view.rs:185` while downcasting the old view. Neither tool detects this.
  - Changes to types held in entities or globals.
- **Needs a restart, not a patch:**
  - `Cargo.toml` and dependency changes;
  - startup code and constructors, which already ran;
  - custom `Element` phases (`request_layout`, `prepaint`, `paint`), which GPUI doesn't patch yet.

Hot reload shortens the visual loop; it doesn't replace the checks. Before finishing, the `cargo-iteration` loop (check, clippy, tests) still runs, and so does a headless screenshot test for the changed views (the `gpui-verify-ui` memory).

## When it doesn't work

- **"No dx development server was found":** the app was started directly. Start it through `dx serve --hot-patch`.
- **No "connected" line:** check that the `hot-reload` feature was passed (`--features hot-reload`) and that the build is a debug build.
- **Patches fail to apply:** compare `cargo tree -i subsecond` with `dx --version`. Both must be 0.7.10 for gpui-pre 0.3.10. When the GPUI pin moves, check gpui-pre's `Cargo.toml` for the new Subsecond version and update the install command here.
