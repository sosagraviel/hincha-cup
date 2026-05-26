# Swift Concurrency

> **Load when:** writing async/await code, working with actors, parallelising tasks, bridging callbacks or delegates to async, or migrating a target to Swift 6 strict concurrency.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Run two tasks in parallel | `async let a = ...; async let b = ...; let (ra, rb) = try await (a, b)` |
| Run N tasks over a collection | `withThrowingTaskGroup(of: T.self) { group in ... }` |
| Ensure UI updates are on the main thread | `@MainActor` on the type, or `await MainActor.run { ... }` |
| Bridge a single callback to async | `try await withCheckedThrowingContinuation { ... }` |
| Bridge a delegate to an async sequence | `AsyncStream { continuation in ... }` |
| Cancel a long task cooperatively | `try Task.checkCancellation()` at checkpoints |
| Cancel immediately and run cleanup | `withTaskCancellationHandler { ... } onCancel: { ... }` |
| Run work explicitly off the main actor | `Task.detached(priority: .background) { ... }` |

## Async/Await

```swift
// Async function declaration
func fetchOrders() async throws -> [Order] {
    let data = try await networkClient.get("/orders")
    return try JSONDecoder().decode([Order].self, from: data)
}

// Calling from a synchronous context
Task {
    do {
        let orders = try await fetchOrders()
        await updateUI(with: orders)
    } catch {
        await showError(error)
    }
}

// Async sequence (for-await loop)
func streamEvents() async throws {
    for try await event in eventSource.events {
        await handleEvent(event)
    }
}
```

## Structured Concurrency

### Parallel Execution with async let

Use `async let` when you know the exact number of concurrent tasks up front.

```swift
// Kick off both fetches simultaneously; await results together
async let user  = fetchUser(id: userID)
async let posts = fetchPosts(for: userID)
let (resolvedUser, resolvedPosts) = try await (user, posts)
```

### Task Groups for Dynamic Parallelism

Use `withThrowingTaskGroup` when the number of concurrent tasks depends on runtime data.

```swift
func fetchAll(ids: [String]) async throws -> [Item] {
    try await withThrowingTaskGroup(of: Item.self) { group in
        for id in ids {
            group.addTask { try await fetch(id: id) }
        }
        return try await group.reduce(into: []) { $0.append($1) }
    }
}
```

> **Ordering gotcha:** Results from a task group arrive in completion order, not the order tasks were added. If output order must match input, include the index and sort afterward:
> ```swift
> group.addTask { (index, try await fetch(ids[index])) }
> // collect, then: results.sorted { $0.0 < $1.0 }.map(\.1)
> ```

### Task Cancellation

Long-running tasks must check for cancellation cooperatively.

```swift
func longRunningWork() async throws -> Result {
    try Task.checkCancellation()   // throws CancellationError if cancelled
    // ... work chunk 1 ...
    try Task.checkCancellation()
    // ... work chunk 2 ...
    return result
}

// Cancelling from outside
let task = Task { try await longRunningWork() }
task.cancel()
```

### Unstructured Tasks and Task.detached

`Task { }` inherits the actor context and priority of its caller — the right tool for bridging sync→async within the same actor.

`Task.detached` explicitly breaks that inheritance. Use it when work must run outside any actor context (e.g. background processing that must not hold the main actor) or at a specific priority independent of the caller.

```swift
// Task {} — inherits caller's @MainActor context; safe to update UI
Task {
    let data = try await fetchData()
    updateUI(with: data)   // still on @MainActor
}

// Task.detached — no actor, no inherited priority
Task.detached(priority: .background) {
    await processLargeDataset()   // guaranteed off the main actor
}
```

**Rule:** Prefer `async let` or task groups (structured). Reach for `Task {}` to bridge sync→async. Use `Task.detached` only when explicitly escaping actor context is the goal.

### withTaskCancellationHandler

Use `withTaskCancellationHandler` when cancellation must trigger an immediate side effect (e.g. cancelling an in-flight network request) rather than waiting for the next `checkCancellation()` poll.

```swift
func fetchWithCleanup(id: String) async throws -> Data {
    try await withTaskCancellationHandler {
        try await networkClient.fetch(id: id)
    } onCancel: {
        // Invoked immediately on cancellation, even if the inner body is suspended.
        // Must be synchronous and Sendable — do not await inside onCancel.
        networkClient.cancelRequest(id: id)
    }
}
```

## Bridging Callbacks to async/await

Use `withCheckedContinuation` to wrap a **single-callback** API into an `async` function. For APIs that produce multiple values over time, use `AsyncStream` (see below).

```swift
// Single callback — withCheckedContinuation
func fetchThumbnail(for url: URL) async -> UIImage? {
    await withCheckedContinuation { continuation in
        SDWebImageManager.shared.loadImage(with: url, options: []) { image, _, _, _ in
            continuation.resume(returning: image)
        }
    }
}

// Single callback that can fail — withCheckedThrowingContinuation
func authorize() async throws -> AuthToken {
    try await withCheckedThrowingContinuation { continuation in
        authClient.requestToken { result in
            continuation.resume(with: result)   // Result<AuthToken, Error>
        }
    }
}
```

**Rules:**
- `resume` must be called **exactly once**. Zero calls leak the task; two calls crash.
- "Checked" variants trap on misuse in debug builds — prefer them over `withUnsafeContinuation` unless you have a measured perf reason.
- For multi-value/delegate sources, use `AsyncStream` — a continuation handles only one value.

## AsyncStream

`AsyncStream` bridges callback- or delegate-based APIs into an `AsyncSequence` that can be consumed with `for await`.

```swift
// Wrap CLLocationManager delegate callbacks into an AsyncStream.
// CLLocationManager.delegate is weak, so use a nested class kept alive by onTermination.
func locationUpdates() -> AsyncStream<CLLocation> {
    final class Delegate: NSObject, CLLocationManagerDelegate {
        let continuation: AsyncStream<CLLocation>.Continuation
        init(_ continuation: AsyncStream<CLLocation>.Continuation) { self.continuation = continuation }
        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            locations.forEach { continuation.yield($0) }
        }
    }

    return AsyncStream { continuation in
        let manager = CLLocationManager()
        let delegate = Delegate(continuation)
        manager.delegate = delegate
        manager.startUpdatingLocation()

        continuation.onTermination = { _ in
            manager.stopUpdatingLocation()
            _ = delegate   // keeps delegate alive until the stream terminates
        }
    }
}

// Consume — loop exits when the stream finishes or the task is cancelled
for await location in locationUpdates() {
    updateUI(with: location)
}

// AsyncThrowingStream — when the source can error
func eventStream() -> AsyncThrowingStream<Event, Error> {
    AsyncThrowingStream { continuation in
        socket.onEvent = { continuation.yield($0) }
        socket.onError = { continuation.finish(throwing: $0) }
        socket.onClose = { continuation.finish() }
        continuation.onTermination = { _ in socket.disconnect() }
    }
}
```

**Rule of thumb:** Use `AsyncStream` to bridge from the delegate/callback world into structured concurrency. Once you have an `AsyncSequence`, you can compose it with `AsyncAlgorithms` (debounce, throttle, zip, etc.).

## Actors

Actors serialise access to mutable state, eliminating data races at compile time.

```swift
// Basic actor
actor UserCache {
    private var cache: [UserID: User] = [:]

    func user(for id: UserID) -> User? { cache[id] }
    func store(_ user: User) { cache[user.id] = user }
}

// Usage — await required from outside the actor
let cached = await userCache.user(for: id)
```

### @MainActor

Mark types or functions that must run on the main thread.

```swift
enum ViewState<T> { case idle, loading, loaded(T), error(String) }

@MainActor
final class ItemListViewModel {
    var state: ViewState<[Item]> = .idle
    private let repository: ItemRepository

    init(repository: ItemRepository) { self.repository = repository }

    func loadItems() async {
        state = .loading
        do {
            state = .loaded(try await repository.fetchItems())
        } catch {
            state = .error(error.localizedDescription)
        }
        // Safe: @MainActor guarantees all mutations happen on the main thread
    }
}

// Hop to main thread from any async context
await MainActor.run { label.text = "Done" }
```

### Actor Reentrancy

An actor suspends at every `await`. While it is suspended, other tasks can run on that actor and mutate its state. Code that looks sequential can have interleaved mutations.

```swift
actor BankAccount {
    var balance: Decimal = 0

    // BUGGY — reentrancy hole
    func withdraw(_ amount: Decimal) async throws {
        guard balance >= amount else { throw BankError.insufficientFunds }
        // 🚨 Actor suspends here while awaiting the network call.
        // Another withdraw() task can run, pass the guard above, and over-draw the account.
        try await recordTransaction(amount)
        balance -= amount
    }

    // CORRECT — check invariants and mutate state atomically before any suspension
    func withdraw(_ amount: Decimal) async throws {
        guard balance >= amount else { throw BankError.insufficientFunds }
        balance -= amount          // ✅ Mutate before awaiting anything
        do {
            try await recordTransaction(amount)
        } catch {
            balance += amount      // Compensate on failure
            throw error
        }
    }
}
```

**Rule:** Treat every `await` inside an actor method as a point where all actor state can change. Read state, make decisions, and mutate — all before the first suspension.

### nonisolated

Use `nonisolated` for synchronous, non-mutating access that doesn't need serialisation.

```swift
actor Counter {
    var value = 0
    nonisolated let name: String    // Readable from any context without await

    init(name: String) { self.name = name }
}
```

## Sendable and Data Race Safety

Swift 6 enforces `Sendable` at compile time when `StrictConcurrency` is enabled.

```swift
// Value types are implicitly Sendable
struct Message: Sendable {
    let id: UUID
    let text: String
}

// @unchecked Sendable — only when you manage the lock yourself
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Any] = [:]

    func set(_ value: Any, for key: String) {
        lock.withLock { storage[key] = value }
    }
}

// Sending parameters (Swift 6) — value is consumed, not shared
func process(_ value: sending SomeClass) async { }
```

### Enabling Strict Concurrency

Add to `Package.swift` targets to catch data races at compile time:

```swift
.target(
    name: "MyTarget",
    swiftSettings: [
        .enableExperimentalFeature("StrictConcurrency"),   // Swift 5.x
        // Or in Swift 6: strict concurrency is on by default
    ]
)
```

## Swift 6 Strict Concurrency Migration

Swift 6 makes data-race safety a compile error. Enable it incrementally per target.

### Step 1 — Enable in Package.swift (one target at a time)

```swift
.target(
    name: "MyTarget",
    swiftSettings: [
        .swiftLanguageVersion(.v6)   // full Swift 6 mode
        // or, to preview in Swift 5.x:
        // .enableUpcomingFeature("StrictConcurrency")
    ]
)
```

### Step 2 — Common compiler errors and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Sending 'x' risks causing data races` | Non-`Sendable` value crosses actor boundary | Make the type `Sendable` (struct/enum) or use `sending` parameter |
| `Main actor-isolated property can not be mutated from a nonisolated context` | Mutating `@MainActor` state off the main thread | Wrap in `await MainActor.run { }` or annotate the call site `@MainActor` |
| `Stored property 'x' of 'Sendable'-conforming class is mutable` | `class` with `var` property marked `Sendable` | Make property `let`, use an actor, or add `@unchecked Sendable` with a lock |
| `Expression is 'async' but is not marked with 'await'` | Calling actor-isolated method without `await` | Add `await` at the call site |

### Step 3 — Key annotations

```swift
// @preconcurrency — suppress Sendable warnings from pre-Swift 6 modules you don't own
import @preconcurrency Foundation

// nonisolated(unsafe) — opt out of isolation checking for a specific stored property
// Use only when you can prove thread safety externally (e.g. write-once-at-init)
nonisolated(unsafe) var legacyGlobal: SomeType = SomeType()

// sending — parameter is consumed (transferred) into the async context, not shared
func process(_ value: sending MyClass) async {
    // value is exclusively owned here; caller cannot use it after this call
}

// @Sendable closure — required when passing closures across actor boundaries
let work: @Sendable () -> Void = { /* no captured mutable state */ }
```

### Migration order of operations

1. Start with leaf targets (no dependents) — fix errors there first
2. Move inward toward the app target
3. Use `@preconcurrency` on third-party imports to silence noise while you work
4. Replace `@unchecked Sendable` stubs with real actors or value types before shipping

## Pitfalls

| Don't | Do |
|---|---|
| `Task { }` stored nowhere | Store the handle: `loadTask = Task { ... }` — orphaned tasks live until completion and leak |
| Mutate actor state after an `await` without re-checking | Read, decide, and mutate **before** the first `await` in an actor method (see Actor Reentrancy) |
| Call `resume` twice or zero times in a continuation | `resume` exactly once — double-call crashes, zero-call leaks the suspended task |
| `@unchecked Sendable` on a class without a lock | Use an `actor`, or add `NSLock` and document that thread safety is manually managed |
| `@MainActor` on individual methods of a type | Annotate the whole type — per-method isolation is verbose and easy to miss |
| `Task.detached` as the default for async work | Prefer `Task { }` (inherits actor context); use `detached` only when escaping context is the goal |

## Best Practices

- Prefer `async let` over `Task { }` when results are used together
- Never escape values from structured concurrency — let the group collect them
- Annotate UI-bound types `@MainActor` at the **type level**, not per-method — per-method annotation is error-prone and verbose
- Enable Swift 6 mode per-target incrementally; a big-bang migration is painful
- Avoid `@unchecked Sendable` without a lock — prefer actors or value types
- Store `Task` handles when you need to cancel; orphaned `Task { }` calls are silent leaks
- Treat every `await` inside an actor method as a potential state mutation point — read, decide, and mutate before the first suspension (see Actor Reentrancy)
- `TaskGroup` results arrive in completion order, not input order — sort explicitly if order matters
- Use `Task.detached` only when you explicitly need to escape the current actor context; prefer `Task {}` otherwise
- Call `resume` exactly once in a continuation — zero calls leak the task, two calls crash
