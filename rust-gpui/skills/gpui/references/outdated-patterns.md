# Outdated GPUI idioms and their current form (gpui-pre 0.3.10 = zed@08cbb88)

Paths: `gpui/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10/`, and `kit/` = `gpui-kit-0.8.1/`. The "old" column is what models trained on older GPUI tend to write. **None of the old names exist in this source.** I checked by grepping `gpui/src` for `ViewContext`, `ModelContext`, `struct Model`, `struct View`, `WeakView`, `WeakModel`, `AsyncAppContext`, `new_view`, `new_model`, `observe_new_views` and `impl_actions`, and each has zero hits. The only `WindowContext` hits are inside the name `AsyncWindowContext`. The dates come from Zed PR metadata where I checked it, and are otherwise marked *approx.*

Imports for this template: `use gpui_kit::*;`, which re-exports `gpui::*`, including the `prelude` traits.

## Types and contexts

| Old idiom | Current form | Source |
|---|---|---|
| `Model<T>`, `View<T>` | `Entity<T>`. A "view" is just an `Entity<T>` where `T: Render`. | `gpui/src/app/entity_map.rs:435` |
| `WeakModel<T>`, `WeakView<T>` | `WeakEntity<T>` | `entity_map.rs:765` |
| `AnyModel` | `AnyEntity`. `AnyView`/`AnyWeakView` still exist, for Render entities. | `entity_map.rs:267`, `gpui/src/view.rs:24,135` |
| `ModelContext<T>`, `ViewContext<T>` | `Context<T>`, a single type for both | `gpui/src/app/context.rs:21` |
| `WindowContext` (`cx: &mut WindowContext`) | Two parameters, `window: &mut Window, cx: &mut App`, **window first** | `gpui/src/element.rs:166,184` |
| `AppContext` as the root struct (`cx: &mut AppContext`) | `App` is the struct. `AppContext` is now a **trait** implemented by App, Context, AsyncApp and others. | `gpui/src/app.rs:850`, `gpui/src/gpui.rs:235` |
| `AsyncAppContext` | `AsyncApp` | `gpui/src/app/async_context.rs:22` |
| `fn render(&mut self, cx: &mut ViewContext<Self>)` | `fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement` | `element.rs:164-167` |
| `RenderOnce::render(self, cx: &mut WindowContext)` | `fn render(self, window: &mut Window, cx: &mut App) -> impl IntoElement` | `element.rs:180-185` |
| `cx.view()`, `cx.model()`, `cx.handle()` | `cx.entity()` (strong) and `cx.weak_entity()` | `context.rs:51,58` |
| `cx.window_handle()` on a view context | `window.window_handle()` | `gpui/src/window.rs` (`pub fn window_handle`) |

## Creating things

| Old idiom | Current form | Source |
|---|---|---|
| `cx.new_model(\|cx\| …)`, `cx.new_view(\|cx\| …)` | `cx.new(\|cx\| …)` (`AppContext::new`). Window-aware construction captures `window`: `cx.new(\|cx\| V::new(window, cx))`. | `gpui.rs:242`; `gpui/examples/hello_world.rs` |
| `window.new_view(…)` / `cx.new_window_entity` in sync code | There is no sync window-entity constructor. `VisualContext::new_window_entity` exists only on async/test contexts. | `gpui.rs:338`, `async_context.rs:515` |
| `App::new().run(…)`, `Application::new().run(…)` | `gpui_platform::application().run(\|cx: &mut App\| …)`, or with the Kit `gpui_kit::application().run(…)` followed by `gpui_kit::init(cx)`. **There is no `Application::new`.** The constructors are `with_platform` and `new_inaccessible`. | `gpui-pre-platform-0.3.10/src/gpui_platform.rs` (`application`), `app.rs:208,225`, `kit/src/lib.rs` |
| `Application::headless()` | `gpui_platform::headless()` | `gpui_platform.rs` (`headless`) |
| `cx.open_window(opts, \|cx\| cx.new_view(…))` | `cx.open_window(opts, \|window, cx\| cx.new(\|cx\| V::new(window, cx)))` returns `Result<WindowHandle<V>>`. With the Kit, `gpui_kit::open_window(opts, cx, \|window, cx\| …)` returns `Result<(AnyWindowHandle, Entity<V>)>`, and the actual root is a `gpui_base::Root`. | `app.rs:1565`, `kit/src/lib.rs` |
| `cx.observe_new_views(\|ws: &mut Workspace, cx\| …)` | `cx.observe_new(\|ws: &mut Workspace, window: Option<&mut Window>, cx: &mut Context<Workspace>\| …)` | `app.rs:2631` |
| `window_handle.root(cx)` in app code | Test-support only. Use `WindowHandle::update(cx, \|view, window, cx\| …)` or keep the `Entity`. | `window.rs:7446,7460` |

## Async

| Old idiom | Current form | Source |
|---|---|---|
| `cx.spawn(\|this, mut cx\| async move { … })` | `cx.spawn(async move \|this, cx\| { … })`. This is an `AsyncFnOnce(WeakEntity<T>, &mut AsyncApp)`, and `cx` is a `&mut` borrow, so drop the `mut cx`. | `context.rs:230-241` |
| `cx.spawn(\|mut cx\| async move …)` on `App` | `cx.spawn(async move \|cx\| …)`, with `AsyncFnOnce(&mut AsyncApp)` | `app.rs:2432-2443` |
| `cx.spawn(…)` from a view to get a window context | `cx.spawn_in(window, async move \|this, cx: &mut AsyncWindowContext\| …)` or `window.spawn(cx, async move \|cx\| …)` | `context.rs:690`, `window.rs:2765` |
| `cx.update(\|cx\| …)?` / `entity.update(&mut cx, …)?` on an async context | **`AsyncApp` is infallible.** `AsyncApp::update` returns `R` and panics if the App is gone. The same goes for `Entity::update`, `Entity::read_with`, `new`, `read_global` and `update_global` through an `AsyncApp`. A leftover `?` either fails to compile or silently applies to the closure's own `Result`. Changed by Zed PR #45809, January 2026. | `async_context.rs:29-33,176-181` |
| — still fallible — | `WeakEntity::update/read_with/update_in` (`Result`, so keep the `?` on `this.update(cx, …)?`). Also `AsyncWindowContext::update(\|window, cx\| …) -> Result<R>`, and `AsyncApp::update_window`/`open_window`. | `entity_map.rs:803-845`, `async_context.rs:315` |
| `entity.update_in(cx, …)` with a `Context<T>` | It only compiles with a `VisualContext` (`AsyncWindowContext`, `VisualTestContext`). In sync code, capture `window` and call `update`. Both forms run in the entity's **current window**, not the window of the context you pass. | `entity_map.rs:523,819`, `async_context.rs:524-536` |
| `cx.background_executor().spawn(fut)` | Still valid (`executor.rs:103`). The shorthand is `cx.background_spawn(fut)` on any `AppContext` (`gpui.rs:300`), and Zed's code uses the shorthand about 13× more often. The two are equivalent: `Context` forwards to `background_executor.spawn` (`context.rs:872-877`). | `gpui/src/executor.rs:103` |
| `task.detach_and_log_err(cx)` as an inherent method | It is now `TaskExt::detach_and_log_err(self, cx: &App)` on `Task<Result<T, E>>`. You need the trait in scope; it comes with the prelude and the gpui/Kit glob. `Task` itself (with `ready` and `detach`) now lives in the `scheduler` crate and is re-exported. | `executor.rs:12-13,38-65`, `gpui/src/prelude.rs` |
| A dropped `Task` keeps running | A dropped `Task` is **cancelled**. Store it, `.await` it, or `.detach()` it. | `gpui-pre-scheduler-0.3.10/src/executor.rs:395-402` |

## Events, listeners, focus and actions

| Old idiom | Current form | Source |
|---|---|---|
| `cx.listener(\|this, event, cx\| …)` | `cx.listener(\|this, event: &E, window, cx\| …)`, which has 4 arguments and yields `impl Fn(&E, &mut Window, &mut App)` | `context.rs:246-257` |
| `cx.subscribe(&e, \|this, emitter, event, cx\| …)` in a view that needs the window | `cx.subscribe_in(&e, window, \|this, emitter: &Entity<_>, event, window, cx\| …)`. Note that the emitter comes **by reference** here and by value in `subscribe`. | `context.rs:94,341` |
| `cx.observe_global::<G>(\|this, cx\| …)` needing the window | `cx.observe_global_in::<G>(window, \|this, window, cx\| …)` | `context.rs:720` |
| `cx.focus(&handle)`, `window.focus(&handle)`, `handle.focus(cx)` | `window.focus(&handle, cx)` or `handle.focus(window, cx)` | `window.rs:2418`, `window.rs:617` |
| `cx.focus_self()`, `cx.focus_view(&v)` | `cx.focus_self(window)` (deferred) and `cx.focus_view(&v, window)` | `context.rs:767,283` |
| `cx.dispatch_action(Box::new(A))` on a view context | `window.dispatch_action(A.boxed_clone(), cx)` or `focus_handle.dispatch_action(&A, window, cx)`. `App::dispatch_action(&dyn Action)` is for app-global dispatch. | `window.rs:2558,644`, `app.rs:2963` |
| `impl_actions!(ns, [Foo])` plus `#[derive(Deserialize)]` | `#[derive(Clone, PartialEq, serde::Deserialize, schemars::JsonSchema, Action)] #[action(namespace = ns)]` | `gpui/src/action.rs:56-104` |
| `impl_internal_actions!` | `#[derive(Clone, PartialEq, Action)] #[action(namespace = ns, no_json)]`. Add `no_register` if it should not be invocable by name. | `action.rs:73-90` |
| `#[gpui::action]` attribute macro | **It does not exist.** `gpui_macros` exports `Action` (a derive with the helper attribute `#[action(...)]`), `register_action!`, `AppContext`, `VisualContext`, `IntoElement`, `Render`, `test`, `bench` and `property_test`. | `gpui-pre-macros-0.3.10/src/gpui_macros.rs:21-37`, `gpui.rs:118-120`, `action.rs:4` |
| `actions!(ns, [A, B])` | Still current. With gpui-kit, use **Kit's own `actions!`** (`gpui_kit::actions!`), which spells the derive as `$crate::Action` so that it resolves without a `gpui` dependency. For other GPUI macro output, an app can alias the Kit with `extern crate gpui_kit as gpui;`. Both are documented in `kit/src/lib.rs`. gpui-pre's proc macros also rewrite the `gpui::` paths they emit to gpui-kit when it is a dependency. | `action.rs:25-41`, `kit/src/lib.rs`, `gpui-pre-macros-0.3.10/src/gpui_pre_facade_paths.rs:11-18` |
| `cx.on_window_closed(\|cx\| …)` | `cx.on_window_closed(\|cx, window_id: WindowId\| …)`. It returns a `Subscription`, so store it or `.detach()` it. | `app.rs:2886` |
| `ScrollWheelEvent`, `.on_scroll_wheel(…)` | `ScrollEvent`, `.on_scroll(…)`. The old names are `#[deprecated]` aliases. | `gpui/src/interactive.rs:541`, `gpui/src/elements/div.rs:400,1093` |
| `#[gpui::test]` in a Kit app | `#[gpui_kit::test]`. The Kit's facade comment says not to replace it with `#[test]`, and that test modules should import Kit types explicitly so the glob does not shadow `#[test]`. | `kit/src/lib.rs` (facade comment) |

## Other changes worth knowing

- **Accessibility on by default.** `Application::with_platform` (and therefore `gpui_platform::application()`) enables AccessKit. Zed itself builds with `Application::new_inaccessible(platform)` unless an env flag is set (`zed/zed/src/main.rs:87-95`, in the GPL crate). `Application::new_inaccessible` is at `app.rs:225`.
- **Quit modes.** `QuitMode::{Default, LastWindowClosed, Explicit}` is set with `Application::with_quit_mode` / `App::set_quit_mode`. `Default` means explicit quit on macOS and quit-on-last-window elsewhere (`app.rs:492-500,257,2079`). Older code called `cx.quit()` from `on_window_closed` on every platform.
- **Windowing modes.** `App::request_windowing` and `Application::with_windowing` switch between headless and windowed modes (`app.rs:268,1313`). The Linux-only `gpui_platform::linux(allowed_modes)` takes the allowed modes.
- **`Entity::write`** replaces the value and notifies (`entity_map.rs:512`). **`cx.as_mut(&e)`** returns a `GpuiBorrow` that notifies on drop and panics on async contexts (`app.rs:3653-3702`, `async_context.rs:70-75`).
- **`AppContext::with_window(entity_id, f)`** runs `f` in an entity's current window (`gpui.rs:279-290`). This "current window" concept is new: it is behind `update_in`, `subscribe_in`, `observe_in` and `defer_in`.
- **`Window` is not a context.** Methods that used to be on `WindowContext` and also need app state now take `cx` explicitly: `window.focus(&h, cx)`, `window.defer(cx, f)`, `window.spawn(cx, f)`, `window.observe(&e, cx, f)`, `window.to_async(cx)` (`window.rs:2418,2619,2765,2629,2717`).
- **The docs lag the code.** `zed/crates/gpui/docs/contexts.md` still says async contexts make entity calls fallible, which has not been true since #45809. Zed's AGENTS.md was updated by PR #54818, "Update AI rules to reflect that `AsyncApp` updates are now infallible". The `_ownership_and_data_flow.rs` doc text refers to `insert_entity`/`new_entity` while its code uses `cx.new` (`gpui/src/_ownership_and_data_flow.rs:3,17`). Follow the code.
- **The crate is published as `gpui-pre`**, with lib name `gpui`, and the platform crate as `gpui-pre-platform` (lib `gpui_platform`). These are snapshot crates whose descriptions say "gpui-pre snapshot of zed@08cbb88" (`gpui/Cargo.toml:13-22,93-95`). They are not the `gpui` crate on crates.io, which is an older API generation (*inferred* from the snapshot naming). gpui-kit pins `=0.3.10` of each (`kit/Cargo.toml`).
