# App architecture (gpui-kit 0.8.1 / gpui-pre 0.3.10)

Paths are relative to these roots:
- `kit/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-kit-0.8.1/`; `comp/`, `base/`, `assets/` = the matching `gpui-component-0.8.1/`, `gpui-base-0.8.1/`, `gpui-kit-assets-0.8.1/`; `gpui/` = `gpui-pre-0.3.10/src/`; `plat/` = `gpui-pre-platform-0.3.10/src/`.
- `zed/` = Zed at 08cbb88 (GPL-3.0: patterns only, nothing copied).
- Third-party apps (all Apache-2.0 or MIT/Apache, checked 2026-10-26): [vicanso/zedis](https://github.com/vicanso/zedis), [AprilNEA/OpenLogi](https://github.com/AprilNEA/OpenLogi), [0xErwin1/dbflux](https://github.com/0xErwin1/dbflux), [tobi/disktree](https://github.com/tobi/disktree) (MIT), the kit's gallery [longbridge/gpui-kit crates/story](https://github.com/longbridge/gpui-kit/tree/main/crates/story).
- "(inferred)" marks a conclusion not read directly from source. The code examples are original (nothing is copied from GPL code) and compile against the pinned versions.

## 1. Application startup

### gpui-kit's entry points (the template's facade)
- `kit/src/lib.rs:200` `pub use platform::application;` → `plat/gpui_platform.rs:13` `pub fn application() -> gpui::Application` (just `Application::with_platform(current_platform(false))`). **It registers no assets.**
- `kit/src/lib.rs:207` `pub fn init(cx: &mut App)` → `comp/src/lib.rs:130` `gpui_component::init`: theme (registry + `Theme::change(Light)`), registers the component `WindowState` as a Base `Root` plugin, `gpui_base::init` (`base/src/lib.rs:239`: Theme global, dialog, focus trap, popover, input, Root key bindings Tab/Shift-Tab/Copy), then dock, sheet, notification, menu, table, tooltip.
- `kit/src/lib.rs:181`:
  `pub fn open_window<V: Render>(options: WindowOptions, cx: &mut App, build: impl FnOnce(&mut Window, &mut App) -> Entity<V>) -> Result<(AnyWindowHandle, Entity<V>)>` — wraps the returned view in `base::Root::new(view, window, cx)` (`base/src/root.rs:175`). Return the content entity, never another Root. In async code call it inside `cx.update`.
- Icons need an asset source: `gpui_kit::application().with_assets(gpui_kit::assets::Assets)` (`assets/src/lib.rs`: `Assets` = default component icons, `AllAssets` = full Lucide set). The gallery does `.with_assets(AllAssets)` (story `main.rs`); the kit docs list "blank icon → missing `with_assets`" as the first troubleshooting item (`website/docs/assets.md`). `with_assets` takes **one** source, so an app with its own files writes a composite `AssetSource` that checks its own files first: the built-in native source returns an error (not `Ok(None)`) for unknown paths.

### gpui `Application` / `App` signatures used at startup
- `gpui/app.rs:232` `with_assets(self, impl AssetSource) -> Self`; `:257` `with_quit_mode(self, QuitMode) -> Self`; `:278` `run<F: 'static + FnOnce(&mut App)>(self, F)`; `:325` `on_open_urls(&self, FnMut(Vec<String>))`; `:335` `on_reopen(&self, FnMut(&mut App))`. Register the `on_*` callbacks before `run`.
- `QuitMode` (`app.rs:492`): `Default` = Explicit on macOS, LastWindowClosed elsewhere; `LastWindowClosed`; `Explicit`.
- `App`: `open_window` `:1565`, `set_app_identity(&self, id, name)` `:1948` (Windows system notifications), `set_global` `:2560`, `observe_global` `:2585`, `bind_keys` `:2741`, `on_action` `:2760`, `on_app_quit(&self, FnMut(&mut App) -> Fut) -> Subscription` `:2851` (quit waits on the future), `on_window_closed(&self, FnMut(&mut App, WindowId)) -> Subscription` `:2886`, `set_menus(&self, impl IntoIterator<Item = Menu>)` `:2923`.
- `WindowOptions` `gpui/platform.rs:2579` (`window_bounds: Option<WindowBounds>`, `titlebar`, `window_min_size`, `app_id`, `kind`, …); `WindowBounds::{Windowed, Maximized, Fullscreen}(Bounds<Pixels>)` `:2723`; `Bounds::centered(display_id: Option<DisplayId>, size, cx: &App)` `gpui/geometry.rs:740`.
- `comp/src/title_bar.rs:82` `TitleBar::window_options() -> WindowOptions` (transparent titlebar, `app_owns_titlebar_drag: true`); use as `..TitleBar::window_options()` when the window draws `TitleBar`.

### What real apps do in `main`
- **Zed** (`zed/crates/zed/src/main.rs:201` onward, described): before `run` — crash handler, `init_paths()` (`:1660`, creates config/data/log/db dirs, collects errors to show later), file logger, `Application` built with its embedded `Assets`, app database opened, settings and keymap file watchers started as channels, `on_open_urls`/`on_reopen` registered. Inside `run` — ~100 `some_crate::init(cx)` calls in dependency order (settings and theme first, features, `workspace::init` late), embedded fonts loaded, `set_menus(app_menus(cx))`, then async `restore_or_create_workspace`. URLs that arrive during restore wait for it (comment cites zed#61346).
- **gpui-kit gallery** (story `lib.rs` `init`): tracing subscriber; `gpui_kit::init`; app `Global` state; `themes::init` (load saved theme JSON, `ThemeRegistry::watch_dir("./themes")`, observe the `Theme` global to save); `bind_keys` with per-OS `cfg` (`cmd-q` vs `alt-f4`); `on_action(Quit)`; `register_panel` for the dock. `create_new_window_with_size` clamps the size to 85% of the primary display, uses `Bounds::centered`, `..TitleBar::window_options()`, opens inside `cx.spawn` + `cx.update`, then `activate_window()` and `set_window_title`.
- **zedis** (`src/main.rs` is 19 lines → `zedis_gui::run()` in `src/lib.rs`): file logger guard held for the whole run, panic hook (crash report), TLS crypto provider, load `zedis.toml` (on error: log and start with defaults), single-instance claim (a second launch forwards its URLs and exits), open the local DB. If the DB fails, `run` opens a small **recovery window** instead of the app. Otherwise `launch`: register bundled fonts, register themes, resolve window bounds, wrap state in an `Entity` and set the Global, apply fonts **before** the theme, place notifications, register the quit flush.
- **OpenLogi** (`crates/openlogi-desktop/src/main.rs`): tracing, single-instance guard, load `config.toml` (if parsing fails: run with an ephemeral config and **disable writes** so a bad file is never overwritten), set the UI locale before any menu exists, start IPC, `with_assets(AppAssets)`, `on_open_urls` → channel, `on_reopen(open main window)`; in `run`: component init, themes, menus, globals, `on_window_closed` quits when no windows remain, then one `runtime::spawn` task owns the event loop.

### Recommended `main` (template)
The `gpui-setup` skill's starter files implement this layout. In one file:

```rust
use gpui_kit::component::{TitleBar, v_flex};

// crates/app/src/main.rs: process concerns only (logging, paths, loading settings),
// then the ui crate takes over inside the event loop.
fn main() {
    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets) // or the app's composite source, app files first
        .run(|cx| {
            gpui_kit::init(cx);
            // ui::init(cx): globals, theme, keymap, actions, menus
            open_main_window(cx);
        });
}

// crates/ui/src/lib.rs
pub fn open_main_window(cx: &mut App) {
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::centered(size(px(960.), px(640.)), cx)), // or restored bounds, clamped to a display
        window_min_size: Some(size(px(640.), px(400.))),
        ..TitleBar::window_options()
    };
    if let Err(err) = gpui_kit::open_window(options, cx, |window, cx| cx.new(|cx| Workspace::new(window, cx))) {
        tracing::error!("cannot open main window: {err:#}");
        cx.quit();
    }
}

pub struct Workspace;

impl Workspace {
    pub fn new(_window: &mut Window, _cx: &mut Context<Self>) -> Self {
        Self
    }
}

impl Render for Workspace {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        v_flex().size_full().child(TitleBar::new().child("My app")).child(div().flex_1().p_4().child("Content"))
    }
}
```

## 2. State management

Primitives: `Entity<T>` (owned, observable, `cx.notify()`), `EventEmitter<E>` + `cx.emit` / `cx.subscribe` (typed events), `Global` (marker trait, `gpui/global.rs:22`; `cx.global::<G>()`, `set_global`, `observe_global`), `WeakEntity` for back references.

**The convergent pattern: a `Global` newtype holding `Entity<AppState>`.** Zed: `GlobalAppState(Arc<AppState>)` whose fields are `Entity<UserStore>`, `Entity<WorkspaceStore>`, etc. (`zed/crates/workspace/src/workspace.rs:1332-1345`). zedis: `ZedisGlobalStore { app_state: Entity<ZedisAppState> }` with `read`/`update` helpers (`src/states/app.rs:596`). OpenLogi: `struct GlobalAppState(Entity<AppState>)` (`crates/openlogi-desktop/src/state.rs:145`). Why: a bare `Global` has no per-entity notify or events; `observe_global` fires on any `global_mut`. An `Entity` in a Global gives `subscribe`/`observe`, `emit` and `notify`, and keeps one owner (inferred rationale; it matches all three).
- dbflux splits further: `dbflux_app::AppState` is a plain struct with **no GPUI** (drivers, profiles, history), wrapped by `AppStateEntity` in `dbflux_ui_base`, which emits UI events (`UserErrorReported`, `OpenAuditRequested`) (dbflux `ARCHITECTURE.md`, "Core Components").
- The gallery's `AppState` is a plain `Global` (flags plus one `Entity<Vec<_>>`) observed with `observe_global`. That is fine for a few flags.

**Events vs direct updates.**
- Parent → owned child: call `child.update(cx, …)` directly.
- Child → parent, sibling ↔ sibling, model → views: events. zedis has `GlobalEvent` (ServerSelected, RouteChanged, notifications) on the app state and `ServerEvent` (ValueUpdated, KeySelected) on per-connection state; views `cx.subscribe`. OpenLogi emits `StateEvent::LanguageChanged` for cached text.
- Store subscriptions on the owner (`_subscriptions: Vec<Subscription>`). Don't `.detach()` recurring view subscriptions, because detached callbacks pile up on long-lived emitters (kit `website/docs/coding-guides.md`, "Keep ownership links and subscriptions bounded").
- One entity holding all unrelated state is the first item in the kit's "Common failure modes" list.

**Per-window state.** Each window gets its own Base `Root` with plugins. The component plugin `WindowState` (`comp/src/root.rs:25`) holds that window's dialogs, sheet, notifications and tooltip overlay. App per-window state lives in the content view (Zed: one `Workspace` per window; zedis: one `ZedisServerState` per workspace tab). Multi-window: share one model `Entity` and create one content entity per window (kit `website/docs/multi-window.md`).

**Async and background work.**
- `Context::spawn_in(&self, window, AsyncFnOnce(WeakEntity<T>, &mut AsyncWindowContext) -> R) -> Task<R>` (`gpui/app/context.rs:690`). `WeakEntity::update_in(cx, |this, window, cx| …) -> Result<R>` (`gpui/app/entity_map.rs:819`). `background_spawn` is on `AppContext` (`gpui/gpui.rs:300`).
- In this snapshot, `AsyncApp::update(&self, f) -> R` returns **R, not Result** (`gpui/app/async_context.rs:176`), but `AsyncWindowContext::update -> Result<R>` (`:315`). Older examples that `?` it won't compile.
- OpenLogi: one long-lived `cx.spawn` task `select!`s over tokio channels (IPC updates, deeplinks, asset commands) and applies each through `cx.update` (`runtime.rs`).
- zedis "Monitor pattern": a cancellable `Task` stored on the **view**, a `background_spawn` loop reading from the domain crate's stream type, a channel to a foreground drainer, and a key guard that discards stale batches after a selection change. Dropping the Task cancels everything.

```rust
use std::{path::PathBuf, time::Duration};

// In crates/core, without GPUI: the settings type and its file IO.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Settings {
    pub dark_mode: bool,
}

pub fn save_settings(path: &std::path::Path, settings: &Settings) -> anyhow::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(settings)?)?;
    std::fs::rename(tmp, path)?; // atomic replace
    Ok(())
}

// In crates/ui: the app state entity, reachable through a Global.
pub struct AppState {
    settings: Settings,
    settings_path: PathBuf,
    save: Option<Task<()>>,
}

pub enum AppEvent {
    SettingsChanged,
}

impl EventEmitter<AppEvent> for AppState {}

struct GlobalAppState(Entity<AppState>);
impl Global for GlobalAppState {}

impl AppState {
    pub fn init(settings: Settings, settings_path: PathBuf, cx: &mut App) {
        let state = cx.new(|_| AppState { settings, settings_path, save: None });
        cx.set_global(GlobalAppState(state));
    }

    pub fn global(cx: &App) -> Entity<AppState> {
        cx.global::<GlobalAppState>().0.clone()
    }

    pub fn update_settings(&mut self, edit: impl FnOnce(&mut Settings), cx: &mut Context<Self>) {
        edit(&mut self.settings);
        cx.emit(AppEvent::SettingsChanged);
        cx.notify();
        let (path, snapshot) = (self.settings_path.clone(), self.settings.clone());
        // Replacing the task cancels the pending write: a 400 ms debounce.
        self.save = Some(cx.spawn(async move |_, cx| {
            cx.background_executor().timer(Duration::from_millis(400)).await;
            let result = cx.background_spawn(async move { save_settings(&path, &snapshot) }).await;
            if let Err(err) = result {
                tracing::error!("saving settings failed: {err:#}")
            }
        }));
    }
}

// A view that follows the settings.
pub struct SettingsBadge {
    _subscriptions: Vec<Subscription>,
}

impl SettingsBadge {
    pub fn new(_window: &mut Window, cx: &mut Context<Self>) -> Self {
        let state = AppState::global(cx);
        let subscription = cx.subscribe(&state, |_this, _state, event: &AppEvent, cx| match event {
            AppEvent::SettingsChanged => cx.notify(),
        });
        Self { _subscriptions: vec![subscription] }
    }
}

impl Render for SettingsBadge {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let dark = AppState::global(cx).read(cx).settings.dark_mode;
        div().child(if dark { "Dark" } else { "Light" })
    }
}
```

## 3. Layout of a real app

**Root and overlays.** One Root per window, created by `gpui_kit::open_window`; don't create a Root per page (coding-guides, "Bootstrap and root ownership"). Root plugins render above the content in registration order (`base/src/root.rs` `RootPlugin` docs), so dialogs, sheets, notifications and tooltips need no slots in your view tree.

**Overlay API**: `gpui_kit::component::WindowExt` (`comp/src/window_ext.rs`), implemented for `Window`:
- `open_dialog<F: Fn(Dialog, &mut Window, &mut App) -> Dialog + 'static>(&mut self, cx, build)` `:75`; `open_alert_dialog` (`AlertDialog`) `:101`; `close_dialog` `:112`; `close_all_dialogs` `:115`; `has_active_dialog` `:109`.
- `open_sheet` `:20`, `open_sheet_at(Placement, cx, build)` `:30`, `close_sheet` `:38`.
- `push_notification(&mut self, impl Into<Notification>, cx)` `:118`; `remove_notification::<T>` `:122`; `clear_notifications` `:128`.
- **The builder is a render closure that can re-run.** Create `InputState` and child views before `open_dialog` and capture their handles; to focus initially, guard with a one-shot `Cell<bool>` (doc on `:41-74`).
- `Dialog` builder (`comp/src/dialog/dialog.rs:364-549`): `title`, `child`/`content`, `footer`, `button_props(DialogButtonProps)`, `on_ok`/`on_cancel`/`on_close`, `width`/`max_w`, `overlay_closable`, `keyboard`, `centered`. `Sheet` (`comp/src/sheet.rs:42`): `title`, `footer`, `size`, `resizable`, `overlay`.
- `Notification` (`comp/src/notification.rs:114`): `info/success/warning/error(msg)` `:203-224`, `.title`, `.icon`, `.id::<T>()` (unique identity, used by `remove_notification::<T>`) `:236`, `.autohide(bool)`, `.action(...)`, `.on_click`, `.placement(Anchor)` `:273`, `.system()` / `.in_app_and_system()` for OS notifications `:306-316`. `From<&str | String | SharedString | (NotificationType, T)>` `:135-159`.
- App-level actions have no window. The gallery's `About` handler takes `cx.active_window()`, downcasts it to `Root`, and calls `window.defer(…open_alert_dialog…)`.

**Shell building blocks** (all under `gpui_kit::component`): `TitleBar` (`title_bar.rs:43`), `sidebar::Sidebar<E>` (`sidebar/mod.rs:222`; `.side`, `.collapsible`, `.collapsed`, `.header`, `.footer`, `.child`), `h_resizable(id)` / `v_resizable(id)` (`resizable.rs:29/34`), `tab::TabBar::new(id)` (`tab/tab_bar.rs:68`), `status_bar::StatusBar` (`status_bar.rs:32`), `setting::Settings::new(id)` with pages/groups/items for a settings screen (`setting/settings.rs:48`).

**Dock** (IDE-style rearrangeable panels). Engine in gpui-base, skin in gpui-component:
- `DockSkin::dock_area(id, version: Option<usize>, window, cx: &mut App) -> (Entity<DockArea>, Rc<DockSkin>)` (`comp/src/dock/mod.rs:195`). Plain `DockArea::new(id, version, window, cx)` (`base/src/dock/dock_area.rs:126`) has no appearance until `with_renderer` is called.
- `DockArea`: `set_center(DockLayout, window, cx)` `:232`, `set_dock(DockPlacement, DockLayout, window, cx)` `:246`, `toggle_dock` `:301`, `set_dock_size` `:348`, `add_panel` `:371`, `select_panel` `:563`, `load(DockAreaState, window, cx) -> Result<()>` `:817`, `dump(&self, cx) -> DockAreaState` `:895`. `DockAreaState` derives `Serialize/Deserialize` (`base/src/dock/state.rs:9`), so it goes straight to JSON. `DockToggleEvent` is emitted only for user toggles (`comp/src/dock/mod.rs:70`).
- `DockLayout::h_split() / v_split() / tabs()`, `.child(layout, Option<Pixels>)`, `.panel(Entity<P>)`, `.active_index(ix)` (`base/src/dock/layout/builder.rs:41-114`).
- `Panel: EventEmitter<PanelEvent> + Render + Focusable` with `panel_name(&self) -> &'static str` (**never change it: it keys saved layouts**), `closable`, `zoomable`, `set_active` (`base/src/dock/panel.rs:21`). The component `Panel` adds presentation (`comp/src/dock/panel.rs:71`). `register_panel(cx, name, Fn(PanelBuildContext, &mut Window, &mut App) -> Arc<dyn PanelView>)` (`base/src/dock/registry.rs:111`) rebuilds panels on `load`.

**What real apps use.**
- Zed's `Workspace` view composes a center `PaneGroup` (tabs per pane), left/right/bottom `Dock`s, a `StatusBar`, a `ModalLayer` (`toggle_modal`, `workspace.rs:8644`) and a toast layer (`zed/crates/workspace/src/`).
- zedis: a root view with sidebar, workspace-tab strip and content. `content.rs` is a route switcher: `HashMap<ServerView, AnyView>` filled lazily, **dropped on route change**, so state that must survive goes into `ZedisAppState`. It hand-rolls its tab pills because `TabBar::child` only accepts `Tab` (no context menu or drag); see zedis `CLAUDE.md`, "GPUI gotchas".
- dbflux: `workspace/` in `dbflux_ui` wires sidebar/dock, document area (its own tab/pane system crate), bottom dock and command palette, and routes focus through `FocusTarget`.
- Template advice: `Workspace` = `v_flex(TitleBar, h_resizable(Sidebar | content), StatusBar)`. Reach for `DockArea` only when users must rearrange panels.

## 4. Settings and themes

**Zed's layering** (pattern). `SettingsStore` global (`zed/crates/settings/src/settings_store.rs:154`). `recompute_values` (`:1369-1400`) merges, in order: embedded `default.json` → extension → global → user `settings.json` (then its release-channel and OS sections) → active profile → server; per-worktree `.zed/settings.json` is then merged per path. Each feature declares a typed `Settings` (`:69`, `from_settings(&SettingsContent)`, `register`, `get`/`get_global`) built from the merged content, so defaults live in one JSON file and a feature reads only its own struct. File watchers push changes through channels, and consumers `observe_global::<SettingsStore>`. For a small app, a reduced form is enough (inferred): `#[serde(default)]` structs in `core` with defaults in `Default` impls, one user file, no layering.

**gpui-kit theming** (`comp/src/theme/`):
- `Theme` (`mod.rs:147`) is the `Global` (`impl Global`, `:234`). It derefs to `ThemeColor` (`theme.primary`, `theme.border`…) and adds `mode`, `font_family`, `font_size`, `mono_font_family`, `radius`, `radius_lg`, `shadow`, `focus_ring`, `scrollbar_mode`, `light_theme`/`dark_theme: Rc<ThemeConfig>`, `highlight_theme`.
- `ActiveTheme` (`mod.rs:44`) is implemented for `App`, so `cx.theme()` works with any context that derefs to `App` (inferred for `Context<T>`; used throughout the gallery).
- `Theme::change(mode: impl Into<ThemeMode>, window: Option<&mut Window>, cx)` `:389` loads the registered light or dark config and refreshes all windows. `Theme::update(cx, |theme| …) -> R` `:288` is the safe edit path (keeps the Base copy in sync, refreshes windows). After `Theme::global_mut` (`:251`) you must call `Theme::sync_base(cx)` (`:473`) and refresh yourself. Setting `mode` inside `update` reloads that mode's colours, so edit colours in a **second** `update`.
- Follow the OS: `Theme::sync_system_appearance(Some(window), cx)` `:354`, called from `cx.observe_window_appearance(window, …)` (`gpui/app/context.rs:457`). `ThemeMode::{Light, Dark}` `:807`.
- `ThemeRegistry` (`registry.rs:76`, Global): `watch_dir(PathBuf, cx, on_load)` `:98` (loads and hot-reloads JSON theme sets), `load_themes_from_str` `:151` (for themes embedded with `include_str!`), `themes()` `:121`, `sorted_themes()` `:126`, `default_light_theme()` / `default_dark_theme()` `:143/147`. A theme file is a `ThemeSet` of `ThemeConfig`s (`schema.rs:24/38`) with colour keys such as `"accent.background"` (`schema.rs:253`). Apply one with `Theme::update(cx, |t| t.apply_config(&config))` (`schema.rs:1064`).
- Custom brand colour: `Theme::update(cx, |t| t.primary = hsla(...))` after each mode change. zedis restores default themes and re-applies its brand primary at startup.
- Persist a theme **name** plus overrides (radius, scrollbar mode), not the whole `Theme`. The gallery stores `{theme, radius, scrollbar_mode}` and saves from `observe_global::<Theme>`, skipping saves while a preview is active (story `themes.rs`).

## 5. Persistence

| App | Settings | Data | Window state |
|---|---|---|---|
| Zed | JSON files in its config dir, watched | own sqlite layer (`sqlez`) + key-value store | per-workspace bounds + display UUID in sqlite, plus a default-bounds key (`workspace/src/persistence.rs:114-205`); serialisation throttled 200 ms (`workspace.rs:177`) |
| zedis | `zedis.toml` in a config dir (`crates/zedis-core/src/fs.rs`, overridable via `ZEDIS_CONFIG_DIR` for tests/CI); atomic write + rolling `.bak`; 500 ms debounce with a generation counter; **flushed in `on_app_quit`** | redb (`crates/zedis-db`), secrets encrypted with a machine key | per-display placements keyed by display UUID, restored and **clamped on screen** (`src/window_setup.rs:69`) |
| OpenLogi | plain TOML; read-only fallback when unparsable | probe/asset caches | — |
| dbflux | single SQLite `~/.local/share/dbflux/dbflux.db`, prefixed tables, trait-based migrations, one-time legacy JSON import | same DB; secrets in the OS keyring | session tabs in the DB |
| gallery | `target/state.json` (demo only) | — | — |

Recommendation:
- `dirs::config_dir().join(APP)/settings.json` (serde_json) and `dirs::data_dir().join(APP)` for data (rusqlite only when data is relational).
- Write to a temp file and `rename`, debounce, and flush in `cx.on_app_quit`.
- Keep the file formats and IO in `core`, without GPUI.
- Window state: `cx.observe_window_bounds(window, …)` (`gpui/app/context.rs:402`) → `window.window_bounds()` (`gpui/window.rs:2536`, returns `WindowBounds`) → store the variant, origin/size as `f32`, and the display UUID (`cx.displays()`, `display.uuid()`). On restore, clamp to a connected display or fall back to `Bounds::centered`.
- Dock layouts: save `dock_area.dump(cx)` as JSON and bump `version` when panels change.

## 6. Crate structure and compile times

**How larger apps split.**
- Zed: hundreds of crates; each feature crate exposes `init(cx)` and the `zed` binary wires them. Actions shared across crates live in a tiny `zed_actions` crate, so features dispatch to each other without depending on each other.
- zedis: `zedis-core` (pure logic, "no gpui, no i18n"), `zedis-connection` (Redis IO, no gpui; `String`, converted to `SharedString` at the UI boundary), `zedis-db` (redb), `zedis-ui` (reusable widgets, no app imports) ← root GUI lib crate ← 19-line bin and a wasm entry crate. `default-members = ["."]`. A test (`tests/view_layering.rs`) fails if a view file speaks Redis.
- OpenLogi: `openlogi-core` (pure types, no I/O, no async), device/IPC crates, `openlogi-ui` (presentation shared by two GPUI binaries: plain `gpui`, not gpui-component), `openlogi-desktop` (app), `openlogi-overlay`, and a separate agent process.
- dbflux: `dbflux_core` (contracts) ← `dbflux_app` (runtime state, **no GPUI**) ← six UI crates (components → ui_base → document/sidebar/windows → thin `dbflux_ui` integrator) ← `dbflux` bin.
- disktree: `disktree-app` / `disktree-core` / `disktree-scan`, the closest match to the template.
- The kit's coding guide says to organise by **capability** (each feature crate owns its model, views, commands and dialogs) and not by `models/` and `views/` folders. It also warns that extra crates do not guarantee faster builds.

**Compile-time levers seen in these repos.**
- Thin binary, GPUI only in UI crates, so `core` builds and tests without GPUI (zedis, dbflux, OpenLogi).
- Dev profile: optimise dependencies, not your own code. zeron uses `[profile.dev.package."*"] opt-level = 2`, noting "gpui is slow unoptimized"; disktree does the same. Zed instead uses `opt-level = 3` only for proc macros (`gpui_macros`, `syn`, `quote`…) and hot deps (`taffy`, `resvg`, `tree-sitter`) (Zed's `Cargo.toml:1085-1107`).
- Debug info: `debug = "limited"` or `"line-tables-only"`, plus `[profile.dev.package."*"] debug = false` (dbflux, OpenLogi, Zed: `split-debuginfo = "unpacked"`). This shrinks link time and `target/`.
- `test-support` only in `[dev-dependencies]` (zedis). Leave off heavy kit features such as `tree-sitter-languages` unless needed (zedis enables only `tree-sitter` and registers the grammars it uses).
- Pin GPUI exactly (`=0.3.x`): every app does. zedis#42 was a crash fixed by pinning a gpui version.
- Proc macros (`Action`, `IntoElement`, serde derives, `rust-embed`, `rust-i18n`) cost every rebuild of the crate that uses them. Keep embedding and i18n macros in the crate that changes least, or in a small `assets` module (inferred).

**Recommended structure for the template** (keeps the given three crates):
```text
crates/core   no GPUI: domain types, Settings (serde, defaults), AppPaths (dirs), load/save,
              domain services, thiserror errors. Unit-tested with plain #[test].
crates/ui     gpui-kit only here: ui::Assets (composite source), ui::init (AppState Global,
              theme setup, keymap, actions, menus), open_main_window, Workspace shell,
              one module per feature (model entity + views + dialogs + actions).
crates/app    main.rs only: logging, panic hook, paths, settings load, single-instance (if needed),
              application().with_assets(ui::Assets).run(|cx| { gpui_kit::init; ui::init; ui::open_main_window }).
```
Reasons: `core` is fast to compile and test without a window system, and UI edits don't rebuild it. `app` changes rarely and links last. Promote a `ui` module to its own crate (`crates/<feature>`) only when it has a clear public boundary (kit guide). Add a dev profile with `package."*"` `opt-level = 2` and `debug = false`.

## 7. Logging and errors
- GPUI logs through `log` (`gpui-pre` depends on `log`); gpui-base and gpui-component use `tracing` (component also uses `log`). Use `tracing` + `tracing-subscriber` (`registry().with(fmt::layer()).with(EnvFilter::from_default_env()).try_init()`, as the gallery does). With `tracing-subscriber`'s default `tracing-log` feature, `try_init` also installs the `log` bridge, so GPUI's `log` records appear (inferred from tracing-subscriber docs, not verified here). zedis logs to a file through a non-blocking writer whose guard lives for the whole `run`; Zed writes `Zed.log` and rotates the previous file.
- Errors: `thiserror` enums in `core` (zedis keeps an `error.rs` per crate, and the app `Error` wraps them transparently); `anyhow` in `ui`/`app`.
- `TaskExt::detach_and_log_err(self, cx: &App)` for `Task<Result<T, E>>` with `E: Display + Debug` logs failures with the caller's location (`gpui/executor.rs:38-52`; re-exported via `gpui_kit::*`). Its `log_err` sibling lives in `gpui-pre-util` and is **not** re-exported, so write your own (below).
- Users see errors as notifications, not logs (kit coding-guides, "Async work"). dbflux has one seam, `report_error(UserFacingError, &mut App)` / `report_error_async`, which toasts, audits and bumps a status-bar badge, with a rule that only the first catch site reports. Zed has `NotifyResultExt::notify_err`, `NotifyTaskExt::detach_and_notify_err` and `DetachAndPromptErr` on `Result`/`Task` (`zed/crates/workspace/src/notifications.rs:1610-1762`, described).
```rust
use gpui_kit::component::{WindowExt as _, notification::Notification};
use std::path::{Path, PathBuf};

pub trait NotifyErr<T> {
    fn notify_err(self, window: &mut Window, cx: &mut App) -> Option<T>;
}

impl<T> NotifyErr<T> for anyhow::Result<T> {
    fn notify_err(self, window: &mut Window, cx: &mut App) -> Option<T> {
        self.map_err(|err| {
            tracing::error!("{err:#}");
            window.push_notification(Notification::error(format!("{err:#}")), cx);
        })
        .ok()
    }
}

// In crates/core: the work itself, without GPUI.
fn import_rows(path: &Path) -> anyhow::Result<Vec<String>> {
    Ok(std::fs::read_to_string(path)?.lines().map(str::to_owned).collect())
}

pub struct ImportView {
    rows: Vec<String>,
}

impl ImportView {
    // Background work, then report on the window that started it.
    fn import(&mut self, path: PathBuf, window: &mut Window, cx: &mut Context<Self>) {
        cx.spawn_in(window, async move |this, cx| {
            let result = cx.background_spawn(async move { import_rows(&path) }).await;
            this.update_in(cx, |this, window, cx| {
                if let Some(rows) = result.notify_err(window, cx) {
                    this.rows = rows;
                    cx.notify();
                }
            })
        })
        .detach_and_log_err(cx);
    }
}
```
- Panics: zedis installs a panic hook that writes a crash report before anything else, because its release profile uses `panic = "abort"`. dbflux keeps `unwind` deliberately: abort loses `catch_unwind`, which GPUI internals may rely on, according to its `Cargo.toml` comment.

## 8. Pitfalls real apps hit
- **Dialog builder re-runs**, so `cx.new(InputState…)` inside it resets the input every frame (`window_ext.rs:41-74`). zedis also found that an `Input` placed as inline elements in a dialog body broke once a `flex_wrap` sibling was added. Make the body a view entity.
- **Blank icons**: `application()` without `.with_assets(...)`, or a composite source that queries the kit's `Assets` first (it errors on unknown paths, so the app's own files are never reached).
- **Overlay calls need the Base Root**: `Root::read/update` `expect("window must have a Base Root")` (`base/src/root.rs:204-217`). A window opened with raw `cx.open_window` and no Root panics on `open_dialog`/`push_notification` (inferred from the `expect`). Always use `gpui_kit::open_window`.
- **macOS keeps running after the last window closes** (`QuitMode::Default`). Use `with_quit_mode(QuitMode::LastWindowClosed)`, or OpenLogi's `on_window_closed` check, plus `on_reopen` to reopen a window.
- **Lost settings on quit**: debounced async saves don't finish before `cx.quit()`, so flush in `on_app_quit` (zedis).
- **Off-screen windows** after a monitor change or an upgrade: clamp restored bounds (zedis `resolve_window_bounds`). zedis#98 (main window vanished after an upgrade) and the Windows smoke-test hang are the related reports.
- **Native file dialogs from third-party crates** (rfd, nfd) panic with `RefCell already borrowed`. Use `cx.prompt_for_paths(PathPromptOptions{..})` and await it in `cx.spawn_in` (gpui-kit#1352).
- **Theme application resets fonts**: `Theme::change`/`apply_config` rebuild the font families, so apply fonts after any theme switch. GPUI doesn't synthesise bold, so register a real bold face (zedis).
- **Focus lost when a panel closes**: key-bound actions stop dispatching until something is clicked. Hand focus to a surviving handle, and only if the closing panel held it (zedis).
- **Layout**: a bare `div()` is block layout, so `flex_1`/`h_full` children (and `uniform_list`) collapse; use `v_flex().flex_1().min_h_0()`. A `Scrollable` with `max_h` clips instead of scrolling; give it a definite `h`. `Label` ignores a parent's `text_color`. `Button::loading(true)` shows nothing without `.icon(...)`. `InputState` placeholders must not contain `\n` (all from zedis `CLAUDE.md`).
- **Dual rustls crypto providers** (gpui-kit's HTTP client uses aws-lc-rs, other deps use ring) panic on first TLS use. Install one provider at startup (zedis).
- **Subscriptions and tasks**: dropping a `Subscription` or `Task` cancels it; `.detach()` on recurring subscriptions leaks callbacks; a strong self-handle captured in a callback creates a cycle (kit coding-guides).
- **Startup URL races**: URLs from `on_open_urls` can arrive before the window exists, so queue them until restore finishes (Zed main.rs comment; zedis posts them to the running instance).
- **Release build quirk** (unverified on 0.3.10): disktree enables `debug-assertions` for `gpui-pre-macros` in release, because a helper is ungated while its module is gated on `debug_assertions` (`gpui-pre-macros-0.3.10/src/gpui_macros.rs:14` shows the gate).
