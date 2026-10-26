# Actions, key bindings, focus (gpui-pre 0.3.10 via gpui-kit 0.8.1)

Paths: `gpui/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10/`, `macros/` = `gpui-pre-macros-0.3.10/`, `kit/` = `gpui-kit-0.8.1/`, `base/` = `gpui-base-0.8.1/`. Apps depend on `gpui-kit` only and write `use gpui_kit::*;` (kit/src/lib.rs:101 `pub use ::gpui::*;`).

## 1. Declaring actions

**Unit actions: `actions!`.** With `use gpui_kit::*;` the name `actions!` resolves to gpui-kit's own macro (kit/src/lib.rs:53, `#[macro_export]`; a crate-root item shadows the glob re-export of gpui's macro). It expands to `#[derive(Clone, PartialEq, Default, Debug, $crate::Action)] #[action(namespace = $ns)] pub struct X;`. The namespace is optional. The structs are always `pub`, and doc comments and attributes are allowed per item. gpui's version (gpui/src/action.rs:25) is identical in gpui-pre and also uses `$crate::Action`. The kit's doc comment says it exists because *upstream* gpui spells the derive `gpui::Action`.

```rust
use gpui_kit::*;

actions!(
    settings,
    [
        /// Opens the settings window
        Open,
        ResetToDefaults
    ]
); // registered as "settings::Open" and "settings::ResetToDefaults"
```

Every action name must be unique in the binary: a second `actions!(app, [Quit])` anywhere, even in another crate or a test helper, panics at startup with "Action with name `app::Quit` already registered".

**Data actions: `#[derive(Action)]`.** The attribute parser is at macros/src/derive_action.rs:26-84. The options are:
- `namespace = ident`. It takes a single identifier, not a path.
- `name = "Str"`. The name must not contain `::` (it panics, :103).
- `no_json`. `build()` always errors and there is no schema, so the type needs no `Deserialize` or `JsonSchema`.
- `no_register`. Skips `inventory` registration, so the action can't be built by name.
- `deprecated_aliases = ["ns::Old"]`. The aliases are also registered as names.
- `deprecated = "msg"`.
- Doc comments become `Action::documentation()`.

Anything else panics with "argument not recognized".

Required traits: `Clone + PartialEq` always (generated `boxed_clone`/`partial_eq`), plus the `Action: Any + Send` supertrait (gpui/src/action.rs:118), so **action data must be `Send`**. A non-unit struct without `no_json` also needs `serde::Deserialize` and `schemars::JsonSchema`. The generated code calls `gpui::private::serde_json::from_value::<Self>` and `<Self as gpui::private::schemars::JsonSchema>` (derive_action.rs:115-135). gpui-pre pins **schemars 1.x**, so a schemars 0.8 derive won't satisfy the bound. Add `serde` and `schemars = "1"` to your own Cargo.toml for the derives. gpui only re-exports them under `gpui_kit::private::{serde, schemars, serde_json}` (gpui/src/gpui.rs:84), and their derives emit `serde::`/`schemars::` paths.

```rust
use gpui_kit::*;
use serde::Deserialize;
use schemars::JsonSchema;

#[derive(Clone, PartialEq, Deserialize, JsonSchema, Action)]
#[action(namespace = editor)]
#[serde(deny_unknown_fields)]
pub struct GoToLine { pub line: u32 }

#[derive(Clone, PartialEq, Action)]
#[action(namespace = app, no_json)]          // runtime-only payload, no serde needed
pub struct OpenPath(pub std::sync::Arc<std::path::Path>);
```

**How `#[derive(Action)]` resolves through the kit.** Every gpui-pre proc macro output goes through `gpui_pre_facade_paths::rewrite` (macros/src/gpui_macros.rs:1-35; macros/src/gpui_pre_facade_paths.rs:10-18). When the *expanding crate's* Cargo.toml names `gpui-kit` (looked up with `proc_macro_crate::crate_name`), path heads `gpui::` are rewritten to `gpui_kit::` (or to the renamed key), and they become `crate::` inside gpui-kit itself. So `#[derive(Action)]` works in a crate that lists `gpui-kit` directly, with no alias. This is shown by kit/tests/integration/exports.rs:20, where `#[derive(Action, Clone, PartialEq)] struct DerivedAction;` sits under a bare `use gpui_kit::*;`.

**`extern crate gpui_kit as gpui;`** comes from kit/src/lib.rs:83-100: "applications can alias the Kit as `gpui` … so GPUI macro output resolves through the Kit whichever GPUI it is built on". `gpui_kit::gpui` is a hidden `pub use crate as gpui;` (lib.rs:117). It names the *kit*, so the root alias and a glob `use gpui_kit::*` resolve `gpui` to the same crate, and there's no E0659 ambiguity. You need the alias, at the crate root, only when:
- (a) the crate doesn't list `gpui-kit` itself (for example it reaches it through a sibling crate), so the rewrite doesn't fire; or
- (b) hand-written code or third-party macro output uses `gpui::…` paths in modules that don't glob-import the kit.

A module with `use gpui_kit::*;` already sees `gpui::Window` (exports.rs:58-62). [Inference: the README says no alias is needed for the `gpui-fast` backend either.]

**`#[gpui::action]` does not exist.** The macros crate has only `#[derive(Action)]` and `register_action!` (macros/src/gpui_macros.rs:21-35). The zed-checkout `crates/gpui/docs/key_dispatch.md` shows `#[gpui::action]` and 3-arg/4-arg `on_action` closures. **That doc is stale. Ignore it.** gpui/src/key_dispatch.rs:30-35 is stale too: it passes `Editor::undo` (a fn) to `KeyBinding::new`. The function needs an action *value*.

**Registry and naming.** Every registered action is collected through `inventory` when the `App` is created. A duplicate full name, or an alias that collides with one, **panics** (gpui/src/action.rs:281-310). The `zed` namespace already holds `zed::NoAction` and `zed::Unbind(SharedString)` (action.rs:426-458). These are keymap markers. A binding to `NoAction` disables lower-precedence bindings for the same keystrokes, and `Unbind("ns::Action")` removes later bindings of that action. `cx.build_action(name, Option<serde_json::Value>)` (gpui/src/app.rs:2793) builds an action by name. Unit actions get `{}`.

## 2. Key bindings

```text
// gpui/src/keymap/binding.rs:35   (panics on a parse error)
pub fn new<A: Action>(keystrokes: &'static str, action: A, context: Option<&str>) -> Self
// :51  dynamic; resolves `secondary-` for the host OS
pub fn load(keystrokes: &str, action: Box<dyn Action>, context_predicate: Option<Rc<KeyBindingContextPredicate>>,
            use_key_equivalents: bool, action_input: Option<SharedString>, cx: &App) -> Result<Self, InvalidKeystrokeError>
// gpui/src/app.rs:2741 / 2747 / 2753
pub fn bind_keys(&mut self, bindings: impl IntoIterator<Item = KeyBinding>)   // appends; refreshes windows
pub fn clear_key_bindings(&mut self)
pub fn key_bindings(&self) -> Rc<RefCell<Keymap>>
```

**Keystroke syntax** (`Keystroke::parse_internal`, gpui/src/platform/keystroke.rs:131-237):
- Components are split on `-`. Modifiers are `ctrl`, `alt`, `shift`, `fn`, and `cmd`/`super`/`win` (all three mean `platform`), all case-insensitive. There is **no `option`, `opt`, `control` or `meta` modifier**.
- `secondary` means cmd on macOS and ctrl elsewhere, but **only through `KeyBinding::load` or `Keystroke::parse_with_os`**. `KeyBinding::new("secondary-s", …)` passes no OS and **panics**.
- A single uppercase letter means shift plus the letter (`"A"` is `shift-a`).
- A trailing `-` means the minus key (`"cmd--"`).
- `"shift"` alone binds the modifier tap.
- `a->b` sets `key_char`, which is for tests.
- Sequences are separated by spaces: `"cmd-k cmd-s"`.
- Key names are lowercase: `enter tab space backspace escape delete up down left right home end pageup pagedown f1…`. These are the macOS names in gpui-pre-macos-0.3.10/src/events.rs:41-55,362-390.

A pending prefix waits for `PENDING_INPUT_TIMEOUT = 1s` (gpui/src/window.rs:1375) and then replays.

The idiomatic way to get a platform modifier with `new` is the gpui-base pattern (base/src/root.rs:43-50):
```rust
actions!(workspace, [CloseWindow, Cancel]);

pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        #[cfg(target_os = "macos")]
        KeyBinding::new("cmd-w", CloseWindow, None),
        #[cfg(not(target_os = "macos"))]
        KeyBinding::new("ctrl-w", CloseWindow, None),
        KeyBinding::new("escape", Cancel, Some("Dialog")),
    ]);
}
```

**Precedence** (`Keymap::bindings_for_input`, gpui/src/keymap.rs:150-268):
- Candidates are bindings whose predicate matches somewhere on the focused element's context stack.
- They are sorted by the *deepest* matching depth, then by **later-added first**.
- A binding with **no context counts as the deepest depth** (`binding_enabled`, :270-277), so a later global binding beats a component's contextual one for the same keys.
- *All* matching bindings are dispatched in order until a handler stops propagation (window.rs:6192-6209). A binding whose action has no handler on the path falls through to the next one.

Key events then go to `on_key_down` listeners **only if no action handled the key** (`finish_dispatch_key_event`, window.rs:6260). When the focused input handler accepts text and the key produces a character, bindings are skipped (`input_preference`, window.rs:6034).

## 3. Key contexts and the predicate language

`.key_context(C) where C: TryInto<KeyContext>` (gpui/src/elements/div.rs:854) accepts `&str` or `KeyContext`. A string like `"Editor mode=full"` is parsed by `KeyContext::parse` (keymap/context.rs:63): identifiers and `key=value` pairs separated by whitespace. You can also build one with `KeyContext::default()`, then `.add("Editor")` and `.set("mode","full")` (:115/:124).

`KeyContext::new_with_defaults(os)` (:31) adds `os=macos|linux|windows|…`, but **gpui never calls it**. Zed does this in its own `key_context()` methods (workspace/src/workspace.rs:8115, editor/src/editor.rs:2793).

Predicates (`KeyBindingContextPredicate::parse`, context.rs:247):
- `Ident` tests whether the context has the identifier.
- `a == b` and `a != b`. `!=` is true when the key is absent.
- `!x`, `&&`, `||` and parentheses.
- `A > B` means a context matching B is a descendant of one matching A.

Precedence from low to high: `>` < `||` < `&&` < `==`/`!=` < `!` (:492-496). Identifiers may contain `-` and `_`. The predicate is evaluated against each prefix of the context stack (`depth_of`, :258), and plain identifiers test the deepest context in that prefix. Only contexts on the path from the root to the **focused** element count. A context on a sibling subtree is invisible.

## 4. Handling actions

- **Element, bubble:** `.on_action(|a: &A, window, cx: &mut App| …)` (div.rs:1153). The usual form is `.on_action(cx.listener(|this, a: &A, window, cx| …))`. `cx.listener` is at gpui/src/app/context.rs:246, with signature `Fn(&mut T, &E, &mut Window, &mut Context<T>)`.
- **Element, capture:** `.capture_action(…)` (div.rs:1139). It runs root to leaf before the bubble phase, and calls `propagate()` for you in the bubble phase (div.rs:459-475).
- **Element, by value:** `.on_boxed_action(&dyn Action, …)` (:1167).
- **Global:** `cx.on_action(|a: &A, cx: &mut App| …) -> &mut App` (gpui/src/app.rs:2760). It runs at the end of the bubble phase, only if nothing on the element path handled the action or the handler called `cx.propagate()`. Global listeners also get a capture pass first.
- **Pitfall:** `Context<T>` has an *inherent* `on_action(TypeId, &mut Window, listener)` (context.rs:750). It's a low-level, paint-phase-only API, and it shadows `App::on_action`. Inside `Context<T>`, register global handlers with `App`-typed code at init, not with `cx.on_action(...)`.

Dispatch order is `dispatch_action_on_node_inner` (window.rs:6533-6640):
1. Global listeners, capture phase.
2. Element capture listeners, root to focused element.
3. Element bubble listeners, focused element to root.
4. Global listeners, bubble phase, newest first.

In the bubble phase, **each handler stops propagation by default**. It sets `propagate_event = false` before calling you, and `cx.propagate()` (app.rs:2788) continues. In capture, propagation continues unless you call `cx.stop_propagation()` (:2780). The same flags apply to mouse and key events, which propagate by default.

Programmatic dispatch:
- `window.dispatch_action(Box<dyn Action>, cx)` (window.rs:2558) targets the focused node. **It is deferred** to the end of the effect cycle, so its effect isn't visible synchronously.
- `focus_handle.dispatch_action(&A, window, cx)` (:644) dispatches on that handle's node immediately.
- `cx.dispatch_action(&dyn Action)` (app.rs:2963) uses the active window, or only the global listeners when there is no window.
- `window.is_action_available(&A, cx)` (:3362) and `cx.is_action_available` (app.rs:2907) check availability.
- `window.keystroke_text_for(&A, cx)` (:5618) returns a display string for the highest-precedence binding.
- `window.bindings_for_action(&A)` (:6801) lists the bindings.

**Nothing focused means almost nothing fires (inference from source; verify).**
- The dispatch path starts at `focus_node_id_in_rendered_frame`, which falls back to the root node 0 (window.rs:6507).
- Node 0 is the root `AnyView` element. The view's rendered `div` is a child node (each `AnyElement` pushes a node, gpui/src/element.rs:465), so child `on_action` handlers and contexts are not on the path.
- Always focus something when the window opens. All the gpui examples do: examples/on_window_close_quit.rs, examples/tab_stop.rs:30.

## 5. Focus

```text
cx.focus_handle() -> FocusHandle                                   // gpui/src/app.rs:3182 (App or Context via Deref)
window.focus(&handle, cx)            // window.rs:2418  pub fn focus(&mut self, handle: &FocusHandle, cx: &mut App)
handle.focus(window, cx)             // :617
window.blur(cx); window.focused(cx) -> Option<FocusHandle>; window.focus_next(cx); window.focus_prev(cx)  // :2431/:2401/:2452/:2463
handle.is_focused(&Window) -> bool   // :622  exact match
handle.contains_focused(&Window, &App) // :628  self or a descendant has focus
handle.within_focused(&Window, &mut App) // :634
pub trait Focusable: 'static { fn focus_handle(&self, cx: &App) -> FocusHandle; }  // :720; Entity<V: Focusable> is Focusable
cx.focus_self(window)        // context.rs:767, deferred
cx.focus_view(&entity, window) // :283
```

- `.track_focus(&handle)` (div.rs:812) makes the element focusable and makes this its focus node. Without it, `focus()` on the handle reaches nothing, because focus is resolved against the last rendered frame.
- `.focus(|s| …)`, `.in_focus(…)` and `.focus_visible(…)` (div.rs:1320/1330/1342) are styles for the focused state, the focused-ancestor state, and keyboard focus.
- `.focusable()` (:1563) requires `.id()`. It creates and stores a handle in element state.
- Listeners are on `Context<T>`, return a `Subscription` you must store, and are activated deferred:
  - `cx.on_focus(&h, window, |this, window, cx|)` (context.rs:560) fires when focus is exactly `h`.
  - `cx.on_blur` (:609).
  - `cx.on_focus_in` (:586) and `cx.on_focus_out` (:655, `FocusOutEvent { blurred: WeakFocusHandle }`) cover descendants.
  - `cx.on_focus_lost` (:636) fires when nothing in the window is focused.
  - Window-level versions: `window.on_focus_in` and `window.on_focus_out` (window.rs:5532/5552).
- `FocusHandle` is refcounted, and `downgrade()` gives a `WeakFocusHandle`. Create it once in the view constructor and store it. Don't create it in `render`.

**Tab order:**
- `FocusHandle::tab_index(isize)` and `.tab_stop(bool)` are builders on the handle (window.rs:589/600). New handles have `tab_stop = false`.
- Element `.tab_index(i)` (div.rs:833) also sets `tab_stop = true`. `.tab_stop(bool)` is at :824 and `.tab_group()` at :844.
- **The element-level `tab_index`/`tab_stop` apply only to the handle the element creates itself** (div.rs:2306-2320, when `tracked_focus_handle.is_none()`). With `track_focus(&h)`, set them on `h`: `cx.focus_handle().tab_index(1).tab_stop(true)` (examples/tab_stop.rs:23).
- gpui itself binds no Tab key. **gpui-kit's `open_window` wraps content in `base::Root`** (kit/src/lib.rs:181-190), which binds `tab` and `shift-tab` to `root::Tab`/`TabPrev` → `window.focus_next/prev` in context `"Root"` (base/src/root.rs:11-50, 222-228), plus focus traps.

## 6. Menus (macOS menu bar; dock menu)

```text
cx.set_menus(impl IntoIterator<Item = Menu>)   // gpui/src/app.rs:2923; reads the keymap *now* for shortcut labels
Menu::new(name).items([...]).disabled(bool)   // platform/app_menu.rs:12-25 (pub fields name/items/disabled)
MenuItem::action(name, action) / ::separator() / ::submenu(Menu) / ::os_submenu("Services", SystemMenuType::Services)
MenuItem::os_action(name, action, OsAction::Copy|Cut|Paste|SelectAll|Undo|Redo) ; .checked(bool) ; .disabled(bool)
cx.set_dock_menu(Vec<MenuItem>)               // app.rs:2934
```

- **Bind keys before `set_menus`**, because the shortcut labels come from the keymap at that call. Call `set_menus` again to change checked or disabled state (examples/set_menus.rs).
- A menu item is enabled only if `cx.is_action_available(action)`, meaning there's a handler on the focused path or a global `cx.on_action`. Choosing an item calls `cx.dispatch_action` (platform/app_menu.rs:331-357).
- The first `Menu` becomes the application menu on macOS. This is AppKit behaviour (`setMainMenu`, gpui-pre-macos platform.rs:1132), so it is an inference.

## 7. Quitting

- `cx.quit()` (app.rs:1296) asks the platform to terminate.
- `QuitMode` (app.rs:492) has three values: `Default` means explicit on macOS and last-window-closed elsewhere; `LastWindowClosed`; and `Explicit`. Set it with `Application::with_quit_mode` (:257) or `cx.set_quit_mode` (:2079). The auto-quit logic is at :3313-3322.
- **No `cmd-q` exists by default.** Not in gpui (the macOS menu is whatever you set), not in gpui-kit ("Applications own quit/close actions", kit/src/lib.rs:176).
- `cx.on_app_quit(|cx| async {...}) -> Subscription` (:2851) can't cancel the quit. All quit futures get `SHUTDOWN_TIMEOUT = 200ms` (:79, :1258).
- `window.on_window_should_close(cx, |window, cx| -> bool)` (window.rs:6914) can veto closing a window.
- `cx.on_window_closed(|cx, WindowId|)` (app.rs:2886) returns a `Subscription`. Call `.detach()` on it.

```rust
actions!(app, [Quit]);

struct MainView {
    focus: FocusHandle,
}

impl Render for MainView {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().track_focus(&self.focus).size_full().child("Press cmd-q to quit")
    }
}

fn main() {
    gpui_kit::application().with_assets(gpui_kit::assets::Assets).run(|cx: &mut App| {
        gpui_kit::init(cx);
        cx.on_action(|_: &Quit, cx: &mut App| cx.quit());
        cx.bind_keys([KeyBinding::new("cmd-q", Quit, None)]); // bind before set_menus
        cx.set_menus([Menu::new("MyApp").items([MenuItem::action("Quit", Quit)])]);
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| {
                let focus = cx.focus_handle();
                focus.focus(window, cx); // nothing focused means no element-level action fires
                MainView { focus }
            })
        })
        .expect("open window");
        cx.activate(true);
    });
}
```

## 8. A focused component with a context

```rust
actions!(list, [SelectNext, SelectPrev]);
pub fn init(cx: &mut App) {
    cx.bind_keys([KeyBinding::new("down", SelectNext, Some("List")), KeyBinding::new("up", SelectPrev, Some("List"))]);
}
struct List { focus: FocusHandle, selected: usize }
impl Focusable for List { fn focus_handle(&self, _: &App) -> FocusHandle { self.focus.clone() } }
impl Render for List {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().key_context("List").track_focus(&self.focus)
            .on_action(cx.listener(|this, _: &SelectNext, _, cx| { this.selected += 1; cx.notify(); }))
            .on_action(cx.listener(|this, _: &SelectPrev, _, cx| { this.selected = this.selected.saturating_sub(1); cx.notify(); }))
    }
}
```

## 9. Zed's practice (GPL code; patterns only)

- Each crate declares its actions with `actions!(crate_name, [...])` and `#[derive(Action)]` structs. Cross-crate actions such as `Quit` live in a shared `zed_actions` crate (zed/src/zed/app_menus.rs:7).
- Keymaps are JSON assets, one per OS (settings/src/settings.rs:161-167, `keymaps/default-{macos,windows,linux}.json`). They're loaded with `KeymapFile::load_asset` and appended in layers: default, then base keymap, then vim, then user (zed/src/zed.rs:2348-2380). The later layer wins.
- Views build their `KeyContext` in a `key_context()` method that starts from `new_with_defaults(os)` and adds state flags (workspace.rs:8115, editor.rs:2787).
- `Workspace::register_action` stores callbacks that are applied as `div.on_action(cx.listener(..))` on each render (workspace.rs:8595). The editor registers through `window.on_action` during paint (editor/src/element.rs:11342).
- `quit` is a global `cx.on_action` (zed.rs:200, :1754). It spawns, prompts, then calls `cx.quit()`.
- The Edit menu uses `MenuItem::os_action` for undo, redo, cut, copy, paste and select-all (app_menus.rs:156-180).
- Other events: `cx.observe_keystrokes` (app.rs:2692) fires after dispatch. `cx.intercept_keystrokes` (:2718) fires before, and `stop_propagation` there blocks dispatch.
