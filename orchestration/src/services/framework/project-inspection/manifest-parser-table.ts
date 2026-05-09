/**
 * Plan v3 §A — manifest-filename → parser mapping.
 *
 * Stack-agnostic by enumeration. Each entry pairs a canonical
 * filename (or filename-pattern) with the parser format. The
 * inspector reads the file and parses it with the appropriate
 * library. The parsed object is supplied verbatim to analyzers —
 * no field-name normalisation; analyzers see the project's own keys.
 *
 * `kind` is the canonical filename (or a `*.<ext>` glob for filename-
 * suffix matches like `*.csproj`). It's a free-form string the rest
 * of the framework treats as opaque.
 *
 * `format` is one of `json` / `toml` / `yaml` / `xml` / `text` /
 * `mix-exs` (Elixir) — the parser table maps each format to its
 * implementation. Adding a new manifest is a one-line addition here
 * + (if needed) a new `format` entry in the parser dispatcher.
 */

export type ManifestFormat = 'json' | 'toml' | 'yaml' | 'xml' | 'text' | 'mix-exs';

export interface ManifestMapping {
  /** Exact filename, or `*.<ext>` for suffix-based matches. */
  readonly kind: string;
  /** Parser format. */
  readonly format: ManifestFormat;
}

/**
 * Initial table — non-exhaustive by design. Add a new entry by
 * appending; the resolver supports both exact-filename and
 * `*.<ext>` matching.
 */
export const MANIFEST_PARSER_TABLE: ReadonlyArray<ManifestMapping> = [
  { kind: 'Cargo.toml', format: 'toml' },
  { kind: 'Gemfile', format: 'text' },
  { kind: 'Package.swift', format: 'text' },
  { kind: 'Pipfile', format: 'toml' },
  { kind: 'build.gradle', format: 'text' },
  { kind: 'build.gradle.kts', format: 'text' },
  { kind: 'build.sbt', format: 'text' },
  { kind: 'build.zig.zon', format: 'text' },
  { kind: 'cabal.project', format: 'text' },
  { kind: 'composer.json', format: 'json' },
  { kind: 'deno.json', format: 'json' },
  { kind: 'deno.jsonc', format: 'json' },
  { kind: 'dune-project', format: 'text' },
  { kind: 'gleam.toml', format: 'toml' },
  { kind: 'go.mod', format: 'text' },
  { kind: 'mix.exs', format: 'mix-exs' },
  { kind: 'package.json', format: 'json' },
  { kind: 'pom.xml', format: 'xml' },
  { kind: 'pubspec.yaml', format: 'yaml' },
  { kind: 'pyproject.toml', format: 'toml' },
  { kind: 'rebar.config', format: 'text' },
  { kind: 'requirements.txt', format: 'text' },
  { kind: 'setup.py', format: 'text' },
  { kind: 'shard.yml', format: 'yaml' },
  { kind: 'stack.yaml', format: 'yaml' },
  { kind: '*.csproj', format: 'xml' },
  { kind: '*.fsproj', format: 'xml' },
  { kind: '*.gemspec', format: 'text' },
  { kind: '*.vbproj', format: 'xml' },
] as const;

/**
 * Resolve the manifest mapping for a given filename. Supports both
 * exact-filename and `*.<ext>` matches. Returns null when no entry
 * matches — caller treats null as "skip this file".
 */
export function resolveManifestMapping(filename: string): ManifestMapping | null {
  // Exact-filename match first (more specific).
  for (const entry of MANIFEST_PARSER_TABLE) {
    if (!entry.kind.startsWith('*.') && entry.kind === filename) {
      return entry;
    }
  }
  // Then `*.<ext>` matches.
  for (const entry of MANIFEST_PARSER_TABLE) {
    if (entry.kind.startsWith('*.')) {
      const ext = entry.kind.slice(1); // .csproj, .gemspec, ...
      if (filename.toLowerCase().endsWith(ext.toLowerCase())) {
        return entry;
      }
    }
  }
  return null;
}

/** All exact filenames the inspector recognises (excluding suffix patterns). */
export function knownExactManifestBasenames(): ReadonlyArray<string> {
  return MANIFEST_PARSER_TABLE.filter((e) => !e.kind.startsWith('*.')).map((e) => e.kind);
}

/** All filename-suffix patterns (e.g. `.csproj`, `.gemspec`). */
export function knownManifestSuffixes(): ReadonlyArray<string> {
  return MANIFEST_PARSER_TABLE.filter((e) => e.kind.startsWith('*.')).map((e) => e.kind.slice(1));
}
