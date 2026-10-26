# Events, observation and subscriptions (gpui-pre 0.3.10 = zed@08cbb88)

Paths: `gpui/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10/`, and `zed/` = `crates/` of github.com/zed-industries/zed at commit 08cbb88. gpui is Apache-2.0. Zed's app crates are GPL-3.0, so they are described here, not quoted. Import everything with `use gpui_kit::*;`.

## The two channels

- **Notify / observe**: "my state changed", with no payload. The emitter calls `cx.notify()`. Observers get the emitter's handle and read whatever they need. Repeated notifies in one update coalesce into a single callback (`gpui/src/app.rs:2100-2106`).
- **Emit / subscribe**: typed events. The emitter declares `impl EventEmitter<E> for T {}` and calls `cx.emit(E)`. Each emit is delivered on its own, with no coalescing (`app.rs:2254-2264`).

Both are queued as effects and delivered in `flush_effects` after the outermost `update` returns (`app.rs:2121-2155`). So **the emitter is no longer leased when handlers run**: a handler may `read` or `update` the emitter without hitting the reentrancy panic. Handlers can also emit or notify further; those effects go onto the same queue.

## Signatures

```text
pub trait EventEmitter<E: Any>: 'static {}                                         // gpui.rs:359

// Context<T> (gpui/src/app/context.rs)
pub fn emit<Evt>(&mut self, event: Evt) where T: EventEmitter<Evt>, Evt: 'static     // :780
pub fn notify(&mut self)                                                             // :221
pub fn subscribe<T2, Evt>(&mut self, entity: &Entity<T2>,
    on_event: impl FnMut(&mut T, Entity<T2>, &Evt, &mut Context<T>) + 'static) -> Subscription
    where T2: 'static + EventEmitter<Evt>, Evt: 'static                              // :94
pub fn subscribe_in<Emitter, Evt>(&mut self, emitter: &Entity<Emitter>, window: &Window,
    on_event: impl FnMut(&mut T, &Entity<Emitter>, &Evt, &mut Window, &mut Context<T>) + 'static) -> Subscription
    where Emitter: EventEmitter<Evt>, Evt: 'static                                   // :341
pub fn subscribe_self<Evt>(&mut self, on_event: impl FnMut(&mut T, &Evt, &mut Context<T>) + 'static) -> Subscription // :112
pub fn observe<W: 'static>(&mut self, entity: &Entity<W>,
    on_notify: impl FnMut(&mut T, Entity<W>, &mut Context<T>) + 'static) -> Subscription // :64
pub fn observe_in<V2: 'static>(&mut self, observed: &Entity<V2>, window: &mut Window,
    on_notify: impl FnMut(&mut T, Entity<V2>, &mut Window, &mut Context<T>) + 'static) -> Subscription // :317
pub fn observe_self(&mut self, on_event: impl FnMut(&mut T, &mut Context<T>) + 'static) -> Subscription // :80
pub fn observe_release<T2: 'static>(&self, entity: &Entity<T2>,
    on_release: impl FnOnce(&mut T, &mut T2, &mut Context<T>) + 'static) -> Subscription // :143
pub fn observe_release_in<T2: 'static>(&self, observed: &Entity<T2>, window: &Window,
    on_release: impl FnMut(&mut T, &mut T2, &mut Window, &mut Context<T>) + 'static) -> Subscription // :380
pub fn on_release(&self, on_release: impl FnOnce(&mut T, &mut App) + 'static) -> Subscription // :127
pub fn observe_global<G: 'static>(&mut self, f: impl FnMut(&mut T, &mut Context<T>) + 'static) -> Subscription // :168
pub fn observe_global_in<G: Global>(&mut self, window: &Window,
    f: impl FnMut(&mut T, &mut Window, &mut Context<T>) + 'static) -> Subscription  // :720
// Window-level observers on Context: observe_window_bounds/activation/visibility/appearance (:402-457),
// on_focus/on_focus_in/on_blur/on_focus_out (:560-655), observe_keystrokes (:513)

// App (gpui/src/app.rs): no "self" entity, so the callbacks get the handle and &mut App
pub fn observe<W: 'static>(&mut self, entity: &Entity<W>, on_notify: impl FnMut(Entity<W>, &mut App) + 'static) -> Subscription // :1398
pub fn subscribe<T, Event>(&mut self, entity: &Entity<T>, on_event: impl FnMut(Entity<T>, &Event, &mut App) + 'static) -> Subscription
    where T: 'static + EventEmitter<Event>, Event: 'static                           // :1487
pub fn observe_new<T: 'static>(&self, on_new: impl 'static + Fn(&mut T, Option<&mut Window>, &mut Context<T>)) -> Subscription // :2631
pub fn observe_release<T: 'static>(&self, handle: &Entity<T>, on_release: impl FnOnce(&mut T, &mut App) + 'static) -> Subscription // :2652
pub fn observe_global<G: Global>(&mut self, f: impl FnMut(&mut Self) + 'static) -> Subscription // :2585

// Window (gpui/src/window.rs): the subscriber is "this window"
pub fn observe<T: 'static>(&mut self, observed: &Entity<T>, cx: &mut App,
    on_notify: impl FnMut(Entity<T>, &mut Window, &mut App) + 'static) -> Subscription // :2629
pub fn subscribe<Emitter, Evt>(&mut self, entity: &Entity<Emitter>, cx: &mut App,
    on_event: impl FnMut(Entity<Emitter>, &Evt, &mut Window, &mut App) + 'static) -> Subscription // :2658
// AsyncApp::subscribe also exists (async_context.rs:184)

// Subscription (gpui/src/subscription.rs:147-193)
#[must_use] pub struct Subscription { … }       // dropping it unsubscribes
pub fn detach(mut self)                         // keep the callback until an entity involved is released
pub fn join(a: Self, b: Self) -> Self
pub fn new(unsubscribe: impl 'static + FnOnce()) -> Self
```

Note the asymmetry: `subscribe` passes the emitter **by value** (`Entity<T2>`), while `subscribe_in` passes it **by reference** (`&Entity<Emitter>`). `observe` and `observe_in` both pass `Entity<W>` by value.

## Idiomatic snippet

```rust
use gpui_kit::*;

pub enum PickerEvent { Confirmed(usize), Dismissed }

pub struct Picker { selected: usize }
impl EventEmitter<PickerEvent> for Picker {}

impl Picker {
    fn confirm(&mut self, cx: &mut Context<Self>) {
        cx.emit(PickerEvent::Confirmed(self.selected));
    }
}

pub struct Shell {
    picker: Entity<Picker>,
    last: Option<usize>,
    _subscriptions: Vec<Subscription>,
}

impl Shell {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let picker = cx.new(|_| Picker { selected: 0 });
        let _subscriptions = vec![
            cx.subscribe_in(&picker, window, Self::on_picker_event),
            cx.observe(&picker, |_this, _picker, cx| cx.notify()),
        ];
        Self { picker, last: None, _subscriptions }
    }

    fn on_picker_event(
        &mut self,
        _picker: &Entity<Picker>,
        event: &PickerEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            PickerEvent::Confirmed(ix) => {
                self.last = Some(*ix);
                cx.notify();
            }
            PickerEvent::Dismissed => window.refresh(),
        }
    }
}

fn watch_new_pickers(cx: &mut App) {
    // An app-level hook: runs for every Picker created from now on.
    cx.observe_new(|picker: &mut Picker, _window: Option<&mut Window>, _cx| {
        picker.selected = 0;
    })
    .detach();
}
```

## Pitfalls

- **A `Subscription` you don't keep is dropped immediately.** `let _ = cx.subscribe(…)` or a bare `cx.subscribe(…);` unsubscribes on the spot: `Drop` runs `unsubscribe` (`subscription.rs:188-193`). The type is `#[must_use]`, so you get a warning, not an error. Bind it to a field (`_subscriptions: Vec<Subscription>`) or call `.detach()`. `let _sub = …` in a constructor drops at the end of the scope.
- **What `.detach()` does.** It keeps the callback alive "until the entities it has been subscribed to are dropped" (`subscription.rs:163-168`). The stored closure returns `false` once the observer or emitter can't be upgraded (`context.rs:901-931`, `app.rs:1461-1480`), and when an entity is released its observers and listeners are removed (`app.rs:2193-2210`). So a detached subscription between two entities isn't a leak, but a detached `App`-level hook (`observe_new`, `on_window_closed`, `observe_global`) lives forever.
- **Activation is deferred.** `observe`, `subscribe`, `subscribe_in`, `observe_in`, `observe_global` and `observe_global_in` activate in a `defer` effect (`app.rs:1457-1459`, `:1502-1508`, `:2596`, `context.rs:180,745`). Effects run in FIFO order. *Inferred from that:* an event emitted earlier in the same update than the subscribe call is not delivered to the new subscription, while one emitted after it is. `on_release`, `observe_release`, `observe_new`, `on_app_quit` and `on_window_closed` activate immediately.
- **`_in` callbacks run in the subscriber's *current* window, not necessarily the `window` you passed in.**
  - `invoke_observer_in` and `invoke_subscriber_in` call `cx.with_window(subscriber.entity_id(), …)` (`context.rs:934-970`). The `window` argument only seeds the entity's current window if it has none yet (`ensure_window`, `app.rs:2329-2333`).
  - If that window is unavailable (closed, or already on the update stack), **the callback is silently skipped and the subscription stays alive.**
  - `Window::observe`/`Window::subscribe` behave differently. They bind to that exact window and drop the subscription once the window is gone (`window.rs:2638-2650`, `:2671-2685`).
  - `observe_global_in` skips the call but keeps the observer while the window is unavailable (`context.rs:727-742`).
- **Event type matching is by `TypeId`.** Delivery is filtered with `TypeId::of::<Evt>()` (`app.rs:2254-2264`). Subscribing for `PickerEvent` will not see a `&PickerEvent` or a wrapper type. With several `EventEmitter` impls on one type, type inference needs the event type in the closure signature, or a turbofish as in `gpui/examples/move_entity_between_windows.rs:56` (`subscribe_in::<_, MoveToNewWindow>`).
- **Emit needs the `EventEmitter` impl.** `cx.emit(e)` only compiles for `T: EventEmitter<Evt>` (`context.rs:780-783`), and the impl must be on the emitting entity's type, not on the event.
- **The emitter handle in the callback is upgraded, so it is strong.** Don't store it in `self` unless you mean to keep the emitter alive.
- **`observe_release` holds no handle, but the observed entity must actually be released.** While any strong `Entity` handle exists (including one in your own struct), it never fires. `on_release` gets `&mut App`, not a `Context`, so it cannot notify itself.
- **`observe_self`/`subscribe_self` see your own notifications and events,** and they run after your update finishes (`gpui/examples/testing.rs:35`).
- **Order and reentrancy:** handlers run during `flush_effects`. If a handler updates the subscriber, which is already leased by an outer update, it panics. That can't normally happen, because effects flush only after the outermost update returns (`app.rs:1386-1395`). *Inferred:* `GpuiBorrow` (`cx.as_mut`) is the exception to keep in mind, since it starts its own update scope (`app.rs:3659-3666`).
- **Keystroke and window observers registered on `Context`** (`observe_window_activation`, `on_focus` and the rest) also return `Subscription`s with the same keep-or-detach rule.

## Which to use when

| Situation | Use |
|---|---|
| Re-render a view when a model it reads changes | Nothing. Reading it in `render` makes the window track it (see entities-and-contexts.md). Use `cx.observe` only to derive or cache state from it. |
| A child tells its parent what happened (confirm, dismiss, edited) | `EventEmitter` + `cx.emit` in the child, and `cx.subscribe_in(&child, window, Self::handler)` in the parent when the handler needs the `Window` (focus, actions); otherwise `cx.subscribe`. |
| React to any change in another entity's state | `cx.observe` / `cx.observe_in` |
| React to settings or theme changes | `cx.observe_global_in::<G>(window, …)` in views, `cx.observe_global::<G>` in models, `App::observe_global` for app-level code |
| Clean up when something goes away | `cx.on_release` (yourself), `cx.observe_release` (another entity), `App::on_window_closed` (windows) |
| Attach behaviour to every instance of a type | `App::observe_new::<T>` (Zed's plugin pattern), detached |
| Need it only for a while | Store the `Subscription` in an `Option` or `Vec` and drop it to stop |

## What Zed does

- **Constructor-built subscription vectors.**
  - Constructors build a `Vec<Subscription>` and store it in a field named `_subscriptions`, with the leading underscore because it is never read. The `_subscriptions` name appears 54 times in the workspace, editor, zed, settings, theme and ui crates.
  - Typical entries: `subscribe_in` on child panes and items, `observe_global_in::<SettingsStore>` for settings, and window activation observers. Examples: `zed/workspace/src/workspace.rs:2008-2030`, `zed/workspace/src/multi_workspace.rs:342-382` (an `on_release` plus a settings observer stored together), `zed/editor/src/editor.rs:2550-2551`.
  - Subscriptions that must be replaced later live in their own field or in a `HashMap` keyed by entity ID, so that dropping or replacing the entry unsubscribes (*inferred* from field names such as `_regenerate_subscriptions` at `zed/editor/src/git/blame.rs:299`).
- **Handler methods.** Handlers are usually methods passed by path (`Self::settings_changed`, `zed/workspace/src/pane.rs:567`) rather than inline closures.
- **Detached app-level hooks.** `cx.observe_new(|workspace: &mut Workspace, window, cx| { … }).detach()` is how feature crates attach to the workspace at startup (`zed/workspace/src/toast_layer.rs:19`, `zed/zed/src/zed.rs:552`). The `window` is `Option<&mut Window>`, so these hooks bail out when it is `None`.
- **Event enums.** One event enum per entity type (`impl EventEmitter<Event> for Pane {}`, `zed/workspace/src/pane.rs:532`; `EditorEvent` at `zed/editor/src/editor.rs:12681`). Parents `match` on it in a single handler.
- **Release hooks.** `on_release` is used for teardown, such as unregistering from a global registry when an entity dies (`zed/zed/src/zed/open_listener.rs:1025`, `zed/zed/src/zed/edit_prediction_registry.rs:34`).
