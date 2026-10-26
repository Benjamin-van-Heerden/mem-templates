---
name: rust-build-performance
description: Build speed and target/ size in Rust projects - the dev profile and why, the iteration loop, cleaning target/, cargo locks and rust-analyzer, reading dependency source at the locked version, moving the toolchain pin, and which faster toolchains were checked and rejected. Use when a build is slow, target/ is large, Cargo.toml profiles or rust-toolchain.toml change, or a dependency's API is unclear.
---

# Rust Build Performance

Rust's compile times and the size of `target/` decide how fast an agent can iterate. The defaults below were measured on 2026-10-26 on an Apple M4 Pro (12 cores, 24 GB) with Rust 1.99.1. The test was a GPUI desktop app: gpui-kit 0.8.1, 796 crates in `Cargo.lock`, split into `app`, `ui` and `core` crates.

## The dev profile

Every workspace `Cargo.toml` keeps:

```toml
[profile.dev]
debug = "line-tables-only"     # file:line in backtraces and panics for our own crates

[profile.dev.package."*"]
debug = false                  # no debug info for dependencies
```

| Same app, same machine | Cargo default dev profile | Profile above |
|---|---|---|
| Cold `cargo build` | 38.3 s | 37.8 s |
| Cold `cargo check --workspace --all-targets` after the build | 23.3 s | 22.1 s |
| `target/` after build and check | 3.7 GB | 2.1 GB |

Measured with the profile above:

| Step | Time |
|---|---|
| `cargo check -q -p <ui crate>` after a one-line edit | 0.3–0.6 s |
| `cargo build` of the app after a one-line edit in the UI crate | 0.8–1.5 s |
| `cargo test -q -p <core crate>` after an edit | 0.7 s |

Dependency debug info is most of `target/` and is almost never needed. Our own crates keep line tables, so panics and backtraces still show `file:line`.

**For a debugger session**, add a profile instead of changing `dev`, and build with `cargo build --profile debugging`:

```toml
[profile.debugging]
inherits = "dev"
debug = "full"

[profile.debugging.package."*"]
debug = "full"
```

Leave the linker, `incremental`, `codegen-units` and `split-debuginfo` at Cargo's defaults:
- On macOS, `split-debuginfo = "packed"` added about 2.9 s to every link, because it runs dsymutil.
- Apple's default linker was as fast as rust-lld (see "Checked and not used").

### Optimising dependencies

A dependency that does heavy work every frame or every request can run unusably slowly in a debug build. Optimise that crate by name:

```toml
[profile.dev.package.taffy]   # GPUI's layout engine
opt-level = 3
```

Never optimise all dependencies (`[profile.dev.package."*"] opt-level = …`). With GPUI that took a cold build from about 50 s to 124 s (`opt-level = 1`) or 152 s (`opt-level = 3`), and saved under a second of incremental time.

## The iteration loop

The project's `cargo-iteration` memory is the short form. Behind it:
- **`cargo check` vs `cargo build`.** `cargo check` stops before code generation and linking, so on a warm crate it is several times faster than `cargo build`. Build only when you need to run the program.
- **`-p <crate>`** limits the command to that crate and its dependencies. A UI edit then never rebuilds unrelated binaries or test targets.
- **`-q`** drops the "Compiling …" lines, which run to hundreds in a large dependency tree, and keeps every diagnostic.
- **`--message-format=short`** gives one line per diagnostic, without rustc's notes and suggestions. Use it to count or locate errors, then rerun without it when the fix isn't obvious.
- **Read diagnostics from the top.** rustc's first errors are usually the cause, and the tail is mostly "could not compile" summaries. Pipe through `head -n 60`, not `tail`.
- **Warnings fail the clippy run before finishing:** `cargo clippy -q -p <crate> --all-targets -- -D warnings`. Never assume a warning or a failing test was already there.

### Long commands

Cold builds, a first `cargo test` and a build after `Cargo.lock` changes can take a minute or more. Agent tools time out: Claude Code's Bash tool after 2 minutes by default, and Codex and Cursor sooner.
- Start such commands in the background, wait for them to finish, then read the output.
- Never start a second cargo command while one is still running in the same checkout.

### Locks

Cargo locks the build directory per checkout, so cargo commands in one checkout run one at a time:
- **"Blocking waiting for file lock on build directory" or "on package cache" means another cargo process is working:** rust-analyzer's check on save, a test run, or another agent. Wait for it. Don't kill it, and don't retry.
- **rust-analyzer shares `target/` by default.** That keeps disk use down, at the cost of occasional waits while it runs `cargo check`. Setting `rust-analyzer.cargo.targetDir` to `true` gives it its own directory with no waits, but doubles disk use and dependency compilation. The template keeps the default.
- **Subagents must not run cargo in parallel in one checkout.**

## Keeping target/ small

**What fills it:**
- dependency debug info (removed by the profile);
- artifacts of dependency versions that `Cargo.lock` no longer uses;
- the extra artifacts of `--release`, `--all-features`, other profiles and test targets;
- incremental-compilation sessions.

Cargo never removes any of it: `cargo clean gc` and Cargo's automatic GC only cover `~/.cargo`.

**The onboard check.** The `rust-checks` runnable prints `target/`'s size at every `mem onboard` and warns above 10 GB. On that warning:
1. Run `cargo clean` before starting other work, while no cargo command is running.
2. Start the next build in the background. It's a cold build: about 40 s for the reference app, more for larger ones.

Also clean after moving the toolchain pin, since nothing built by the old compiler is reused. Don't clean for any other reason: it throws away every incremental and dependency artifact.

**Worktrees.** Each Git worktree has its own `target/`, so a new worktree starts with a cold build and a full-size copy. Prefer working in the main checkout. Never share a `CARGO_TARGET_DIR` between checkouts: binaries of the same name overwrite each other, and tests can run another checkout's build.

## Reading a dependency at the locked version

Training data lags behind fast-moving crates. Read the source of the exact version in `Cargo.lock`, not docs.rs or memory:

```sh
cargo metadata --format-version 1 --offline | jq -r '.packages[] | select(.name == "<crate>") | .manifest_path'
```

- Registry crates live in `~/.cargo/registry/src/index.crates.io-*/<crate>-<version>/`; git dependencies in `~/.cargo/git/checkouts/<name>-<hash>/<rev>/`.
- Grep `src/` for the item, and read `examples/` and the crate's tests for usage.
- `cargo doc` produces HTML, which is slow to read. Rustdoc JSON still needs nightly as of 1.99.

## Moving the toolchain pin

`rust-toolchain.toml` pins the exact compiler, for example `channel = "1.99.1"`. rustup installs it on the first cargo command. To move the pin:
1. Change `channel` and `components`.
2. `cargo clean`.
3. Run the first build in the background.
4. Run the clippy and test loop over every crate, since new lints and deprecations appear.
5. Commit `rust-toolchain.toml` with any fixes.

Rust 1.100, due on 2026-11-12, garbage-collects old incremental sessions: 27–31% smaller `target/` in its PR's measurements (rust#162240). It also makes rust-lld work with Xcode 27's SDK. Moving to it is worthwhile.

## Checked and not used (2026-10-26)

Recheck these when a project's builds become a bottleneck. The landscape is moving fast.

| Option | Why not |
|---|---|
| rust-lld or another linker on macOS | rust-lld from 1.99 cannot link against the Xcode 27 SDK (`arm64e.x1-macos`), and with an older SDK it was no faster than Apple's ld |
| Cranelift backend | Nightly only. It fails on `pathfinder_simd` (a GPUI dependency) on arm64 and has no unwinding on macOS |
| Parallel front end (`-Zthreads`) | Nightly only |
| sccache | Doesn't cache incremental, binary or proc-macro crates, so it helps little in a local edit loop |
| Shared `build.build-dir` or `CARGO_TARGET_DIR` | Worktrees are rare here. Sharing serialises builds across checkouts, and `cargo clean` in one checkout wipes the shared cache |
| blaze (formerly ra-jit), rustd, Relax, Lust, the Astral/OpenAI rustc fork | Experimental compilers that skip or replace parts of rustc. Their problems: borrow checking that misses errors (blaze, rustd), exact toolchain pins (1.99.0), several times cargo's memory, no macOS support (Lust), or not public yet (Relax on a branch; the fork unreleased) |

Faster compilers are expected soon. When one is adopted, the `cargo-iteration` memory is the one place that names the iteration command.
