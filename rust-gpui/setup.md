# Setup: rust-gpui

Turns this repository into a GPUI desktop app built on gpui-kit:
- a workspace of a thin `app` binary, a `ui` crate (the only one using GPUI) and a GPUI-free `core` crate;
- Rust pinned to 1.99.1;
- a dev profile that keeps `target/` small;
- a behaviour test and headless screenshot tests.

The verified starter files are in `.agents/skills/gpui-setup/files/`. The `gpui-setup`, `gpui` and `rust-build-performance` skills explain each part.

Run commands from the repository root. Steps marked **(you)** need the user: ask for what the step names, then continue. Tick a step's box when its "Done when" holds, and commit. Builds take a minute or more when cold: run them in the background and wait for them, as the `cargo-iteration` memory says.

## [ ] 1. Check the toolchain

```sh
rustup --version
xcode-select -p
```

- **rustup** is required. If it's missing, ask the user to install it from https://rustup.rs. `rust-toolchain.toml` (step 2) then makes rustup download Rust 1.99.1 on the first cargo command.
- **Xcode or its Command Line Tools** provide the macOS SDK and linker. If `xcode-select -p` fails, ask the user to run `xcode-select --install`.
- **No Metal toolchain download is needed:** gpui-kit compiles GPUI's shaders at runtime (`runtime_shaders`).

Done when: both commands succeed.

## [ ] 2. Copy the starter files and name the crates

The crates are named after the repository: `<name>` (the binary), `<name>-ui` and `<name>-core`. The menu shows the name in title case until step 7 sets the real one.

```sh
cp -R .agents/skills/gpui-setup/files/. .
name=$(basename "$PWD" | tr '[:upper:]_ ' '[:lower:]--')
snake=$(printf '%s' "$name" | tr - _)
display=$(printf '%s' "$name" | tr - ' ' | awk '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2) } 1')
grep -rl --include='*.rs' --include='*.toml' -e myapp -e MyApp Cargo.toml crates | while read -r file; do
  sed -i.bak -e "s/myapp_/${snake}_/g" -e "s/actions!(myapp,/actions!(${snake},/" -e "s/myapp/${name}/g" -e "s/MyApp/${display}/g" "$file" && rm "$file.bak"
done
printf '/target\n/dist\n' >> .gitignore
grep -rn -e myapp -e MyApp Cargo.toml crates || echo "renamed"
```

If `.gitignore` already listed `/target`, remove the duplicate line.

Done when: `grep` reports `renamed`, and `Cargo.toml`, `rust-toolchain.toml` and `crates/{app,ui,core}` exist, with `.gitignore` ignoring `/target` and `/dist`.

## [ ] 3. First build

```sh
cargo build -q 2>&1 | head -n 40
du -sh target
```

- Run the build in the background. It's cold, about 35 s on an M4 Pro, plus a toolchain download on first use.
- It must finish without errors or warnings.
- Note the time and the size of `target/` in the commit message.

Done when: `cargo build` succeeds and `target/debug/<name>` exists.

## [ ] 4. Tests, screenshots and lints

```sh
cargo test -q --workspace 2>&1 | tail -n 30
cargo clippy -q --workspace --all-targets -- -D warnings
```

- The first test build compiles GPUI's `test-support` variant: about 25 s more.
- The screenshot test prints the paths of `target/screenshots/main_view_light.png` and `main_view_dark.png`. Open both images and check that each shows "Clicked 0 times" and an Increment button on a light and a dark background.

Done when: all tests pass, clippy reports nothing, and both screenshots show the view.

## [ ] 5. Onboard checks

```sh
.mem/runnables/rust-checks
.mem/runnables/gpui-checks
```

Done when: both print a single status line without ⚠️ (target/ under the limit, dev profile and toolchain in place, one gpui-pre matching the gpui skill).

## [ ] 6. Run the app

```sh
cargo run
```

Run it in the background. A window opens with the counter: clicking Increment counts, and cmd-q quits. Ask the user to confirm the window looks and behaves right, since this is the one check a screenshot can't make: real window chrome, the menu bar, focus. Then stop the process if the user didn't quit it.

Done when: the user has seen the window, and the app quit through cmd-q or the menu.

## [ ] 7. App identity (you)

Ask the user for:
- **the app's display name**, shown in the menu bar and Finder;
- **the bundle identifier**, `com.<company>.<app>`. It is permanent: changing it later makes a different app for macOS;
- **an app icon**, a square PNG of at least 1024×1024. Save it as `assets/app-icon.png`. If there's none yet, skip it and note that in the README.

Then:
1. Put the display name in the `Menu::new(...)` and `MenuItem::action("Quit …")` labels in `crates/ui/src/lib.rs`.
2. Build a bundle in the background, to check that the identity works:
   ```sh
   sh .agents/skills/macos-app-packaging/scripts/bundle-macos.sh <name> "<Display Name>" <bundle id> assets/app-icon.png
   ```
   Open `dist/<Display Name>.app` with the user.
3. Add a short "Release" section to the README with that bundle command and the bundle identifier.

Done when: the user confirmed the name, bundle id and icon, the bundle opened, and the README records the bundle command.

## [ ] 8. Hot reload (you, optional)

Ask whether the user wants hot reload while iterating on UI. It needs dioxus-cli 0.7.10 installed for their account (`cargo binstall dioxus-cli@0.7.10`), and it's experimental with these GPUI snapshots. If yes, follow the `gpui-hot-reload` skill: install, run `dx serve --hot-patch`, change a string in `MainView::render`, and check that the window updates without a restart. Record the result in that skill's status section.

Done when: the user declined, or a render edit was patched into the running app (or the failure is recorded in the skill).
