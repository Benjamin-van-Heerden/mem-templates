# Testing GPUI apps (gpui-pre 0.3.10 via gpui-kit 0.8.1)

Roots: `GP` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10`, `GK` = `.../gpui-kit-0.8.1`, `GPL` = `.../gpui-pre-platform-0.3.10`, `GM` = `.../gpui-pre-macros-0.3.10`, `GA` = `.../gpui-pre-apple-0.3.10`. Zed reference: `zed/crates/gpui/examples/testing.rs` (Apache-2.0), `zed/crates/zed/src/visual_test_runner.rs` (GPL, patterns only).

## 0. Dependencies and imports

The app depends on `gpui-kit` alone. Tests need its `test-support` feature, which turns on `gpui/test-support`, `gpui_platform/test-support`, `gpui-base/test-support` and `gpui-component?/test-support` (`GK/Cargo.toml` `[features] test-support`). In `gpui-pre` everything test-related is gated `#[cfg(any(test, feature = "test-support"))]`: `TestAppContext`, `VisualTestContext`, `HeadlessAppContext`, `run_test`, `Window::render_to_image`, executor `advance_clock`/`run_until_parked` (`GP/src/app.rs:32-41,68-75`, `GP/src/gpui.rs:65-74,223`, `GP/src/executor.rs:191-271`). So yes, `test-support` is required.

```toml
[dependencies]
gpui-kit = "0.8.1"
[dev-dependencies]
gpui-kit = { version = "0.8.1", features = ["test-support"] }   # same version: features unify for test builds only
```

Imports in test files: **do not glob-import** `use gpui_kit::*;` there. With test-support the glob also brings GPUI's `test` attribute macro, which shadows/conflicts with Rust's `#[test]` (`GK/src/lib.rs:98-99`). Import names explicitly and spell the attribute `#[gpui_kit::test]`. App code keeps `use gpui_kit::*;`. `gpui_kit::component::*` paths are fine.

## 1. `#[gpui_kit::test]` (= GPUI's `#[gpui::test]`, `GM/src/gpui_macros.rs:211-253`, `GM/src/test.rs`)

It re-exports `gpui_macros::test` (`GP/src/gpui.rs:118`); gpui-pre's macros rewrite emitted `gpui::` paths to the `gpui-kit` crate found in your manifest (`GM/src/gpui_pre_facade_paths.rs`, via `proc_macro_crate`), so no `gpui` dependency is needed. Expansion: a plain `#[test] fn name()` calling `gpui::run_test(iterations, &[seeds], retries, |dispatcher, seed| ..., on_failure)` (`GP/src/test.rs:95`). Each `&mut TestAppContext` parameter gets its own `TestAppContext::build(dispatcher.clone(), Some("name"))`; teardown runs `run_until_parked`, `quit`, then drains tasks.

Accepted parameters: `&mut TestAppContext` (any number: one app each), `&mut App` (sync only), `StdRng` (seeded; the expansion calls `rand::SeedableRng`, so add `rand` as a dev-dependency), `BackgroundExecutor` (async only). Any other parameter is a compile error ("invalid function signature").

Options: `iterations = N` (seeds `0..N`), `seed = N`, `seeds(a, b, ..)`, `retries = N`, `on_failure = "path::to::fn"`. Env: `SEED=n` runs `n..n+iterations` and ignores explicit seeds; `ITERATIONS=n` overrides `iterations` (`GP/src/seeds.rs:15-45`). On multi-seed failure it prints `failing seed: n`.

Async tests (`async fn`) run on a single-threaded deterministic executor: spawned work does not run until you await or call `run_until_parked()`.

## 2. `TestAppContext` (`GP/src/app/test_context.rs`)

| Line | API |
|---|---|
| 271 / 277 | `update<R>(&self, f: impl FnOnce(&mut App) -> R) -> R`, `read<R>(&self, f: impl FnOnce(&App) -> R) -> R` |
| AppContext | `cx.new(|cx| ..)`, `entity.update(cx, |v, cx| ..)`, `entity.read_with(cx, |v, cx| ..)` (no `entity.read(cx)` on TestAppContext), `cx.update_window(any_handle, |root, window, cx| ..) -> Result<R>` |
| 284 | `add_window<F, V>(&mut self, build: F) -> WindowHandle<V>`, `F: FnOnce(&mut Window, &mut Context<V>) -> V`; maximized test-display bounds |
| 307 | `open_window(&mut self, window_size: Size<Pixels>, build) -> WindowHandle<V>`; explicit size |
| 352 | `add_window_view(&mut self, build) -> (Entity<V>, &mut VisualTestContext)`; shadow: `let (view, cx) = cx.add_window_view(..)` |
| 331 | `add_empty_window(&mut self) -> &mut VisualTestContext` |
| 600 | `run_until_parked(&self)` |
| 605 | `dispatch_action<A: Action>(&mut self, window: AnyWindowHandle, action: A)` (to focused node, then parks) |
| 622 | `simulate_keystrokes(&mut self, window: AnyWindowHandle, "cmd-shift-p b enter")` (space-separated) |
| 639 | `simulate_input(&mut self, window: AnyWindowHandle, "abc")` (one keystroke per char) |
| 261 | `executor(&self) -> BackgroundExecutor` |
| 466/521 | `simulate_window_resize(handle, size)`, `simulate_window_scale_factor_change(handle, f32)` |
| 386/392/435 | `write_to_clipboard`, `read_from_clipboard`, `opened_url()` |
| 676/696 | `notifications(&entity)`, `events(&entity)` streams; `Entity::next_event`, `next_notification`, `condition` (:755-805) |

`VisualTestContext` (`test_context.rs:868`) derefs to `TestAppContext` and binds one window: `VisualTestContext::from_window(handle.into(), cx)` (:887), `update(|window, cx| ..)` (:878), `dispatch_action(action)` (:900), `simulate_keystrokes(&str)` (:924), `simulate_input(&str)` (:930), `simulate_mouse_move(pos, button, modifiers)`, `simulate_mouse_down/up(pos, MouseButton, Modifiers)`, `simulate_click(pos: Point<Pixels>, modifiers: Modifiers)` (:980), `simulate_modifiers_change`, `simulate_resize(size)`, `simulate_event(E: InputEvent)`, `debug_bounds("selector")` (needs `.debug_selector(..)` and debug_assertions), `draw(origin, space, |window, cx| element)` to lay out a bare element. Mouse simulation needs a drawn frame first.

Executor (`GP/src/executor.rs`): `timer(Duration) -> Task<()>` (:183), `advance_clock(Duration)` (:198, makes timers ready, runs nothing), `tick()`, `run_until_parked()` (:215; **also advances the clock to the next pending timer** when nothing is runnable), `allow_parking()`/`forbid_parking()` (:222; needed to await real threads/IO, otherwise the test panics when parked), `simulate_random_delay()`, `rng()`.

### Timers: executor vs `smol::Timer`
Use `cx.executor().timer(d).await` (or `cx.background_executor().timer(d)` from `App`) in code you test. A `smol::Timer::after` is invisible to the test scheduler: `advance_clock`/`run_until_parked` can't fire it, and the test either parks ("nothing left to run") or needs `allow_parking` and real waiting. Zed's agent rules say the same. GPUI animations driven by wall time are not advanced by the test clock (`GK/TESTING.md`).

### Example: kit UI test (`GK/tests/ui.rs` is the compiled reference)
```rust
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::test::{TestAppContextExt, TestWindowExt};
use gpui_kit::{
    AppContext, Bounds, Context, Entity, IntoElement, ParentElement, Point, Render, SharedString, Styled, Subscription,
    TestAppContext, Window, WindowBounds, WindowOptions, div, px, size,
};

// The view under test; in an app it lives in the ui crate, not in the test.
struct NameForm {
    name: Entity<InputState>,
    saved: SharedString,
    _subscriptions: Vec<Subscription>,
}

impl NameForm {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let name = cx.new(|cx| InputState::new(window, cx).placeholder("Your name"));
        let subscription = cx.subscribe_in(&name, window, |this, state, event: &InputEvent, _, cx| {
            if let InputEvent::PressEnter { .. } = event {
                this.saved = state.read(cx).value();
                cx.notify();
            }
        });
        Self { name, saved: SharedString::default(), _subscriptions: vec![subscription] }
    }
}

impl Render for NameForm {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().p_4().child(Input::new(&self.name).id("name").w(px(240.)))
    }
}

#[gpui_kit::test]
async fn typing_updates_the_model(cx: &mut TestAppContext) {
    cx.update(gpui_kit::init);
    let (handle, form) = cx.update(|cx| {
        let opts = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds { origin: Point::default(), size: size(px(480.), px(320.)) })),
            ..Default::default()
        };
        gpui_kit::open_window(opts, cx, |window, cx| cx.new(|cx| NameForm::new(window, cx))).unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);              // needed before the first query
        window.click("name", cx);             // real hit testing on ElementId "name"
        window.input("Ada", cx);
        window.press("enter", cx);
        assert_eq!(window.find("name").value(), Some("Ada"));
    }).unwrap();
    cx.wait_for(handle, std::time::Duration::from_secs(1), |_, cx| !form.read(cx).saved.is_empty()).await;
}
```
gpui-kit test API (`GK/src/test.rs`): `TestWindowExt` on `Window` (:33): `find/try_find/find_all(id) -> ElementSnapshot`, `within(id)`, `render_frame(cx)` (= `window.refresh(); window.draw(cx).clear(cx)`, :348), `click`, `click_at`, `click_with_options`, `right_click`, `double_click`, `hover`, `scroll`, `drag`, `drag_to`, `press(key)`, `input(text)`. `TestAppContextExt::wait_for(handle, timeout, pred)` (:572, polls every 10 ms of test time). `TestQueryExt` (`find_by_label`, `find_all_by_role`), `TestEventExt` (`pointer_down/move/up`, `key_down/up`, `change_modifiers`), `TestInput` (IME bridge). Snapshots: `.value()`, `.label()`, `.checked()`, `.focused()`, `.bounds()`, `.visible()`, `.role()`; `None` = unreported. Custom elements need `.test_support()` (from `gpui_kit::test::TestSupportExt`) before `.track_focus(..)` to be findable.

## 3. Headless screenshots (the important part)

### What exists in source
- `HeadlessAppContext` (`GP/src/app/headless_app_context.rs:38`, gated test-support, re-exported as `gpui_kit::HeadlessAppContext`). Built on `TestPlatform` + `TestDispatcher` (deterministic; `SEED` env read at :70) with a real text system and an optional real GPU renderer.
  - `with_platform(platform_text_system: Arc<dyn PlatformTextSystem>, asset_source: Arc<dyn AssetSource>, renderer_factory: impl Fn() -> Result<Option<Box<dyn PlatformHeadlessRenderer>>> + 'static) -> Self` (:65). `new(text_system)` / `with_asset_source(..)` pass a factory returning `Ok(None)`, so no screenshots.
  - `open_window<V: Render>(&mut self, size: Size<Pixels>, build_root: impl FnOnce(&mut Window, &mut App) -> Entity<V>) -> Result<WindowHandle<V>>` (:104; `show: false, focus: false`, no kit `Root`).
  - `update(&mut self, f: impl FnOnce(&mut App) -> R) -> R` (:149), `update_window(&mut self, AnyWindowHandle, f: impl FnOnce(AnyView, &mut Window, &mut App) -> R) -> Result<R>` (:155), `run_until_parked`, `advance_clock`, `allow_parking`, `text_system()`.
  - `capture_screenshot(&mut self, window: AnyWindowHandle) -> Result<image::RgbaImage>` (:168) = `window.render_to_image()` (`GP/src/window.rs:2888`): rasterizes the **last drawn frame's** scene; it does not draw. Also `window.painted_quads()` for pixel-free assertions.
- `RgbaImage` is `image` 0.25's `ImageBuffer<Rgba<u8>, Vec<u8>>`; gpui-pre builds `image` with `png` enabled (`GP/Cargo.toml` `[dependencies.image]`), so `img.save("x.png")` works without your own `image` dependency (gpui-kit's own test does exactly this, `GK/tests/rendering.rs:504`). Add `image = "0.25"` only to load/compare baselines.
- Renderer: `gpui_platform::current_headless_renderer()` (`GPL/src/gpui_platform.rs:116`, gated `test-support`/`bench-support`), reachable as `gpui_kit::platform::current_headless_renderer`. macOS: `MetalHeadlessRenderer` (offscreen BGRA texture, swizzled to RGBA, `GA/src/metal_renderer.rs:1696,1362`); Linux: `WgpuHeadlessRenderer` (lavapipe works); Windows and others: `Ok(None)` (capture then errors "no HeadlessRenderer configured").
- Text system: `gpui_kit::platform::current_platform(true).text_system()`. On macOS this constructs `MacPlatform`, which **panics unless on the main thread** (`gpui-pre-macos-0.3.10/src/platform.rs:217`). gpui-kit enables `font-kit` on the platform crate, so text is real Core Text (without it you'd get `NoopTextSystem`, i.e. no text).
- Device pixels: `TestWindow` scale factor is 2.0 (`GP/src/platform/test/window.rs:132`), so a 400x300 window yields an 800x600 PNG.
- `TestPlatform::window_appearance()` is `Light`; set the theme explicitly (`Theme::change(ThemeMode::Dark, None, cx)`).
- `VisualTestAppContext` (`GP/src/app/visual_test_context.rs`, macOS only) is Zed's alternative: real `MacPlatform` (`current_platform(false)`), off-screen windows at (-10000,-10000), same `capture_screenshot`. Heavier; needs main thread too. Prefer `HeadlessAppContext`.

### Main thread: `harness = false` is required on macOS
libtest runs `#[test]` fns on worker threads (even with `--test-threads=1`), so `current_platform(..)` aborts. gpui-kit's own `rendering` target therefore uses `test = false, harness = false` and a plain `fn main()` that calls each case in turn (`GK/Cargo.toml [[test]] rendering`, `GK/tests/rendering.rs:1-8,1009`); `GK/TESTING.md` states the reason. Do not use `#[gpui_kit::test]` here; it builds a `TestAppContext` without a renderer.

### Feasibility with gpui-kit 0.8.1 alone: yes (macOS Metal, Linux WGPU)
Everything is reachable through the facade: `gpui_kit::HeadlessAppContext`, `gpui_kit::platform::{current_platform, current_headless_renderer}`, `gpui_kit::assets::Assets` (`assets` feature, default), `gpui_kit::test::TestWindowExt` (render_frame), all with `features = ["test-support"]`. gpui-kit's CI runs exactly this on macOS and Linux.

### Recipe (mirrors `GK/tests/rendering.rs`)

`Cargo.toml`:
```toml
[dependencies]
gpui-kit = "0.8.1"

[dev-dependencies]
gpui-kit = { version = "0.8.1", features = ["test-support"] }

[[test]]
name = "screenshots"
path = "tests/screenshots.rs"
harness = false     # run fn main on the process main thread (AppKit requirement)
# test = false      # add to keep it out of plain `cargo test`; then run `cargo test --test screenshots`
```

`tests/screenshots.rs`:
```rust
//! cargo test -q -p <ui crate> --test screenshots [-- <name-filter>]   -> target/screenshots/<name>.png
use gpui_kit::component::{ActiveTheme as _, Theme, ThemeMode};
use gpui_kit::test::TestWindowExt;
use gpui_kit::{
    AnyWindowHandle, App, AppContext, Bounds, Context, Entity, HeadlessAppContext, IntoElement, ParentElement, Point,
    Render, Styled, Window, WindowBounds, WindowOptions, div, px, size,
};
use std::{path::PathBuf, sync::Arc};

// In an app, the views come from the ui crate: `use my_app_ui::MainView;`.
struct Greeting;

impl Render for Greeting {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().size_full().p_4().bg(cx.theme().background).text_color(cx.theme().foreground).child("Hello")
    }
}

fn main() {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let filter = std::env::args().nth(1).filter(|a| !a.starts_with('-'));
        let cases: &[(&str, fn(&mut HeadlessAppContext) -> AnyWindowHandle)] = &[
            ("greeting_light", |cx| open(cx, ThemeMode::Light, (480., 320.), |_, cx| cx.new(|_| Greeting))),
            ("greeting_dark", |cx| open(cx, ThemeMode::Dark, (480., 320.), |_, cx| cx.new(|_| Greeting))),
        ];
        for (name, build) in cases {
            if filter.as_deref().is_some_and(|f| !name.contains(f)) { continue; }
            let mut cx = context();
            let handle = build(&mut cx);
            let path = shoot(&mut cx, handle, name);
            println!("wrote {}", path.display());
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    println!("screenshots: skipped, no headless renderer on this platform");
}

fn context() -> HeadlessAppContext {
    let mut cx = HeadlessAppContext::with_platform(
        gpui_kit::platform::current_platform(true).text_system(),
        Arc::new(gpui_kit::assets::Assets),                 // icons render; Arc::new(()) gives none
        gpui_kit::platform::current_headless_renderer,
    );
    cx.update(gpui_kit::init);
    cx
}

fn open<V: Render>(cx: &mut HeadlessAppContext, mode: ThemeMode, (w, h): (f32, f32),
                   build: impl FnOnce(&mut Window, &mut App) -> Entity<V>) -> AnyWindowHandle {
    cx.update(|cx| Theme::change(mode, None, cx));
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds { origin: Point::default(), size: size(px(w), px(h)) })),
        focus: false,
        show: false,
        ..Default::default()
    };
    // gpui_kit::open_window wraps the view in base::Root like the real app does.
    let (handle, _view) = cx.update(|cx| gpui_kit::open_window(options, cx, build)).expect("open window");
    handle
}

fn shoot(cx: &mut HeadlessAppContext, handle: AnyWindowHandle, name: &str) -> PathBuf {
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| window.render_frame(cx)).unwrap();
    let image = cx.capture_screenshot(handle).expect("offscreen renderer (Metal/WGPU) must be available");
    // <workspace>/target/screenshots, from crates/<ui crate>; adjust the ../.. to the crate's depth.
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/screenshots");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.canonicalize().unwrap().join(format!("{name}.png"));
    image.save(&path).unwrap();
    path
}
```
Verified on 2026-10-26 (macOS 27, M4 Pro): a test like this builds and runs, and writes a PNG at twice the window size (960×640 for 480×320) with real text. The first build of the `test-support` variant of GPUI took 20 s and added 0.5 GB to `target/`. Later runs take about 3 s.

### Workflows: interact, then screenshot each step

The same headless window takes input through gpui-kit's `TestWindowExt`:
- **Pointer:** `click`, `double_click`, `right_click`, `hover`, `drag_to` and `scroll`, with real hit testing on the drawn frame. A click lands on whatever is drawn at the element's position, so an overlay covering a button gets the click.
- **Keyboard:** `input` and `press`.

Interact inside `update_window`, then draw and capture again. A user workflow becomes a sequence of screenshots plus assertions on the state. Verified on 2026-10-26: two clicks on a gpui-kit `Button` counted, and the second PNG showed "Clicked 2 times" with the button in its hover shade, since the pointer stays where it clicked.

```rust
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::test::TestWindowExt as _;
use gpui_kit::{
    AnyWindowHandle, AppContext as _, Bounds, ClickEvent, Context, HeadlessAppContext, IntoElement, ParentElement,
    Render, Styled, Window, WindowBounds, WindowOptions, div, px, size,
};

struct Counter {
    count: u32,
}

impl Render for Counter {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().size_full().p_4().child(format!("Clicked {} times", self.count)).child(
            Button::new("increment").primary().label("Increment").on_click(cx.listener(
                |this, _: &ClickEvent, _, cx| {
                    this.count += 1;
                    cx.notify();
                },
            )),
        )
    }
}

/// One workflow case: `cx` comes from `context()` in the recipe above.
fn increment_flow(cx: &mut HeadlessAppContext, dir: &std::path::Path) {
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds { origin: Default::default(), size: size(px(480.), px(320.)) })),
        focus: false,
        show: false,
        ..Default::default()
    };
    let (window, counter): (AnyWindowHandle, _) = cx
        .update(|cx| gpui_kit::open_window(options, cx, |_, cx| cx.new(|_| Counter { count: 0 })))
        .expect("open the window");

    // Draw before every capture: capture_screenshot reads the last drawn frame.
    cx.update_window(window, |_, window, cx| window.render_frame(cx)).unwrap();
    let start = cx.capture_screenshot(window).unwrap();

    cx.update_window(window, |_, window, cx| {
        window.click("increment", cx);
        window.click("increment", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(window, |_, window, cx| window.render_frame(cx)).unwrap();
    let after = cx.capture_screenshot(window).unwrap();

    start.save(dir.join("increment_flow_1_start.png")).unwrap();
    after.save(dir.join("increment_flow_2_after_two_clicks.png")).unwrap();
    assert_eq!(cx.update(|cx| counter.read(cx).count), 2, "the clicks did not reach the button");
    assert!(start != after, "the window looks the same after the clicks");
}
```

- **Name the steps** `<flow>_<n>_<what>.png`, so the PNGs sort in order. Look at them in order before saying a workflow works.
- **Assert on state,** such as the entity's fields or `window.find(id).value()` and `.checked()`. Pixels alone don't say what is wrong. Compare whole screenshots only for "something changed" or "nothing changed".
- **Naming the image type in a helper** (`fn shoot(..) -> RgbaImage`) needs `image = { version = "0.25", default-features = false }` as a dev-dependency, because gpui doesn't re-export it. That's the same crate GPUI already builds, with PNG support, so it costs nothing extra. The starter does this.
- **Timers and animations** (tooltips, hover delays) advance with `cx.advance_clock(duration)` before the capture. Wall-clock animations don't.

Still unconfirmed:
- `HeadlessAppContext::update` borrows the `App` directly without `App::update`, so effects queued there may flush only on the next `update_window` (which does go through `App::update`, `GP/src/app.rs:3280`). Making state changes inside `update_window` and calling `render_frame` immediately before capture avoids depending on this.
- `proc_macro_crate` finds `gpui-kit` when it is only a dev-dependency (it scans dev-dependencies); relevant only to `#[gpui_kit::test]`, not this recipe.
- Pixels are deterministic run-to-run on one machine (gpui-kit asserts repeated renders are equal), not across GPUs/OS versions/fonts. Compare baselines with a tolerance.
- Headless Metal needs a GPU-capable session; on a CI macOS runner it works per gpui-kit's CI. Over SSH without a GUI session: not verified.

## 4. Zed's visual test runner as a pattern (`crates/zed/src/visual_test_runner.rs`, GPL: described, not copied)
- A separate binary (`[[bin]]` behind a `visual-tests` feature), macOS-only with a stub `main` elsewhere; it uses `VisualTestAppContext::with_asset_source(current_platform(false), Assets)` so it runs on the main thread, loads the real embedded fonts, and initializes real (not test) settings so fonts match production.
- Per case: `run_until_parked`, `window.refresh()`, `run_until_parked`, then `capture_screenshot`. The capture is always written to an output dir (`VISUAL_TEST_OUTPUT_DIR`, default `target/visual_tests/<name>.png`).
- Baselines are PNGs committed under a fixtures dir in the repo (`crates/zed/test_fixtures/visual_tests/<name>.png`). `UPDATE_BASELINE=1` overwrites them instead of comparing; a missing baseline is a failure telling you to run with that variable.
- Comparison: per-pixel, each RGBA channel within a tolerance of 2; the pass threshold is 99% matching pixels; size mismatches count missing pixels as transparent. On failure it writes `<name>_diff.png` with matches tinted green and differences red, and prints the match percentage.
- Time-based UI (tooltips, hover delays) is made deterministic with `advance_clock` before capture.
- Each case returns a `Result`; the runner keeps going after a failed case, prints a pass/fail summary, and wraps the whole run in `catch_unwind`.

Applying it with the recipe above: add `image = "0.25"` as a dev-dependency, keep baselines in `tests/screenshots/<name>.png`, and gate overwrite on an env var.
