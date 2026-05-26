# Testing

> **Load when:** writing unit or integration tests, creating mocks or fixtures, testing async code, or choosing between Swift Testing and XCTest.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Assert equality | `#expect(a == b)` |
| Assert a function throws | `#expect(throws: MyError.self) { try fn() }` |
| Unwrap an optional or abort the test | `let x = try #require(optional)` |
| Test the same logic for many inputs | `@Test("...", arguments: [...]) func test(x: T)` |
| Mark a known bug without failing CI | `withKnownIssue("tracking #123") { #expect(...) }` |
| Create a test-swappable dependency | `final class MockFoo: FooProtocol { ... }` |
| Build a model with sensible defaults | `static func fixture(id: String = UUID().uuidString, ...) -> Foo` |
| Prevent tests from interfering with each other | `@Suite("...", .serialized)` |

## Swift Testing Framework (Swift 6+)

The built-in `Testing` module replaces XCTest for unit testing. Use it for all new test code.

```swift
import Testing

@Suite("OrderService")
struct OrderServiceTests {
    let mockRepository = MockOrderRepository()
    let sut: OrderService

    init() {
        sut = OrderService(repository: mockRepository)
    }

    @Test("places order with valid items")
    func placeOrderWithValidItems() async throws {
        let confirmation = try await sut.placeOrder(items: [.fixture()])
        #expect(confirmation.status == .confirmed)
    }

    @Test("throws for empty cart")
    func emptyCartThrows() async {
        await #expect(throws: OrderError.emptyCart) {
            try await sut.placeOrder(items: [])
        }
    }
}
```

### #require — Abort on Failure

Use `#require` for preconditions where continuing after a failure would produce confusing cascading errors. Unlike `#expect` (which records a failure and continues), `#require` throws immediately, stopping the test.

```swift
@Test("processes first result")
func processesFirstResult() async throws {
    let results = try await sut.search(query: "swift")

    // #require stops the test here if results is empty — no confusing index-out-of-bounds below
    let first = try #require(results.first)
    #expect(first.title == "Swift Programming Language")
}

// #require also works for optional unwrapping — equivalent to XCTUnwrap
let url = try #require(URL(string: rawURL), "invalid URL: \(rawURL)")
```

**Rule:** Use `#expect` by default. Reach for `#require` when a nil or unexpected value would make subsequent assertions meaningless.

### Parameterised Tests

```swift
@Test("formats currency correctly", arguments: [
    (1.0,   "USD", "$1.00"),
    (1000.0, "EUR", "€1,000.00"),
])
func formatsCurrencyCorrectly(amount: Double, currency: String, expected: String) {
    #expect(formatter.format(amount, currency: currency) == expected)
}
```

### Tags and Filtering

```swift
@Suite("Integration Tests", .tags(.integration))
struct IntegrationTests { ... }

// Run only tagged tests
// swift test --filter .integration
```

### withKnownIssue — Expected Failures

Use `withKnownIssue` when a test is known to fail (e.g. a tracked bug) but you still want it to run and surface if it unexpectedly *passes*. Unlike `#expect`, which fails the suite, `withKnownIssue` marks the issue as expected and keeps CI green.

```swift
@Test("renders correctly (known layout bug)")
func rendersCorrectly() {
    withKnownIssue("Layout regression tracked in #1234") {
        #expect(view.frame.height == 44)   // fails — recorded as expected, not a test failure
    }
}

// If the issue is intermittent, use isIntermittent: true
withKnownIssue("flaky on CI", isIntermittent: true) {
    #expect(result == .success)
}
```

When the underlying bug is fixed, the test will start passing and `withKnownIssue` will emit a warning that the issue is no longer present — a reminder to remove the wrapper.

## XCTest (Legacy / UIKit Tests)

Use XCTest for UI tests (XCUITest) and any codebase not yet on Swift Testing.

```swift
import XCTest

final class UserServiceTests: XCTestCase {
    var sut: UserService!
    var mockRepository: MockUserRepository!

    override func setUp() {
        super.setUp()
        mockRepository = MockUserRepository()
        sut = UserService(repository: mockRepository)
    }

    override func tearDown() {
        sut = nil
        mockRepository = nil
        super.tearDown()
    }

    func test_fetchUser_returnsExpectedUser() async throws {
        let expected = User.fixture()
        mockRepository.userResult = .success(expected)

        let user = try await sut.fetchUser(id: expected.id)
        XCTAssertEqual(user, expected)
    }
}
```

## Test Doubles

### Protocol-Based Mocks

```swift
protocol OrderRepositoryProtocol {
    func placeOrder(items: [Item]) async throws -> OrderConfirmation
}

final class MockOrderRepository: OrderRepositoryProtocol {
    var placeOrderResult: Result<OrderConfirmation, Error> = .success(.fixture())
    private(set) var placeOrderCallCount = 0
    private(set) var lastPlacedItems: [Item]?

    func placeOrder(items: [Item]) async throws -> OrderConfirmation {
        placeOrderCallCount += 1
        lastPlacedItems = items
        return try placeOrderResult.get()
    }
}
```

### Test Fixtures via Static Factory

```swift
extension Item {
    static func fixture(
        id: String = UUID().uuidString,
        name: String = "Test Item",
        price: Decimal = 9.99
    ) -> Item {
        Item(id: id, name: name, price: price)
    }
}

extension OrderConfirmation {
    static func fixture(
        id: String = UUID().uuidString,
        status: OrderStatus = .confirmed
    ) -> OrderConfirmation {
        OrderConfirmation(id: id, status: status)
    }
}
```

### Spies for Interaction Verification

```swift
final class SpyAnalyticsService: AnalyticsService {
    private(set) var trackedEvents: [AnalyticsEvent] = []

    func track(_ event: AnalyticsEvent) {
        trackedEvents.append(event)
    }

    func wasTracked(_ event: AnalyticsEvent) -> Bool {
        trackedEvents.contains(event)
    }
}
```

## Async Testing

### Swift Testing (async)

```swift
@Test("fetches data asynchronously")
func fetchesDataAsync() async throws {
    let data = try await sut.fetchData()
    #expect(!data.isEmpty)
}
```

### XCTest with async/await

```swift
func test_fetchData_returnsExpectedData() async throws {
    let data = try await sut.fetchData()
    XCTAssertFalse(data.isEmpty)
}
```

### Testing Combine Publishers (XCTest)

```swift
func test_publisherEmitsValue() {
    let expectation = expectation(description: "publisher emits")
    var received: [Int] = []
    var cancellables = Set<AnyCancellable>()

    sut.valuePublisher
        .sink {
            received.append($0)
            if received.count == 1 { expectation.fulfill() }
        }
        .store(in: &cancellables)

    sut.trigger()

    waitForExpectations(timeout: 1) { _ in
        XCTAssertEqual(received, [42])
    }
}
```

## Test Isolation

Tests that share mutable global state can fail non-deterministically depending on execution order. Avoid this by:

- Not reading from or writing to global/singleton state in tests — inject dependencies instead
- Setting up all state in `init()` (Swift Testing) or `setUp()` (XCTest) and tearing it down afterward
- Marking suites that must not run in parallel with `.serialized`:

```swift
@Suite("Database tests", .serialized)   // runs tests in this suite sequentially
struct DatabaseTests { ... }
```

- Resetting `@MainActor` isolated state before each test when it cannot be injected:

```swift
@Suite @MainActor
struct ViewModelTests {
    var sut: MyViewModel!

    init() {
        sut = MyViewModel()   // fresh instance per test — no shared state
    }
}
```

## Pitfalls

| Don't | Do |
|---|---|
| `XCTAssert` for new test code | Use Swift Testing `#expect` — better diagnostics, async-native, no subclassing |
| Read from or write to global/singleton state in tests | Inject all dependencies; create fresh state in `init()` (Swift Testing) or `setUp()` (XCTest) |
| `sleep` to wait for async work | Use `async/await` directly — `@Test func myTest() async throws { ... }` |
| Mock at `URLSession` level | Mock at the protocol boundary (`HTTPClient`, `UserRepository`) — higher-level, less fragile |
| `try!` or force-unwrap in test assertions | Use `try #require` — stops the test immediately with a clear failure message |
| Leave `withKnownIssue` wrappers after the bug is fixed | Remove them — when the issue clears, Swift Testing emits a warning that the wrapper is stale |

## Best Practices

- Inject all dependencies as protocols — concrete types stay out of test targets
- Use `fixture()` factories with default parameters; override only what the test cares about
- Prefer Swift Testing `#expect` / `#require` over XCTest for new code — better diagnostics
- Use `#require` when a nil result would make all subsequent assertions meaningless
- Test one behaviour per test; name tests as plain English descriptions
- Never use `sleep` in tests — use `async/await` or `expectation` instead
- Use `withKnownIssue` for tracked bugs; remove the wrapper once the bug is fixed
- Run `swift test --parallel` in CI and locally — Swift Testing parallelises by default
- Run tests with strict concurrency enabled to catch actor isolation issues
