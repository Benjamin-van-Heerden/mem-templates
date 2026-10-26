---
name: gpui-hot-reload
description: Hot-patching GPUI render code while the app runs, with GPUI's hot-reload feature and Dioxus's dx tool (Subsecond) - setup, how to run it, and what it can't patch. Use when iterating on UI layout or styling and rebuilding and restarting the app is the slow part.
---

# GPUI Hot Reload

GPUI can apply code patches to a running app: edit a view's `render`, save, and the window redraws with the new code while keeping the app's state. It uses Dioxus's Subsecond hot-patching and was added to GPUI on 2026-10-17 (zed-industries/zed#65738).

**Status in this template (2026-10-26):**
- The `hot-reload` feature exists in gpui-pre 0.3.10 (`src/hot_reload.rs`, `build.rs`).
- The starter's app crate builds with it.
- Patching a running app through `dx` has **not been verified yet**. It needs dioxus-cli 0.7.10 installed. Treat it as experimental until someone confirms it on this project, and record the result here.

## How it works

- **The feature.** gpui-pre's `hot-reload` feature compiles in a client for the `dx` development server. GPUI's `build.rs` turns it on only in debug builds (`debug_assertions`), on macOS, Linux, Windows and iOS, so it can't ship in a release.
- **Connecting.** At startup `Application::run` connects to the server that `dx serve --hot-patch` started. Without one, it logs "GPUI hot reload is enabled, but no dx development server was found" and the app runs normally.
- **Patching.** When a source file changes, `dx` recompiles only what changed and sends a patch. GPUI applies it between frames and refreshes all windows. Entity state is kept.

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

- **Versions.** The version must match gpui-kit's `gpui-pre` pin exactly, or Cargo builds a second GPUI. Check that `cargo tree -i gpui-pre` shows one copy.
- **Build cost.** Enabling the feature adds the dioxus devtools crates: about 20 s to the first build, and about 0.6 GB to `target/` for the starter app, because GPUI is compiled again with the feature.

The `dx` tool must match GPUI's Subsecond version (0.7.10 for gpui-pre 0.3.10):

```sh
cargo binstall dioxus-cli@0.7.10   # or: cargo install dioxus-cli --version 0.7.10 --locked
```

This installs a program for the user's account, so ask the user first.

## Use

From the workspace root:

```sh
dx serve --hot-patch --package <binary crate> --features hot-reload
```

Run it in the background. It builds, launches the app, and watches the source.

What a patch covers:
- **Patched:** function bodies, notably `render` of views and `RenderOnce` components, and the code they call.
- **Not patched** (needs a restart, which `dx` reports as a full reload):
  - changes to a struct's fields or layout;
  - new dependencies or `Cargo.toml` changes;
  - custom `Element` phases (`request_layout`, `prepaint`, `paint`);
  - code that already ran: startup and constructors.
  - Restart the app for these.

Hot reload shortens the visual loop; it doesn't replace it. Before finishing, the `cargo-iteration` loop (check, clippy, tests) still runs, and so does a headless screenshot test for the changed views.

## When it doesn't work

- **"No dx development server was found":** the app was started directly. Start it through `dx serve --hot-patch`.
- **Patches fail to apply, or `dx` and GPUI disagree about the protocol:** check the Subsecond versions with `cargo tree -i subsecond` and `dx --version`. They must match.
- **`dx` fails on the package rename** (`gpui-pre` used as `gpui`): this is unverified with the snapshot crates. Record what happened here. The fallback is the normal loop: `cargo build` takes about 1 s incrementally for the starter app, plus a restart.
