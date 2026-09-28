---
name: rust
description: Rust project structure and coding rules. Use when writing or restructuring Rust modules, crates, error handling or tests.
---

# Rust Project Structure and Rules

## Core Principles

Rust code should be idiomatic, strongly typed, testable, and easy for both humans and AI agents to reason about.

Prefer:
- simple public APIs
- strong domain types over primitive obsession
- explicit ownership and lifetimes
- small modules and crates with clear boundaries
- comprehensive tests for observable behavior
- compiler, Clippy, rustfmt, and Cargo as the source of truth

Avoid:
- clever type magic unless it clearly improves user experience
- unnecessary global state
- panics for recoverable errors
- exposing implementation details in public APIs
- ad-hoc `unsafe`

## Cargo and Workspace Structure

Use Cargo conventions. Do not invent custom build flows unless absolutely necessary.

### Standard Layout

```text
project/
├── Cargo.toml
├── Cargo.lock
├── crates/
│   ├── app/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       └── config.rs
│   ├── core/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── models.rs
│   │       ├── errors.rs
│   │       └── services/
│   │           ├── mod.rs
│   │           └── users.rs
│   └── cli/
│       ├── Cargo.toml
│       └── src/
│           └── main.rs
└── tests/
    └── integration.rs
```

### Crate Boundaries

Split code into separate crates when a component can reasonably be used independently.

Good crate boundaries:
- `core`: domain logic, models, core traits
- `app`: application runtime, dependency wiring, server startup
- `cli`: command-line interface
- `client`: API client
- `macros`: procedural macros
- `test-support` or `test-util`: shared testing helpers

Do not create one huge crate with unrelated modules if independent compilation and clearer dependency boundaries would help.

### Features

Library features must be additive.

Rules:
- A feature may add functionality.
- A feature must not remove or alter existing public APIs.
- Prefer `std` as a feature instead of `no-std`.
- Test important feature combinations.
- Keep feature names concrete and meaningful.

```toml
[features]
default = ["std"]
std = []
serde = ["dep:serde"]
test-util = []
```

## Module Organization

Use modules to reflect domain boundaries, not arbitrary technical layers.

```text
src/
├── lib.rs
├── config.rs
├── errors.rs
├── users/
│   ├── mod.rs
│   ├── model.rs
│   ├── repository.rs
│   └── service.rs
├── billing/
│   ├── mod.rs
│   ├── invoice.rs
│   └── payment.rs
└── utils/
    └── time.rs
```

Use `utils` sparingly. If a utility becomes domain-specific, move it into that domain.

### Re-exports

Avoid glob re-exports.

```rust
// Good
pub use users::{User, UserId};

// Avoid
pub use users::*;
```

Use `#[doc(inline)]` for public re-exports from your own crate when it improves generated documentation.

```rust
#[doc(inline)]
pub use users::User;
```

## Naming

Use Rust naming conventions:

```rust
struct UserAccount;
enum PaymentStatus;
trait StoreObject;
fn calculate_total() {}
const MAX_RETRIES: usize = 3;
```

Avoid vague type names:
- `Manager`
- `Service`
- `Factory`
- `Helper`
- `Processor`

Prefer names that say what the thing actually does:

```rust
// Weak
struct UserManager;

// Better
struct Users;
struct UserRepository;
struct UserAuthenticator;
```

Use `Builder` instead of `Factory`.

## API Design

### Prefer Strong Types

Avoid primitive obsession.

```rust
// Weak
fn send_email(user_id: String, email: String) {}

// Better
struct UserId(String);
struct EmailAddress(String);

fn send_email(user_id: UserId, email: EmailAddress) {}
```

Use the strongest appropriate standard type:
- Use `Path` / `PathBuf` for filesystem paths, not `str` / `String`.
- Use `Duration` for time durations, not raw integers.
- Use `NonZeroUsize` only when the invariant truly matters at the boundary.
- Use domain newtypes when the same primitive could mean multiple things.

### Accept Flexible Inputs in Functions

For borrowed string/path/buffer inputs, accept `impl AsRef<T>` where appropriate.

```rust
use std::path::Path;

fn read_config(path: impl AsRef<Path>) -> Result<Config, Error> {
    let path = path.as_ref();
    // ...
}
```

Common patterns:
- `impl AsRef<str>`
- `impl AsRef<Path>`
- `impl AsRef<[u8]>`

Do not infect structs with unnecessary generic parameters.

```rust
// Avoid
struct User<T: AsRef<str>> {
    name: T,
}

// Prefer
struct User {
    name: String,
}
```

### Prefer Inherent Core Functionality

Core behavior should be available directly on the type. Trait implementations should forward to inherent methods.

```rust
impl HttpClient {
    pub async fn get(&self, url: impl AsRef<str>) -> Result<Response, HttpError> {
        // ...
    }
}
```

Do not hide essential behavior behind traits that users must import before the type is usable.

### Prefer Regular Functions When No Receiver Is Needed

Do not put unrelated computation into an `impl` block just to namespace it.

```rust
// Good
fn validate_config(config: &Config) -> Result<(), ConfigError> {}

// Avoid
impl Config {
    fn validate_config_file(path: &Path) -> Result<(), ConfigError> {}
}
```

Associated functions should primarily construct or configure the type.

## Builders and Initialization

Use `new()` for simple construction.

```rust
impl Client {
    pub fn new(config: Config) -> Self {
        Self { config }
    }
}
```

Use a builder when construction has many optional parameters or many valid permutations.

```rust
impl Client {
    pub fn builder(config: Config) -> ClientBuilder {
        ClientBuilder::new(config)
    }
}

impl ClientBuilder {
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn retries(mut self, retries: usize) -> Self {
        self.retries = retries;
        self
    }

    pub fn build(self) -> Client {
        Client {
            config: self.config,
            timeout: self.timeout.unwrap_or_default(),
            retries: self.retries,
        }
    }
}
```

Builder rules:
- The builder for `Foo` is named `FooBuilder`.
- `Foo::builder(...)` creates the builder.
- Builder setter methods are named `x(...)`, not `set_x(...)`.
- Final method is `build()`.
- Required parameters should be passed when the builder is created.

## Error Handling

### Applications

Application crates may use `anyhow`, `eyre`, or a similar application-level error type.

Pick one and use it consistently.

```rust
use anyhow::Result;

fn main() -> Result<()> {
    run_app()?;
    Ok(())
}
```

### Libraries

Library crates should expose concrete, situation-specific error types.

```rust
#[derive(Debug)]
pub struct ConfigError {
    source: Option<std::io::Error>,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "failed to load configuration")
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source
            .as_ref()
            .map(|err| err as &(dyn std::error::Error + 'static))
    }
}
```

Prefer specific errors:

```rust
fn load_config() -> Result<Config, ConfigError> {}
fn connect_database() -> Result<Database, DatabaseError> {}
```

Avoid a single global enum for unrelated failures.

### Panics

Panics are not exceptions.

Use panics only for:
- programming bugs
- violated invariants
- impossible states
- caller contract violations
- explicit `unwrap()`-style APIs

Do not use panics for recoverable runtime errors.

```rust
// Good: parsing user input is fallible
fn parse_user_id(input: &str) -> Result<UserId, ParseUserIdError> {}

// Acceptable: internal invariant violation
assert!(start <= end, "range start must not exceed end");
```

## Documentation

Public crates, modules, types, traits, and functions should be documented.

### Crate and Module Docs

Use `//!` for crate/module-level docs.

```rust
//! User account management.
//!
//! This module contains user identifiers, profile records,
//! and operations for creating and updating users.
```

### Item Docs

Use a short first sentence. Add sections where relevant.

````rust
/// Loads configuration from a TOML file.
///
/// # Errors
///
/// Returns `ConfigError` if the file cannot be read or parsed.
///
/// # Examples
///
/// ```rust
/// let config = load_config("config.toml")?;
/// ```
pub fn load_config(path: impl AsRef<Path>) -> Result<Config, ConfigError> {
    // ...
}
````

Use these sections when applicable:
- `# Examples`
- `# Errors`
- `# Panics`
- `# Safety`
- `# Abort`

Do not create parameter tables. Explain parameters naturally in prose.

## Testing

Test observable behavior, not implementation details.

Use:
- unit tests close to the module
- integration tests in `tests/`
- doc tests for public examples
- property tests where useful
- feature-combination tests for libraries

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_user_id() {
        let id = UserId::parse("user_123").unwrap();
        assert_eq!(id.as_str(), "user_123");
    }
}
```

### Mocking I/O and External Systems

Code that depends on files, networks, clocks, randomness, or system calls should be mockable.

Prefer passing dependencies in:

```rust
trait Clock {
    fn now(&self) -> SystemTime;
}

struct TokenIssuer<C> {
    clock: C,
}
```

For libraries, expose test helpers behind a feature flag:

```rust
#[cfg(feature = "test-util")]
pub fn new_mocked() -> (Client, MockClientController) {
    // ...
}
```

Use a single feature name where possible:

```toml
[features]
test-util = []
```

## Async and Runtime Design

Futures exposed by public APIs should usually be `Send`, especially when targeting Tokio or general async ecosystems.

Avoid holding `Rc`, `RefCell`, or non-`Send` values across `.await`.

```rust
// Risky
let value = Rc::new(data);
some_async_call().await;
dbg!(value);
```

For long-running CPU-heavy async work, include cooperative yield points.

```rust
tokio::task::yield_now().await;
```

Prefer batching over one-item-at-a-time async churn when throughput matters.

## Logging and Telemetry

Use structured logging.

Prefer `tracing`.

```rust
tracing::info!(
    user.id = %user_id,
    request.id = %request_id,
    "created user account"
);
```

Do not log secrets, tokens, credentials, or raw personally identifiable information.

```rust
// Avoid
tracing::info!(email = %user.email, "sending email");

// Better
tracing::info!(user.id = %user.id, "sending email");
```

## Static Verification

All Rust projects should use the standard verification loop.

```bash
cargo fmt
cargo clippy --all-targets --all-features
cargo test --all-features
cargo check --all-targets --all-features
```

For libraries, also consider:

```bash
cargo test --no-default-features
cargo hack check --feature-powerset
cargo audit
cargo udeps
```

Use Miri when writing unsafe abstractions:

```bash
cargo +nightly miri test
```

### Lints

Prefer configuring lints in `Cargo.toml`.

```toml
[lints.rust]
missing_debug_implementations = "warn"
unsafe_op_in_unsafe_fn = "warn"
unused_lifetimes = "warn"

[lints.clippy]
correctness = { level = "warn", priority = -1 }
suspicious = { level = "warn", priority = -1 }
complexity = { level = "warn", priority = -1 }
perf = { level = "warn", priority = -1 }
style = { level = "warn", priority = -1 }
pedantic = { level = "warn", priority = -1 }
```

When suppressing lints, prefer `#[expect]` with a reason.

```rust
#[expect(clippy::unused_async, reason = "public API will perform async I/O later")]
pub async fn ping() {}
```

Use `#[allow]` mostly for generated code or unavoidable broad suppressions.

## Unsafe Code

Avoid `unsafe` unless there is a strong reason.

Valid reasons include:
- FFI
- implementing a sound low-level abstraction
- proven performance need after benchmarking

Rules:
- Every unsafe block must have a `SAFETY:` comment.
- Unsafe abstractions must be minimal and testable.
- Safe public APIs must never permit undefined behavior.
- Do not use `unsafe` to bypass lifetimes, `Send`, `Sync`, or type-system errors.
- Run Miri for unsafe code where possible.

```rust
// SAFETY: `ptr` is guaranteed by the caller to be valid for reads
// and properly aligned for `T`.
let value = unsafe { ptr.read() };
```

If callers must uphold safety conditions, mark the function `unsafe` and document `# Safety`.

```rust
/// Reads a value from a raw pointer.
///
/// # Safety
///
/// `ptr` must be non-null, properly aligned, and valid for reads.
pub unsafe fn read_ptr<T>(ptr: *const T) -> T {
    ptr.read()
}
```

## Public Types and Traits

Public types should usually implement common traits where meaningful:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(String);
```

Implement `Display` for types intended to be shown to users or developers.

```rust
impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
```

Types containing secrets must implement custom `Debug` and avoid leaking sensitive data.

```rust
pub struct ApiKey(String);

impl std::fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ApiKey(...)")
    }
}
```

## Globals and State

Avoid global mutable state.

Avoid `static` and thread-local state when correctness depends on having exactly one shared instance.

Prefer explicit dependency passing:

```rust
struct App {
    db: Database,
    clock: SystemClock,
}
```

Statics are acceptable for:
- immutable constants
- performance caches where duplication is safe
- compile-time data

Document magic values and prefer named constants.

```rust
/// Maximum time allowed for the upstream service to respond.
///
/// Chosen to match the provider timeout. Lowering this may abort
/// valid long-running requests.
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(60);
```

## Dependency Injection

Prefer concrete types first.

Escalation order:
1. concrete type
2. enum over known implementations
3. generic over a narrow trait
4. custom wrapper around `dyn Trait`

Avoid exposing `Arc<dyn Trait>` or `Box<dyn Trait>` throughout public APIs unless necessary.

```rust
// Good
struct UserService {
    users: UserRepository,
}

// Good when multiple known implementations exist
enum UserRepository {
    Postgres(PostgresUsers),
    Memory(InMemoryUsers),
}

// Good when callers must provide custom behavior
trait LoadUser {
    fn load_user(&self, id: UserId) -> Result<User, UserError>;
}
```

Keep traits narrow.

```rust
trait LoadUser {}
trait StoreUser {}

trait UserStore: LoadUser + StoreUser {}
```

## Smart Pointers and Wrappers

Do not expose `Arc`, `Rc`, `Box`, `RefCell`, or `Mutex` in public APIs unless the wrapper is central to the API.

```rust
// Good
pub fn process(data: &Data) -> Result<State, Error> {}

// Avoid
pub fn process(data: Arc<Mutex<Data>>) -> Result<State, Error> {}
```

Internally, shared services may use `Arc` and implement cheap `Clone`.

```rust
#[derive(Clone)]
pub struct EmailClient {
    inner: Arc<EmailClientInner>,
}
```

`Clone` for service-like types should usually clone a handle, not duplicate a heavy resource.

## I/O Design

Prefer sans-I/O design where possible.

Functions that only need to read or write data should accept standard I/O traits.

```rust
fn parse_data(input: impl std::io::Read) -> Result<Data, ParseError> {
    // ...
}
```

This allows callers to use files, sockets, byte slices, buffers, or test doubles.

Do not unnecessarily require a concrete `File` or path if the function only needs bytes.

## FFI

Keep FFI boundaries explicit and conservative.

Rules:
- Use `#[repr(C)]` for FFI-safe types.
- Do not pass Rust-owned types like `String`, `Vec`, `Box`, or non-`repr(C)` structs across FFI boundaries.
- Avoid sharing state across dynamic library boundaries.
- Provide native-handle escape hatches where appropriate.
- Document all safety requirements.

```rust
#[repr(C)]
pub struct RawHandle {
    ptr: *mut std::ffi::c_void,
}
```

## Performance

Do not optimize blindly.

For performance-sensitive code:
- identify hot paths early
- benchmark with `criterion` or similar
- profile CPU and allocations
- avoid unnecessary allocation, cloning, formatting, and hashing
- batch work where possible
- document performance-sensitive areas

```toml
[profile.bench]
debug = 1
```

Use `unsafe` for performance only after benchmarking proves the safe version is insufficient.

## Agent Workflow

When working in a Rust codebase:

1. Run or recommend the standard verification commands.
2. Prefer compiler-guided changes over speculative rewrites.
3. Keep public APIs idiomatic and documented.
4. Add tests for changed behavior.
5. Avoid introducing new dependencies without explicit approval.
6. Avoid introducing `unsafe` unless absolutely necessary.
7. Keep changes small, typed, and easy to review.

Default verification:

```bash
cargo fmt
cargo clippy --all-targets --all-features
cargo test --all-features
```

For libraries:

```bash
cargo check --all-targets --all-features
cargo test --all-features
cargo test --no-default-features
```
