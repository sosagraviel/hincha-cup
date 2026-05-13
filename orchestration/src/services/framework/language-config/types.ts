/**
 * Centralized language-config registry types.
 *
 * Every language the framework supports plugs in via ONE file under
 * `languages/<key>.ts` exporting a `LanguageConfig` object.
 * Detectors, post-fills, and renderers read from the registry — never
 * from inline tables.
 *
 * Stack-agnostic by construction: every field is a literal token /
 * file pattern / version-extractor function the project itself uses.
 * No hardcoded service names, no closed framework enum.
 *
 * Adding a new language (e.g. Crystal, OCaml, Gleam, Zig, etc.):
 *   1. Create `languages/<key>.ts` exporting a `LanguageConfig`.
 *   2. Add ONE import line to `languages/index.ts`.
 *   3. Done. Every detector / post-fill / renderer picks it up.
 */

export type ManifestFormat = 'json' | 'toml' | 'yaml' | 'xml' | 'text' | 'mix-exs';

export interface ManifestEntry {
  /** Exact filename, or `*.<ext>` for suffix-based matches. */
  readonly kind: string;
  /** Parser format. */
  readonly format: ManifestFormat;
  /**
   * Canonical package manager this manifest pins to, when unambiguous.
   * Optional: only set when the manifest deterministically identifies
   * its manager (e.g. `pom.xml → maven`, `build.gradle → gradle`).
   * Used by post-fill manifest-kind → manager mapping.
   */
  readonly manager?: string;
}

export interface LockFileEntry {
  /** Exact lock-file basename. */
  readonly filename: string;
  /** Canonical lowercase manager identifier (e.g. `pnpm`, `poetry`, `cargo`). */
  readonly manager: string;
}

export interface RuntimeVersionEntry {
  /** Free-form lowercase identifier of the language family this version pin maps to. */
  readonly key: string;
  /** Project-relative filename of the canonical version-pin file. */
  readonly filename: string;
  /** Pure function: extract a version string from file contents (null when not present). */
  readonly extract: (contents: string) => string | null;
}

/**
 * Mapping from a manifest dependency token to a known external service vendor.
 * Used by `deriveExternalServices()` to surface SDKs the project integrates
 * with without an LLM. Token match is a case-insensitive substring of the dep
 * name; the first matching entry wins.
 */
export interface ExternalServiceSdkEntry {
  readonly pkg: string;
  readonly vendor: string;
  readonly purpose: string;
}

/**
 * Mapping from a manifest dependency token to an auth library.
 * Used by `deriveAuthFlow()` to identify the project's auth strategy
 * without an LLM. The `strategy` is an open enum used by the deterministic
 * template generator.
 */
export interface AuthLibraryEntry {
  readonly pkg: string;
  readonly strategy:
    | 'jwt-bearer'
    | 'session-cookie'
    | 'oauth2-pkce'
    | 'oauth2-code'
    | 'basic-auth'
    | 'api-key'
    | 'mtls'
    | 'other';
  readonly displayName: string;
}

/**
 * Mapping from a manifest dependency token to an event-queue library.
 * Used by `deriveEventPipeline()` to identify the project's queue /
 * messaging pattern without an LLM.
 */
export interface EventQueueLibraryEntry {
  readonly pkg: string;
  readonly pattern:
    | 'task-queue'
    | 'pubsub'
    | 'websocket'
    | 'actor-mailbox'
    | 'channel-fanout'
    | 'kafka-streams'
    | 'event-bus'
    | 'other';
  readonly displayName: string;
}

/**
 * Per-language tool-name tokens used by analyzer post-fills to detect
 * which quality tools a project uses. Stack-agnostic — token strings
 * are the literal package names projects declare in their manifests.
 */
export interface ToolTokens {
  /** Linter tokens (e.g. `eslint`, `pylint`, `golangci-lint`, `rubocop`). */
  readonly linters?: ReadonlyArray<string>;
  /** Formatter tokens (e.g. `prettier`, `black`, `gofmt`, `rustfmt`). */
  readonly formatters?: ReadonlyArray<string>;
  /** Type-checker tokens (e.g. `typescript`, `mypy`, `pyright`). */
  readonly typeCheckers?: ReadonlyArray<string>;
  /** Test-runner tokens (e.g. `jest`, `vitest`, `pytest`, `pytest`, `cargo`, `go test`). */
  readonly testRunners?: ReadonlyArray<string>;
  /** Common framework tokens for type-inference fallback (express, react, fastify, etc.). */
  readonly commonFrameworks?: ReadonlyArray<string>;
  /** Database / ORM tokens (e.g. `pg`, `psycopg2`, `gorm`, `prisma`, `sqlalchemy`). */
  readonly databases?: ReadonlyArray<string>;
  /**
   * External service SDKs the language family uses. Drives
   * `deriveExternalServices` for the composer view.
   */
  readonly externalServiceSdks?: ReadonlyArray<ExternalServiceSdkEntry>;
  /**
   * Auth libraries for this language family. Drives `deriveAuthFlow`.
   */
  readonly authLibraries?: ReadonlyArray<AuthLibraryEntry>;
  /**
   * Event-queue / messaging libraries for this language family.
   * Drives `deriveEventPipeline`.
   */
  readonly eventQueueLibraries?: ReadonlyArray<EventQueueLibraryEntry>;
}

export interface LanguageConfig {
  /** Stable lowercase key used as the registry id (e.g. `javascript`, `python`, `go`). */
  readonly key: string;

  /** Display name (e.g. "JavaScript", "TypeScript", "Python", ".NET"). */
  readonly displayName: string;

  /**
   * File extensions THIS language is identified by — used by the
   * file-counter fallback when the graph is empty. Lowercase, no leading dot.
   */
  readonly extensions: ReadonlyArray<string>;

  /** Manifest files this language uses (e.g. `package.json`, `Cargo.toml`, `go.mod`). */
  readonly manifests: ReadonlyArray<ManifestEntry>;

  /** Lock files this language uses. */
  readonly lockFiles: ReadonlyArray<LockFileEntry>;

  /**
   * Canonical package manager identifier when the language has exactly
   * ONE manager but no lock-file entry (e.g. Swift Package Manager,
   * Maven, Gradle). Used by post-fill to map manifest → manager.
   * Omit when ambiguous (e.g. Python: poetry / pdm / uv / pip).
   */
  readonly defaultManager?: string;

  /** Version-pin files (e.g. `.nvmrc`, `.python-version`, `go.mod` go-directive). */
  readonly runtimeVersionFiles?: ReadonlyArray<RuntimeVersionEntry>;

  /** Tool tokens used by post-fill detectors. */
  readonly toolTokens?: ToolTokens;

  /**
   * Cross-language behaviours when relevant — e.g. TypeScript extends
   * JavaScript's manifests + adds `tsc`. Optional inheritance chain
   * resolved at registry-load time (no runtime cost).
   */
  readonly extends?: ReadonlyArray<string>;
}
