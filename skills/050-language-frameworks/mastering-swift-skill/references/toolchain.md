# Toolchain

> **Load when:** managing SPM dependencies (Package.swift or Xcode UI), running builds or tests via CLI, configuring SwiftLint/SwiftFormat, setting up GitHub Actions CI, or choosing an architecture pattern.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Add a versioned dependency (Package.swift) | `.package(url: "...", from: "1.0.0")` + add product to target |
| Add a dependency in an Xcode project | File → Add Package Dependencies… |
| Build | `swift build` / `xcodebuild -scheme X build` |
| Run tests (parallel) | `swift test --parallel` |
| Lint | `swiftlint lint --strict` |
| Format code | `swiftformat . --config .swiftformat` |
| Archive for App Store | `xcodebuild archive` + `xcodebuild -exportArchive` |
| Find dead code | `periphery scan --strict` |
| Enable Swift 6 strict concurrency | `.swiftLanguageVersion(.v6)` in `swiftSettings` |

## Swift Package Manager

### Package.swift Template

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MyLibrary",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "MyLibrary", targets: ["MyLibrary"]),
        .executable(name: "mytool", targets: ["MyTool"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-algorithms", from: "1.2.0"),
    ],
    targets: [
        .target(
            name: "MyLibrary",
            dependencies: [
                .product(name: "Algorithms", package: "swift-algorithms"),
            ],
            swiftSettings: [
                .swiftLanguageVersion(.v6)   // enables strict concurrency checking
            ]
        ),
        .executableTarget(
            name: "MyTool",
            dependencies: ["MyLibrary"],
            swiftSettings: [
                .swiftLanguageVersion(.v6)
            ]
        ),
        .testTarget(
            name: "MyLibraryTests",
            dependencies: ["MyLibrary"],
            swiftSettings: [
                .swiftLanguageVersion(.v6)
            ]
        ),
    ]
)
```

### SPM via Xcode (no Package.swift)

When an app target lives in an `.xcodeproj` — the most common setup for iOS/macOS apps created through Xcode — dependencies are added through the Xcode UI rather than a Package.swift file. The project stores them in `project.pbxproj`; a `Package.resolved` lockfile is kept inside the `.xcodeproj` bundle at `<Name>.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.

#### Adding a dependency

1. **File → Add Package Dependencies…** (or **Project navigator → + → Add Package Dependency**)
2. Paste the repository URL into the search field
3. Choose a version rule (Exact, Up to Next Major, Branch, Commit)
4. Select which product(s) to link to which target

#### Managing existing packages

| Task | Where |
|------|-------|
| View / update all packages | **Project navigator → Package Dependencies** tab |
| Update a single package | Right-click the package → **Update Package** |
| Update all packages | **File → Packages → Update to Latest Package Versions** |
| Reset the package cache | **File → Packages → Reset Package Caches** |
| Remove a package | Select it in **Package Dependencies** → press Delete |

#### Committing resolved versions

Always commit `Package.resolved` so every team member and CI build uses the same dependency versions:

```
# .gitignore — do NOT ignore this file for Xcode projects
# <Name>.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
```

#### Enabling Swift 6 concurrency for app targets

Xcode-managed targets don't have `swiftSettings` in a Package.swift. Set the language version in **Build Settings** instead:

1. Select the target → **Build Settings** → search `Swift Language Version`
2. Set to **Swift 6**

Or via `xcodebuild` in CI:

```bash
xcodebuild build \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  SWIFT_VERSION=6.0
```

### Common SPM Commands

```bash
# Resolve and fetch dependencies
swift package resolve

# Build (debug and release)
swift build
swift build -c release

# Run tests (all / filtered)
swift test
swift test --filter MyLibraryTests.OrderServiceTests

# Run an executable target
swift run MyTool --arg value

# Update all dependencies to latest compatible versions
swift package update

# Show resolved dependency tree
swift package show-dependencies

# Generate Xcode project (rarely needed with modern Xcode)
swift package generate-xcodeproj

# Clean build artifacts
swift package clean
```

### Adding Dependencies

```swift
// Exact version
.package(url: "https://github.com/apple/swift-log", exact: "1.5.4"),

// Version range
.package(url: "https://github.com/vapor/vapor", from: "4.89.0"),

// Branch (avoid in production)
.package(url: "https://github.com/apple/swift-nio", branch: "main"),
```

### SPM Plugins

Build tool plugins run automatically at build time (e.g. code generation, linting). Command plugins run on demand via `swift package <plugin-name>`.

```swift
// Package.swift — attach a build tool plugin to a target
.target(
    name: "MyApp",
    plugins: [
        .plugin(name: "SwiftLintBuildToolPlugin", package: "SwiftLint"),
        .plugin(name: "SwiftGenPlugin", package: "SwiftGen"),
    ]
)
```

```bash
# List available command plugins
swift package plugin --list

# Run a command plugin (e.g. SwiftFormat)
swift package swiftformat
```

## Xcode CLI

```bash
# Build a scheme
xcodebuild -scheme MyApp -configuration Debug build

# Run tests
xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 16'

# Archive for distribution
xcodebuild archive -scheme MyApp -archivePath build/MyApp.xcarchive

# Export IPA
xcodebuild -exportArchive \
    -archivePath build/MyApp.xcarchive \
    -exportOptionsPlist ExportOptions.plist \
    -exportPath build/

# List available simulators
xcrun simctl list devices available

# Boot / shutdown a simulator
xcrun simctl boot "iPhone 16 Pro"
xcrun simctl shutdown all
```

## Code Quality Tools

### SwiftLint

```bash
# Lint all sources
swiftlint lint --strict

# Auto-fix correctable violations
swiftlint --fix

# Lint specific paths
swiftlint lint Sources/ Tests/
```

#### .swiftlint.yml

```yaml
included:
  - Sources
  - Tests

disabled_rules:
  - trailing_whitespace

opt_in_rules:
  - force_unwrapping
  - implicitly_unwrapped_optional
  - closure_spacing
  - empty_count
  - sorted_imports

line_length: 120
function_body_length: 50
type_body_length: 300
```

### SwiftFormat

```bash
# Format all Swift files
swiftformat . --config .swiftformat

# Dry run (show what would change)
swiftformat . --dryrun

# Format a single file
swiftformat Sources/MyFile.swift
```

#### .swiftformat

```
--swiftversion 6.0
--indent 4
--maxwidth 120
--importgrouping testable-bottom
--wraparguments before-first
--wrapcollections before-first
--disable redundantSelf
```

### Periphery (Dead Code Detection)

```bash
# Scan the entire project
periphery scan

# Scan in CI mode (exit 1 if dead code found)
periphery scan --strict
```

### Type Checking

```bash
# Fast type-check pass without producing output
# Use find rather than ** glob — globstar is not enabled by default in all shells
find Sources -name '*.swift' -print0 | xargs -0 swiftc -typecheck
```

## Architecture Patterns

### MVVM with Swift Concurrency

Use `@MainActor` on the ViewModel class and `ViewState<T>` for loading state. For UIKit, bind via Combine `@Published` properties. For iOS 17+ with `@Observable`, the ViewModel properties are automatically tracked — no `@Published` needed. See [UIKit Patterns](uikit-patterns.md) for the Combine binding pattern and [Language Fundamentals](language-fundamentals.md) for `@Observable` macro usage.

### Repository Pattern

```swift
// Abstract the data source behind a protocol
protocol UserRepository {
    func fetchUser(id: UserID) async throws -> User
    func saveUser(_ user: User) async throws
}

// Live implementation
final class RemoteUserRepository: UserRepository {
    private let client: HTTPClient
    private let decoder: JSONDecoder

    init(client: HTTPClient = URLSessionHTTPClient()) {
        self.client = client
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func fetchUser(id: UserID) async throws -> User {
        try await client.decode(User.self, from: APIEndpoint.user(id: id), using: decoder)
    }

    func saveUser(_ user: User) async throws {
        let request = try APIEndpoint.saveUser(user)
        _ = try await client.data(for: request)
    }
}

// Test double
final class MockUserRepository: UserRepository {
    var userResult: Result<User, Error> = .success(.fixture())

    func fetchUser(id: UserID) async throws -> User {
        try userResult.get()
    }

    func saveUser(_ user: User) async throws { }
}
```

### Dependency Container

```swift
struct AppDependencies {
    let userRepository: UserRepository
    let analyticsService: AnalyticsService

    static func live() -> AppDependencies {
        AppDependencies(
            userRepository: RemoteUserRepository(),
            analyticsService: FirebaseAnalyticsService()
        )
    }

    static func mock() -> AppDependencies {
        AppDependencies(
            userRepository: MockUserRepository(),
            analyticsService: MockAnalyticsService()
        )
    }
}
```

## CI/CD

### GitHub Actions

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode_16.3.app

      - name: Lint
        run: swiftlint lint --strict

      - name: Build
        run: swift build -c release

      - name: Test
        run: swift test --parallel

      - name: Dead code check
        run: periphery scan --strict
```

**Tips:**
- Pin the `runs-on` image to a specific macOS version (e.g. `macos-15`) to avoid unintended Xcode upgrades breaking your build.
- Run `swift test --parallel` — Swift Testing and XCTest both support parallel execution.

#### Caching SPM dependencies

Add this step after `actions/checkout` to cache the SPM build folder. Keying on `Package.resolved` means the cache invalidates exactly when dependencies change.

```yaml
      - name: Cache SPM
        uses: actions/cache@v4
        with:
          path: .build
          key: ${{ runner.os }}-spm-${{ hashFiles('**/Package.resolved') }}
          restore-keys: |
            ${{ runner.os }}-spm-
```

### Xcode Cloud

Xcode Cloud reads `ci_scripts/` at the repo root. Place shell scripts named `ci_post_clone.sh`, `ci_pre_xcodebuild.sh`, and `ci_post_xcodebuild.sh` to run SwiftLint, environment setup, or post-build artefact handling without leaving Xcode.

```bash
# ci_scripts/ci_pre_xcodebuild.sh
#!/bin/sh
set -e
brew install swiftlint
swiftlint lint --strict
```

## Toolchain Comparison

| Feature | npm / pnpm | Swift SPM |
|---------|------------|-----------|
| Lock file | `package-lock.json` / `pnpm-lock.yaml` | `Package.resolved` |
| Install | `pnpm install` | `swift package resolve` |
| Add dependency | Edit `package.json` | Edit `Package.swift` |
| Run scripts | `pnpm run build` | `swift build` |
| Test | `pnpm test` | `swift test` |
| Publish | `npm publish` | GitHub release + tag |

## Pitfalls

| Don't | Do |
|---|---|
| Add `Package.resolved` to `.gitignore` | Commit it — it pins exact versions; every team member and CI run uses the same build |
| Use a branch dependency in production | Use a tagged version (`from: "1.0.0"`) — branches move without warning |
| `swift test` without `--parallel` in CI | Add `--parallel` — Swift Testing and XCTest both support it; serial runs waste CI minutes |
| `swiftlint lint` (warnings only) in CI | Use `--strict` — promotes violations to errors, making the build fail on lint issues |
| Archive with Debug configuration | Use Release (`-configuration Release`) for App Store builds |
| `swift build` without `-c release` for a CI artefact | Debug builds skip optimisations and produce larger binaries |

## Best Practices

- Always commit `Package.resolved` — it pins exact dependency versions for reproducible builds
- Set `.swiftLanguageVersion(.v6)` in `swiftSettings` for every target to enforce strict concurrency at compile time
- Pin `runs-on` to a specific macOS version in CI to prevent silent Xcode upgrade breakage
- Cache `.build` keyed on `Package.resolved` in CI — the single highest-impact build time optimisation
- Run `swift test --parallel` — both Swift Testing and XCTest support it; serial runs are a waste
- Use `swiftlint lint --strict` in CI so lint violations fail the build, not just produce warnings
- Prefer `swift build -c release` for CI artefacts — debug builds skip optimisations and produce larger binaries
- Use `periphery scan --strict` to catch dead code before it accumulates; easier to delete one function than fifty
