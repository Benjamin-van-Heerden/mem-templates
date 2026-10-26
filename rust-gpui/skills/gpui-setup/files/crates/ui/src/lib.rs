//! The application's GPUI layer: startup wiring, actions and views.

mod main_view;

use gpui_kit::*;

pub use main_view::MainView;

actions!(myapp, [Quit]);

/// Registers the app's actions, key bindings and menus. Call once, after `gpui_kit::init`.
pub fn init(cx: &mut App) {
    cx.on_action(|_: &Quit, cx: &mut App| cx.quit());
    cx.bind_keys([
        #[cfg(target_os = "macos")]
        KeyBinding::new("cmd-q", Quit, None),
        #[cfg(not(target_os = "macos"))]
        KeyBinding::new("ctrl-q", Quit, None),
    ]);
    // Menus read the key bindings for their shortcut labels, so they come after bind_keys.
    cx.set_menus([Menu::new("MyApp").items([MenuItem::action("Quit MyApp", Quit)])]);
}

pub fn open_main_window(cx: &mut App) -> Result<(AnyWindowHandle, Entity<MainView>)> {
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::centered(size(px(960.), px(640.)), cx)),
        window_min_size: Some(size(px(480.), px(320.))),
        ..Default::default()
    };
    gpui_kit::open_window(options, cx, |window, cx| {
        cx.new(|cx| MainView::new(window, cx))
    })
}
