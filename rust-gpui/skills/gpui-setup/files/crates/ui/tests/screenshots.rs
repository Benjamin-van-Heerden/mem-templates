//! Renders views offscreen with GPUI's real renderer (Metal on macOS, WGPU on Linux) and
//! writes PNGs to target/screenshots/ to look at. Run: cargo test -q -p myapp-ui --test screenshots

fn main() {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    screenshots::run(std::env::args().nth(1).filter(|arg| !arg.starts_with('-')));
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    println!("screenshots: skipped; GPUI has no headless renderer on this platform");
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod screenshots {
    use std::{path::PathBuf, sync::Arc};

    use gpui_kit::component::{Theme, ThemeMode};
    use gpui_kit::test::TestWindowExt as _;
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, HeadlessAppContext, WindowBounds, WindowOptions, assets::Assets, px,
        size,
    };
    use myapp_ui::MainView;

    pub fn run(filter: Option<String>) {
        let cases: [(&str, ThemeMode); 2] = [("main_view_light", ThemeMode::Light), ("main_view_dark", ThemeMode::Dark)];
        for (name, mode) in cases {
            if filter.as_deref().is_some_and(|filter| !name.contains(filter)) {
                continue;
            }
            let mut cx = context();
            cx.update(|cx| Theme::change(mode, None, cx));
            let window = open_main_view(&mut cx);
            let path = shoot(&mut cx, window, name);
            println!("screenshot: {}", path.display());
        }
    }

    fn context() -> HeadlessAppContext {
        let mut cx = HeadlessAppContext::with_platform(
            gpui_kit::platform::current_platform(true).text_system(),
            Arc::new(Assets),
            gpui_kit::platform::current_headless_renderer,
        );
        cx.update(gpui_kit::init);
        cx
    }

    fn open_main_view(cx: &mut HeadlessAppContext) -> AnyWindowHandle {
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds { origin: Default::default(), size: size(px(480.), px(320.)) })),
            focus: false,
            show: false,
            ..Default::default()
        };
        let (window, _view) = cx
            .update(|cx| gpui_kit::open_window(options, cx, |window, cx| cx.new(|cx| MainView::new(window, cx))))
            .expect("open the window");
        window
    }

    fn shoot(cx: &mut HeadlessAppContext, window: AnyWindowHandle, name: &str) -> PathBuf {
        cx.run_until_parked();
        cx.update_window(window, |_, window, cx| window.render_frame(cx)).expect("render a frame");
        let image = cx.capture_screenshot(window).expect("offscreen rendering must be available");
        let background = *image.get_pixel(0, 0);
        let drawn = image.pixels().filter(|pixel| **pixel != background).count();
        assert!(drawn > 100, "{name}: the view rendered nothing but its background");

        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/screenshots");
        std::fs::create_dir_all(&dir).expect("create target/screenshots");
        let path = dir.canonicalize().expect("resolve target/screenshots").join(format!("{name}.png"));
        image.save(&path).expect("write the screenshot");
        path
    }
}
