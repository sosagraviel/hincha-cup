# Language Fundamentals

> **Load when:** choosing between types, working with optionals, writing protocols/generics, handling errors, encoding/decoding JSON, controlling availability, or choosing `@Observable` vs `@Published`.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Exit early if a value is nil | `guard let x else { return }` |
| Use a value only if present | `if let x { ... }` |
| Provide a fallback for nil | `x ?? defaultValue` |
| Represent a closed set of states | `enum` with associated values |
| Enforce a type capability | `protocol` with method/property requirements |
| Encode or decode JSON | `struct Foo: Codable` + `JSONDecoder` / `JSONEncoder` |
| Assign a multi-branch value to `let` | `let x: T = if ... { ... } else { ... }` (Swift 5.9+) |
| Restrict a declaration to iOS 17+ | `@available(iOS 17, *)` |
| Group related constants | `enum Namespace { static let x: T = ... }` |
| Hide implementation details | `private` / `private(set)` |

## Contents

| Section | Topics |
|---------|--------|
| [Types and Value Semantics](#types-and-value-semantics) | struct, class, enum, let/var, typealias |
| [Optionals](#optionals) | guard let, if let, ??, optional chaining |
| [Enums](#enums) | associated values, CaseIterable, indirect/recursive |
| [if / switch Expressions](#if--switch-expressions) | expression syntax, assignment, return |
| [Protocols and Protocol-Oriented Programming](#protocols-and-protocol-oriented-programming) | associatedtype, composition, default implementations, conditional conformance |
| [Generics](#generics) | generic functions/types, primary associated types, some vs any |
| [Result Builders and DSL Patterns](#result-builders-and-dsl-patterns) | @resultBuilder |
| [Error Handling](#error-handling) | typed throws, Result, do/catch, try?/try! |
| [Codable](#codable) | synthesis, CodingKeys, custom init(from:) |
| [Availability](#availability) | #available, @available, @available(*, deprecated) |
| [Common Protocol Conformances](#common-protocol-conformances) | Identifiable, Hashable, Comparable |
| [Property Wrappers](#property-wrappers) | wrappedValue, projectedValue |
| [Access Control](#access-control) | private, fileprivate, internal, public, open, private(set) |
| [Named Constants](#named-constants) | enum namespaces, extension constants |
| [Macros](#macros-swift-59) | built-in macros, @Observable, @Observable vs @Published, custom macros |

## Types and Value Semantics

- Prefer `struct` over `class` for value types (no shared mutable state)
- Use `class` only when identity, inheritance, or reference semantics are required
- Use `enum` with associated values instead of subclassing for closed hierarchies
- `let` by default; only use `var` when mutation is needed
- Use `typealias` to give semantic names to complex types

```swift
// Value type composition
struct Money {
    let amount: Decimal
    let currency: Currency
}

// Enum with associated values
enum PaymentResult {
    case success(transactionID: String)
    case failure(PaymentError)
    case pending(estimatedTime: TimeInterval)
}

// Type alias for clarity
typealias UserID = String
typealias CompletionHandler = (Result<User, Error>) -> Void
```

## Optionals

- Use optional chaining (`?.`) over forced unwrapping (`!`)
- Prefer `guard let` for early exit; `if let` for narrowly-scoped branches
- Combine consecutive `guard` conditions into one when they share the same `else` clause
- Use `??` for default values; avoid `!` except in tests or truly guaranteed non-nil cases

```swift
// Preferred: guard for early exit, happy path stays unindented
func process(user: User?) {
    guard let user, user.isActive else { return }
    // user is non-optional here
}

// Combine guards that share the same else — never stack them separately
// Wrong
guard let id = item.id else { return false }
guard item.isValid else { return false }

// Correct
guard let id = item.id, item.isValid else { return false }

// Optional chaining
let city = user?.address?.city ?? "Unknown"

// Nil coalescing with side effects
let name = profile?.displayName ?? generateDefaultName()
```

## Enums

```swift
// Exhaustive matching — no default when all cases are known
switch event {
case .purchase(let item):   handlePurchase(item)
case .refund(let amount):   handleRefund(amount)
case .cancel:               handleCancel()
}

// CaseIterable for iteration
enum Feature: String, CaseIterable {
    case darkMode = "dark_mode"
    case notifications = "notifications"
}

// Recursive enum
indirect enum Expression {
    case number(Double)
    case addition(Expression, Expression)
    case multiplication(Expression, Expression)
}
```

## if / switch Expressions

Swift 5.9+ lets `if` and `switch` be used as expressions — they return a value directly. This eliminates the need for a mutable `var` that gets assigned in branches.

```swift
// Before (5.8 and below) — requires var and mutation
var label: String
if score >= 90 {
    label = "A"
} else if score >= 75 {
    label = "B"
} else {
    label = "C"
}

// After (5.9+) — expression produces a value; label can be let
let label: String = if score >= 90 {
    "A"
} else if score >= 75 {
    "B"
} else {
    "C"
}

// switch expression — exhaustive, returns a value
let color: Color = switch status {
case .active:   .green
case .pending:  .yellow
case .inactive: .gray
}

// Works in return position too
func badge(for status: Status) -> Color {
    switch status {
    case .active:   .green
    case .pending:  .yellow
    case .inactive: .gray
    }
}
```

Every branch must produce the same type, and `if` expressions must be exhaustive (include an `else`).

## Protocols and Protocol-Oriented Programming

```swift
// Define capabilities, not types
protocol DataFetching {
    associatedtype Response: Decodable
    func fetch(from endpoint: Endpoint) async throws -> Response
}

// Protocol composition
typealias Repository = DataFetching & DataCaching

// Protocol with default implementation
protocol Loggable {
    var logTag: String { get }
    func log(_ message: String)
}

extension Loggable {
    var logTag: String { String(describing: type(of: self)) }
    func log(_ message: String) {
        print("[\(logTag)] \(message)")
    }
}

// Conditional conformance — define a local type rather than adding retroactive
// conformances to stdlib types; Stack (used elsewhere) works identically
struct Container<T> { var items: [T] }

extension Container: Loggable where T: CustomStringConvertible {
    var logTag: String { "Container<\(T.self)>" }
}
```

## Generics

```swift
// Generic function with multiple constraints
func merge<T: Hashable>(_ a: [T], _ b: [T]) -> [T] {
    var seen = Set(a)
    return a + b.filter { seen.insert($0).inserted }
}

// Generic type
struct Stack<Element> {
    private var storage: [Element] = []

    mutating func push(_ element: Element) { storage.append(element) }
    mutating func pop() -> Element? { storage.popLast() }
    var top: Element? { storage.last }
}

// Primary associated types (Swift 5.7+) — name clearly to avoid shadowing stdlib
protocol Paginatable<Item> {
    associatedtype Item
    func page(at index: Int) async throws -> [Item]
}

// Opaque types (some) vs existential types (any)
func makeShape() -> some Shape { Circle() }         // Specific hidden type
func drawShape(_ shape: any Shape) { shape.draw() } // Any conforming type
```

## Result Builders and DSL Patterns

```swift
@resultBuilder
struct ArrayBuilder<T> {
    static func buildBlock(_ components: T...) -> [T] { components }
    static func buildOptional(_ component: [T]?) -> [T] { component ?? [] }
    static func buildEither(first component: [T]) -> [T] { component }
    static func buildEither(second component: [T]) -> [T] { component }
}

// Usage
@ArrayBuilder<String>
func makeList(includeExtra: Bool) -> [String] {
    "First"
    "Second"
    if includeExtra { "Conditional" }
}
```

## Error Handling

```swift
// Typed errors (Swift 6+)
enum NetworkError: Error {
    case noConnection
    case timeout(after: TimeInterval)
    case serverError(statusCode: Int, body: Data?)
    case decodingFailed(underlying: DecodingError)
}

// Throwing with typed errors
func fetchUser(id: UserID) throws(NetworkError) -> User {
    guard isConnected else { throw .noConnection }
    // ...
}

// Error propagation with context
func loadProfile() async throws {
    do {
        try await fetchUser(id: currentUserID)
    } catch NetworkError.timeout(let duration) {
        logger.warning("Fetch timed out after \(duration)s")
        throw ProfileError.temporarilyUnavailable
    }
}

// Result type for explicit error handling
func validate(_ input: String) -> Result<ValidatedInput, ValidationError> {
    guard !input.isEmpty else { return .failure(.empty) }
    return .success(ValidatedInput(raw: input))
}
```

### try? and try!

```swift
// try? — converts a throwing call into an Optional; nil on failure
// Use when failure is expected and you have a reasonable fallback
let user = try? decoder.decode(User.self, from: data)   // User? — nil if decoding fails

// try! — crashes on failure; use only when failure is a programmer error
// that should never happen in production (e.g. a regex that is known-valid)
let regex = try! NSRegularExpression(pattern: "^[a-z]+$")

// Avoid try! in app logic — prefer try? with ?? or a full do/catch
let settings = (try? loadSettings()) ?? Settings.default
```

## Codable

Use `Codable` (`Encodable & Decodable`) for JSON serialisation. Conformance is synthesised automatically when all stored properties are themselves `Codable`.

```swift
// Basic — synthesis handles encode/decode
struct User: Codable {
    let id: Int
    let name: String
    let email: String
}

let data = try JSONEncoder().encode(User(id: 1, name: "Alice", email: "alice@example.com"))
let user = try JSONDecoder().decode(User.self, from: data)

// Custom CodingKeys — map snake_case JSON keys to camelCase Swift properties
struct Article: Codable {
    let id: Int
    let title: String
    let publishedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title
        case publishedAt = "published_at"
    }
}

let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601

// Custom init(from:) when the JSON shape doesn't map cleanly to your model
struct Product: Decodable {
    let id: String
    let price: Decimal     // API sends price as integer cents

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        let cents = try c.decode(Int.self, forKey: .price)
        price = Decimal(cents) / 100
    }

    private enum CodingKeys: String, CodingKey { case id, price }
}
```

## Availability

```swift
// Runtime conditional adoption
if #available(iOS 18, *) {
    useNewAPI()
} else {
    useFallback()
}

// Restrict a declaration to a platform version
@available(iOS 17, *)
func useObservationFramework() { ... }

// Deprecate with a migration hint
@available(*, deprecated, renamed: "loadUser(id:)")
func fetchUser(id: String) async throws -> User { ... }

// Unavailable on a specific platform
@available(watchOS, unavailable, message: "Not supported on watchOS")
func showFullScreenMap() { ... }
```

## Common Protocol Conformances

```swift
// Identifiable — required by ForEach, diffable data sources, and List
struct Order: Identifiable {
    let id: UUID
    let total: Decimal
}

// Hashable — for Set membership and Dictionary keys
// Synthesised when all stored properties are Hashable
struct Point: Hashable {
    let x: Double
    let y: Double
}

// Custom Hashable when only one field determines identity
struct User: Hashable {
    let id: UUID
    var displayName: String

    static func == (lhs: User, rhs: User) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// Comparable — enables sorted(), min(), max(), and range operators
struct Version: Comparable {
    let major: Int
    let minor: Int

    static func < (lhs: Version, rhs: Version) -> Bool {
        (lhs.major, lhs.minor) < (rhs.major, rhs.minor)
    }
}
```

## Property Wrappers

Property wrappers encapsulate get/set logic reusable across multiple properties.

```swift
@propertyWrapper
struct Clamped<T: Comparable> {
    private var value: T
    private let range: ClosedRange<T>

    init(wrappedValue: T, _ range: ClosedRange<T>) {
        self.range = range
        self.value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }

    var wrappedValue: T {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
}

struct AudioSettings {
    @Clamped(0...100) var volume: Int = 50
}

// projectedValue exposes extra API via the $ prefix
@propertyWrapper
struct Tracked<T> {
    private var value: T
    private(set) var projectedValue = false   // accessed as $property

    init(wrappedValue: T) { self.value = wrappedValue }

    var wrappedValue: T {
        get { value }
        set { value = newValue; projectedValue = true }
    }
}

struct Form {
    @Tracked var name: String = ""
}

var form = Form()
form.name = "Alice"
print(form.$name)   // true — has been written
```

## Access Control

Swift has five access levels, from most to least restrictive. Default to the most restrictive level that still lets the code compile.

| Level | Visible to |
|-------|-----------|
| `private` | Enclosing declaration and extensions in the same file |
| `fileprivate` | Entire source file |
| `internal` | Entire module (default when nothing is written) |
| `public` | Any module that imports this module; cannot be subclassed/overridden outside the module |
| `open` | Any module; can be subclassed and overridden outside the module |

```swift
// Prefer private for implementation details
final class OrderProcessor {
    private var pendingOrders: [Order] = []   // not visible outside this type

    func submit(_ order: Order) {             // internal — visible within the module
        pendingOrders.append(order)
        process(order)
    }

    private func process(_ order: Order) { /* ... */ }
}

// Public API in a library — expose only what callers need
public struct PaymentGateway {
    public init() { }
    public func charge(_ amount: Decimal) async throws -> Receipt { /* ... */ }

    // Internal helpers stay internal — not exported
    func buildRequest(for amount: Decimal) -> URLRequest { /* ... */ }
}
```

**Rules of thumb:**
- Start with `private`; promote only when something outside the type needs it.
- Never use `open` unless you're building a framework designed for subclassing.
- Mark test helpers `internal` (the default) — the test target is a separate module and won't see `private`.
- Use `private(set)` to allow reads but restrict writes: `public private(set) var count = 0`.

## Named Constants

Before writing any numeric or string literal, ask whether it deserves a name. If a value carries meaning — a size, spacing, duration, limit, identifier — define it as a named constant.

```swift
// Group constants by concern
enum Layout {
    static let avatarSize: CGFloat = 44
    static let cardPadding: CGFloat = 16
    static let cornerRadius: CGFloat = 12
}

extension Animation {
    static let contentTransition: Animation = .bouncy(duration: 0.25)
}

enum API {
    static let requestTimeout: TimeInterval = 30
    static let maxRetries = 3
}

// Applied
Image(systemName: "person")
    .frame(width: Layout.avatarSize, height: Layout.avatarSize)
    .clipShape(Circle())
    .padding(Layout.cardPadding)
```

Group constants by concern (layout, animation, network, business rules) as enums with static members or as `extension` properties on the relevant type. Avoid a single monolithic `Constants` namespace.

## Macros (Swift 5.9+)

Macros generate code at compile time. Swift ships built-in macros and supports custom ones via `swift-syntax`.

### Built-in Literal and Diagnostic Macros

```swift
// Source location — resolved at compile time, useful for logging
func log(file: String = #fileID, line: Int = #line, fn: String = #function) {
    print("\(file):\(line) \(fn)")
}

// Inline compile-time diagnostics
#warning("Replace stub before shipping")
// #error("Missing required configuration") — uncomment to fail the build
```

### Attached Macros

`@Observable` (from the Observation framework) is an attached macro that generates observation tracking boilerplate. It is the canonical example of what attached macros look like at the call site.

```swift
// @Observable expands to _$observationRegistrar storage + access/withMutation call-site tracking
@Observable
final class SettingsViewModel {
    var theme: Theme = .system
    var fontSize: Int = 16
}
// No @Published needed — all stored properties are automatically tracked
```

### @Observable vs @Published — Decision Guide

| Situation | Use |
|-----------|-----|
| iOS 17+ / macOS 14+ only, new code | `@Observable` |
| Minimum deployment target below iOS 17 | `@Published` + Combine |
| Need a Combine publisher chain (debounce, flatMap, etc.) | `@Published` |
| Pure SwiftUI observation (no Combine operators needed) | `@Observable` |
| UIKit binding via Combine `.sink` | `@Published` |
| Mixed UIKit + SwiftUI with `UIHostingController` | `@Observable` works for both |

```swift
// @Observable — iOS 17+, no Combine import needed
@Observable
final class ProfileViewModel {
    var name = ""
    var isLoading = false
    // SwiftUI views that read these properties re-render automatically
}

// @Published — iOS 16 and below, or when you need Combine operators
final class SearchViewModel {
    @Published var query = ""
    @Published private(set) var results: [Item] = []
    private var cancellables = Set<AnyCancellable>()

    init(repository: ItemRepository) {
        $query
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .flatMap { repository.search(query: $0) }
            .receive(on: DispatchQueue.main)
            .assign(to: &$results)
    }
}
```

### Custom Macros

Custom macros live in a dedicated `macro` target that depends on `swift-syntax`. Callers never need to depend on `swift-syntax` themselves.

```swift
// Package.swift — declare the macro implementation target
.macro(
    name: "AppMacros",
    dependencies: [
        .product(name: "SwiftSyntaxMacros", package: "swift-syntax"),
        .product(name: "SwiftCompilerPlugin", package: "swift-syntax"),
    ]
),
// Expose it as a library so call-site targets can use it
.library(name: "AppMacros", targets: ["AppMacros"]),
```

Usage at call sites is identical to built-in macros — annotate with `@MyMacro` or call `#myMacro(...)`. Xcode can expand any macro in place via right-click → **Expand Macro**.

## Pitfalls

| Don't | Do |
|---|---|
| `let x = obj.value!` in production | `guard let x = obj.value else { return }` |
| Stack multiple `guard let` with separate `else` clauses | `guard let a, let b else { return }` — combine when they share the same else |
| Add `default:` to a switch over a closed enum | Omit `default` — the compiler enforces exhaustiveness and catches new cases |
| Use `class` when no identity or inheritance is needed | Default to `struct` — value semantics, no retain cycles |
| Spread magic numbers / strings across the codebase | Define named constants in a typed `enum` namespace (e.g. `enum Layout`) |
| Conform to `@unchecked Sendable` on a class without a lock | Use an `actor`, or add `NSLock` and document the invariant |

## Best Practices

- Default to `struct`; only reach for `class` when identity or inheritance is required
- Use `let` by default — `var` signals intentional mutation
- Prefer `guard let` for early exit so the happy path stays unindented
- Never use `!` in production code — use `guard let`, `??`, or `try?` instead
- Default to `private`; promote access level only when something outside the type genuinely needs it
- Use exhaustive `switch` without `default` for closed enums — the compiler will catch new cases
- Group named constants by concern (layout, animation, API) using enums with static members; avoid a single `Constants` file
- Use `if`/`switch` expressions (Swift 5.9+) to assign multi-branch values to `let` instead of a mutable `var`
- Add `@available(*, deprecated, renamed:)` before removing public API — never delete without a migration path
