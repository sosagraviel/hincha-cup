---
name: mastering-swift-skill
description: Comprehensive Swift expertise covering language fundamentals, concurrency, UIKit, memory management, testing, SPM, and Apple platform patterns (Swift 6+, iOS 17+, macOS 14+). Does NOT cover SwiftUI — use swiftui-expert-skill for any SwiftUI work. Use this skill for Swift language questions, async/await, actors, ARC, UIKit, Swift Testing, and SPM.
allowed-tools: Read, Write, Bash, Edit, Grep, Glob, WebFetch
---

# Mastering Swift

Expert guidance for Swift language and Apple platform development, excluding SwiftUI (handled by `swiftui-expert-skill`).

> **SwiftUI handoff:** Hand off to `swiftui-expert-skill` only for SwiftUI views, `@State`, `@Binding`, or `NavigationStack`. `@Observable` is *not* SwiftUI-specific — it works in UIKit and is covered here.

## Workflow

1. **Not sure where to start?** Check [TOC.md](TOC.md) — the Quick Topic Lookup table maps any task to the right reference file.
2. **Identify the task category** from the routing table below and load the relevant reference file(s). Many tasks span multiple domains — load all that apply (e.g. a UIKit ViewModel backed by an actor needs both `uikit-patterns.md` and `concurrency.md`).
3. **Read the reference** before writing code — patterns and naming conventions must match.
4. **Apply the Quick Reference tables** in this file for one-liner decisions (type choice, state annotation, etc.).
5. **Use `Glob`** (`**/*.swift`) to find existing Swift files before creating new ones — match the project's conventions.
6. **Use `WebFetch`** on `developer.apple.com` when a specific API's behaviour is unclear or undocumented here.

| Task | Load |
|------|------|
| Language syntax, types, optionals, generics, access control, `@Observable` vs `@Published`, macros | `references/language-fundamentals.md` |
| async/await, actors, actor reentrancy, task groups, AsyncStream, continuations, Swift 6 migration | `references/concurrency.md` |
| ARC, retain cycles, `weak`/`unowned`, CoW, Task lifetime leaks | `references/memory-management.md` |
| HTTP requests, `URLSession`, `HTTPClient` protocol, response decoding, auth, network mocking | `references/networking.md` |
| SwiftData models, queries, migrations, background context, `UserDefaults` | `references/persistence.md` |
| UIKit view controllers, diffable data source, Combine, Coordinator, navigation (push/pop/modal/root swap), error alerts, SwiftUI interop | `references/uikit-patterns.md` |
| Swift Testing (`#expect`, `#require`), XCTest, test doubles, fixtures, async testing | `references/testing.md` |
| SPM (Package.swift or Xcode UI), adding packages in Xcode, Xcode CLI, SwiftLint/SwiftFormat, CI/CD | `references/toolchain.md` |
| SwiftUI views, state, navigation, animations | → **use `swiftui-expert-skill`** |

## Quick Start

### New Swift Package (Library or CLI)

```bash
# Library
swift package init --name MyLibrary --type library

# Executable / CLI tool
swift package init --name MyTool --type executable

# Copy the bundled production-ready Package.swift template
# (path is relative to the project root after skill sync)
cp .claude/skills/mastering-swift-skill/assets/Package.swift-template Package.swift
```

### New iOS App (Xcode)

```bash
# Validate your local Swift / Xcode setup
bash .claude/skills/mastering-swift-skill/scripts/validate-setup.sh

# Then create in Xcode: File → New → Project → iOS → App
# Recommended settings: Swift Testing, Swift 6 strict concurrency
# UI framework choice: UIKit (this skill) or SwiftUI (see swiftui-expert-skill)
```

## Language Quick Reference

### Type Decision Matrix

| Need | Use |
|------|-----|
| Data container, no shared identity | `struct` |
| Shared mutable state / inheritance | `class` |
| Concurrent access to shared mutable state | `actor` |
| Closed set of cases | `enum` with associated values |
| Capability contract | `protocol` |
| Guaranteed non-nil value | non-optional `let` |
| Value that may be absent | `Optional<T>` |

### Optional Unwrapping Patterns

| Pattern | When to Use |
|---------|-------------|
| `guard let x else { return }` | Early exit; happy path stays unindented |
| `if let x { ... }` | Narrowly scoped optional branch |
| `x ?? default` | Provide a fallback value |
| `x?.property` | Optional chaining; nil propagates silently |
| `x!` | Tests or provably guaranteed non-nil only |

### Concurrency Quick Reference

| Pattern | Use Case |
|---------|----------|
| `async let a = ...; async let b = ...` | Fixed number of parallel tasks |
| `withThrowingTaskGroup` | Dynamic parallelism over a collection |
| `actor` | Isolated mutable state, no data races |
| `@MainActor` | Main-thread isolation; required for any type that drives UI updates |
| `Sendable` | Types that safely cross actor boundaries |
| `Task.checkCancellation()` | Cooperative cancellation in long work |

## Modern Toolchain (2026)

| Tool | Recommended Version | Purpose |
|------|---------------------|---------|
| Swift | 6.1+ | Language runtime |
| Xcode | 16.3+ | IDE + build system |
| iOS Deployment Target | 17+ | Minimum runtime |
| macOS Deployment Target | 14+ | Minimum runtime |
| SwiftLint | 0.57+ | Style and best-practice linting |
| SwiftFormat | 0.54+ | Automated code formatting |
| Periphery | 2.21+ | Dead code detection |
| swift-testing | Built-in (Swift 6) | Unit testing framework |

## Architecture Patterns Quick Reference

| Pattern | When to Use |
|---------|-------------|
| MVVM + `@Observable` | iOS 17+; no Combine needed for observation |
| MVVM + `@Published` / Combine | iOS 16 and below, or when Combine operators are needed |
| Coordinator | UIKit navigation flow management |
| Repository protocol | Abstract and swap data sources in service/data layers |
| Dependency container struct | Lightweight DI without third-party frameworks |
| Clean Architecture (Use Cases) | Complex domain logic that must be testable in isolation |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Force unwrap `!` in production | Use `guard let` or `??` |
| Stacking separate `guard` statements with the same `else` | Combine: `guard let a, b else { ... }` |
| `@unchecked Sendable` without a lock | Add `NSLock` / actor, or redesign as value type |
| Unstructured `Task { }` stored nowhere | Store the handle or use structured concurrency — orphaned tasks leak |
| `weak var` on everything | Use `weak` only in closures that outlive their capture target |
| `count == 0` check | Use `.isEmpty` |
| Defaulting to `class` | Default to `struct`; use `class` only when identity is required |
| Typed `throws` without exhaustive `catch` | Catch each error case or rethrow — unhandled typed errors are a compile error in Swift 6 |
| `@MainActor` on individual methods instead of the whole type | Annotate the type; per-method annotation is error-prone and verbose |

## Reference Files

| Reference | Contents |
|-----------|----------|
| [Language Fundamentals](references/language-fundamentals.md) | Types, optionals, enums, protocols, generics, errors, Codable, availability, property wrappers, access control, named constants, macros, `@Observable` vs `@Published` |
| [Concurrency](references/concurrency.md) | async/await, structured concurrency, task groups, AsyncStream, continuations, actors, actor reentrancy, Sendable, Swift 6 migration |
| [Memory Management](references/memory-management.md) | ARC, weak/unowned, capture lists, copy-on-write, Task lifetime leaks, Instruments |
| [Networking](references/networking.md) | `HTTPClient` protocol, `URLSessionHTTPClient` thin wrapper, request building, response validation and decoding, auth decorator, `MockHTTPClient` for tests |
| [Persistence](references/persistence.md) | SwiftData `@Model`, `ModelContainer`, `ModelContext`, `#Predicate`, migrations, background context, `UserDefaults` |
| [UIKit Patterns](references/uikit-patterns.md) | View controller lifecycle, `CellRegistration`, diffable data source, Combine binding, Coordinator, navigation primitives (push/pop/modal/root swap), error presentation (`UIAlertController`), dependency injection, SwiftUI interop |
| [Testing](references/testing.md) | Swift Testing (`#expect`, `#require`, parameterised, tags), XCTest, mocks, spies, fixtures, async testing |
| [Toolchain](references/toolchain.md) | SPM Package.swift, SPM via Xcode UI, `xcodebuild`, SwiftLint, SwiftFormat, Periphery, GitHub Actions, Xcode Cloud |

> SwiftUI patterns are covered by `swiftui-expert-skill` — do not load `swiftui-patterns.md` from this skill.

## Navigation

See [TOC.md](TOC.md) for a full Quick Topic Lookup table mapping any task to the right reference file and section.
