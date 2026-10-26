//! Renders views offscreen with GPUI's real renderer (Metal on macOS, WGPU on Linux) and
//! writes PNGs to target/screenshots/ to look at. Run: cargo test -q -p myapp-ui --test screenshots
//! Pass a filter to run only the cases whose name contains it: `-- dark`, `-- flow`.

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
        AnyWindowHandle, AppContext as _, Bounds, Entity, HeadlessAppContext, WindowBounds,
        WindowOptions, assets::Assets, px, size,
    };
    use image::RgbaImage;
    use myapp_ui::MainView;

    /// A named case; it receives its own name for the PNG files.
    type Case = (&'static str, fn(&str));

    pub fn run(filter: Option<String>) {
        let cases: [Case; 3] = [
            ("main_view_light", |name| still(name, ThemeMode::Light)),
            ("main_view_dark", |name| still(name, ThemeMode::Dark)),
            ("increment_flow", increment_flow),
        ];
        for (name, case) in cases {
            if filter.as_deref().is_none_or(|filter| name.contains(filter)) {
                case(name);
            }
        }
    }

    /// The view as it opens.
    fn still(name: &str, mode: ThemeMode) {
        let mut cx = context(mode);
        let (window, _) = open_main_view(&mut cx);
        save(&shoot(&mut cx, window), name);
    }

    /// A workflow: act on the window the way a user would, and capture each step.
    fn increment_flow(name: &str) {
        let mut cx = context(ThemeMode::Light);
        let (window, view) = open_main_view(&mut cx);
        let start = shoot(&mut cx, window);
        save(&start, &format!("{name}_1_start"));

        // Real hit testing: the click lands on whatever is drawn at the button's position.
        cx.update_window(window, |_, window, cx| {
            window.click("increment", cx);
            window.click("increment", cx);
        })
        .expect("click increment");
        let after = shoot(&mut cx, window);
        save(&after, &format!("{name}_2_after_two_clicks"));

        assert_eq!(
            cx.update(|cx| view.read(cx).count()),
            2,
            "{name}: the clicks did not reach the button"
        );
        assert!(
            start != after,
            "{name}: the window looks the same after the clicks"
        );
    }

    fn context(mode: ThemeMode) -> HeadlessAppContext {
        let mut cx = HeadlessAppContext::with_platform(
            gpui_kit::platform::current_platform(true).text_system(),
            Arc::new(Assets),
            gpui_kit::platform::current_headless_renderer,
        );
        cx.update(gpui_kit::init);
        cx.update(|cx| Theme::change(mode, None, cx));
        cx
    }

    fn open_main_view(cx: &mut HeadlessAppContext) -> (AnyWindowHandle, Entity<MainView>) {
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds {
                origin: Default::default(),
                size: size(px(480.), px(320.)),
            })),
            focus: false,
            show: false,
            ..Default::default()
        };
        cx.update(|cx| {
            gpui_kit::open_window(options, cx, |window, cx| {
                cx.new(|cx| MainView::new(window, cx))
            })
        })
        .expect("open the window")
    }

    /// Draws the current state and captures it. Capturing reads the last drawn frame, so draw first.
    fn shoot(cx: &mut HeadlessAppContext, window: AnyWindowHandle) -> RgbaImage {
        cx.run_until_parked();
        cx.update_window(window, |_, window, cx| window.render_frame(cx))
            .expect("render a frame");
        let image = cx
            .capture_screenshot(window)
            .expect("offscreen rendering must be available");
        let background = *image.get_pixel(0, 0);
        assert!(
            image.pixels().filter(|pixel| **pixel != background).count() > 100,
            "the view rendered nothing but its background"
        );
        image
    }

    fn save(image: &RgbaImage, name: &str) {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/screenshots");
        std::fs::create_dir_all(&dir).expect("create target/screenshots");
        let path = dir
            .canonicalize()
            .expect("resolve target/screenshots")
            .join(format!("{name}.png"));
        image.save(&path).expect("write the screenshot");
        println!("screenshot: {}", path.display());
    }
}
