---
name: mastering-rust-skill
description: Comprehensive Rust expertise covering ownership, lifetimes, traits, async programming, and the Rust ecosystem
user-invokable: true
disable-model-invocation: false
---

# Mastering Rust

Expert guidance for Rust development following idiomatic patterns and leveraging Rust's unique features.

## Ownership & Borrowing

### Ownership Rules
1. Each value has a single owner
2. When the owner goes out of scope, the value is dropped
3. Values can be moved or borrowed

```rust
// Ownership transfer (move)
let s1 = String::from("hello");
let s2 = s1;  // s1 is now invalid

// Copy types (stack-only data)
let x = 5;
let y = x;  // x is still valid (Copy trait)
```

### Borrowing and References
```rust
// Immutable borrow (&T)
fn calculate_length(s: &String) -> usize {
    s.len()
}

let s = String::from("hello");
let len = calculate_length(&s);  // s still valid

// Mutable borrow (&mut T)
fn append_world(s: &mut String) {
    s.push_str(", world");
}

let mut s = String::from("hello");
append_world(&mut s);

// Rules:
// - At any time: either one mutable reference OR any number of immutable references
// - References must always be valid (no dangling references)
```

### Lifetimes
```rust
// Explicit lifetime annotations
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Lifetime in structs
struct ImportantExcerpt<'a> {
    part: &'a str,
}

// Lifetime elision rules often make annotations unnecessary
fn first_word(s: &str) -> &str {
    // Lifetime inferred
}
```

### Slice Types
```rust
let s = String::from("hello world");
let hello = &s[0..5];
let world = &s[6..11];

// String slices (&str) are immutable references
fn first_word(s: &str) -> &str {
    let bytes = s.as_bytes();
    for (i, &item) in bytes.iter().enumerate() {
        if item == b' ' {
            return &s[0..i];
        }
    }
    &s[..]
}
```

## Type System

### Enums and Pattern Matching
```rust
// Enums can hold data
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(i32, i32, i32),
}

// Pattern matching (exhaustive)
fn process_message(msg: Message) {
    match msg {
        Message::Quit => println!("Quit"),
        Message::Move { x, y } => println!("Move to ({}, {})", x, y),
        Message::Write(text) => println!("Text: {}", text),
        Message::ChangeColor(r, g, b) => println!("RGB({}, {}, {})", r, g, b),
    }
}

// if let for single pattern
if let Message::Write(text) = msg {
    println!("{}", text);
}
```

### Traits and Trait Bounds
```rust
// Define trait
trait Summary {
    fn summarize(&self) -> String;

    // Default implementation
    fn author(&self) -> String {
        String::from("Anonymous")
    }
}

// Implement trait
impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{}, by {}", self.headline, self.author)
    }
}

// Trait bounds on generics
fn notify<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}

// Multiple trait bounds
fn process<T: Summary + Display>(item: &T) { }

// where clause for complex bounds
fn complex<T, U>(t: &T, u: &U) -> i32
where
    T: Display + Clone,
    U: Clone + Debug,
{ }
```

### Generic Types
```rust
// Generic struct
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }
}

// Implement for specific type
impl Point<f32> {
    fn distance_from_origin(&self) -> f32 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
```

### Associated Types
```rust
trait Iterator {
    type Item;  // Associated type

    fn next(&mut self) -> Option<Self::Item>;
}

impl Iterator for Counter {
    type Item = u32;

    fn next(&mut self) -> Option<Self::Item> {
        // Implementation
    }
}
```

## Error Handling

### Result<T, E> Type
```rust
use std::fs::File;
use std::io::{self, Read};

// Explicit error handling
fn read_file(path: &str) -> Result<String, io::Error> {
    let mut file = File::open(path)?;  // ? operator propagates errors
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

// Match on Result
match read_file("file.txt") {
    Ok(contents) => println!("{}", contents),
    Err(e) => eprintln!("Error: {}", e),
}
```

### Option<T> Type
```rust
fn find_user(id: u32) -> Option<User> {
    // Return Some(user) or None
}

// Pattern matching
match find_user(123) {
    Some(user) => println!("Found {}", user.name),
    None => println!("User not found"),
}

// Combinators
let name = find_user(123)
    .map(|u| u.name)
    .unwrap_or_else(|| String::from("Unknown"));
```

### Custom Error Types with thiserror
```rust
use thiserror::Error;

#[derive(Error, Debug)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(#[from] std::num::ParseIntError),

    #[error("User {0} not found")]
    UserNotFound(u32),
}

fn load_user(id: u32) -> Result<User, AppError> {
    let data = std::fs::read_to_string("users.txt")?;  // Auto-converts io::Error
    // Parse and return user
}
```

### Error Handling with anyhow
```rust
use anyhow::{Context, Result};

fn process_file(path: &str) -> Result<()> {
    let content = std::fs::read_to_string(path)
        .context("Failed to read config file")?;

    let config: Config = serde_json::from_str(&content)
        .context("Failed to parse config")?;

    Ok(())
}
```

## Async Programming

### Async/Await Syntax
```rust
// Async function
async fn fetch_data(url: &str) -> Result<String, reqwest::Error> {
    let response = reqwest::get(url).await?;
    let body = response.text().await?;
    Ok(body)
}

// Calling async functions
#[tokio::main]
async fn main() {
    match fetch_data("https://api.example.com").await {
        Ok(data) => println!("{}", data),
        Err(e) => eprintln!("Error: {}", e),
    }
}
```

### Tokio Runtime
```rust
// Multi-threaded runtime
#[tokio::main]
async fn main() {
    // Async code
}

// Manual runtime creation
let runtime = tokio::runtime::Runtime::new().unwrap();
runtime.block_on(async {
    // Async code
});

// Spawn tasks
tokio::spawn(async {
    // Background task
});

// Join multiple futures
let (result1, result2) = tokio::join!(
    fetch_data("url1"),
    fetch_data("url2")
);
```

### Stream Trait
```rust
use tokio_stream::StreamExt;

async fn process_stream() {
    let mut stream = tokio_stream::iter(vec![1, 2, 3]);

    while let Some(value) = stream.next().await {
        println!("{}", value);
    }
}
```

## Testing & Quality

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    #[should_panic(expected = "divide by zero")]
    fn test_divide_by_zero() {
        divide(10, 0);
    }

    #[test]
    fn test_result() -> Result<(), String> {
        if add(2, 2) == 4 {
            Ok(())
        } else {
            Err(String::from("two plus two is not four"))
        }
    }
}
```

### Integration Tests
```rust
// tests/integration_test.rs
use my_crate;

#[test]
fn test_integration() {
    assert!(my_crate::process().is_ok());
}
```

### Doc Tests
```rust
/// Adds two numbers together
///
/// # Examples
///
/// ```
/// let result = my_crate::add(2, 3);
/// assert_eq!(result, 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

### Cargo Test Patterns
```bash
# Run all tests
cargo test

# Run specific test
cargo test test_name

# Run tests with output
cargo test -- --nocapture

# Run tests in single thread
cargo test -- --test-threads=1

# Run ignored tests
cargo test -- --ignored

# Run benchmarks
cargo bench
```

### Clippy Lints
```bash
# Run clippy
cargo clippy

# Clippy with warnings as errors
cargo clippy -- -D warnings

# Configuration in Cargo.toml
[lints.clippy]
all = "warn"
pedantic = "warn"
nursery = "warn"
```

### Rustfmt Configuration
```toml
# rustfmt.toml
edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
```

## Common Frameworks

### Axum (Web Framework)
```rust
use axum::{
    routing::{get, post},
    Router, Json,
    extract::{Path, State},
};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(root))
        .route("/users/:id", get(get_user))
        .route("/users", post(create_user));

    axum::Server::bind(&"0.0.0.0:3000".parse().unwrap())
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn root() -> &'static str {
    "Hello, World!"
}

async fn get_user(Path(id): Path<u32>) -> Json<User> {
    // Fetch user
    Json(user)
}

async fn create_user(Json(payload): Json<CreateUser>) -> Json<User> {
    // Create user
    Json(user)
}
```

### Actix-web (Web Framework)
```rust
use actix_web::{web, App, HttpServer, Responder};

async fn greet() -> impl Responder {
    "Hello, World!"
}

async fn get_user(path: web::Path<u32>) -> impl Responder {
    format!("User ID: {}", path.into_inner())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(greet))
            .route("/users/{id}", web::get().to(get_user))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
```

### Diesel (ORM)
```rust
// Define schema
table! {
    users (id) {
        id -> Int4,
        name -> Varchar,
        email -> Varchar,
    }
}

// Define model
#[derive(Queryable)]
struct User {
    id: i32,
    name: String,
    email: String,
}

// CRUD operations
use diesel::prelude::*;

// Create
diesel::insert_into(users::table)
    .values(&new_user)
    .execute(&conn)?;

// Read
users::table
    .filter(users::email.eq("user@example.com"))
    .first::<User>(&conn)?;

// Update
diesel::update(users::table.find(id))
    .set(users::name.eq("New Name"))
    .execute(&conn)?;

// Delete
diesel::delete(users::table.find(id))
    .execute(&conn)?;
```

### SQLx (Async SQL)
```rust
use sqlx::postgres::PgPoolOptions;

let pool = PgPoolOptions::new()
    .max_connections(5)
    .connect("postgres://localhost/database").await?;

// Query with compile-time verification
let user = sqlx::query_as!(
    User,
    "SELECT id, name, email FROM users WHERE id = $1",
    id
)
.fetch_one(&pool)
.await?;

// Dynamic queries
let users = sqlx::query_as::<_, User>(
    "SELECT id, name, email FROM users"
)
.fetch_all(&pool)
.await?;
```

### Serde (Serialization)
```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct User {
    id: u32,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
}

// JSON serialization
let json = serde_json::to_string(&user)?;
let user: User = serde_json::from_str(&json)?;

// YAML, TOML, MessagePack also supported
```

## Build & Deployment

### Cargo Workspace
```toml
# Root Cargo.toml
[workspace]
members = [
    "api",
    "core",
    "cli",
]

[workspace.package]
version = "0.1.0"
edition = "2021"

[workspace.dependencies]
tokio = { version = "1.0", features = ["full"] }
```

### Feature Flags
```toml
# Cargo.toml
[features]
default = ["json"]
json = ["serde_json"]
xml = ["quick-xml"]

[dependencies]
serde_json = { version = "1.0", optional = true }
quick-xml = { version = "0.30", optional = true }
```

```rust
#[cfg(feature = "json")]
pub fn serialize_json() { }

#[cfg(feature = "xml")]
pub fn serialize_xml() { }
```

### Cross-compilation
```bash
# Install target
rustup target add x86_64-unknown-linux-musl

# Build for target
cargo build --target x86_64-unknown-linux-musl --release

# Common targets
# Linux: x86_64-unknown-linux-gnu, x86_64-unknown-linux-musl
# macOS: x86_64-apple-darwin, aarch64-apple-darwin
# Windows: x86_64-pc-windows-msvc, x86_64-pc-windows-gnu
```

## Best Practices

1. **Ownership**: Prefer borrowing over cloning, use `Cow` for conditional ownership
2. **Error Handling**: Use `Result` for recoverable errors, `panic!` only for unrecoverable
3. **Types**: Make invalid states unrepresentable with the type system
4. **Async**: Use async for I/O bound tasks, avoid blocking the runtime
5. **Testing**: Write comprehensive unit tests, use doc tests for examples
6. **Documentation**: Document public APIs, use `///` for doc comments
7. **Clippy**: Run clippy regularly and address warnings
8. **Safety**: Minimize `unsafe` code, justify and document when necessary
9. **Performance**: Profile before optimizing, use `cargo flamegraph` for profiling
10. **Dependencies**: Keep dependencies minimal, use workspace for shared dependencies
