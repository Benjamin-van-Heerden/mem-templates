---
name: gpui
description: How to write GPUI code (Zed's Rust UI framework) through gpui-kit at the pinned version - entities and contexts, elements and styling, actions, keys and focus, events, async, custom elements and text input, testing with headless screenshots, app architecture, and the outdated APIs models get wrong. Use before writing or changing any GPUI view, element, action, test or app startup code.
---

# GPUI

GPUI is Zed's UI framework. It has few docs, changes weekly, and AI models' training data mixes several incompatible API generations. This skill was written on 2026-10-26 from the source of the versions this template pins:
- gpui-kit 0.8.1 (longbridge, Apache-2.0), which pins gpui-pre 0.3.10;
- gpui-pre 0.3.10 (Apache-2.0), a snapshot of github.com/zed-industries/zed at commit 08cbb88, published by Longbridge.

Every `rust` block in this skill compiles against those versions; `text` blocks are signature listings.

**If the project's `Cargo.lock` has other versions, the details here may be wrong.** Check the source (below) before trusting an example, and update the skill when the pin moves.

## Read the source, not your memory

The locked source is the authority. Find it with:

```sh
cargo metadata --format-version 1 --offline | jq -r '.packages[] | select(.name | test("^gpui")) | "\(.name) \(.manifest_path)"'
```

- **gpui:** `~/.cargo/registry/src/index.crates.io-*/gpui-pre-0.3.10/`. It has `src/`, `docs/` (partly stale, see `outdated-patterns`) and `examples/`. The examples are short, current programs: `hello_world.rs`, `input.rs`, `list_example.rs`, `scrollable.rs`, `set_menus.rs`, `tab_stop.rs`, `testing.rs` and more.
- **Components:** `gpui-kit-0.8.1/` (`src/lib.rs`, `TESTING.md`) and `gpui-component-0.8.1/src/` (components), `gpui-base-0.8.1/src/` (behaviour). gpui-kit also publishes docs at https://gpui-kit.com and https://gpui-kit.com/llms.txt.
- **Zed itself:** most of github.com/zed-industries/zed is GPL-3.0. Read it for patterns and never copy its code into an app. The `gpui*` crates are Apache-2.0.

## The rules that matter most

1. **Depend on `gpui-kit` alone.** App code imports `use gpui_kit::*;` and `use gpui_kit::prelude::*;` (the prelude carries `FluentBuilder`: `.when`, `.when_some`, `.map`). Test files import names explicitly, because with `test-support` the glob brings GPUI's `test` macro over Rust's `#[test]`.
2. **Start the app with assets, then init, then the window:**
   ```text
   gpui_kit::application().with_assets(gpui_kit::assets::Assets).run(|cx| {
       gpui_kit::init(cx);
       gpui_kit::open_window(options, cx, |window, cx| cx.new(|cx| View::new(window, cx)))
   })
   ```
   - Without `with_assets`, component icons render blank.
   - `open_window` wraps the view in gpui-base's `Root`, which dialogs, sheets and notifications need. Never use raw `cx.open_window` for app windows.
3. **Contexts:**
   - The current types are `App`, `Context<T>`, `Window`, `Entity<T>` and `WeakEntity<T>`. `Model`, `View`, `ViewContext` and `WindowContext` no longer exist.
   - `window` comes before `cx` in every signature.
   - Inside `entity.update(cx, |this, cx| …)`, use the inner `cx`.
4. **Async:**
   - Write `cx.spawn(async move |this, cx| …)`, where `this` is a `WeakEntity`.
   - On `AsyncApp`, `update` and `read_with` return the value directly, not a `Result`.
   - `WeakEntity::update` and window updates return `Result`.
   - There is no tokio runtime. Never block the main thread.
5. **No re-entrant updates.** Reading or updating an entity while it is being updated (including your own handle inside `render` or `update`) panics. Pass data down, use `&mut self`, emit an event, or `cx.defer`.
6. **Call `cx.notify()` after changing state that is shown.** Reading an entity in `render` is enough to re-render when it notifies.
7. **Keep what you start.** Dropping a `Subscription` unsubscribes and dropping a `Task` cancels it. Store them (`_subscriptions: Vec<Subscription>`, `_task: Task<…>`) or `.detach()` them deliberately.
8. **Layout:**
   - `div()` is block layout: `.flex_col()` does nothing without `.flex()`. gpui-kit's `v_flex()`/`h_flex()` set both, and `h_flex` centres its children vertically.
   - Scroll containers and lists need a bounded size.
   - A border needs `border_color`.
   - An `svg()` needs a size and a text colour.
9. **Element ids:** `on_click`, `active`, `tooltip` and scrolling need `.id(…)`, unique among siblings (`.id(("row", ix))` in lists).
10. **Focus:**
    - Focus something when a window opens. With nothing focused, element `on_action` handlers and key contexts never fire.
    - Create each `FocusHandle` once, in the constructor.
11. **Actions:**
    - Declare unit actions with `actions!(namespace, [A, B])` and data actions with `#[derive(Clone, PartialEq, serde::Deserialize, schemars::JsonSchema, Action)]`, which needs `schemars` 1.x.
    - Names must be unique in the binary.
    - Bind platform keys with `#[cfg(target_os = "macos")] KeyBinding::new("cmd-…")`: `secondary-` panics in `KeyBinding::new`.
12. **Check UI changes yourself** with a headless screenshot test, and drive workflows through it: click and type through `TestWindowExt`, then capture each step (see `testing`). Look at the PNGs before saying a view or a flow works.

## A complete view

```rust
use gpui_kit::component::{
    ActiveTheme as _, Sizable as _,
    button::{Button, ButtonVariants as _},
    h_flex, v_flex,
};

pub struct Counter {
    count: usize,
}

impl Counter {
    pub fn new(_window: &mut Window, _cx: &mut Context<Self>) -> Self {
        Self { count: 0 }
    }
}

impl Render for Counter {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .size_full()
            .gap_4()
            .p_4()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .child(format!("Clicked {} times", self.count))
            .child(
                h_flex().gap_2().child(
                    Button::new("increment").primary().small().label("Increment").on_click(cx.listener(
                        |this, _: &ClickEvent, _window, cx| {
                            this.count += 1;
                            cx.notify();
                        },
                    )),
                ),
            )
    }
}

fn main() {
    gpui_kit::application().with_assets(gpui_kit::assets::Assets).run(|cx| {
        gpui_kit::init(cx);
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| cx.new(|cx| Counter::new(window, cx)))
            .expect("open the main window");
        cx.activate(true);
    });
}
```

## References

Read the one that matches the task. Each lists the source files it was written from.

| Reference | Covers |
|---|---|
| [entities-and-contexts](references/entities-and-contexts.md) | `App`, `Context<T>`, `Window`, `Entity`/`WeakEntity`, update rules and the re-entrancy panic, `notify`, globals, application startup, windows, quitting, entity lifecycle |
| [elements-and-styling](references/elements-and-styling.md) | `Render`/`RenderOnce`, `div()` and flex/grid layout, the generated style methods, colours, text, interactivity and ids, scrolling, `uniform_list`/`list`, images, SVG, assets, fonts, conditional rendering, render performance, gpui-kit's styling layer |
| [actions-keys-focus](references/actions-keys-focus.md) | Declaring actions, key bindings and keystroke syntax, key contexts and predicates, dispatch order and propagation, focus and tab order, menus, quitting |
| [events-and-subscriptions](references/events-and-subscriptions.md) | `EventEmitter`/`emit`/`subscribe`, `observe`, the `_in` variants and the current-window rule, `Subscription` lifetimes, which to use when |
| [async-and-tasks](references/async-and-tasks.md) | `spawn`, `spawn_in`, `background_spawn`, `Task` cancellation, return types in async code, timers and debouncing, channels, blocking I/O, tokio and HTTP |
| [custom-elements-and-text-input](references/custom-elements-and-text-input.md) | When to write an `Element`, its phases and window APIs, `canvas()`, text input from scratch, gpui-kit's `Input`/`InputState` |
| [testing](references/testing.md) | `#[gpui_kit::test]`, `TestAppContext`/`VisualTestContext`, gpui-kit's test queries, executor timers, headless screenshots with `HeadlessAppContext` |
| [app-architecture](references/app-architecture.md) | Startup in real apps, app state in a `Global` holding an `Entity`, root and overlays, dock, settings and themes, persistence, crate structure, logging and errors, pitfalls real apps hit |
| [outdated-patterns](references/outdated-patterns.md) | The old idioms models write and their current forms. **Read this when code from memory doesn't compile.** |

## When the pin moves

After bumping `gpui-kit` (and with it `gpui-pre`):
1. Re-check `outdated-patterns` and the rules above against the new source.
2. Update the version lines in this file and in each reference.
3. Run `python3 .agents/skills/gpui/scripts/check_examples.py <scratch dir outside the project> <new gpui-kit version>` in the background. It compiles every example in this skill and runs its test. Fix the examples that fail; each generated module's first line names the file and line it came from.
4. Promote the updated skill to the template (`mem template promote skill gpui`) once the user agrees, so other projects get it.
