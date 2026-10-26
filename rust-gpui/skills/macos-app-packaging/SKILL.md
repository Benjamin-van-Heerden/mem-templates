---
name: macos-app-packaging
description: Turning a GPUI app into a distributable macOS .app - the bundle script, Info.plist and icon, signing with the hardened runtime, notarization and stapling, DMGs, and choosing an update mechanism. Use when building a release, changing the app's name, bundle id or icon, or preparing distribution outside the App Store.
---

# macOS App Packaging

`cargo build --release` produces an executable, not an app. Finder, the Dock, notifications and Gatekeeper need a `.app` bundle with an `Info.plist`. Distribution to other Macs also needs a Developer ID signature and Apple's notarization.

GPUI has no packaging tooling of its own. This skill follows gpui-kit's packaging guide (https://gpui-kit.com/docs/packaging) and Zed's own release scripts. It was verified on 2026-10-26 up to an ad hoc signed bundle that launches.

## Bundle

```sh
sh .agents/skills/macos-app-packaging/scripts/bundle-macos.sh <binary crate> "<App Name>" <bundle id> [icon.png]
```

The script:
1. Builds `cargo build --release --locked -p <crate>`. Run it in the background. A cold release build of the template's starter app took 62 s on an M4 Pro, and larger apps take longer. Release artifacts live in `target/release`, about 1.5 GB for the starter.
2. Creates `dist/<App Name>.app` with `Contents/MacOS/<binary>`.
3. Turns a square PNG (1024×1024 recommended) into `AppIcon.icns` with `sips` and `iconutil`.
4. Writes `Info.plist` with:
   - the name and bundle id;
   - the crate's version as `CFBundleShortVersionString` and `CFBundleVersion`;
   - `LSMinimumSystemVersion` 11.0;
   - `NSHighResolutionCapable`.
5. Signs:
   - with `SIGN_IDENTITY` set: with that identity and the hardened runtime;
   - otherwise ad hoc (`codesign --sign -`), which is enough to run on this Mac only.

Then check it with `open "dist/<App Name>.app"`.

Rules:
- **Pick the bundle id once** (`com.yourcompany.appname`). It is the app's identity for macOS settings, notifications, keychain items and upgrades. Changing it makes a second app.
- **Bump the version in the binary crate's `Cargo.toml` for every release.** The script copies it into both version keys.
- **The app's data and settings live outside the bundle** (`dirs::config_dir()`, `dirs::data_dir()`). The bundle is replaced on every update.
- **Files the app reads at runtime must be inside the bundle**, under `Contents/Resources`, located from the executable's path. Never assume the working directory. Prefer embedding assets and fonts in the binary (`include_bytes!` or an `AssetSource`), so there is nothing to locate.
- **`dist/` is a build output:** add it to `.gitignore`.

## Sign, notarize, staple (needs the user)

Distribution outside the App Store needs an Apple Developer account, a **Developer ID Application** certificate in the keychain, and a notarytool profile. Only the user can set those up:

```sh
xcrun notarytool store-credentials "notary-profile" --apple-id <apple id> --team-id <team id>
```

That prompts for an app-specific password. Then:

```sh
SIGN_IDENTITY="Developer ID Application: <Name> (<TEAMID>)" sh .agents/skills/macos-app-packaging/scripts/bundle-macos.sh <crate> "<App Name>" <bundle id> assets/app-icon.png
mkdir -p dist/dmg && rm -rf "dist/dmg/<App Name>.app" && cp -R "dist/<App Name>.app" dist/dmg/ && ln -sf /Applications dist/dmg/Applications
hdiutil create -volname "<App Name>" -srcfolder dist/dmg -ov -format UDZO "dist/<App Name>.dmg"
codesign --force --timestamp --sign "$SIGN_IDENTITY" "dist/<App Name>.dmg"
xcrun notarytool submit "dist/<App Name>.dmg" --keychain-profile "notary-profile" --wait
xcrun stapler staple "dist/<App Name>.dmg"
xcrun stapler validate "dist/<App Name>.dmg"
```

- **Success means `notarytool` reports `status: Accepted`.** `--wait` returning isn't enough. If it's rejected, read the log: `xcrun notarytool log <submission id> --keychain-profile notary-profile`.
- **Sign nested code from the inside out:** helper binaries and frameworks first, then the app. Don't rely on `codesign --deep` for signing. Zed signs each helper binary in `Contents/MacOS`, then the app with its entitlements.
- **Entitlements are only for what the app needs.** A plain GPUI app needs none. Add an entitlements plist (`codesign --entitlements app.entitlements …`) only for features that require one: associated domains, the camera or microphone in a sandbox, and so on.
- **The `/Applications` symlink in the DMG** gives users the usual drag-to-install view, as Zed's DMG does.
- **Final check:** download the published DMG on a clean Mac (or another user account), open it, drag the app to Applications, and launch it. Gatekeeper must not warn.

## Architectures

The bundle contains whatever `cargo build --release` produced: arm64 on Apple Silicon. Intel Macs need an `x86_64-apple-darwin` build, either as a separate download or combined into a universal binary:

```sh
rustup target add x86_64-apple-darwin
cargo build --release --locked -p <crate> --target x86_64-apple-darwin
cargo build --release --locked -p <crate> --target aarch64-apple-darwin
lipo -create -output <binary> target/x86_64-apple-darwin/release/<binary> target/aarch64-apple-darwin/release/<binary>
```

Copy the result into `Contents/MacOS` before signing. Ask the user whether Intel Macs matter before doubling the release build time.

## Updates

GPUI and gpui-kit provide no updater. The rule from gpui-kit's guide: **replace and verify the whole signed `.app`**, never only the binary inside it, because changing `Contents/MacOS/<binary>` breaks the bundle's signature.

The options, from simplest:
1. **A "new version available" check.** The app fetches a small JSON (version, notes, DMG URL) from the release host, shows it in the UI, and opens the download page. The user installs the new DMG. This needs no installer code and no extra signing.
2. **A bundle-aware updater**, typically Sparkle (the standard macOS updater framework): it downloads, verifies the EdDSA signature and replaces the app. It's an Objective-C framework embedded in the bundle, so it needs bundling and signing work. Decide with the user before adopting it.
3. **`self_update`** replaces a single executable. It suits a portable CLI-style binary, **not** a signed `.app`.

Run update checks on the background executor, keep the UI responsive, and show the phases (checking, available, downloading, ready to restart, failed) as state in an entity. The `gpui` skill's `async-and-tasks` reference covers the mechanics.
