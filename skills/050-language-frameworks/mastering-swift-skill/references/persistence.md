# Persistence

> **Load when:** storing data locally with SwiftData, querying or filtering models, setting up a ModelContainer, testing with an in-memory store, or storing small settings with `UserDefaults`.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Define a persistent model | `@Model final class Foo { var x: String; init(...) }` |
| Set up a container (UIKit) | `try ModelContainer(for: Foo.self, configurations: [config])` |
| Insert a model | `context.insert(instance)` |
| Fetch all instances | `try context.fetch(FetchDescriptor<Foo>())` |
| Fetch with a filter | `FetchDescriptor<Foo>(predicate: #Predicate { $0.field == value })` |
| Sort fetch results | `FetchDescriptor(sortBy: [SortDescriptor(\Foo.date, order: .reverse)])` |
| Delete a model | `context.delete(instance)` |
| Use in-memory store for tests | `ModelConfiguration(isStoredInMemoryOnly: true)` |
| Store a small user setting | `UserDefaults.standard.set(value, forKey: key)` |
| Migrate schema version | `VersionedSchema` + `SchemaMigrationPlan` |

## SwiftData

SwiftData (iOS 17+, macOS 14+) is Apple's native persistence layer built on Core Data. Swift macros generate the underlying store schema from types annotated with `@Model`.

### Defining Models

```swift
import SwiftData

@Model
final class Article {
    var title: String
    var body: String
    var publishedAt: Date
    var isFavourite: Bool

    @Relationship(deleteRule: .cascade) var tags: [Tag] = []

    init(title: String, body: String, publishedAt: Date = .now) {
        self.title = title
        self.body = body
        self.publishedAt = publishedAt
        self.isFavourite = false
    }
}

@Model
final class Tag {
    @Attribute(.unique) var name: String
    var articles: [Article]?

    init(name: String) { self.name = name }
}
```

**Rules for `@Model` types:**
- Must be `final class` — value types (`struct`) are not supported
- All stored properties need an initial value or must be set in `init`
- Use `@Attribute(.unique)` for properties that must be unique across all stored instances
- Use `@Relationship(deleteRule:)` to control cascade behaviour: `.cascade` deletes related objects, `.nullify` clears the reference, `.deny` blocks deletion if related objects exist

### Setting Up ModelContainer

Create one `ModelContainer` per app at startup and inject the context downward. Multiple containers for the same schema on the same file create conflicts.

```swift
// UIKit / non-SwiftUI — create at app launch (e.g. AppDelegate or SceneDelegate)
do {
    let schema = Schema([Article.self, Tag.self])
    let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
    let container = try ModelContainer(for: schema, configurations: [config])
    let context = container.mainContext
    // Inject context into coordinators/repositories
} catch {
    fatalError("Failed to create ModelContainer: \(error)")
}
```

```swift
// SwiftUI — attach to the root scene (see swiftui-expert-skill for @Environment usage)
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(for: [Article.self, Tag.self])
    }
}
```

### ModelContext — CRUD Operations

`ModelContext` tracks all in-flight changes and syncs to the store when saved.

```swift
// Insert
let article = Article(title: "Swift 6", body: "...")
context.insert(article)

// Fetch all
let all = try context.fetch(FetchDescriptor<Article>())

// Fetch with predicate and sort
var descriptor = FetchDescriptor<Article>(
    predicate: #Predicate { $0.isFavourite == true },
    sortBy: [SortDescriptor(\Article.publishedAt, order: .reverse)]
)
descriptor.fetchLimit = 20
let favourites = try context.fetch(descriptor)

// Update — mutate the property directly; SwiftData tracks changes automatically
article.title = "Updated Title"

// Delete
context.delete(article)

// Explicit save — SwiftData auto-saves at the end of the run loop,
// but call save() when you need deterministic commit timing
try context.save()
```

### #Predicate

`#Predicate` is a macro that builds a type-safe predicate from a Swift closure at compile time. The closure body is restricted to expressions the store backend can evaluate.

```swift
// Simple comparison
let pred = #Predicate<Article> { $0.isFavourite == true }

// Compound predicate
let compound = #Predicate<Article> {
    $0.isFavourite && $0.publishedAt > cutoffDate
}

// String containment
let search = #Predicate<Article> { $0.title.localizedStandardContains(searchText) }

// Relationship filter — articles that have at least one "swift" tag
let byTag = #Predicate<Article> {
    $0.tags.contains(where: { $0.name == "swift" })
}
```

**`#Predicate` constraints:**
- Only `@Model` properties and built-in Swift operators are supported — no custom functions
- Supported string methods: `.contains(_:)`, `.localizedStandardContains(_:)`, `.hasPrefix(_:)`, `.hasSuffix(_:)`
- When an expression is unsupported at compile time, do a broader fetch and post-filter in Swift

### Background Context

Use a background context for write-heavy operations to keep `mainContext` (and the main thread) free.

```swift
func importArticles(_ incoming: [ArticleDTO]) async throws {
    let context = container.newBackgroundContext()
    try await context.perform {
        for dto in incoming {
            let article = Article(title: dto.title, body: dto.body)
            context.insert(article)
        }
        try context.save()
    }
}
```

**Rule:** Never share a `ModelContext` across threads. `mainContext` is main-thread only; call `container.newBackgroundContext()` for any background work.

### Migrations — Lightweight and Versioned

When you add, remove, or rename a property, SwiftData needs a migration plan. Additive changes (new optional or defaulted property) qualify for a lightweight migration — no custom code.

```swift
enum SchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { [Article.self] }

    @Model final class Article {
        var title: String
        var body: String
        init(title: String, body: String) { self.title = title; self.body = body }
    }
}

enum SchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] { [Article.self] }

    @Model final class Article {
        var title: String
        var body: String
        var isFavourite: Bool   // added in V2; requires a default value for existing rows
        init(title: String, body: String) {
            self.title = title; self.body = body; self.isFavourite = false
        }
    }
}

enum AppMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [SchemaV1.self, SchemaV2.self] }
    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: SchemaV1.self, toVersion: SchemaV2.self)]
    }
}

// Pass the migration plan when creating the container
let container = try ModelContainer(
    for: schema,
    migrationPlan: AppMigrationPlan.self,
    configurations: [config]
)
```

## UserDefaults — Small Settings

Use `UserDefaults` for small, non-sensitive scalar values: feature flags, last-opened date, user preferences. Do not store credentials, tokens, or large blobs here — use Keychain or SwiftData respectively.

```swift
extension UserDefaults {
    enum Key: String {
        case hasSeenOnboarding
        case selectedTheme
        case lastSyncDate
    }

    var hasSeenOnboarding: Bool {
        get { bool(forKey: Key.hasSeenOnboarding.rawValue) }
        set { set(newValue, forKey: Key.hasSeenOnboarding.rawValue) }
    }

    var lastSyncDate: Date? {
        get { object(forKey: Key.lastSyncDate.rawValue) as? Date }
        set { set(newValue, forKey: Key.lastSyncDate.rawValue) }
    }
}

// Usage
UserDefaults.standard.hasSeenOnboarding = true
if let last = UserDefaults.standard.lastSyncDate { ... }
```

## Testing — In-Memory Store

Use `isStoredInMemoryOnly: true` to create an isolated container per test. No files on disk, no cleanup required between tests.

```swift
@MainActor
func makeTestContext(for types: any PersistentModel.Type...) throws -> ModelContext {
    let schema = Schema(types)
    let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
    let container = try ModelContainer(for: schema, configurations: [config])
    return container.mainContext
}

@Suite("ArticleRepository") @MainActor
struct ArticleRepositoryTests {
    let context: ModelContext
    let sut: ArticleRepository

    init() throws {
        context = try makeTestContext(for: Article.self, Tag.self)
        sut = ArticleRepository(context: context)
    }

    @Test("saves and retrieves an article")
    func savesAndRetrieves() throws {
        let article = Article(title: "Test", body: "Body")
        context.insert(article)

        let fetched = try context.fetch(FetchDescriptor<Article>())
        #expect(fetched.count == 1)
        #expect(fetched[0].title == "Test")
    }

    @Test("fetches only favourites")
    func fetchesFavourites() throws {
        context.insert(Article(title: "A", body: ""))
        let favourite = Article(title: "B", body: "")
        favourite.isFavourite = true
        context.insert(favourite)

        let results = try sut.fetchFavourites()
        #expect(results.count == 1)
        #expect(results[0].title == "B")
    }
}
```

## Pitfalls

| Don't | Do |
|---|---|
| Use `struct` for `@Model` types | Use `final class` — SwiftData requires reference semantics |
| Share `mainContext` across threads | Use `container.newBackgroundContext()` for background work; each context is thread-bound |
| Create multiple `ModelContainer` instances for the same store | Create one container at app launch and inject the context |
| Force-save after every single mutation | Let SwiftData auto-save; call `save()` only at known transaction boundaries |
| Store secrets in `UserDefaults` | Use Keychain for tokens and credentials — `UserDefaults` is not encrypted |
| Use raw strings as `UserDefaults` keys | Define a typed `Key` enum to centralise key names and prevent typos |
| Write `#Predicate` with unsupported expressions | Use supported predicates; post-filter in Swift for complex or dynamic logic |
| Leave schema versioning until migration is urgent | Add `VersionedSchema` from the start — retrofitting schema history is painful |

## Best Practices

- Define one `ModelContainer` at app launch and pass its context down via injection — never create ad-hoc containers in repositories or view models
- Mark `@Model` classes `final` — SwiftData's macro expansion assumes no subclassing
- Keep `@Model` types as plain data containers — no async methods, no networking, no business logic
- Use `#Predicate` with `fetchLimit` to page large result sets rather than loading everything into memory
- Use `ModelConfiguration(isStoredInMemoryOnly: true)` in every test — no teardown needed, no disk state leaks between tests
- For background import or batch writes, use `container.newBackgroundContext()` and call `save()` explicitly when done
- Prefer `@Attribute(.unique)` over manual uniqueness checks — SwiftData enforces it at insert time with a clear error
- Use `UserDefaults` only for small, non-sensitive scalars; use SwiftData for structured data and Keychain for credentials
