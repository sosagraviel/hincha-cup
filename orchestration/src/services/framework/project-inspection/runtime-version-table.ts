/**
 * Plan v3 §A — runtime-version extraction table.
 *
 * Stack-agnostic by enumeration. Each entry maps a canonical version-
 * pin file to a small extractor function that pulls the version
 * string out of it. The result populates
 * `ProjectInspection.runtime_versions[<key>]` with the project's
 * declared version for that runtime. A language family the table
 * doesn't know about yields no entry — analyzers fall through to
 * LLM-based version discovery for those services.
 *
 * Add a new language by appending an entry here; tests in
 * `__tests__/runtime-version-table.test.ts` enforce key uniqueness
 * and minimal extractor behaviour.
 */

export interface RuntimeVersionExtractor {
  /** Free-form lowercase identifier of the language family. */
  readonly key: string;
  /**
   * Project-relative path of the canonical version-pin file, or a
   * filename matched against directory entries (no glob; suffix-only
   * via the `suffix` boolean).
   */
  readonly filename: string;
  /** When true, treat `filename` as a suffix to match against any file in the project root. */
  readonly suffix?: boolean;
  /**
   * Pure function: given the file's UTF-8 contents, extract a version
   * string (or null if the file shape doesn't carry one). Best-effort
   * — returning null is normal and analyzers handle it.
   */
  readonly extract: (contents: string) => string | null;
}

/* ----------------------------- Helpers ----------------------------- */

const TRIM = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
};

const FIRST_LINE = (s: string): string | null => TRIM(s.split('\n')[0]);

const REGEX_FIRST_GROUP =
  (re: RegExp) =>
  (contents: string): string | null => {
    const m = contents.match(re);
    return m ? TRIM(m[1] ?? null) : null;
  };

/* ----------------------------- Table ----------------------------- */

export const RUNTIME_VERSION_TABLE: ReadonlyArray<RuntimeVersionExtractor> = [
  // Node.js — `.nvmrc` is just a version line.
  { key: 'node', filename: '.nvmrc', extract: FIRST_LINE },
  // Python — `.python-version` is a version line.
  { key: 'python', filename: '.python-version', extract: FIRST_LINE },
  // Ruby — `.ruby-version` is a version line.
  { key: 'ruby', filename: '.ruby-version', extract: FIRST_LINE },
  // Java — `.java-version` is a version line (jenv convention).
  { key: 'java', filename: '.java-version', extract: FIRST_LINE },
  // Go — `go.mod` carries `go 1.21` directive.
  {
    key: 'go',
    filename: 'go.mod',
    extract: REGEX_FIRST_GROUP(/^go\s+([\w.]+)/m),
  },
  // Rust — `rust-toolchain.toml`'s `[toolchain]\nchannel = "1.70"` (or just a version line).
  {
    key: 'rust',
    filename: 'rust-toolchain.toml',
    extract: (contents) => {
      const channel = REGEX_FIRST_GROUP(/channel\s*=\s*"([^"]+)"/)(contents);
      if (channel) return channel;
      // Pre-TOML form: a bare version on the first line.
      return FIRST_LINE(contents);
    },
  },
  // OCaml — `.ocaml-version` (less common; rare projects).
  { key: 'ocaml', filename: '.ocaml-version', extract: FIRST_LINE },
  // Crystal — `.crystal-version` (asdf convention).
  { key: 'crystal', filename: '.crystal-version', extract: FIRST_LINE },
  // Nim — `.nim-version`.
  { key: 'nim', filename: '.nim-version', extract: FIRST_LINE },
  // Multi-runtime — `.tool-versions` (asdf): one extractor per recognised line prefix.
  // We expose this entry under key `tool-versions-raw` so consumers can re-parse
  // for whatever languages they care about; the file may carry many.
  {
    key: 'tool-versions-raw',
    filename: '.tool-versions',
    extract: (contents) => TRIM(contents),
  },
  // Deno — `deno.json` / `deno.jsonc` carry a `"version"` field for the project, not the runtime;
  // we rely on the manifest parser for richer extraction. This entry catches
  // an explicit `.deno-version` if one exists.
  { key: 'deno', filename: '.deno-version', extract: FIRST_LINE },
  // Erlang — `.tool-versions` typically carries `erlang <version>`; covered above.
  // Elixir — same.
  // Dart — `pubspec.yaml`'s `environment.sdk` is the canonical pin; extracted via the
  // manifest parser, not here.
  // Swift — `Package.swift`'s `swift-tools-version` first-line directive.
  {
    key: 'swift',
    filename: 'Package.swift',
    extract: REGEX_FIRST_GROUP(/swift-tools-version:\s*([\d.]+)/),
  },
  // .NET — `global.json` carries `sdk.version`.
  {
    key: 'dotnet',
    filename: 'global.json',
    extract: REGEX_FIRST_GROUP(/"version"\s*:\s*"([^"]+)"/),
  },
  // PHP — `composer.json::require.php`.
  {
    key: 'php',
    filename: 'composer.json',
    extract: REGEX_FIRST_GROUP(/"php"\s*:\s*"([^"]+)"/),
  },
] as const;

/**
 * Resolve a version extractor by exact filename. Returns null when
 * no entry matches. Suffix matches are handled by the caller (the
 * inspector) to keep this function pure.
 */
export function resolveRuntimeExtractor(filename: string): RuntimeVersionExtractor | null {
  for (const entry of RUNTIME_VERSION_TABLE) {
    if (!entry.suffix && entry.filename === filename) return entry;
  }
  return null;
}

/** All filenames the inspector should look for at the project root. */
export function knownRuntimeVersionFilenames(): ReadonlyArray<string> {
  return RUNTIME_VERSION_TABLE.filter((e) => !e.suffix).map((e) => e.filename);
}

/**
 * Parse a `.tool-versions` body into a Record<language, version> map.
 * `.tool-versions` is asdf's lingua franca and carries multiple
 * runtimes per project.
 */
export function parseToolVersions(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [name, version] = line.split(/\s+/, 2);
    if (name && version) out[name] = version;
  }
  return out;
}
