# Memory Management

> **Load when:** dealing with retain cycles, choosing `weak` vs `unowned`, implementing Copy-on-Write, managing `Task` lifetimes, or debugging memory leaks with Instruments.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Break a retain cycle in a stored closure | `[weak self]` capture + `guard let self else { return }` |
| Break a cycle in a delegate property | `weak var delegate: MyDelegate?` |
| Skip the capture list on a short closure | Closures that execute and are discarded (e.g. `UIView.animate`) need no capture list |
| Avoid unnecessary copy of a large value type | CoW: `if !isKnownUniquelyReferenced(&storage) { storage = storage.copy() }` |
| Cancel an async task when the owner deallocates | Store handle; call `loadTask?.cancel()` in `deinit` |
| Release Obj-C objects in a tight loop | Wrap loop body in `autoreleasepool { }` |

## ARC Overview

Swift uses Automatic Reference Counting (ARC) for memory management. ARC tracks the number of strong references to each class instance and deallocates it when the count reaches zero. Structs and enums are value types and are not reference-counted.

## Reference Cycles

A retain cycle occurs when two class instances hold strong references to each other, preventing deallocation.

### weak References

Use `weak` when the reference may become `nil` during the object's lifetime (owner/child relationships).

```swift
class Parent {
    var child: Child?
}

class Child {
    weak var parent: Parent?   // Optional; becomes nil when Parent deallocates
}
```

### unowned References

Use `unowned` when the referenced object is guaranteed to outlive the current one. Accessing a deallocated `unowned` reference crashes.

```swift
class Customer {
    var card: CreditCard?
}

class CreditCard {
    unowned let customer: Customer   // Non-optional; Customer must outlive CreditCard
    init(customer: Customer) { self.customer = customer }
}
```

### Capture Lists in Closures

Closures capture variables by strong reference by default. Use `[weak self]` to break cycles in closures that outlive their capture target.

```swift
// [weak self] + guard for the strong-to-weak dance
viewModel.onUpdate = { [weak self] newValue in
    guard let self else { return }
    updateLabel(with: newValue)
}

// [unowned self] — only when self is guaranteed to outlive the closure
button.action = { [unowned self] in
    self.handleTap()
}
```

**Rule of thumb:**
- Closures stored as properties → `[weak self]`
- Closures that execute and are discarded (e.g., `UIView.animate`) → no capture list needed
- `unowned` only when lifetime is provably guaranteed (rare)

## Value vs Reference Semantics in Practice

### When to Use struct

Structs have value semantics: assignment copies the value. No shared mutable state, no retain cycles.

```swift
struct Point {
    var x: Double
    var y: Double
}

var a = Point(x: 1, y: 2)
var b = a      // Independent copy
b.x = 99      // Does not affect a
```

### Copy-on-Write (CoW)

For expensive value types backed by heap storage, implement Copy-on-Write to avoid unnecessary copies.

```swift
struct LargeDataSet {
    private var storage: Storage   // class providing CoW backing

    mutating func append(_ element: Element) {
        // Only copy when the storage is shared
        if !isKnownUniquelyReferenced(&storage) {
            storage = storage.copy()
        }
        storage.append(element)
    }
}
```

Swift's standard collection types (`Array`, `Dictionary`, `String`) all implement CoW automatically.

## Task Lifetime and Leaks

Unstructured `Task { }` calls that are not stored or cancelled live until they complete — or forever if they loop. This is the async equivalent of a retain cycle.

```swift
// BAD — task is fire-and-forget; cannot be cancelled; leaks if self deallocates
class DataLoader {
    func load() {
        Task { await self.fetchData() }   // self retained until task finishes
    }
}

// GOOD — store the handle so you can cancel on deinit
class DataLoader {
    private var loadTask: Task<Void, Never>?

    func load() {
        loadTask = Task { await self.fetchData() }
    }

    deinit {
        loadTask?.cancel()
    }
}

// ALSO GOOD — use structured concurrency so the task is scoped to a lifetime
// (e.g. SwiftUI .task modifier, or a TaskGroup inside an actor)
```

### `[weak self]` in async closures

Unlike Combine or completion handlers, `Task { }` closures do **not** need `[weak self]` to break a cycle — the task holds a strong reference to `self` only for its duration. However, if `self` should be allowed to deallocate before the task finishes, check for cancellation or use `[weak self]` explicitly:

```swift
Task { [weak self] in
    guard let self else { return }
    await self.fetchData()
}
```

## autoreleasepool

Tight loops that create many Objective-C-bridged objects (images, Core Data managed objects, `NSString`) can accumulate autoreleased memory until the run loop drains. Wrapping the loop body in `autoreleasepool` drains after each iteration, keeping peak memory flat.

```swift
// Without autoreleasepool — peak memory spikes as all images stay alive until loop ends
for url in imageURLs {
    let image = UIImage(contentsOfFile: url.path)
    process(image)
}

// With autoreleasepool — each image is released at the end of its iteration
for url in imageURLs {
    autoreleasepool {
        let image = UIImage(contentsOfFile: url.path)
        process(image)
    }
}
```

Pure Swift value types don't require this — it's only relevant when bridging to Objective-C APIs.

## Debugging Memory Issues

```bash
# Run with Address Sanitizer to detect use-after-free and buffer overflows
# In Xcode: Product → Scheme → Edit Scheme → Diagnostics → Address Sanitizer

# Instruments — Leaks template detects retain cycles at runtime
# Xcode: Product → Profile → Leaks

# Memory Graph Debugger (Xcode)
# Debug → View Memory Graph Hierarchy
# Shows live object graph; purple icons indicate retain cycles
```

## Pitfalls

| Don't | Do |
|---|---|
| `[weak self]` on every closure | Use `weak` only when the closure outlives its capture target — `UIView.animate` blocks don't need it |
| `unowned` when lifetime isn't provably guaranteed | Prefer `weak` when unsure — `unowned` crashes on access after dealloc |
| `Task { await self.work() }` stored nowhere | Store the handle and cancel in `deinit` — orphaned tasks retain `self` for their duration |
| `autoreleasepool` inside an `await` | `autoreleasepool` is synchronous — it is not safe across a suspension point |

## Best Practices

- Default to `struct` — no retain cycles possible, no `weak`/`unowned` needed
- Use `weak` in stored closures; use `unowned` only when lifetime is provably guaranteed
- Never access a potentially-deallocated `unowned` reference — prefer `weak` when unsure
- Combine consecutive `guard let self` lines sharing the same `else` into one
- Profile with Instruments Leaks before shipping to catch long-lived cycles
