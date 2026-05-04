# Swift Skill — Quick Topic Lookup

Find the reference file for any topic. Load the file before writing code — don't rely on recall for patterns.

## Quick Topic Lookup

| I need to... | Reference |
|---|---|
| Choose between struct, class, actor, or enum | [Language Fundamentals — Types](references/language-fundamentals.md#types-and-value-semantics) |
| Handle an optional safely | [Language Fundamentals — Optionals](references/language-fundamentals.md#optionals) |
| Match enum cases exhaustively | [Language Fundamentals — Enums](references/language-fundamentals.md#enums) |
| Assign a multi-branch value with `if`/`switch` expressions | [Language Fundamentals — if / switch Expressions](references/language-fundamentals.md#if--switch-expressions) |
| Write a protocol with a default implementation | [Language Fundamentals — Protocols](references/language-fundamentals.md#protocols-and-protocol-oriented-programming) |
| Handle errors with typed throws or Result | [Language Fundamentals — Error Handling](references/language-fundamentals.md#error-handling) |
| Encode or decode JSON | [Language Fundamentals — Codable](references/language-fundamentals.md#codable) |
| Gate code on OS version | [Language Fundamentals — Availability](references/language-fundamentals.md#availability) |
| Choose `@Observable` vs `@Published` | [Language Fundamentals — @Observable vs @Published](references/language-fundamentals.md#observable-vs-published--decision-guide) |
| Group related constants | [Language Fundamentals — Named Constants](references/language-fundamentals.md#named-constants) |
| Run two tasks in parallel | [Concurrency — async let](references/concurrency.md#parallel-execution-with-async-let) |
| Run N tasks over a collection | [Concurrency — Task Groups](references/concurrency.md#task-groups-for-dynamic-parallelism) |
| Cancel a long-running task cooperatively | [Concurrency — Task Cancellation](references/concurrency.md#task-cancellation) |
| Bridge a single callback to async/await | [Concurrency — Continuations](references/concurrency.md#bridging-callbacks-to-asyncawait) |
| Bridge a delegate to an async sequence | [Concurrency — AsyncStream](references/concurrency.md#asyncstream) |
| Isolate mutable state from concurrent access | [Concurrency — Actors](references/concurrency.md#actors) |
| Push work to the main thread | [Concurrency — @MainActor](references/concurrency.md#mainactor) |
| Migrate a target to Swift 6 strict concurrency | [Concurrency — Swift 6 Migration](references/concurrency.md#swift-6-strict-concurrency-migration) |
| Break a retain cycle in a closure | [Memory Management — Capture Lists](references/memory-management.md#capture-lists-in-closures) |
| Choose `weak` vs `unowned` | [Memory Management — Reference Cycles](references/memory-management.md#reference-cycles) |
| Cancel an async task when the owner deallocates | [Memory Management — Task Lifetime](references/memory-management.md#task-lifetime-and-leaks) |
| Release Obj-C objects in a tight loop | [Memory Management — autoreleasepool](references/memory-management.md#autoreleasepool) |
| Make an HTTP GET / POST request | [Networking — Building Requests](references/networking.md#building-requests) |
| Define the `HTTPClient` protocol and thin wrapper | [Networking — HTTPClient Protocol](references/networking.md#httpclient-protocol) |
| Validate HTTP status codes and decode the response | [Networking — Response Validation](references/networking.md#response-validation-and-decoding) |
| Add an authorization header transparently | [Networking — Authentication](references/networking.md#authentication--decorator-pattern) |
| Mock network calls in tests | [Networking — Testing](references/networking.md#testing-the-network-layer) |
| Define a persistent model | [Persistence — Defining Models](references/persistence.md#defining-models) |
| Set up a ModelContainer | [Persistence — ModelContainer](references/persistence.md#setting-up-modelcontainer) |
| Query SwiftData with a filter | [Persistence — #Predicate](references/persistence.md#predicate) |
| Perform a background insert or batch write | [Persistence — Background Context](references/persistence.md#background-context) |
| Handle a schema migration | [Persistence — Migrations](references/persistence.md#migrations--lightweight-and-versioned) |
| Store a small user preference | [Persistence — UserDefaults](references/persistence.md#userdefaults--small-settings) |
| Test persistence with an in-memory store | [Persistence — Testing](references/persistence.md#testing--in-memory-store) |
| Build a UIKit screen with a collection view | [UIKit Patterns — Modern Collection Views](references/uikit-patterns.md#modern-collection-views) |
| Animate list changes without a full reload | [UIKit Patterns — Diffable Data Source](references/uikit-patterns.md#modern-collection-views) |
| Bind a `@Published` ViewModel to a UIKit view | [UIKit Patterns — Combine Integration](references/uikit-patterns.md#combine-integration) |
| Own navigation flow with a coordinator | [UIKit Patterns — Coordinator](references/uikit-patterns.md#coordinator-pattern) |
| Push or pop a view controller | [UIKit Patterns — Navigation Primitives](references/uikit-patterns.md#navigation-primitives) |
| Present or dismiss a modal | [UIKit Patterns — Navigation Primitives](references/uikit-patterns.md#modal-presentation) |
| Swap the root view controller after login/logout | [UIKit Patterns — Navigation Primitives](references/uikit-patterns.md#replacing-the-root--auth-flows) |
| Show an error alert to the user | [UIKit Patterns — Error Presentation](references/uikit-patterns.md#error-presentation) |
| Show a confirmation dialog before a destructive action | [UIKit Patterns — Error Presentation](references/uikit-patterns.md#error-presentation) |
| Embed a SwiftUI view inside UIKit | [UIKit Patterns — SwiftUI Interop](references/uikit-patterns.md#swiftui--uikit-interop) |
| Wire dependencies at startup | [UIKit Patterns — Dependency Injection](references/uikit-patterns.md#dependency-injection) → [Toolchain — Dependency Container](references/toolchain.md#dependency-container) |
| Write a unit test with Swift Testing | [Testing — Swift Testing](references/testing.md#swift-testing-framework-swift-6) |
| Assert a function throws a specific error | [Testing — Swift Testing](references/testing.md#swift-testing-framework-swift-6) |
| Unwrap an optional or abort the test | [Testing — #require](references/testing.md#require--abort-on-failure) |
| Test many inputs with one test function | [Testing — Parameterised Tests](references/testing.md#parameterised-tests) |
| Create a protocol mock | [Testing — Test Doubles](references/testing.md#test-doubles) |
| Build test data with defaults | [Testing — Fixtures](references/testing.md#test-fixtures-via-static-factory) |
| Test async code | [Testing — Async Testing](references/testing.md#async-testing) |
| Add an SPM dependency | [Toolchain — SPM](references/toolchain.md#swift-package-manager) |
| Lint and format Swift files | [Toolchain — Code Quality](references/toolchain.md#code-quality-tools) |
| Set up GitHub Actions CI | [Toolchain — CI/CD](references/toolchain.md#cicd) |
| Use the Repository pattern | [Toolchain — Repository Pattern](references/toolchain.md#repository-pattern) |
| Wire dependencies with a container | [Toolchain — Dependency Container](references/toolchain.md#dependency-container) |
| Enable Swift 6 strict concurrency per-target | [Toolchain — SPM](references/toolchain.md#packageswift-template) |

## Reference Files

| Reference | Load When |
|---|---|
| [Language Fundamentals](references/language-fundamentals.md) | Types, optionals, enums, protocols, generics, errors, Codable, availability, macros, `@Observable` vs `@Published` |
| [Concurrency](references/concurrency.md) | async/await, actors, task groups, AsyncStream, continuations, Swift 6 migration |
| [Memory Management](references/memory-management.md) | ARC, retain cycles, `weak`/`unowned`, CoW, Task lifetime leaks |
| [Networking](references/networking.md) | HTTP requests, `URLSession`, `HTTPClient` protocol, response decoding, auth, network mocking |
| [Persistence](references/persistence.md) | SwiftData models, queries, migrations, background context, `UserDefaults` |
| [UIKit Patterns](references/uikit-patterns.md) | View controllers, collection views, Combine binding, Coordinator, SwiftUI interop |
| [Testing](references/testing.md) | Swift Testing, XCTest, mocks, fixtures, async testing, test isolation |
| [Toolchain](references/toolchain.md) | SPM, `xcodebuild`, SwiftLint, SwiftFormat, CI/CD, Repository pattern, Dependency Container |

> SwiftUI views, `@State`, `@Binding`, `NavigationStack`, and SwiftUI-specific patterns are covered by `swiftui-expert-skill`.
