//! Behaviour tests: real hit testing and input on an offscreen test window.

use gpui_kit::test::TestWindowExt as _;
use gpui_kit::{AppContext as _, TestAppContext, WindowOptions};
use myapp_ui::MainView;

#[gpui_kit::test]
fn clicking_increment_counts(cx: &mut TestAppContext) {
    cx.update(gpui_kit::init);
    let (window, view) = cx
        .update(|cx| {
            gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| cx.new(|cx| MainView::new(window, cx)))
        })
        .expect("open the window");

    cx.update_window(window, |_, window, cx| {
        window.render_frame(cx);
        window.click("increment", cx);
        window.click("increment", cx);
    })
    .expect("update the window");

    assert_eq!(cx.update(|cx| view.read(cx).count()), 2);
}
