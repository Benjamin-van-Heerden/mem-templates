//! Process concerns only: everything the app does lives in the ui and core crates.

use gpui_kit::*;

fn main() {
    gpui_kit::application()
        .with_assets(gpui_kit::assets::Assets)
        .with_quit_mode(QuitMode::LastWindowClosed)
        .run(|cx| {
            gpui_kit::init(cx);
            myapp_ui::init(cx);
            if let Err(err) = myapp_ui::open_main_window(cx) {
                eprintln!("cannot open the main window: {err:#}");
                cx.quit();
                return;
            }
            cx.activate(true);
        });
}
