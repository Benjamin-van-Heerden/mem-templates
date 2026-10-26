# GPUI elements and styling (gpui-pre 0.3.10 / gpui-kit 0.8.1)

Source of truth: `gpui-pre-0.3.10/src` (abbreviated `G/`), `gpui-pre-macros-0.3.10/src` (`M/`), `gpui-base-0.8.1/src` (`B/`), `gpui-component-0.8.1/src` (`C/`), all under `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`. Zed (GPL) references are under `zed/crates/` (github.com/zed-industries/zed at commit 08cbb88); patterns are paraphrased, not copied.

## Imports (gpui-kit facade)

Apps depend on `gpui-kit` only. `gpui_kit::*` is `pub use ::gpui::*` (`gpui-kit-0.8.1/src/lib.rs:103`).

```rust
use gpui_kit::*;          // div, px, rgb, Render, Styled, InteractiveElement, ...
use gpui_kit::prelude::*; // REQUIRED for FluentBuilder (.when/.when_some/.map)
```

- `FluentBuilder` is **not** re-exported at the gpui root, only in `G/prelude.rs:5-9`. Without `prelude::*`, `.when(...)` fails to resolve. gpui-kit's own tests import `prelude::*` (e.g. `gpui-kit-0.8.1/tests/integration/window.rs:3`).
- Derive macros emit `gpui::...` paths. The macro crate rewrites them to `gpui_kit::...` when `gpui-kit` is a dependency (`M/gpui_pre_facade_paths.rs`), so `#[derive(IntoElement)]` works with only gpui-kit.
- gpui-kit layers: `gpui_kit::base` (gpui-base), `gpui_kit::component` (styled components), `gpui_kit::assets` (Lucide icons).
- Name clashes if you also glob `gpui_kit::component::*`: it exports `Size` (an enum, `C/sizing.rs:6`) and `Edges` (from gpui-base). These collide with gpui's `Size<T>` and `Edges<T>`. Import component items by name instead.

## Rendering traits (`G/element.rs`, `G/view.rs`)

```text
// G/element.rs:164
pub trait Render: 'static + Sized {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement;
}
// G/element.rs:180
pub trait RenderOnce: 'static {
    fn render(self, window: &mut Window, cx: &mut App) -> impl IntoElement;
}
// G/element.rs:146
pub trait IntoElement: Sized {
    type Element: Element;
    fn into_element(self) -> Self::Element;
    fn into_any_element(self) -> AnyElement { .. }
}
// G/element.rs:189
pub trait ParentElement {
    fn extend(&mut self, elements: impl IntoIterator<Item = AnyElement>);
    fn child(self, child: impl IntoElement) -> Self;
    fn children(self, children: impl IntoIterator<Item = impl IntoElement>) -> Self;
}
```

- **Views** (`Render`) are stateful and live in an `Entity<T>` created with `cx.new(|cx| ..)`. `Entity<V: Render>` implements `IntoElement` (`G/view.rs:112`), so `.child(entity.clone())` embeds it. `AnyView` is the type-erased form (`From<Entity<V>>`, `G/view.rs:30`).
- **Components** (`RenderOnce`) are props structs, consumed each frame. Add `#[derive(IntoElement)]` (`M/derive_into_element.rs`), which wraps them in `ViewElement<Self>`. Never derive `IntoElement` on a `Render` type.
- `View` (`G/view.rs:208`) is the unifying trait with a blanket impl for `T: RenderOnce` and `Entity<T: Render>`. You rarely implement it.
- `AnyElement` (`G/element.rs:650`) is arena-allocated per frame. Use `.into_any_element()` (any `IntoElement`) or `.into_any()` (types that implement `Element`, e.g. `Div`) to unify branch types: `if a { div().into_any_element() } else { img(..).into_any_element() }`.
- Text children: `&'static str`, `String`, `SharedString` and `Cow<'static, str>` are elements (`G/elements/text.rs:304-378`). `text!("...")` (`G/elements/text.rs:160`) creates an *accessible* `Text` with a source-location id. Use `StyledText::new(..).with_highlights(..)` for mixed runs.
- `Option<impl IntoElement>` is **not** `IntoElement`. Use `.children(opt)`, since `Option` is an iterator, or `.when_some(..)`.
- `Element` (`G/element.rs:52`) is the low-level trait (`request_layout` → `prepaint` → `paint`, with associated `RequestLayoutState`/`PrepaintState`). It's only needed for custom elements (covered separately).

```rust
#[derive(IntoElement)]
struct Badge { label: SharedString, color: Hsla }

impl RenderOnce for Badge {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        div().px_2().py_0p5().rounded_md().bg(self.color.opacity(0.15))
            .text_color(self.color).text_xs().child(self.label)
    }
}

struct Counter { count: usize }

impl Render for Counter {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().flex().flex_col().gap_2().p_4().size_full()
            .child(Badge { label: format!("{}", self.count).into(), color: blue() })
            .child(
                div().id("inc").px_3().py_1().rounded_md().bg(rgb(0x2563eb)).text_color(white())
                    .cursor_pointer()
                    .hover(|s| s.bg(rgb(0x1d4ed8)))
                    .active(|s| s.opacity(0.8))
                    .on_click(cx.listener(|this, _: &ClickEvent, _window, cx| {
                        this.count += 1;
                        cx.notify();
                    }))
                    .child("Increment"),
            )
    }
}
```

## `div()` and layout (taffy)

- `pub fn div() -> Div` (`G/elements/div.rs:1844`). `Div: Styled + InteractiveElement + ParentElement`.
- **Default display is `Block`**, flex direction defaults to `Row`, and position is `Relative` (`G/style.rs:771-800`). `flex_col()`/`flex_row()` only set the direction (`G/styled.rs:153,167`). **You must also call `.flex()`**, for example `div().flex().flex_col()`. gpui-kit's `v_flex()` and `h_flex()` do this for you.
- Display: `block`, `flex`, `grid`, `hidden` (`G/styled.rs:38-59`). Flex: `flex_1`, `flex_auto`, `flex_initial`, `flex_none`, `flex_grow(f32)`, `flex_shrink_0`, `flex_basis(..)`, `flex_wrap`. Alignment: `items_{start,end,center,baseline,stretch}`, `self_*`, `justify_{start,end,center,between,around,evenly}` and `content_*` (`G/styled.rs:181-470`). Also `aspect_ratio(f32)`/`aspect_square`.
- Grid exists: `.grid().grid_cols(3).grid_rows(2)`, `col_span(n)`, `col_span_full`, `row_span`, `col_start/end` and `grid_cols_min_content/max_content` (`G/styled.rs:752-885`). There's an example at `zed/crates/gpui/examples/grid_layout.rs`.
- Units (`G/geometry.rs`): `px(f32) -> Pixels` (3748), `rems(f32) -> Rems` (3735, 1rem = `window.rem_size()`, 16px by default), `relative(f32) -> DefiniteLength` (3717, fraction of the parent), `auto() -> Length` (3763) and `phi()`. Custom setters take `impl Into<Length>` (`w`, `h`, `size`, `min_*`, `max_*`, `m*`, `inset/top/left/...`) or `impl Into<DefiniteLength>` (`p*`, `gap*`).
- Position: `.relative()` and `.absolute()` (`M/styles.rs:111,118`), then `top_0()`, `left(px(4.))`, `inset_0()`, `right_neg_1()`.
- Overflow: `overflow_hidden`, `overflow_x_hidden` and `overflow_y_hidden` are on `Styled` (`M/styles.rs:135-150`). The **scroll** variants are only on `StatefulInteractiveElement` (they need `.id()`; see below).
- `min_w_0()` is the standard fix when a flex child with long text refuses to shrink (min-size defaults to `auto`, as in CSS; *inference from taffy semantics*). Zed uses it about 50 times across workspace, ui and editor.
- Debugging: `.debug()` / `.debug_below()` (`G/styled.rs:893,900`).

### How the `Styled` methods are generated

`pub trait Styled { fn style(&mut self) -> &mut StyleRefinement; ... }` (`G/styled.rs:22`). Lines 26-34 invoke proc macros from `M/styles.rs`, which is the full generated list:

| macro | generates |
|---|---|
| `style_helpers!` | prefixes `w h size min_size min_w min_h max_size max_w max_h gap gap_x gap_y` (`M/styles.rs:843-924`) plus `rounded rounded_{t,b,l,r,tl,tr,bl,br}` |
| `margin_style_methods!` | `m mt mb my mx ml mr` (`:699`) |
| `padding_style_methods!` | `p pt pb px py pl pr` (`:751`) |
| `position_style_methods!` | `relative absolute`, `inset top bottom left right` (`:803`) |
| `overflow/cursor/visibility` | `overflow_*_hidden`; `cursor(CursorStyle)`, `cursor_pointer/text/grab/ew_resize/...`; `visible`/`invisible` |
| `border_style_methods!` | `border border_{t,b,l,r,x,y}` + `border_color(impl Into<Hsla>)` (`:335`) |
| `box_shadow_style_methods!` | `shadow(Vec<BoxShadow>)`, `shadow_none`, `shadow_{2xs,xs,sm,md,lg,xl,2xl}` (`:384`) |

Naming: `{prefix}(value)` is a custom setter, `{prefix}_{suffix}` is a preset, and `{prefix}_neg_{suffix}` is a negated preset (not for `auto`; `M/styles.rs:531-588`). Spacing suffixes are `0 0p5 1 1p5 2 2p5 3 3p5 4 5 6 7 8 9 10 11 12 16 20 24 32 40 48 56 64 72 80 96 112 128` (rem/4 each: `4` = 1rem = 16px), plus `auto px full 1_2 1_3 2_3 1_4 2_4 3_4 1_5 ... 1_6 5_6 1_12`. Rounded suffixes are `none xs sm md lg xl 2xl 3xl full`. Border suffixes are pixel widths `0 1 2 3 4 5 6 7 8 9 10 11 12 16 20 24 32`. Examples: `size_full()`, `w_1_2()`, `h(px(30.))`, `gap_x_2()`, `mt_neg_1()`, `rounded(px(6.))`, `border_2()`, `px(px(6.))` (horizontal padding).

## Colours (`G/color.rs`)

```text
pub fn rgb(hex: u32) -> Rgba            // :14  rgb(0x1e293b)
pub fn rgba(hex: u32) -> Rgba           // :20  rgba(0x1e293bcc) — alpha is the LOW byte
pub const fn hsla(h: f32, s: f32, l: f32, a: f32) -> Hsla  // :424 — all in 0..=1
pub struct Hsla { pub h: f32, pub s: f32, pub l: f32, pub a: f32 }  // :334
pub const fn black()/white()/red()/blue()/green()/yellow()/transparent_black()/transparent_white() -> Hsla // :434-514
pub const fn opaque_grey(lightness: f32, opacity: f32) -> Hsla // :464
```

- **Hue is 0..1, not degrees**: write `hsla(210. / 360., 0.4, 0.5, 1.)`. Values are clamped.
- `Hsla` methods: `.opacity(f)` (multiplies alpha), `.alpha(a)` (sets it), `.blend(other)`, `.grayscale()`, `.fade_out(&mut)`, `.to_rgb()` and `is_transparent()`. `Rgba: TryFrom<&str>` parses `"#rrggbb"` (`:224`).
- `text_color`/`border_color` take `impl Into<Hsla>`. `Rgba` converts (`:677`). `bg` takes `impl Into<Fill>` (Hsla, Rgba or Background, `G/style.rs:875-891`). Gradients: `linear_gradient(angle_deg, linear_color_stop(c, 0.), linear_color_stop(c2, 1.))` (`:865`). Also `pattern_slash`.
- `gpui::colors::Colors::for_appearance(window)` (`G/colors.rs`) is a minimal light/dark palette.

## Borders, radius, shadow, opacity

- A border paints only when **both** a non-zero width and a non-transparent `border_color` are set (`G/style.rs:764`, where `border_color` defaults to `None`). `border_dashed()` (`G/styled.rs:500`).
- `BoxShadow` (`G/style.rs:349`) now has an `inset: bool` field, so struct literals from older gpui code won't compile. Use the builder: `BoxShadow::new(px(0.), px(2.), black().opacity(0.2)).blur_radius(px(8.)).spread_radius(px(0.))` and `.inset()` (`:366-400`). gpui-kit also has `box_shadow(x, y, blur, spread, color)` (`B/styled.rs:51`).
- `.opacity(f32)` applies to the element and its children (`G/styled.rs:746`).

## Text styling (cascades to descendants)

`text_color`, `text_bg`, `text_size(impl Into<AbsoluteLength>)`, `text_xs/sm/base/lg/xl/2xl/3xl` (rems 0.75…), `font_family(impl Into<SharedString>)`, `font_weight(FontWeight)` (consts `FontWeight::{THIN..BOLD,BLACK}`, `G/text_system.rs:1192-1208`), `font(Font)` (via `font("Name")` `G/text_system.rs:1351`), `line_height(impl Into<DefiniteLength>)` (the default is `phi()`, a ratio), `italic`, `underline`, `line_through`, `text_left/center/right`, `whitespace_nowrap/normal`, `text_ellipsis`, `text_ellipsis_start`, `text_ellipsis_middle`, `line_clamp(n)` and `truncate()` (= `overflow_hidden().whitespace_nowrap().text_ellipsis()`, `G/styled.rs:139`). These are all in `G/styled.rs:75-745`. The defaults are black, `.SystemUIFont`, 1rem and `phi` line height (`G/style.rs:488-500`). Truncation needs a bounded width, which means `min_w_0()` or `w(..)` on the flex item.

## Interactivity (`G/elements/div.rs`)

- `InteractiveElement` (`:792`): `id(impl Into<ElementId>) -> Stateful<Self>` (`:803`), `group`, `track_focus(&FocusHandle)`, `key_context`, `hover(|StyleRefinement| ..)` (`:866`), `group_hover(name, f)`, `on_mouse_down(MouseButton, Fn(&MouseDownEvent, &mut Window, &mut App))` (`:893`), `on_mouse_up/move`, `on_scroll_wheel`, `on_key_down`, `on_action::<A>`, `on_drop`, `drag_over`, `focus(..)`, `focus_visible(..)`, `occlude()`.
- `StatefulInteractiveElement` (`:1353`) is only on `Stateful<E>`: `overflow_scroll` / `overflow_x_scroll` / `overflow_y_scroll` (`:1569-1586`), `track_scroll(&ScrollHandle)` (`:1596`), `active(f)` (`:1608`), `on_click(Fn(&ClickEvent, &mut Window, &mut App))` (`:1637`), `on_aux_click`, `on_drag`, `on_hover(Fn(&bool, ..))`, `tooltip(Fn(&mut Window, &mut App) -> AnyView)` (`:1729`), `hoverable_tooltip`, `tooltip_show_delay`, `focusable`, and the a11y builders `role`/`aria_*`.
- **Why the id matters:** state that persists across frames (click and active tracking, hover, tooltip timers, scroll offset) is stored under the element's `GlobalElementId` (the path of ancestor ids). The id must be unique among siblings under the nearest ancestor with an id (`G/element.rs:63-67`). In lists use `.id(ix)` or `.id(("row", ix))`. `ElementId` converts from `&'static str`, `SharedString`, `String`, `usize`/`u64`/`i32`, `(&'static str, usize)`, `(SharedString, usize)`, `&FocusHandle` and `Uuid` (`G/window.rs:7696-7798`).
- `hover`, `group_hover`, `cursor_*` and `on_mouse_down` work **without** an id (any of them inserts a hitbox, `G/elements/div.rs:2458`). `on_click`, `active`, `tooltip` and scrolling require `.id()` at compile time.
- Calling `hover`, `tooltip` or `on_hover` twice on one element `debug_assert!`-panics (`:867, :726, :703`). Merge the styles into one closure.
- `ClickEvent` is an enum (`Mouse`/`Keyboard`/`Touch`, `G/interactive.rs:290`) with methods like `click_count()`, `standard_click()`, `modifiers()`, `is_right_click()`, `is_keyboard()` and `position()`. Keyboard activation (Space or Enter on a focused element) also fires `on_click`.
- `cx.listener` (`G/app/context.rs:246`): `fn listener<E: ?Sized>(&self, f: impl Fn(&mut T, &E, &mut Window, &mut Context<T>) + 'static) -> impl Fn(&E, &mut Window, &mut App) + 'static`. It holds a **weak** handle, so it is safe to store. `cx.processor` (`:260`): `Fn(&mut T, E, &mut Window, &mut Context<T>) -> R` becomes `Fn(E, &mut Window, &mut App) -> R`, which suits list item renderers.
- Tooltip with gpui-kit: `.tooltip(|window, cx| Tooltip::new("Save").build(window, cx))` with `use gpui_kit::component::tooltip::Tooltip` (`C/tooltip.rs:48,86`). Zed's ui crate offers a helper returning that closure (`ui/src/components/tooltip.rs:46`). Raw gpui needs an `AnyView`: `cx.new(|_| MyTip).into()`.

### Scrolling

```rust
struct Log {
    scroll: ScrollHandle, // ScrollHandle::new() or Default (:4308)
    lines: Vec<SharedString>,
}

impl Log {
    fn append(&mut self, line: SharedString, cx: &mut Context<Self>) {
        self.lines.push(line);
        self.scroll.scroll_to_bottom(); // also scroll_to_item(ix), offset()
        cx.notify();
    }
}

impl Render for Log {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().id("log").size_full().overflow_y_scroll().track_scroll(&self.scroll).children(self.lines.iter().cloned())
    }
}
```

- A scroll container needs a bounded size (e.g. `size_full`/`flex_1` inside a sized parent, or `h(px(..))`). gpui draws **no scrollbar**. gpui-kit adds `overflow_y_scrollbar()` / `overflow_scrollbar()` / `vertical_scrollbar(&handle)` via `gpui_kit::component::scroll::ScrollableElement` (`C/scroll/scrollable.rs:16-63`), which is implemented for `Div` and `Stateful<E>`.
- Example: `zed/crates/gpui/examples/scrollable.rs`.

## Lists

`uniform_list` (`G/elements/uniform_list.rs:22`) is virtualised and measures the first item only:

```text
pub fn uniform_list<R: IntoElement>(id: impl Into<ElementId>, item_count: usize,
    f: impl 'static + Fn(Range<usize>, &mut Window, &mut App) -> Vec<R>) -> UniformList
```

```rust
use std::ops::Range;

struct Files {
    files: Vec<SharedString>,
    selected: Option<usize>,
    list_scroll: UniformListScrollHandle, // (:80, :686)
}

impl Render for Files {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        uniform_list(
            "files",
            self.files.len(),
            cx.processor(|this, range: Range<usize>, _window, cx| {
                range
                    .map(|ix| {
                        div()
                            .id(ix)
                            .h(px(24.))
                            .px_2()
                            .when(this.selected == Some(ix), |row| row.bg(rgb(0xdbeafe)))
                            .child(this.files[ix].clone())
                            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                this.selected = Some(ix);
                                cx.notify();
                            }))
                    })
                    .collect()
            }),
        )
        .track_scroll(&self.list_scroll)
        .h_full() // needs a bounded height
    }
}
```

- It already has an id and sets `overflow_y: Scroll`. `UniformListScrollHandle::scroll_to_item(ix, ScrollStrategy::{Top,Center,Bottom,Nearest})` (`:84,:150`). Other builders: `with_sizing_behavior(ListSizingBehavior::Infer)`, `with_width_from_item(Some(ix))`, `y_flipped`, `with_decoration`.
- Rows must all have the same height. Zed's completion menu builds one with `cx.processor` (`editor/src/code_context_menus.rs:966`).

`list` + `ListState` (`G/elements/list.rs`) handles variable heights. The item renderer is passed to `list()`, **not** stored in `ListState` (older API):

```text
pub fn list(state: ListState, render_item: impl FnMut(usize, &mut Window, &mut App) -> AnyElement + 'static) -> List // :24
pub fn new(item_count: usize, alignment: ListAlignment, overdraw: Pixels) -> Self // ListState, :314
```

```rust
struct Messages {
    messages: Vec<SharedString>,
    list_state: ListState,
}

impl Messages {
    fn new(messages: Vec<SharedString>) -> Self {
        let list_state = ListState::new(messages.len(), ListAlignment::Bottom, px(200.));
        Self { messages, list_state }
    }

    fn push(&mut self, message: SharedString, cx: &mut Context<Self>) {
        let count = self.messages.len();
        self.messages.push(message);
        self.list_state.splice(count..count, 1); // ListState doesn't see the data: report changes
        cx.notify();
    }

    fn render_row(&mut self, ix: usize, _: &mut Window, _: &mut Context<Self>) -> AnyElement {
        div().p_2().child(self.messages[ix].clone()).into_any_element()
    }
}

impl Render for Messages {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        list(self.list_state.clone(), cx.processor(Self::render_row)).size_full()
    }
}
```

- `ListState` is `Clone` (an `Rc`). It does not see your data. When items change, call `splice(old_range, new_count)` (`:490`) or `reset(count)` (`:355`); `remeasure()` after style changes. Other methods: `scroll_to_reveal_item`, `scroll_to_end`, `set_follow_mode(FollowMode::Tail)` (chat logs), `.measure_all()` and `.with_uniform_item_height(px)` for an accurate scrollbar. Use `ListAlignment::Bottom` for bottom-anchored chat.
- This is Zed's pattern too (`zed/src/zed/telemetry_log.rs:523`). Example: `gpui/examples/list_example.rs`. gpui-kit also has `v_virtual_list` / `VirtualList` (`C/virtual_list.rs`).

## Images, SVG, assets, fonts

- `pub fn img(source: impl Into<ImageSource>) -> Img` (`G/elements/img.rs:201`). **String sources:** a valid URL is fetched over HTTP (`gpui_kit::application()` installs a fetch client, `gpui-pre-platform/src/gpui_platform.rs:46`). **Any other string is an *embedded asset path* looked up in the `AssetSource`, not the filesystem** (`:63-80`). For files use `PathBuf`/`&Path`/`Arc<Path>`. `Arc<Image>`, `Arc<RenderImage>` and a custom loader closure are also accepted (`:107-126`). The `StyledImage` methods are `object_fit(ObjectFit::..)`, `grayscale`, `with_loading(|| ..)` and `with_fallback(|| ..)` (`:148`).
- `svg()` (`G/elements/svg.rs:27`): `.path("icons/x.svg")` (from the AssetSource), `.external_path(fs_path)`, `.data(&[u8])` and `.with_transformation(Transformation::rotate(..))`. **An SVG is a monochrome mask tinted by `text_color`. Without a text colour in effect (set on it or inherited) it paints nothing** (`:149-185`). It also needs a size: `svg().path(p).size_4().text_color(c)`.
- `AssetSource` (`G/assets.rs:13`): `fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>>` and `fn list(&self, path: &str) -> Result<Vec<SharedString>>`. Register with `Application::with_assets(self, impl AssetSource) -> Self` (`G/app.rs:232`). There is **one source per app**, so to keep gpui-kit's component icons you must compose with `gpui_kit::assets::Assets` (`gpui-kit-assets-0.8.1/README.md:55-80`). gpui-kit-assets embeds with `rust_embed::RustEmbed` (`gpui-kit-assets/src/native_assets.rs`). Adding `rust-embed` yourself is optional.

```rust
use std::borrow::Cow;

// In an app: include_bytes!("../../../assets/icons/logo.svg"), relative to the source file.
const LOGO_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>"#;

struct AppAssets;

impl AssetSource for AppAssets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        match path {
            "icons/logo.svg" => Ok(Some(Cow::Borrowed(LOGO_SVG))),
            // The app's files first: the Kit's source errors on paths it doesn't know.
            _ => gpui_kit::assets::Assets.load(path),
        }
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        gpui_kit::assets::Assets.list(path)
    }
}

fn main() {
    gpui_kit::application().with_assets(AppAssets).run(|cx| {
        gpui_kit::init(cx);
        // svg().path("icons/logo.svg").size_6().text_color(...) now resolves, and Kit icons still render
    });
}
```

- Selected extra Lucide icons: `gpui_kit::assets::icon_assets!(ExtraIcons, [Search, Check]);` generates an `AssetSource` that returns `Ok(None)` for other paths. Compose it the same way.
- Fonts: `cx.text_system().add_fonts(vec![Cow::Borrowed(include_bytes!("../assets/fonts/Inter.ttf").as_slice())])?` with signature `pub fn add_fonts(&self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()>` (`G/text_system.rs:302`). It's available on `App` (`G/app.rs:2475`, returns `&Arc<TextSystem>`) and on `Application` (`:359`). Then use `.font_family("Inter")` (the family name, not the file name). Native platforms use system fonts. The **web** target has none, so the examples load fonts first (`gpui/examples/example_support/fonts.rs`). gpui-kit's `Theme` picks `font_family`/`mono_font_family` with installed fallbacks (`C/theme/mod.rs:160-181`).

## Conditional rendering (`G/util.rs:11`, needs `prelude::*`)

`map(|this| ..)`, `when(cond, |this| ..)`, `when_else(cond, then, else)`, `when_some(opt, |this, v| ..)` and `when_none(&opt, |this| ..)`. These are blanket-implemented for every `IntoElement` (`G/element.rs:160`), but not for `StyleRefinement`, so you can't use them inside `hover(|s| ..)` closures.

```rust
#[derive(IntoElement)]
struct Row {
    label: SharedString,
    selected: bool,
    compact: bool,
    error: Option<SharedString>,
}

impl RenderOnce for Row {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        div()
            .child(self.label)
            .when(self.selected, |d| d.bg(rgb(0xdbeafe)))
            .when_some(self.error, |d, error| d.child(div().text_color(red()).child(error)))
            .map(|d| if self.compact { d.p_1() } else { d.p_4() })
    }
}
```

## Performance in render

- `render` runs on every frame in which the window is dirty, and the element tree is rebuilt from scratch each frame (`G/element.rs:10-14`). Keep it cheap. Hold display strings as `SharedString` (`Arc<str>`, cheap to clone) rather than `format!`-ing per frame. Use `uniform_list`/`list` for anything long. Never do I/O in `render`.
- `cx.notify()` (`G/app/context.rs:221`) marks the entity dirty and schedules a redraw. Call it only when visible state changed. Child views embedded with `.child(entity)` are **re-rendered every frame regardless** (the uncached path always calls render, `G/view.rs:484-506`). To make a subtree reuse its previous frame until *that* entity notifies, embed it with `entity.cached(style)` / `AnyView::cached` (`G/view.rs:46,258`). A cached view needs a definite size from `style` because it isn't measured from its content. Zed caches docked panels and panes this way (`workspace/src/dock.rs:1364`, `pane_group.rs:581`, using a full-size flex column refinement). `StyleRefinement` is `Styled` (`G/style.rs:324`), so `StyleRefinement::default().size_full()` works.
- Splitting heavy UI into separate `Entity` views gives each one a notify boundary. `window.refresh()` ignores caches.
- Transient per-element state without a view field: `window.use_state(cx, |w, cx| ..) -> Entity<S>` and `use_keyed_state(key, ..)` (`G/window.rs:4356,4382`). `use_state` is keyed by call site, so use `use_keyed_state` inside loops.
- Continuous animation: `window.request_animation_frame()` (`G/window.rs:2742`) or `AnimationExt::with_animation`.

## Zed patterns (GPL, paraphrased)

- Zed's `ui` crate defines nearly every widget as a `RenderOnce` + `#[derive(IntoElement)]` props struct with chained builder methods (67 derives in `ui/src/components`). Stateful pieces (editor, panels) are `Entity<T: Render>`.
- `h_flex()`/`v_flex()` free functions (`ui/src/components/stack.rs:7,13`) and a `StyledExt` trait (`ui/src/traits/styled_ext.rs:30-37`) add elevation helpers taking `cx`.
- Theme colours come from `cx.theme().colors().<field>` through Zed's own `ActiveTheme` (`theme/src/theme.rs:150`). This is **not** the gpui-kit theme API; don't mix them.
- Sizes are in rems so the UI scales with the user's font size (`ui/src/styles/units.rs`, `typography.rs`).

## gpui-kit's styling layer (`gpui_kit::component` / `gpui_kit::base`)

- `h_flex()` = `div().flex().flex_row().items_center()`. `v_flex()` = `div().flex().flex_col()` (`B/styled.rs:38,46`; trait versions on `StyledExt`, `B/styled.rs:78,105`). **These are asymmetric:** `h_flex` centres on the cross axis, so a column inside an `h_flex` row does not stretch to the row's height. Give it `h_full()`, or call `items_start()`/`items_stretch()` on the row.
- `StyledExt` (also `gpui_kit::component::StyledExt`) adds `refine_style(&StyleRefinement)`, `paddings(..)`, `margins(..)`, `corner_radii(Corners<Pixels>)` and `debug_red/blue/...`. `ThemeStyled` (`C/styled.rs:129`) adds `popover_style(cx)` and `focus_ring_style(window, cx)`.
- Theme: `use gpui_kit::component::ActiveTheme as _;` then `cx.theme()` returns `&Theme` (`C/theme/mod.rs:44`, implemented for `App`, so a `Context<T>` works via deref). `Theme` derefs to `ThemeColor` (`:220`), so fields read directly: `cx.theme().background`, `.foreground`, `.border`, `.muted_foreground`, `.primary`, `.accent`, `.danger`, `.list_hover`. The theme also has `font_family`, `font_size`, `mono_font_family`, `radius`, `radius_lg` and `mode` (`:147-187`). `gpui_kit::init(cx)` installs it. gpui-base has a separate crate-private `ActiveTheme` returning `Theme` by value (`B/theme.rs:42`), which is not for apps.
- `Sizable` (`C/sizing.rs:190`): `with_size(impl Into<Size>)`, `xsmall()`, `small()`, `large()`, with `Size::{XSmall, Small, Medium (default), Large, Size(Pixels)}`. It's implemented by Kit components (e.g. `Button::new("ok").primary().small()`). Other component traits: `Selectable` (`.selected(bool)`), `Disableable` (`.disabled(bool)`) and `Collapsible` (`B/component_traits.rs`).
