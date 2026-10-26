# Async, tasks, executors (gpui-pre 0.3.10 via gpui-kit 0.8.1)

Paths: `gpui/` = `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/gpui-pre-0.3.10/`, `sched/` = `gpui-pre-scheduler-0.3.10/`, `http/` = `gpui-pre-http-client-0.3.10/`. Snippets assume `use gpui_kit::*;`, which brings in `Task`, `Priority`, `AppContext`, `TaskExt`, `FutureExt`/`Timeout` and the rest.

## 1. The model

- Entities, windows and rendering live on one foreground (main) thread.
- `AsyncApp` holds `Weak<AppCell>` (an `Rc`), so it is **not `Send`** and can't move to a background task.
- Background tasks get only `Send` data and return a value. A foreground task awaits that value and applies it to entities.
- Async closures are real `AsyncFnOnce` closures, written `async move |…| { … }` (Rust ≥1.85). The old `move |cx| async move {…}` form, with an owned `AsyncApp`, belongs to an earlier API generation.

## 2. Spawning: exact signatures

```text
// App: gpui/src/app.rs:2432
pub fn spawn<AsyncFn, R>(&self, f: AsyncFn) -> Task<R>
    where AsyncFn: AsyncFnOnce(&mut AsyncApp) -> R + 'static, R: 'static
// Context<T>: gpui/src/app/context.rs:230   (`this` = WeakEntity<T>)
pub fn spawn<AsyncFn, R>(&self, f: AsyncFn) -> Task<R>
    where T: 'static, AsyncFn: AsyncFnOnce(WeakEntity<T>, &mut AsyncApp) -> R + 'static, R: 'static
// Context<T>: context.rs:690
pub fn spawn_in<AsyncFn, R>(&self, window: &Window, f: AsyncFn) -> Task<R>
    where R: 'static, AsyncFn: AsyncFnOnce(WeakEntity<T>, &mut AsyncWindowContext) -> R + 'static
// Window: gpui/src/window.rs:2765
pub fn spawn<AsyncFn, R>(&self, cx: &App, f: AsyncFn) -> Task<R>
    where R: 'static, AsyncFn: AsyncFnOnce(&mut AsyncWindowContext) -> R + 'static
// AsyncApp::spawn (async_context.rs:202) and AsyncWindowContext::spawn (:324) take the same closure shapes
// *_with_priority(Priority, …) variants: app.rs:2446, context.rs:705, window.rs:2781
// AppContext trait (gpui/src/gpui.rs:300); App, Context, AsyncApp and AsyncWindowContext implement it
fn background_spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R> where R: Send + 'static;
// App: app.rs:2364 / 2375 (&BackgroundExecutor / &ForegroundExecutor); AsyncApp: async_context.rs:151/159
pub fn background_executor(&self) -> &BackgroundExecutor
// BackgroundExecutor: gpui/src/executor.rs:103, 115, 183
pub fn spawn<R>(&self, future: impl Future<Output = R> + Send + 'static) -> Task<R> where R: Send + 'static
pub fn spawn_with_priority<R>(&self, priority: Priority, future: impl Future<Output = R> + Send + 'static) -> Task<R>
pub fn timer(&self, duration: Duration) -> Task<()>          // a zero duration gives Task::ready(())
pub fn now(&self) -> Instant                                 // use instead of Instant::now so tests can fake time
pub async fn scoped<'scope, F>(&self, scheduler: F) where F: FnOnce(&mut Scope<'scope>)  // :137, borrows allowed
```

`Priority` (sched/src/scheduler.rs:44) has the values `RealtimeAudio | High | Medium (default) | Low`. `RealtimeAudio` gets its own thread.

Note that `Context<T>::spawn` *shadows* `App::spawn`: inside an entity the closure has two arguments, `|this, cx|`. `App::spawn` and `AsyncApp::spawn` closures have one, `|cx|`.

## 3. `Task<T>` (re-exported from the scheduler crate, executor.rs:12)

- The type is `#[must_use] pub struct Task<T>` (sched/src/executor.rs:402). **Dropping a task cancels it immediately.**
- `.detach()` (:572) runs it to completion with nowhere to send the result.
- `Task::ready(v)` (:539) builds a finished task, and `.is_ready()` (:562) checks for one.
- `.fallible() -> FallibleTask<T>` (:582) awaits to an `Option<T>` that is `None` on cancellation. Awaiting a plain `Task` whose runnable was dropped panics inside `async_task`, so this is the safe form [inference from `async_task` semantics].
- `TaskExt` (gpui/src/executor.rs:38-66) adds `.detach_and_log_err(cx: &App)` and `.detach_and_log_err_with_backtrace(cx)` to `Task<Result<T, E>>` where `E: Display + Debug`. It's in `gpui_kit::*` and in the prelude as `TaskExt as _`.

There are three ways to keep a task alive (Zed's AGENTS.md, "Concurrency"):
1. Await it from another task.
2. `.detach()` or `.detach_and_log_err(cx)`.
3. **Store it in a struct field**, so that dropping the owner cancels the work. Typical fields are `_task: Task<()>` or `pending: Option<Task<anyhow::Result<()>>>`.

## 4. Updating state from async code: return types matter

This is the generation most likely to be mixed up. In 0.3.10, `AppContext` has **no `type Result`**. On `AsyncApp`, entity operations return plain values and panic if the App is gone (`AsyncApp::app()` expects "app was released before async operation completed", async_context.rs:28-33). Window operations still return `Result`.

| call | returns | source |
|---|---|---|
| `cx.update(\|cx: &mut App\| …)` on `AsyncApp` | `R` | async_context.rs:164 |
| `entity.update(cx, \|e, cx\| …)` | `R` | entity_map.rs:497 (`AppContext::update_entity`) |
| `entity.read_with(cx, \|e, cx\| …)` | `R` | entity_map.rs:491 |
| `weak.update(cx, …)`, `weak.read_with(cx, …)` | `anyhow::Result<R>` ("entity released") | entity_map.rs:803, :838 |
| `weak.update_in(cx, \|e, window, cx\| …)` | `anyhow::Result<R>` | entity_map.rs:819, using the entity's *current window* via `with_window(entity_id)` |
| `cx.update(\|window, cx\| …)` on `AsyncWindowContext` | `Result<R>` | async_context.rs:283 |
| `entity.update_in(cx, …)` with `C: VisualContext` | `C::Result<R>`, which is `Result<R>` for `AsyncWindowContext` (:509) | entity_map.rs:523 |
| `cx.read_global`, `cx.update_global` on `AsyncApp` | `R` | :219, :246 |
| `cx.try_read_global` | `Option<R>` | :225 |
| `cx.open_window(…)` on `AsyncApp` | `Result<WindowHandle<V>>` | :184 |

So `cx.update(|cx| …)?` on `AsyncApp` and `entity.update(cx, …)?` **no longer compile** unless the closure itself returns a `Result`. `this.update(cx, …)?` on a `WeakEntity` is still correct.

```rust
use std::time::Duration;

fn search_index(query: &str) -> Vec<String> {
    vec![format!("result for {query}")] // plain, Send work: runs off the main thread
}

struct Search {
    hits: Vec<String>,
    focus: FocusHandle,
    pending: Task<anyhow::Result<()>>, // replacing it cancels the old search
}

impl Search {
    fn run(&mut self, query: String, cx: &mut Context<Self>) {
        self.pending = cx.spawn(async move |this, cx| {
            let hits = cx.background_spawn(async move { search_index(&query) }).await;
            this.update(cx, |this, cx| {
                this.hits = hits;
                cx.notify();
            })?; // WeakEntity: Err when the view is gone
            anyhow::Ok(())
        });
    }

    fn focus_later(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(Duration::from_secs(1)).await;
            this.update_in(cx, |this, window, cx| {
                window.focus(&this.focus, cx);
                cx.notify();
            })
        })
        .detach_and_log_err(cx);
    }
}
```

## 5. Timers and debouncing

- Use `cx.background_executor().timer(d).await`. It works from `Context`/`App` (returns `&BackgroundExecutor`) and from `AsyncApp`.
- Zed's rules prefer it over `smol::Timer`, because it goes through GPUI's scheduler, and tests can drive it with `advance_clock` and `run_until_parked` (Zed's AGENTS.md "Timers in tests").
- Timeouts: `fut.with_timeout(d, cx.background_executor())` returns `Result<T, Timeout>` (gpui/src/util.rs:64-106). The name `gpui::FutureExt` collides with `futures::FutureExt`, so import the latter as `use futures::FutureExt as _;`.

Debounce by **replacing a stored task**: the old task is dropped and cancelled mid-sleep. This is Zed's pattern in editor/src/editor.rs:11449-11475 (language-detection debounce).
```rust
use std::time::Duration;

fn filter_items(query: &str) -> Vec<SharedString> {
    ["alpha", "beta", "gamma"].into_iter().filter(|item| item.contains(query)).map(SharedString::from).collect()
}

struct Filter {
    query: SharedString,
    debounce: Option<Task<()>>,
    results: Vec<SharedString>,
}

impl Filter {
    fn set_query(&mut self, query: SharedString, cx: &mut Context<Self>) {
        self.query = query.clone();
        self.debounce = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(Duration::from_millis(200)).await;
            let results = cx.background_spawn(async move { filter_items(&query) }).await;
            // Err only means the view was closed; there is nothing left to update.
            this.update(cx, |this, cx| {
                this.results = results;
                cx.notify();
            })
            .ok();
        }));
    }
}
```

For a periodic tick, put `loop { timer.await; if this.update(cx, …).is_err() { break } }` in a stored task.

The scheduler crate is relevant in three places:
- It supplies `Task`, `FallibleTask` and `Priority`.
- `DedicatedExecutor::new(&cx.background_executor().scheduler_executor())` (sched/src/executor.rs:357) gives you one OS thread for `!Sync` or thread-local-heavy work.
- Tests use `TestScheduler`, which is deterministic. `BackgroundExecutor::{advance_clock, run_until_parked, simulate_random_delay}` are test-support only (executor.rs:192-222).

## 6. Channels and `futures` interop

- gpui's executors poll any `std::future::Future`. `futures` channels (`futures::channel::{mpsc, oneshot}`) and smol, async-channel and flume channels all work.
- The kit re-exports smol channels as `gpui_kit::base::async_util::{unbounded, Sender, Receiver}` (gpui-base-0.8.1/src/async_util.rs). These are `smol::channel` on native and `async-channel` on wasm, and `Sender::send_blocking` works from plain threads.
- gpui doesn't re-export `futures` or `smol`. Add `futures = "0.3"` yourself for `StreamExt` and `mpsc`.

```rust
use futures::{StreamExt as _, channel::mpsc};

fn blocking_source() -> impl Iterator<Item = String> {
    std::io::stdin().lines().map_while(Result::ok) // stands in for a watcher, socket or child process
}

struct LogView {
    lines: Vec<String>,
    _watcher: Option<Task<()>>,
}

impl LogView {
    fn watch(&mut self, cx: &mut Context<Self>) {
        let (tx, mut rx) = mpsc::unbounded::<String>();
        // Indefinite blocking gets its own thread, not the background executor's pool.
        std::thread::spawn(move || {
            for line in blocking_source() {
                if tx.unbounded_send(line).is_err() {
                    break;
                }
            }
        });
        self._watcher = Some(cx.spawn(async move |this, cx| {
            while let Some(line) = rx.next().await {
                let applied = this.update(cx, |this, cx| {
                    this.lines.push(line);
                    cx.notify();
                });
                if applied.is_err() {
                    break; // the view is gone
                }
            }
        }));
    }
}
```

## 7. Blocking I/O, tokio and HTTP

- **There is no tokio runtime.** gpui-pre depends on `async-task`, `futures` and (desktop) `smol 2`, with no tokio (gpui-pre Cargo.toml:284, :334, :606).
- Background work runs on the platform dispatcher. macOS uses GCD global queues by priority (gpui-pre-apple-0.3.10/src/dispatcher.rs:33-46). Linux uses a **fixed pool of `available_parallelism()` worker threads** (gpui-pre-linux-0.3.10/src/linux/dispatcher.rs:30-50).
- Short blocking calls (`std::fs`) inside `background_spawn` are acceptable [inference]. Long or indefinite blocking (sockets, child processes, watchers) starves the pool. Use `std::thread::spawn` with a channel, `smol::unblock`, or a `DedicatedExecutor`.
- **Never block the foreground thread.** Don't use `block_on`, sync I/O or `std::thread::sleep` in render, listeners or `cx.spawn`.
- **Tokio-based crates** (reqwest, tonic, and anything built on `tokio::net` or `tokio::time`) panic with "no reactor running" when polled on gpui executors [inference; standard tokio behaviour]. Zed's `reqwest_client` (published as `gpui-pre-reqwest-client =0.3.10`, a dev-dependency in gpui-base-0.8.1/Cargo.toml:216) shows the fix:
  - It keeps a private `static RUNTIME: OnceLock<tokio::runtime::Runtime>` (multi-thread, 1 worker).
  - It runs each request with `handle.spawn(async { request.send().await })`.
  - It awaits the `JoinHandle` from GPUI, since a `JoinHandle` is executor-agnostic.
  - Source: zed@08cbb88 crates/reqwest_client/src/reqwest_client.rs:18-139, 268-318, read via `gh api`.
- Crates built on `smol` or `async-io` (async-std, surf/isahc-style clients, `smol::net`) bring their own reactor and work directly.
- **gpui's own HTTP client** is the `http_client` crate, re-exported as `gpui_kit::http_client` (gpui/src/gpui.rs:190):
  - The trait is `pub trait HttpClient: 'static + Send + Sync` (http/src/http_client.rs:122), with `send(&self, http::Request<AsyncBody>) -> BoxFuture<'static, anyhow::Result<Response<AsyncBody>>>`, `get(uri, body, follow_redirects)` and `post_json(uri, body)`.
  - `AsyncBody` implements `futures::AsyncRead` and converts from `()`, `String`, `Vec<u8>`, `&'static str`, `Bytes` and `Json<T>` (http/src/async_body.rs).
  - Extras include `HttpClientWithUrl`, `HttpClientWithProxy`, `BlockedHttpClient`, and `FakeHttpClient` for tests.
  - **It ships no real transport.** `App` defaults to `NullHttpClient`, which errors with "No HttpClient available" (gpui/src/app.rs:212, :3627-3651). Install one with `Application::with_http_client(Arc<dyn HttpClient>)` (:248) or `cx.set_http_client` (:2073), and read it with `cx.http_client()` (:2068).
  - The kit only pulls in reqwest for wasm (gpui-kit-assets Cargo.toml:105-117).
  - Simplest native option: use any smol-compatible client directly in `background_spawn`, or wrap a tokio client the reqwest_client way.

## 8. Pitfalls

1. **Old closure and return shapes.** Use `cx.spawn(async move |this, cx| …)`, where `cx: &mut AsyncApp` is a *borrow*. `cx.update(…)` returns `R`, not `Result`. `WeakEntity::update` still returns `Result`.
2. **Dropping a task cancels it.** A `let _task = cx.spawn(…);` that goes out of scope, or forgetting to store or detach, kills the work silently. Conversely, a detached infinite loop holding a strong `Entity` leaks the entity. Capture `WeakEntity` (the `this` you're given) or `entity.downgrade()`, never a strong `Entity` that the task's owner holds.
3. **Updating dropped entities.** `weak.update` returns `Err("entity released")`. Treat that as "stop": `?` in a Result-returning task, or `.is_err() => break` in loops. Strong `entity.update` on `AsyncApp` panics only if the whole App is gone. The executor doesn't poll foreground tasks after that, per the doc comment at async_context.rs:18-20.
4. **No borrows across `.await`.** `entity.read(cx)` needs `&App`, so in async code copy what you need out with `read_with(cx, |e, _| e.field.clone())` before awaiting. Data moved into `background_spawn` must be `Send + 'static`, so clone `Arc`s and `SharedString`s in first. Zed's AGENTS.md recommends shadowing clones in a block: `executor.spawn({ let x = x.clone(); async move { … } })`.
5. **Re-entrancy.** Updating an entity while it's already leased panics with "cannot update {T} while it is already being updated" (entity_map.rs:231). Inside `this.update(cx, |this, cx| …)`, use the inner `cx`, and don't call `entity.update` for the same entity. Defer with `cx.defer(…)` (app.rs:2463) or `window.defer(cx, …)` (window.rs:2619) when needed.
6. **`spawn` after quit.** `App::spawn` hits `debug_panic!("Can't spawn on main thread after on_app_quit")` while quitting (app.rs:3351-3355). `on_app_quit` futures get only `SHUTDOWN_TIMEOUT = 200ms` (app.rs:79).
7. **Logging errors.** gpui doesn't re-export `ResultExt::log_err`. Use `.detach_and_log_err(cx)` for tasks, or `if let Err(e) = … { log::error!(…) }`. Zed's rules forbid `let _ =` on fallible calls.
8. **`AsyncWindowContext` vs entity window.** `cx.update(|window, cx| …)` targets the context's window. `weak.update_in(cx, …)` targets the window the *entity* was last associated with, and errors "entity has no current window" otherwise.

## 9. Zed's practice (GPL code; patterns only)

- **Long-running tasks** are stored in fields named `_task`, `*_task` or `pending_*`, and get cancelled by replacement (editor.rs:11449).
- **Fire-and-forget** work uses `.detach_and_log_err(cx)` (workspace/src/workspace.rs:944, :2687).
- **Background work** follows one shape: `let result = cx.background_spawn(async move { … }).await;` followed by `this.update(cx, …)?` (workspace.rs:2678).
- **Window-bound flows** such as prompts and modals use `cx.spawn_in(window, async move |this, cx| …)` (workspace/src/multi_workspace.rs:1674).
- **The quit flow** (zed/src/zed.rs:1754-1800):
  1. A global action spawns `cx.spawn(async move |cx| …)`.
  2. It prompts with `window.prompt(…)` and awaits the receiver.
  3. It calls `cx.update(|cx| cx.quit())`.
