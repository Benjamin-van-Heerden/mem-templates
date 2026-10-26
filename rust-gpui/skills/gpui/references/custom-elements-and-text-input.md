# Custom elements and text input (gpui-pre 0.3.10 via gpui-kit 0.8.1)

Source roots used below:
- `GP` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10`
- `GB` = `.../gpui-base-0.8.1`, `GC` = `.../gpui-component-0.8.1`, `GK` = `.../gpui-kit-0.8.1`
- Zed example: `zed/crates/gpui/examples/input.rs` (Apache-2.0, same commit)

All snippets import with `use gpui_kit::*;`. gpui-kit re-exports the whole of `gpui` at its root (`GK/src/lib.rs:100-101`), so `Element`, `Window`, `PaintQuad`, `fill`, `PathBuilder`, `InspectorElementId` etc. all resolve as `gpui_kit::X`. Do not add a separate `gpui` dependency.

## 1. Do you need a custom element?

Usually no. In order of preference:
1. Compose `div()` + styling + gpui-kit components (`gpui_kit::component::*`).
2. `canvas(prepaint, paint)` for one-off painting (charts, sparklines, custom shapes). No trait impl, no ids.
3. `impl RenderOnce` + `#[derive(IntoElement)]` for reusable stateless building blocks.
4. `impl Element` only when you need control of layout measurement, hitbox ordering, per-element cross-frame state, or input handler registration (a text editor, a virtualized grid, a custom scroll surface). Zed's editor is the canonical case: one big element whose `PrepaintState` is a full layout struct, which inserts several hitboxes (text, gutter, scrollbars) in prepaint and in paint registers mouse listeners, calls `window.handle_input`, then paints in layers.

## 2. The `Element` trait (`GP/src/element.rs:52-143`)

```text
pub trait Element: 'static + IntoElement {
    type RequestLayoutState: 'static;                      // element.rs:55
    type PrepaintState: 'static;                           // element.rs:59
    fn id(&self) -> Option<ElementId>;                     // element.rs:66
    fn source_location(&self) -> Option<&'static panic::Location<'static>>; // :70, REQUIRED, no default
    fn request_layout(                                     // element.rs:74
        &mut self,
        id: Option<&GlobalElementId>,
        inspector_id: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState);
    fn prepaint(                                           // element.rs:84
        &mut self,
        id: Option<&GlobalElementId>,
        inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState;
    fn paint(                                              // element.rs:96
        &mut self,
        id: Option<&GlobalElementId>,
        inspector_id: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        request_layout: &mut Self::RequestLayoutState,
        prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    );
    // defaulted: a11y_role() -> Option<accesskit::Role> (None), write_a11y_info(&self, &mut accesskit::Node),
    //            a11y_synthetic_children(..), into_any(self) -> AnyElement
}
pub trait IntoElement: Sized { type Element: Element; fn into_element(self) -> Self::Element; ... } // :146
```

Pitfalls (old API generations that will not compile here):
- No `ElementContext`/`WindowContext`/`ViewContext`. Everything is `window: &mut Window, cx: &mut App`. Views use `Context<Self>`.
- Phases are named `request_layout` / `prepaint` / `paint` (not `layout`/`after_layout`/`commit_bounds`).
- `source_location` and the `InspectorElementId` parameter are mandatory; return `None` from `source_location`.
- `GlobalElementId` (`element.rs:220`) is an opaque, `Arc`-backed path of `ElementId`s with a cached hash. It is `Some` only when `id()` returns `Some`. You don't build it; pass it to `with_element_state`.
- Phase assertions: `paint_quad`/`paint_path`/`handle_input`/`on_mouse_event`/`set_cursor_style` debug-assert the paint phase; `insert_hitbox` and `request_layout` assert prepaint; `with_element_state` allows paint or prepaint.

### Window APIs used by custom elements (`GP/src/window.rs`)

| Line | Signature |
|---|---|
| 5227 | `pub fn request_layout(&mut self, style: Style, children: impl IntoIterator<Item = LayoutId>, cx: &mut App) -> LayoutId` (`#[must_use]`) |
| 5256 | `pub fn request_measured_layout<F>(&mut self, style: Style, measure: F) -> LayoutId` where `F: Fn(Size<Option<Pixels>>, Size<AvailableSpace>, &mut Window, &mut App) -> Size<Pixels> + 'static` |
| 5313 | `pub fn insert_hitbox(&mut self, bounds: Bounds<Pixels>, behavior: HitboxBehavior) -> Hitbox` |
| 896 | `enum HitboxBehavior { #[default] Normal, BlockMouse, BlockMouseExceptScroll }` |
| 870 | `Hitbox::is_hovered(&self, window: &Window) -> bool` (false during keyboard modality); `is_hovered_at`, `should_handle_scroll`. `Hitbox: Clone`. |
| 4399 | `pub fn with_element_state<S: 'static, R>(&mut self, global_id: &GlobalElementId, f: impl FnOnce(Option<S>, &mut Self) -> (R, S)) -> R` |
| 4474 | `pub fn with_optional_element_state<S, R>(&mut self, global_id: Option<&GlobalElementId>, f: impl FnOnce(Option<Option<S>>, &mut Self) -> (R, Option<S>)) -> R` |
| 4356/4382 | `use_keyed_state(key, cx, init) -> Entity<S>` / `#[track_caller] use_state(cx, init) -> Entity<S>`: entity-backed state usable from `render` too |
| 4702 | `pub fn paint_quad(&mut self, quad: PaintQuad)` |
| 4773 | `pub fn paint_path(&mut self, path: Path<Pixels>, color: impl Into<Background>)` |
| 4181 | `pub fn with_content_mask<R>(&mut self, mask: Option<ContentMask<Pixels>>, f: impl FnOnce(&mut Self) -> R) -> R` |
| 4145 | `pub fn set_cursor_style(&mut self, style: CursorStyle, hitbox: &Hitbox)` |
| 5472 | `pub fn on_mouse_event<E: MouseEvent>(&mut self, listener: impl FnMut(&E, DispatchPhase, &mut Window, &mut App) + 'static)` |
| 5495 | `pub fn on_key_event<E: KeyEvent>(&mut self, listener: impl Fn(&E, DispatchPhase, &mut Window, &mut App) + 'static)` |
| 5409 | `pub fn handle_input(&mut self, focus_handle: &FocusHandle, input_handler: impl InputHandler, cx: &App)` |

`PaintQuad` helpers (free functions, `window.rs:7857-7900`): `quad(bounds, corner_radii, background, border_widths, border_color, border_style)`, `fill(bounds, background)`, `outline(bounds, border_color, border_style)`. `PathBuilder` (`GP/src/path_builder.rs`): `PathBuilder::stroke(width)` / `::fill()`, `move_to`, `line_to`, `curve_to`, `cubic_bezier_to`, `arc_to`, `add_polygon`, `close`, then `build() -> Result<Path<Pixels>, Error>`. `DispatchPhase` is `Bubble` (default) or `Capture`.

Listeners registered with `on_mouse_event` are window-wide for the next frame: always gate them on `hitbox.is_hovered(window)` (or bounds) and `phase == DispatchPhase::Bubble`.

### Example: element with id, hitbox, cross-frame state and a path

```rust
use gpui_kit::*;

pub struct Sparkline { id: ElementId, values: Vec<f32>, color: Hsla }

#[derive(Default)]
struct SparklineState { clicks: usize } // survives across frames, keyed by GlobalElementId

impl IntoElement for Sparkline {
    type Element = Self;
    fn into_element(self) -> Self { self }
}

impl Element for Sparkline {
    type RequestLayoutState = ();
    type PrepaintState = Hitbox;

    fn id(&self) -> Option<ElementId> { Some(self.id.clone()) }
    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> { None }

    fn request_layout(&mut self, _: Option<&GlobalElementId>, _: Option<&InspectorElementId>,
                      window: &mut Window, cx: &mut App) -> (LayoutId, ()) {
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        style.size.height = px(40.).into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(&mut self, _: Option<&GlobalElementId>, _: Option<&InspectorElementId>,
                bounds: Bounds<Pixels>, _: &mut (), window: &mut Window, _: &mut App) -> Hitbox {
        window.insert_hitbox(bounds, HitboxBehavior::Normal)
    }

    fn paint(&mut self, id: Option<&GlobalElementId>, _: Option<&InspectorElementId>,
             bounds: Bounds<Pixels>, _: &mut (), hitbox: &mut Hitbox, window: &mut Window, _: &mut App) {
        let clicks = window.with_element_state::<SparklineState, _>(id.unwrap(), |state, _| {
            let state = state.unwrap_or_default();
            (state.clicks, state)
        });
        let bg = if hitbox.is_hovered(window) { hsla(0., 0., 0.95, 1.) } else { hsla(0., 0., 1., 1.) };
        window.paint_quad(fill(bounds, bg));

        let max = self.values.iter().cloned().fold(f32::EPSILON, f32::max);
        let step = bounds.size.width / (self.values.len().max(2) - 1) as f32;
        let mut path = PathBuilder::stroke(px(1.5));
        for (i, v) in self.values.iter().enumerate() {
            let p = point(bounds.left() + step * i as f32, bounds.bottom() - bounds.size.height * (v / max));
            if i == 0 { path.move_to(p) } else { path.line_to(p) }
        }
        if let Ok(path) = path.build() { window.paint_path(path, self.color); }
        let _ = clicks;

        window.set_cursor_style(CursorStyle::Crosshair, hitbox);
        let hitbox = hitbox.clone();
        window.on_mouse_event(move |_: &MouseDownEvent, phase, window, _cx| {
            if phase == DispatchPhase::Bubble && hitbox.is_hovered(window) {
                // Mutate app state through an Entity here (element state can only be
                // touched during prepaint/paint, not from listeners), then window.refresh().
            }
        });
    }
}
```

Inference (the example compiles, but this rule was not tested): `with_element_state` state cannot be mutated from an event listener because it is only reachable during drawing; keep interactive state in an `Entity` (or `window.use_keyed_state`) and read it in paint.

## 3. `canvas()`: the cheap alternative (`GP/src/elements/canvas.rs:10`)

```text
pub fn canvas<T>(
    prepaint: impl 'static + FnOnce(Bounds<Pixels>, &mut Window, &mut App) -> T,
    paint: impl 'static + FnOnce(Bounds<Pixels>, T, &mut Window, &mut App),
) -> Canvas<T>
```
`Canvas<T>` implements `Styled` (`canvas.rs:91`); its layout is just its style, so give it a size or it collapses to zero: `canvas(|_, _, _| (), |bounds, (), window, _| window.paint_quad(fill(bounds, rgb(0x3366ff)))).size_full()`. It has no id (no element state) and paints inside `style.paint(...)`. Prepaint can insert a hitbox and return it as `T`. Zed's `examples/painting.rs` uses `canvas` with `paint_quad` + `paint_path`.

## 4. Text input from scratch (what `examples/input.rs` does, ~920 lines)

Only do this if gpui-kit's `Input` (section 5) can't work. Moving parts:

1. **View entity** `TextInput` holding `focus_handle: FocusHandle`, `content: SharedString`, `selected_range: Range<usize>` (UTF-8 byte offsets), `selection_reversed`, `marked_range: Option<Range<usize>>` (IME preedit), `last_layout: Option<ShapedLine>`, `last_bounds: Option<Bounds<Pixels>>`, `is_selecting`.
2. **Actions + keymap**: `actions!(text_input, [Backspace, Delete, Left, Right, SelectLeft, SelectRight, SelectAll, Home, End, ShowCharacterPalette, Paste, Cut, Copy])`; `cx.bind_keys([KeyBinding::new("backspace", Backspace, None), ...])`. In the view's `render`: `div().key_context("TextInput").track_focus(&self.focus_handle(cx)).on_action(cx.listener(Self::backspace))...on_mouse_down/up/move(...)`, child = the custom `TextElement`. With gpui-kit use `gpui_kit::actions!` (lib.rs:52); the upstream macro spells `gpui::Action`.
3. **`impl EntityInputHandler for TextInput`** (`GP/src/input.rs:26`). Required: `text_for_range`, `selected_text_range(ignore_disabled_input, ..) -> Option<UTF16Selection>`, `marked_text_range`, `unmark_text`, `replace_text_in_range(range: Option<Range<usize>>, text, ..)`, `replace_and_mark_text_in_range(range, new_text, new_selected_range: Option<Range<usize>>, ..)`, `bounds_for_range(range_utf16, element_bounds, ..) -> Option<Bounds<Pixels>>`, `character_index_for_point(point, ..) -> Option<usize>`. Defaulted: `paste`, `selection_bounds_for_range`, `set_selected_text_range`, `text_length_utf16`, `accepts_text_input` (true), `text_input_configuration`, `text_input_editable_range`. All ranges passed by the platform are **UTF-16 code units**; convert to/from byte offsets (`offset_to_utf16`/`offset_from_utf16` helpers in the example).
4. **IME**: `replace_and_mark_text_in_range` replaces (given range, else current marked range, else selection), sets `marked_range` to the inserted text when non-empty, and positions the selection relative to it. `replace_text_in_range` commits and clears `marked_range`. `unmark_text` clears it. The element shapes the marked span with an underline `TextRun`. `bounds_for_range` returns the caret rect so the OS candidate window is placed correctly.
5. **Notify the platform**: after every programmatic edit call `window.notify_text_input_changed(&self.focus_handle)` (`window.rs:5429`, new in this generation) plus `cx.notify()`.
6. **`TextElement` (custom `Element`)**: `request_layout` = full width, `window.line_height()` tall. `prepaint` builds `TextRun`s (`len, font, color, background_color, underline, strikethrough`; `text_system.rs:1261`), shapes with `window.text_system().shape_line(text: SharedString, font_size: Pixels, runs: &[TextRun], force_width: Option<Pixels>) -> ShapedLine` (`text_system.rs:671`), computes cursor/selection quads with `line.x_for_index(i)`. `paint` calls `window.handle_input(&focus_handle, ElementInputHandler::new(bounds, self.input.clone()), cx)` (`ElementInputHandler::new(element_bounds, view: Entity<V>)`, `input.rs:161`), paints selection, then `line.paint(origin, line_height, TextAlign::Left, None, window, cx) -> Result<()>` (`text_system/line.rs:108`), then the cursor if focused, and stores `last_layout`/`last_bounds` back into the entity for mouse hit-testing (`closest_index_for_x`).

## 5. Use gpui-kit's `Input` instead (strong recommendation)

Free: IME/marked text, UTF-16 bookkeeping, selection, undo/redo, clipboard, word movement, masking, placeholder, validation, accessibility, test-support registration, theming. Types:
- `InputState` = `InputBaseState<InputMode>` (`GB/src/input/input/mod.rs:10`), re-exported at `gpui_kit::component::input::InputState` (`GC/src/input/mod.rs:24-37`).
- `Input` element: `GC/src/input/input.rs` (`RenderOnce`, `Styled`, `Sizable`). `TextareaState`/`Textarea` for multi-line, `NumberInput`, `OtpInput` alongside.
- `InputEvent` (`GB/src/input/base/state.rs:132`): `Change`, `PressEnter { secondary: bool, shift: bool }`, `Focus`, `Blur`. `InputBaseState<M>: EventEmitter<InputEvent>` (`state.rs:717`).

Key signatures (`GB/src/input/base/state.rs`):
- `pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self` (:11966). Builders: `.placeholder(impl Into<SharedString>)` (:1052), `.default_value(impl Into<SharedString>)` (:1577), `.masked(bool)` (:11990), `.clean_on_escape()` (:1426), `.mask_pattern(..)` (:4072), `.pattern(regex::Regex)`, `.validate(impl Fn(&str, &mut App) -> bool + 'static)` (~:12002-12019).
- `pub fn value(&self) -> SharedString` (:1593); `text(&self) -> &Rope` (:1623); `selected_value`, `unmask_value`.
- `pub fn set_value(&mut self, value: impl Into<InputContent>, window: &mut Window, cx: &mut Context<Self>)` (:1226). `&str`, `String`, `SharedString` convert. **Does not emit `InputEvent::Change`** and clears undo history. Use `replace_all(text, window, cx)` (:1258) to keep undo, `insert(text, window, cx)` at cursor.
- `set_placeholder(p, window, cx)` (:1177), `set_disabled(bool, cx)` (:1375), `set_readonly(bool, cx)` (:1401), `set_masked(bool, window, cx)` (:11996), `focus(&self, window, cx)` (:1651), `set_selected_range(range, cx)` (:3495).
- `Input::new(state: &Entity<InputState>) -> Self` (`GC/src/input/input.rs:211`); builders `.id(..)` (:205), `.aria_label(..)` (:269), `.prefix(el)`/`.suffix(el)`, `.cleanable(bool)` (:315), `.mask_toggle()` (:321), `.disabled(bool)`, `.readonly(bool)`, `.appearance(bool)`, `.bordered(bool)`, plus `Styled` (`.w(px(240.))`) and `Sizable` (`.small()` etc.).
- Subscribe: `Context::subscribe_in(&mut self, emitter: &Entity<E>, window: &Window, on_event: impl FnMut(&mut T, &Entity<E>, &Evt, &mut Window, &mut Context<T>) + 'static) -> Subscription` (`GP/src/app/context.rs:341`). Keep the `Subscription` or it unsubscribes on drop.

```rust
use gpui_kit::*;
use gpui_kit::component::input::{Input, InputEvent, InputState};

struct NameForm { name: Entity<InputState>, saved: SharedString, _subs: Vec<Subscription> }

impl NameForm {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let name = cx.new(|cx| InputState::new(window, cx).placeholder("Your name"));
        let sub = cx.subscribe_in(&name, window, |this, state, event: &InputEvent, _window, cx| {
            match event {
                InputEvent::Change => cx.notify(),
                InputEvent::PressEnter { .. } => { this.saved = state.read(cx).value(); cx.notify(); }
                _ => {}
            }
        });
        Self { name, saved: SharedString::default(), _subs: vec![sub] }
    }
    fn reset(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.name.update(cx, |s, cx| s.set_value("", window, cx)); // no Change event
    }
}

impl Render for NameForm {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().p_4().gap_2().flex().flex_col()
            .child(Input::new(&self.name).id("name").cleanable(true).w(px(240.)))
            .child(format!("Saved: {}", self.saved))
    }
}
// Open with gpui_kit::open_window(options, cx, |window, cx| cx.new(|cx| NameForm::new(window, cx)))
// after gpui_kit::init(cx). open_window wraps the view in gpui_kit::base::Root, which the
// component library's overlays (menus, popovers, notifications) render through.
```

Pitfalls:
- Create `InputState` once (in the parent's constructor), never inside `render`; it owns focus and history.
- Call `gpui_kit::init(cx)` first; it binds the `"Input"` key context keymap (`GB/src/input/base/state.rs:142+`). Without it keys do nothing.
- `InputState::new` needs a `&mut Window`, so build it inside a window context (the `open_window` build closure or a view method).
- Testing a hand-written `EntityInputHandler`: `gpui_kit::test::TestInput::new(ElementInputHandler::new(bounds, entity.clone()), window)` with `commit_text`/`compose_text`/`marked_text_range`/`unmark_text` (`GK/src/test/input.rs`, documented in `GK/TESTING.md`). Ranges are UTF-16.
