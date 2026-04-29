/**
 * Stack-agnostic language normalization for structure-analyzer service entries.
 *
 * The framework targets 600+ projects across legacy + modern stacks (PHP,
 * .NET Framework, COBOL bridges, Python 2 era, Rails monoliths, modern
 * TypeScript serverless, Go services, Rust crates, mixed). The structure-
 * analyzer's `language` field is free-form on purpose — every project speaks
 * its own dialect, and a strict enum would reject legitimate values.
 *
 * Approach: lowercase + alias-map for known dialects so `tsx`, `jsx`, `mjs`,
 * `cs`, `cpp`, `py`, etc. all collapse to canonical keys downstream consumers
 * can switch on. Unknown values pass through unchanged — no rejection — so
 * a project with a less-common stack (Elixir, Crystal, Nim, V, Zig, …) keeps
 * working.
 *
 * The CANONICAL_LANGUAGES set is the curated allowlist of languages that
 * downstream consumers (synthesis, wiki templates) special-case. It is NOT
 * a hard enum — values outside it are accepted but flagged via a soft warning
 * channel for telemetry (Phase E in the gira-init-run audit refactor plan).
 */

const ALIASES: Record<string, string> = {
  // TypeScript/JavaScript dialects
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  // Python
  py: 'python',
  py2: 'python',
  py3: 'python',
  python2: 'python',
  python3: 'python',
  // .NET family
  cs: 'csharp',
  'c#': 'csharp',
  'c-sharp': 'csharp',
  fs: 'fsharp',
  'f#': 'fsharp',
  vb: 'vbnet',
  'visual basic': 'vbnet',
  'vb.net': 'vbnet',
  // C / C++
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  // Ruby
  rb: 'ruby',
  // Go
  golang: 'go',
  // Rust
  rs: 'rust',
  // Kotlin
  kt: 'kotlin',
  kts: 'kotlin',
  // Swift / ObjC
  'objective-c': 'objectivec',
  'objective c': 'objectivec',
  objc: 'objectivec',
  // PHP
  phtml: 'php',
  // Java
  jav: 'java',
  // Scala
  sc: 'scala',
  // Perl
  pl: 'perl',
  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  // R / Julia / Lua / Dart / Elixir / Clojure / Haskell / Erlang
  jl: 'julia',
  ex: 'elixir',
  exs: 'elixir',
  clj: 'clojure',
  cljs: 'clojure',
  hs: 'haskell',
  erl: 'erlang',
  // Elm / OCaml / F-Sharp etc. left as-is — pass through.
};

/**
 * The curated set of canonical language values downstream code can rely on.
 * Wider than typical enums so legacy + modern stacks both fit. Values OUTSIDE
 * this set are NOT rejected — `normalizeLanguage` returns them as-is.
 */
export const CANONICAL_LANGUAGES = new Set<string>([
  'typescript',
  'javascript',
  'python',
  'go',
  'java',
  'csharp',
  'fsharp',
  'vbnet',
  'kotlin',
  'scala',
  'ruby',
  'rust',
  'php',
  'swift',
  'objectivec',
  'cpp',
  'c',
  'dart',
  'elixir',
  'clojure',
  'haskell',
  'erlang',
  'lua',
  'r',
  'julia',
  'perl',
  'shell',
  'powershell',
  'sql',
  'html',
  'css',
  'unknown',
]);

/**
 * Normalize an analyzer-emitted language string to a canonical, lowercase
 * form. Pass-through for any value that doesn't match a known alias.
 *
 * Stack-agnostic: returns the raw value (lowercased) when unknown so legacy
 * or unusual dialects still flow downstream — caller can decide how to
 * surface them (e.g. as a soft warning).
 */
export function normalizeLanguage(value: string): string {
  if (!value) return value;
  const lower = value.trim().toLowerCase();
  if (lower === '') return lower;
  return ALIASES[lower] ?? lower;
}

/**
 * True when the (already-normalized) value is one of the curated canonical
 * languages. Use this to drive soft-warning telemetry — never to reject.
 */
export function isCanonicalLanguage(value: string): boolean {
  return CANONICAL_LANGUAGES.has(normalizeLanguage(value));
}
