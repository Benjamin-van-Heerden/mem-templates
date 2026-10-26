# Entities and contexts (gpui-pre 0.3.10 = zed@08cbb88)

Paths: `gpui/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10/`, `kit/` = `gpui-kit-0.8.1/`, `zed/` = `crates/` of github.com/zed-industries/zed at commit 08cbb88. Licences: gpui-pre, gpui-pre-macros, gpui-pre-platform and gpui-pre-macos are `Apache-2.0` (their Cargo.toml), and so is gpui-kit 0.8.1. The crates.io package `gpui-pre` has lib name `gpui` (`gpui/Cargo.toml:93`), and `gpui-pre-platform` has lib name `gpui_platform`.

Imports in this template: `use gpui_kit::*;` re-exports all of `gpui::*` (`kit/src/lib.rs`, `pub use ::gpui::*`). That glob brings in the traits `AppContext`, `BorrowAppContext`, `VisualContext`, `TaskExt`, `Global`, `ReadGlobal` and `UpdateGlobal`, which many methods below need in scope. The API paths below are gpui's own.

## The types

| Type | What it is | Source |
|---|---|---|
| `App` | The root context. It owns every entity, global and window. | `gpui/src/app.rs:850` |
| `Context<'a, T>` | `&mut App` plus a `WeakEntity<T>`. You get it inside `update` and `cx.new`. It derefs to `App`, so it can be passed wherever `&App` or `&mut App` is expected. | `gpui/src/app/context.rs:21-38` |
| `Window` | **Not a context.** It is passed as a separate `window: &mut Window` argument. | `gpui/src/window.rs` |
| `Entity<T>` | A strong, ref-counted handle. On its own it gives no access to state. | `gpui/src/app/entity_map.rs:435` |
| `WeakEntity<T>` | A weak handle. Every access returns `anyhow::Result`. | `entity_map.rs:765` |
| `AnyEntity` / `AnyWeakEntity` | Type-erased handles. `AnyEntity::downcast::<T>(self) -> Result<Entity<T>, AnyEntity>`. | `entity_map.rs:267,320,590` |
| `AnyView` | An erased `Entity<V: Render>`, via `From<Entity<V>>`. `downcast::<T>()`. | `gpui/src/view.rs:24-61` |
| `AsyncApp` | A `'static`, cloneable context that holds a `Weak<AppCell>`. It can be held across `.await`. | `gpui/src/app/async_context.rs:22` |
| `AsyncWindowContext` | An `AsyncApp` plus an `AnyWindowHandle`. It derefs to `AsyncApp`. | `async_context.rs:296` |

The traits are `AppContext` (`gpui/src/gpui.rs:235`, implemented by App, Context, AsyncApp, AsyncWindowContext and the test/bench contexts) and `VisualContext: AppContext` (`gpui.rs:323`). **`VisualContext` is implemented only by `AsyncWindowContext`, `VisualTestContext` and `BenchWindowContext`** (`async_context.rs:508`, `test_context.rs:1217`, `bench_context.rs:1298`). `App` and `Context<T>` do not implement it.

## Core signatures

```text
// AppContext (gpui.rs:235-308)
fn new<T: 'static>(&mut self, build_entity: impl FnOnce(&mut Context<T>) -> T) -> Entity<T>;
fn update_entity<T, R>(&mut self, handle: &Entity<T>, update: impl FnOnce(&mut T, &mut Context<T>) -> R) -> R;
fn read_entity<T, R>(&self, handle: &Entity<T>, read: impl FnOnce(&T, &App) -> R) -> R;
fn as_mut<'a, T>(&'a mut self, handle: &Entity<T>) -> GpuiBorrow<'a, T>;          // notifies on drop (app.rs:3695)
fn with_window<R>(&mut self, entity_id: EntityId, f: impl FnOnce(&mut Window, &mut App) -> R) -> Option<R>;
fn background_spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R> where R: Send + 'static;

// Entity<T> (entity_map.rs:485-530)
pub fn read<'a>(&self, cx: &'a App) -> &'a T
pub fn read_with<R, C: AppContext>(&self, cx: &C, f: impl FnOnce(&T, &App) -> R) -> R
pub fn update<R, C: AppContext>(&self, cx: &mut C, update: impl FnOnce(&mut T, &mut Context<T>) -> R) -> R
pub fn update_in<R, C: VisualContext>(&self, cx: &mut C, update: impl FnOnce(&mut T, &mut Window, &mut Context<T>) -> R) -> C::Result<R>
pub fn write<C: AppContext>(&self, cx: &mut C, value: T)        // replaces the value, then notifies
pub fn downgrade(&self) -> WeakEntity<T>;  pub fn entity_id(&self) -> EntityId;  pub fn into_any(self) -> AnyEntity

// WeakEntity<T> (entity_map.rs:792-845). All three are fallible.
pub fn upgrade(&self) -> Option<Entity<T>>
pub fn update<C: AppContext, R>(&self, cx: &mut C, update: impl FnOnce(&mut T, &mut Context<T>) -> R) -> Result<R>   // Err("entity released")
pub fn update_in<C: AppContext, R>(&self, cx: &mut C, update: impl FnOnce(&mut T, &mut Window, &mut Context<T>) -> R) -> Result<R> // Err("entity has no current window")
pub fn read_with<C: AppContext, R>(&self, cx: &C, read: impl FnOnce(&T, &App) -> R) -> Result<R>

// Context<T> (context.rs)
pub fn entity(&self) -> Entity<T>            // :51
pub fn weak_entity(&self) -> WeakEntity<T>   // :58
pub fn notify(&mut self)                     // :221
pub fn spawn<AsyncFn, R>(&self, f: AsyncFn) -> Task<R> where AsyncFn: AsyncFnOnce(WeakEntity<T>, &mut AsyncApp) -> R + 'static   // :230
pub fn spawn_in<AsyncFn, R>(&self, window: &Window, f: AsyncFn) -> Task<R> where AsyncFn: AsyncFnOnce(WeakEntity<T>, &mut AsyncWindowContext) -> R + 'static // :690
pub fn listener<E: ?Sized>(&self, f: impl Fn(&mut T, &E, &mut Window, &mut Context<T>) + 'static) -> impl Fn(&E, &mut Window, &mut App) + 'static // :246
pub fn defer_in(&mut self, window: &Window, f: impl FnOnce(&mut T, &mut Window, &mut Context<T>) + 'static) // :301
pub fn on_release(&self, f: impl FnOnce(&mut T, &mut App) + 'static) -> Subscription // :127
pub fn focus_self(&mut self, window: &mut Window) where T: Focusable   // :767 (deferred)

// AsyncApp (async_context.rs)
pub fn update<R>(&self, f: impl FnOnce(&mut App) -> R) -> R                       // :176, NOT Result
pub fn spawn<AsyncFn, R>(&self, f: AsyncFn) -> Task<R> where AsyncFn: AsyncFnOnce(&mut AsyncApp) -> R + 'static // :218
pub fn read_global<G: Global, R>(&self, read: impl FnOnce(&G, &App) -> R) -> R    // :239
pub fn update_global<G: Global, R>(&self, update: impl FnOnce(&mut G, &mut App) -> R) -> R // :273
// AsyncWindowContext: still fallible, because the window can close
pub fn update<R>(&mut self, update: impl FnOnce(&mut Window, &mut App) -> R) -> Result<R>  // :315
pub fn update_root<R>(&mut self, update: impl FnOnce(AnyView, &mut Window, &mut App) -> R) -> Result<R> // :322
```

The return types under `AsyncApp`:
- `AsyncApp` became **infallible** in Zed PR #45809, "gpui: Actually remove the Result from AsyncApp", merged in January 2026.
- `AsyncApp::update`, `Entity::update(&mut async_cx, …)`, `Entity::read_with(&async_cx, …)`, `AsyncApp::new` and `read_global` now return `R` directly.
- They **panic** with "app was released before async operation completed" (`async_context.rs:29-33`). The doc at `:14-20` says this "should not happen in practice" for tasks from `cx.spawn`, because the executor checks that the app is alive before polling. The companion PR #45768 cancels foreground tasks when the app is dropped.
- `gpui/docs/contexts.md` at that commit still says async calls "become fallible". **That doc is stale.**
- What stays fallible: `AsyncWindowContext::update`, `update_root`, `read_global` and `update_global` (window gone), `AsyncApp::update_window` and `open_window` (app quitting), and every `WeakEntity` method.

## Idiomatic snippet (gpui-kit facade)

```rust
use gpui_kit::*;

struct Counter { count: usize }

struct CounterView {
    counter: Entity<Counter>,
    _load: Option<Task<()>>,
}

impl CounterView {
    fn new(_window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self { counter: cx.new(|_| Counter { count: 0 }), _load: None }
    }

    fn increment(&mut self, cx: &mut Context<Self>) {
        // Use the inner `cx` inside the closure; the outer one is mutably borrowed.
        self.counter.update(cx, |counter, cx| {
            counter.count += 1;
            cx.notify();
        });
    }

    fn load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self._load = Some(cx.spawn_in(window, async move |this, cx| {
            let n = cx.background_spawn(async { 41 + 1 }).await;   // off the main thread
            this.update_in(cx, |this, _window, cx| {                  // WeakEntity -> Result
                this.counter.update(cx, |c, cx| { c.count = n; cx.notify(); });
            })
            .ok();
        }));
    }
}

impl Render for CounterView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let count = self.counter.read(cx).count;   // a read inside render => the window tracks `counter`
        div()
            .id("counter")
            .child(format!("count: {count}"))
            .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
                this.increment(cx);
                this.load(window, cx);
            }))
    }
}

fn main() {
    gpui_kit::application().run(|cx| {
        gpui_kit::init(cx);
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| CounterView::new(window, cx))
        })
        .expect("failed to open window");
        cx.activate(true);
    });
}
```

## Argument order and `window`

- **`window` comes before `cx`** in every callback and in Zed's own functions, e.g. `fn render(&mut self, window: &mut Window, cx: &mut Context<Self>)` (`gpui/src/element.rs:166`). Zed's AGENTS.md (GPUI section) states this rule.
- On Window methods the window is `self` and `cx` follows: `window.focus(&handle, cx)` (`window.rs:2418`), `window.spawn(cx, f)` (`:2765`), `window.defer(cx, f)` (`:2619`). On Context methods the window is the argument just before the callback: `cx.spawn_in(window, f)`, `cx.subscribe_in(&e, window, f)` and `cx.observe_global_in::<G>(window, f)`.
- In synchronous code you cannot call `entity.update_in(cx, …)`, because `Context<T>` is not a `VisualContext`. Capture the `window` you already have instead: `child.update(cx, |child, cx| child.do_thing(window, cx))`. The gpui examples do this, e.g. `gpui/examples/input.rs:707`. Use `update_in` only with an `AsyncWindowContext`, `VisualTestContext`, or through `WeakEntity::update_in`.
- **`update_in` uses the entity's *current window*, not the window of the context you pass in.** `WeakEntity::update_in` (`entity_map.rs:819-834`) and `AsyncWindowContext::update_window_entity` (`async_context.rs:524-536`) both go through `cx.with_window(entity_id, …)`. The current window is "the most recently rendered window that referenced the entity, or its creation window" (`app.rs:2313-2318`). If the entity has never been rendered or created inside a window, you get `Err("entity has no current window")`. `gpui/examples/move_entity_between_windows.rs:38-52` shows a task following the entity into a new window.
- The inner `cx` rule: inside `x.update(cx, |x, cx| …)` the outer `cx` is mutably borrowed, so using it is a borrowck error (E0499). Always shadow it. Zed's AGENTS.md says the same.

## The reentrancy panic

- `update` *leases* the entity: it removes the entity from the map for the duration of the closure (`entity_map.rs:138-170`, `app.rs:3336-3347`).
- While the entity is leased, any `read` or `update` of the same entity panics with `cannot {read|update} {Type} while it is already being updated` (`entity_map.rs:231-233`).
- Common ways to trigger it:
  - Calling `self_handle.read(cx)` or `cx.entity().update(…)` inside your own `update` or `render`. `render` runs inside an update of the view.
  - A child calling back into its parent through a stored `Entity<Parent>` while the parent is updating the child (A updates B, and B updates A).
  - Reading the new entity's own handle inside `cx.new(|cx| …)`. The slot is reserved but not yet inserted (`app.rs:3364-3378`), so `cx.entity().read(cx)` panics with the same message. Cloning `cx.entity()` there is fine.
  - Globals have the same shape: inside `cx.update_global::<G, _>(…)`, the global is removed (`lease_global`, `app.rs:2602`), so `cx.global::<G>()` panics with `no state of type G exists` (`app.rs:2522-2528`).
- How to avoid it:
  - Pass data down as arguments instead of re-entering the entity.
  - Use `&mut self` directly instead of the handle.
  - Postpone the work with `cx.defer(|cx| …)` (`app.rs:2463`) or `cx.defer_in(window, …)`. Both run "at the end of the current effect cycle, allowing entities that are currently on the stack to be returned to the app".
  - Emit an event instead of calling back up, since handlers run after the update ends. Zed's `workspace.rs` uses `cx.defer` for this (e.g. `zed/workspace/src/workspace.rs:3595`).
- A separate RefCell panic: calling `AsyncApp::update` while a synchronous update is on the stack (for example, creating `cx.to_async()` inside an update and using it immediately) double-borrows the `AppCell`. The doc at `app.rs:189-191` warns about this for `ApplicationHandle::update`, and Zed PR #54188 fixed a crash from exactly this. If a function must work from both sync and async callers, take `&impl AppContext` instead.

## `cx.notify()` and re-rendering

- `Context::notify` calls `App::notify(entity_id)` (`app.rs:3187-3221`). During a window draw, GPUI records which entities were read or updated (`detect_accessed_entities`, `view.rs:565`, and `record_entities_accessed`, `window.rs:3603`). If a window currently displays the entity, `notify` marks the view dirty and wakes the platform loop (`window.rs:178-203`). Either way it queues `Effect::Notify`, which runs the `observe` callbacks.
- Reading an entity inside `render` is therefore enough to re-render when it notifies; you don't need an `observe` just to repaint. Exception: cached views (`AnyView::cached`/`Entity::cached`, `view.rs:46,258`) only redraw when they are in `dirty_views` (`view.rs:550`). *Inferred:* reads inside a cached child are attributed to that child.
- Mutating state without `notify` leaves the screen stale until something else redraws. The exception is `GpuiBorrow` (`cx.as_mut(&e)`), which notifies on drop (`app.rs:3695-3702`).
- Repeated `notify` calls are coalesced into one `Effect::Notify` per flush through `pending_notifications` (`app.rs:2100-2106`).
- *Inferred from `window.rs:182`:* calling `notify` while the window is in its draw phase does not schedule a frame or run observers. Don't call `notify` from `render`.
- Effects (notify, emit, defer, global observers, entity releases) flush when the outermost update finishes (`app.rs:1378-1395`, `flush_effects` at `:2121`).
- To force a window to redraw: `window.refresh()` (`window.rs:2388`), or `cx.refresh_windows()` for every window.

## Globals

```text
pub trait Global: 'static {}                                            // global.rs:22, a marker trait
pub fn set_global<G: Global>(&mut self, global: G)                      // app.rs:2560 (notifies observers)
pub fn global<G: Global>(&self) -> &G                                   // :2522, panics if missing
pub fn try_global<G: Global>(&self) -> Option<&G>                       // :2530
pub fn global_mut<G: Global>(&mut self) -> &mut G                       // :2538, always notifies observers
pub fn default_global<G: Global + Default>(&mut self) -> &mut G         // :2549
pub fn has_global<G: Global>(&self) -> bool;  pub fn remove_global<G: Global>(&mut self) -> G
fn update_global<G, R>(&mut self, f: impl FnOnce(&mut G, &mut Self) -> R) -> R  // BorrowAppContext, gpui.rs:385
pub fn observe_global<G: Global>(&mut self, f: impl FnMut(&mut Self) + 'static) -> Subscription  // App, app.rs:2585
pub fn observe_global<G: 'static>(&mut self, f: impl FnMut(&mut T, &mut Context<T>) + 'static) -> Subscription // Context, context.rs:168
pub fn observe_global_in<G: Global>(&mut self, window: &Window, f: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static) -> Subscription // :720
// Trait sugar: ReadGlobal::global(cx), UpdateGlobal::update_global(cx, f) and set_global(cx, v) (global.rs:30-79)
```

```rust
#[derive(Default)]
struct Prefs { dark: bool }
impl Global for Prefs {}

fn init_prefs(cx: &mut App) {
    cx.set_global(Prefs::default());
    cx.update_global::<Prefs, _>(|prefs, _cx| prefs.dark = true); // don't call cx.global::<Prefs>() in here
    let _dark = Prefs::global(cx).dark;                           // ReadGlobal
}
// In an entity constructor: `cx.observe_global::<Prefs>(|_this, cx| cx.notify()).detach();`
```

- `remove_global`'s doc says it does "not notify global observers", but the code pushes `NotifyGlobalObservers` (`app.rs:2572-2575`). Trust the code.
- Zed's pattern: a private newtype that implements `Global`, wrapping an `Arc` or `Entity` (for example, the app-state wrapper at `zed/workspace/src/workspace.rs:1343-1345`). Public associated functions read or replace the inner value, as in the theme global at `zed/theme/src/theme.rs:320-335`. Views react through `observe_global_in::<SettingsStore>(window, …)` stored in `_subscriptions` (`zed/workspace/src/workspace.rs:2008-2010`, `zed/workspace/src/pane.rs:567`, `zed/editor/src/editor.rs:2550-2551`).

## Application, windows, activation, quitting

```text
// gpui_platform (gpui-pre-platform-0.3.10/src/gpui_platform.rs)
pub fn application() -> gpui::Application        // with_platform(current_platform(false))
pub fn headless() -> gpui::Application
pub fn current_platform(headless: bool) -> Rc<dyn Platform>
// gpui (app.rs)
pub fn with_platform(platform: Rc<dyn Platform>) -> Self      // :208 (there is no Application::new)
pub fn new_inaccessible(platform: Rc<dyn Platform>) -> Self   // :225, AccessKit disabled
pub fn with_assets(self, a: impl AssetSource) -> Self; pub fn with_quit_mode(self, mode: QuitMode) -> Self // :232, :257
pub fn run<F>(self, on_finish_launching: F) where F: 'static + FnOnce(&mut App)   // :278, blocks
pub fn open_window<V: 'static + Render>(&mut self, options: WindowOptions,
    build_root_view: impl FnOnce(&mut Window, &mut App) -> Entity<V>) -> anyhow::Result<WindowHandle<V>> // :1565
pub fn activate(&self, ignoring_other_apps: bool)   // :1601
pub fn quit(&self)                                  // :1296
pub enum QuitMode { Default, LastWindowClosed, Explicit }  // :492; Default = Explicit on macOS, LastWindowClosed elsewhere
pub fn on_window_closed(&self, f: impl FnMut(&mut App, WindowId) + 'static) -> Subscription // :2886
pub fn on_app_quit<Fut>(&self, f: impl FnMut(&mut App) -> Fut + 'static) -> Subscription // :2851, polled ≤ SHUTDOWN_TIMEOUT = 200ms (:79)
```

- **gpui-kit** wraps all of this:
  - `gpui_kit::application` is `gpui_platform::application`.
  - `gpui_kit::init(cx)` initialises gpui-component and gpui-base. Call it once, before opening windows.
  - `gpui_kit::open_window(options, cx, build) -> Result<(AnyWindowHandle, Entity<V>)>` wraps your view in a `gpui_base::Root`, which is the window's real root (`kit/src/lib.rs`, `open_window`). So `WindowHandle<YourView>` downcasts fail. Keep the returned `Entity<V>` and use `AnyWindowHandle::update(cx, |root, window, cx| …)`.
  - From async code, call `gpui_kit::open_window` inside `cx.update(|cx| …)`, as its doc says.
- Kit also defines its own `actions!` (`kit/src/lib.rs`), so that the derive resolves without a `gpui` dependency. For other GPUI macro output, an app can alias the Kit with `extern crate gpui_kit as gpui;` (the "Public facade decision" comment in `kit/src/lib.rs`). gpui-pre's proc macros also rewrite the `gpui::` paths they emit to gpui-kit when it is a dependency (`gpui-pre-macros-0.3.10/src/gpui_pre_facade_paths.rs:11-18`).
- `WindowOptions` (`gpui/src/platform.rs:2579`) is non-exhaustive in practice; always write `..Default::default()`. `WindowBounds::centered(size, cx)` is at `platform.rs:2751`. `open_window` draws once before it returns (`app.rs:1584-1589`).
- `WindowHandle::<V>::update(cx, |v, window, cx| …) -> Result<R>` (`window.rs:7460`). `WindowHandle::root` is test-support only (`window.rs:7446`). To close a window: `window.remove_window()` (`window.rs:2396`). To veto a close: `window.on_window_should_close(cx, f)` (`window.rs:6914`).
- On macOS the default `QuitMode` never quits when the last window closes. Either use `.with_quit_mode(QuitMode::LastWindowClosed)` or do what `gpui/examples/on_window_close_quit.rs` does: `on_window_closed(|cx, _| if cx.windows().is_empty() { cx.quit() })` followed by `.detach()`. After quitting starts, `foreground_executor()` panics with "Can't spawn on main thread after on_app_quit" (`app.rs:2375-2380`).
- Zed's own startup (`zed/zed/src/main.rs:87-95, 124-126`): build the platform with `gpui_platform::current_platform(false)`, use `Application::new_inaccessible` unless an a11y env flag is set, add `.with_assets(…)` and `.with_quit_mode(QuitMode::Explicit)`, then `.run(…)`, and call `cx.activate(true)` once the first window is up (`:877`).

## Lifecycle and release

- An `Entity` is ref-counted like an `Rc`. When the last strong handle drops, the entity ID goes onto `dropped_entity_ids`. At the next `flush_effects`, `release_dropped_entities` (`app.rs:2193-2210`) does three things:
  1. Removes the entity's observers, event listeners and window tracking.
  2. Runs the `release_listeners` with `&mut T`.
  3. Drops the state.
- **Release is deferred to the end of the effect cycle**, never inline at the `drop`.
- The release hooks:
  - `cx.on_release(|this, cx: &mut App| …)` (`context.rs:127`). It gets `&mut App`, not a `Context`, because the entity is going away.
  - `cx.observe_release(&other, |this, other, cx| …)` (`:143`).
  - `App::observe_release` (`app.rs:2652`).
  - The `_in` variants also get the window (`context.rs:370,380`), but the window may already be closed.
  - Each of these returns a `Subscription`, which must be stored or `.detach()`ed. Unlike observe and subscribe, they are active immediately rather than deferred.
- Leaks:
  - Cycles of strong `Entity` handles never free. Hold `WeakEntity` for back-references to a parent; Zed's `Pane` holds `workspace: WeakEntity<Workspace>` (`zed/workspace/src/pane.rs:415`).
  - A stored `Task` holds whatever its future captured. `cx.spawn` gives you a `WeakEntity` for this reason.
  - Under `cfg(test)` / `gpui_leak_detection`, leaked handles panic at exit (`entity_map.rs:1116-1146`).
- `Context::processor` captures a **strong** `Entity` (`context.rs:260-268`), whereas `listener` captures a weak one (`:246-257`). A `processor` closure stored inside the entity itself leaks.
