/**
 * Public API of the language-config registry.
 *
 * Consumers (detectors / post-fills / renderers) read from this
 * surface instead of maintaining their own inline tables. Adding a
 * new language requires zero changes here — only `languages/<key>.ts`
 * and one import line in `languages/index.ts`.
 */

import type {
  CommandDefaults,
  LanguageConfig,
  LockFileEntry,
  ManifestEntry,
  RuntimeVersionEntry,
  ToolTokens,
} from './types.js';
import { ALL_LANGUAGE_CONFIGS } from './languages/index.js';

export type {
  CommandDefaults,
  LanguageConfig,
  LockFileEntry,
  ManifestEntry,
  ManifestFormat,
  RuntimeVersionEntry,
  ToolTokens,
} from './types.js';

const BY_KEY: ReadonlyMap<string, LanguageConfig> = new Map(
  ALL_LANGUAGE_CONFIGS.map((c) => [c.key, c]),
);

export function getAllLanguages(): ReadonlyArray<LanguageConfig> {
  return ALL_LANGUAGE_CONFIGS;
}

export function getLanguageByKey(key: string): LanguageConfig | undefined {
  return BY_KEY.get(key.toLowerCase());
}

/**
 * Resolve a language from a file extension (no leading dot, lowercase).
 * Returns the first matching language; extensions are unique by
 * construction (enforced by unit test).
 */
export function getLanguageByExtension(ext: string): LanguageConfig | undefined {
  const e = ext.toLowerCase().replace(/^\./, '');
  for (const config of ALL_LANGUAGE_CONFIGS) {
    if (config.extensions.includes(e)) return config;
  }
  return undefined;
}

/**
 * All manifest entries across all languages, with parent-language keys
 * resolved (so a TypeScript config that `extends: ['javascript']`
 * inherits javascript's manifests). Suffix entries (`*.csproj`) keep
 * their wildcard form — caller resolves at match time.
 */
export function allManifests(): ReadonlyArray<ManifestEntry & { languageKey: string }> {
  const out: Array<ManifestEntry & { languageKey: string }> = [];
  const seen = new Set<string>();
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    const seq = inheritanceChain(lang);
    for (const ancestor of seq) {
      for (const m of ancestor.manifests) {
        const key = `${lang.key}::${m.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...m, languageKey: lang.key });
      }
    }
  }
  return out;
}

export function allLockFiles(): ReadonlyArray<LockFileEntry & { languageKey: string }> {
  const out: Array<LockFileEntry & { languageKey: string }> = [];
  const seen = new Set<string>();
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    const seq = inheritanceChain(lang);
    for (const ancestor of seq) {
      for (const l of ancestor.lockFiles) {
        const key = `${lang.key}::${l.filename}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...l, languageKey: lang.key });
      }
    }
  }
  return out;
}

export function allRuntimeVersionFiles(): ReadonlyArray<RuntimeVersionEntry> {
  const out: RuntimeVersionEntry[] = [];
  const seen = new Set<string>();
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    const seq = inheritanceChain(lang);
    for (const ancestor of seq) {
      for (const v of ancestor.runtimeVersionFiles ?? []) {
        const key = `${v.key}::${v.filename}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
    }
  }
  return out;
}

/**
 * String-array tool-token categories (linter / formatter / type-checker /
 * test-runner / common-framework / database). The structured categories
 * (`externalServiceSdks`, `authLibraries`, `eventQueueLibraries`) are
 * NOT string arrays — they carry per-entry metadata — and are exposed
 * via separate aggregator helpers below.
 */
type StringToolTokenCategory =
  | 'linters'
  | 'formatters'
  | 'typeCheckers'
  | 'testRunners'
  | 'commonFrameworks'
  | 'databases';

/**
 * Aggregated tool tokens for a string-array category across every language.
 * Returns deduplicated lowercase strings.
 */
export function allToolTokens(category: StringToolTokenCategory): ReadonlyArray<string> {
  const out = new Set<string>();
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    const seq = inheritanceChain(lang);
    for (const ancestor of seq) {
      const list = ancestor.toolTokens?.[category];
      if (!list) continue;
      for (const tok of list) out.add(tok.toLowerCase());
    }
  }
  return Array.from(out).sort();
}

export function resolveLockFileManager(filename: string): string | null {
  for (const entry of allLockFiles()) {
    if (entry.filename === filename) return entry.manager;
  }
  return null;
}

export function resolveManifestEntry(
  filename: string,
): (ManifestEntry & { languageKey: string }) | null {
  for (const entry of allManifests()) {
    if (!entry.kind.startsWith('*.') && entry.kind === filename) return entry;
  }
  for (const entry of allManifests()) {
    if (entry.kind.startsWith('*.')) {
      const ext = entry.kind.slice(1);
      if (filename.toLowerCase().endsWith(ext.toLowerCase())) return entry;
    }
  }
  return null;
}

export function resolveRuntimeExtractor(filename: string): RuntimeVersionEntry | null {
  for (const entry of allRuntimeVersionFiles()) {
    if (entry.filename === filename) return entry;
  }
  return null;
}

/** All known lock-file basenames. */
export function knownLockFileBasenames(): ReadonlyArray<string> {
  return Array.from(new Set(allLockFiles().map((e) => e.filename))).sort();
}

/** All known exact-filename manifest basenames (no suffix wildcards). */
export function knownExactManifestBasenames(): ReadonlyArray<string> {
  return Array.from(
    new Set(
      allManifests()
        .filter((e) => !e.kind.startsWith('*.'))
        .map((e) => e.kind),
    ),
  ).sort();
}

/** All known manifest suffix patterns (e.g. `.csproj`, `.gemspec`). */
export function knownManifestSuffixes(): ReadonlyArray<string> {
  return Array.from(
    new Set(
      allManifests()
        .filter((e) => e.kind.startsWith('*.'))
        .map((e) => e.kind.slice(1)),
    ),
  ).sort();
}

/**
 * Every manifest pattern in the registry, deduped, for use by the
 * service-completeness validator. Suffix wildcards (`*.csproj`,
 * `*.xcodeproj`) are returned verbatim — the caller expands them at
 * glob time. Exact filenames (`package.json`, `AndroidManifest.xml`)
 * flow through unchanged.
 *
 * Stack-agnostic by construction: returns only the patterns each
 * language already registers. Adding a new manifest kind to a
 * language file automatically widens the validator's discovery surface.
 */
export function allManifestPatternsForDiscovery(): ReadonlyArray<string> {
  return Array.from(new Set(allManifests().map((e) => e.kind))).sort();
}

/** All known runtime-version filenames at project root. */
export function knownRuntimeVersionFilenames(): ReadonlyArray<string> {
  return Array.from(new Set(allRuntimeVersionFiles().map((e) => e.filename))).sort();
}

/**
 * Derive a "manifest kind → manager" map for UNAMBIGUOUS cases only.
 * A manifest is unambiguous when its language declares a `defaultManager`,
 * when the manifest entry carries an explicit `manager`, or when the
 * containing language has exactly one lock-file entry. Ambiguous manifests
 * (e.g. `pyproject.toml`) are excluded so the post-fill never guesses.
 */
export function manifestKindToManagerMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    const chain = inheritanceChain(lang);
    const managers = new Set<string>();
    for (const ancestor of chain) {
      for (const l of ancestor.lockFiles) managers.add(l.manager);
    }
    const lockBasedManager = managers.size === 1 ? Array.from(managers)[0] : undefined;
    const langDefault = lang.defaultManager ?? lockBasedManager;
    for (const ancestor of chain) {
      for (const m of ancestor.manifests) {
        if (m.kind in out) continue;
        const manager = m.manager ?? langDefault;
        if (manager) out[m.kind] = manager;
      }
    }
  }
  return out;
}

/**
 * Parse `.tool-versions` (asdf) body into `{language → version}`.
 * Stack-agnostic — language tokens come from the file itself, not a
 * hard-coded list.
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

/**
 * Returns `{ <canonical-language-key>: ['.ext', …] }` for every language in
 * the registry. The file-counter and stack-profile validator consume this
 * to attribute on-disk files to languages without a per-language `if` chain.
 */
export function languageExtensionsMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    if (lang.extensions.length === 0) continue;
    out[lang.key] = lang.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`));
  }
  return out;
}

/**
 * Returns `{ <manifest-filename>: { language, type } }` for every manifest
 * with an unambiguous package manager. `type` is the lower-cased manager
 * identifier so external consumers can switch on it. Suffix-matched
 * manifests (`*.csproj`, `*.gemspec`) are NOT included — callers that need
 * suffix support resolve via `resolveManifestEntry()` directly.
 */
export function manifestInfoMap(): Record<string, { language: string; type: string }> {
  const out: Record<string, { language: string; type: string }> = {};
  const managerMap = manifestKindToManagerMap();
  for (const entry of allManifests()) {
    if (entry.kind.startsWith('*.')) continue;
    if (entry.kind in out) continue;
    const manager = managerMap[entry.kind];
    if (!manager) continue;
    out[entry.kind] = { language: entry.languageKey, type: manager };
  }
  return out;
}

/**
 * Manifest filenames the framework treats as workspace roots. Excludes lock
 * files, ambiguous-manager manifests, and entries explicitly marked
 * `isPrimary: false` (e.g. `global.json`).
 */
export function primaryManifestFilenames(): ReadonlySet<string> {
  const nonPrimary = new Set<string>();
  for (const entry of allManifests()) {
    if (entry.isPrimary === false) nonPrimary.add(entry.kind);
  }
  const out = new Set<string>();
  for (const name of Object.keys(manifestInfoMap())) {
    if (!nonPrimary.has(name)) out.add(name);
  }
  return out;
}

/**
 * Per-language default lint/format/typecheck/test/build commands the Phase 5
 * implementer-agent generator falls back to when the project's manifest has
 * no scripts.
 */
export function commandDefaultsByLanguage(): Record<string, CommandDefaults> {
  const out: Record<string, CommandDefaults> = {};
  for (const lang of ALL_LANGUAGE_CONFIGS) {
    if (!lang.commandDefaults) continue;
    out[lang.key] = lang.commandDefaults;
  }
  return out;
}

/**
 * Language keys for which Phase 5 generates a dedicated implementer agent.
 * Languages without `hasImplementerAgent: true` fall through to
 * `implementer-generic`.
 */
export function languagesWithImplementerAgent(): ReadonlyArray<string> {
  return ALL_LANGUAGE_CONFIGS.filter((l) => l.hasImplementerAgent === true)
    .map((l) => l.key)
    .sort();
}

/**
 * Auxiliary file-type languages (shell, sql, html, css, …) that legitimately
 * appear in file counts but are intentionally absent from the stack profile.
 * Validators use this set to suppress false-positive warnings.
 */
export function utilityLanguageKeys(): ReadonlySet<string> {
  return new Set(ALL_LANGUAGE_CONFIGS.filter((l) => l.isUtility === true).map((l) => l.key));
}

function inheritanceChain(lang: LanguageConfig): ReadonlyArray<LanguageConfig> {
  const visited = new Set<string>();
  const chain: LanguageConfig[] = [];
  function walk(cfg: LanguageConfig): void {
    if (visited.has(cfg.key)) return;
    visited.add(cfg.key);
    for (const parentKey of cfg.extends ?? []) {
      const parent = BY_KEY.get(parentKey);
      if (parent) walk(parent);
    }
    chain.push(cfg);
  }
  walk(lang);
  return chain;
}
