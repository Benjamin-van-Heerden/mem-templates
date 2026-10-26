use gpui_kit::component::{
    ActiveTheme as _,
    button::{Button, ButtonVariants as _},
    v_flex,
};
use gpui_kit::*;
use myapp_core::Counter;

pub struct MainView {
    focus: FocusHandle,
    counter: Counter,
}

impl MainView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus = cx.focus_handle();
        // With nothing focused, key bindings and element actions never fire.
        focus.focus(window, cx);
        Self { focus, counter: Counter::default() }
    }

    pub fn count(&self) -> u32 {
        self.counter.value()
    }
}

impl Focusable for MainView {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for MainView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .key_context("MainView")
            .track_focus(&self.focus)
            .size_full()
            .items_center()
            .justify_center()
            .gap_4()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .child(format!("Clicked {} times", self.counter.value()))
            .child(Button::new("increment").primary().label("Increment").on_click(cx.listener(
                |this, _: &ClickEvent, _window, cx| {
                    this.counter = this.counter.increment();
                    cx.notify();
                },
            )))
    }
}
