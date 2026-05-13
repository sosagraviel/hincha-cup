---
sidebar_position: 5
title: Adding Languages
description: Teach the framework to recognise a new language by dropping one TypeScript file into the centralized language registry.
---

# Adding a New Language

Teach the framework to recognise a new language by dropping one TypeScript file into the language registry. Every analyzer, post-fill, renderer, file-counter, command-defaults table, and implementer-agent gate reads from the registry — no other files need touching.

The registry currently covers **36 languages** (21 first-class language families plus 15 auxiliary file-types like Shell, SQL, HTML, CSS that participate in file counting but don't have full toolchains). Adding the 37th is a one-file change.

---

## Where the registry lives

```
orchestration/src/services/framework/language-config/
├── extractors.ts                          # tiny helpers: firstLine, regexFirstGroup, trim
├── types.ts                               # LanguageConfig schema
├── index.ts                               # public API (loaded by every analyzer)
└── languages/
    ├── index.ts                           # ALL_LANGUAGE_CONFIGS — add ONE import here
    ├── javascript.ts                      # one file per language family
    ├── typescript.ts                      # extends javascript
    ├── python.ts
    ├── go.ts
    ├── rust.ts
    ├── java.ts
    ├── kotlin.ts                          # extends java
    ├── ruby.ts                            # defaultManager: 'bundler'
    ├── ... (21 total)
    └── zig.ts
```

The runtime consumers are auto-derived from the registry. **There is no other "language list" anywhere in the codebase** — a CI test (`test/unit/services/framework/language-config/language-config.test.ts`) enforces that the registry covers every consumer-side helper. The derived consumers include:

| Consumer | What it derives from |
|---|---|
| `phase4/constants.ts::LANGUAGE_EXTENSIONS` | `languageExtensionsMap()` |
| `phase4/constants.ts::MANIFEST_FILES` | `manifestInfoMap()` (+ lock-file entries) |
| `phase4/constants.ts::PRIMARY_MANIFESTS` | `primaryManifestFilenames()` |
| `phase4/constants.ts::UTILITY_LANGUAGES` | `utilityLanguageKeys()` |
| `phase5/constants.ts::COMMAND_DEFAULTS` | `commandDefaultsByLanguage()` |
| `phase5/constants.ts::SUPPORTED_IMPLEMENTER_LANGUAGES` | `languagesWithImplementerAgent()` |
| `apply-inspection-postfill.ts` (tech-stack + code-patterns) | `manifestKindToManagerMap()` + `allToolTokens()` |
| Phase 0 `project-inspection` | `knownExactManifestBasenames()`, `knownLockFileBasenames()`, `knownRuntimeVersionFilenames()` |
| Composer-view derivation | `allToolTokens('externalServiceSdks' / 'authLibraries' / 'eventQueueLibraries')` |

---

## Step 1 — create `languages/<key>.ts`

Pick a stable lowercase `key` (e.g. `julia`, `clojure`, `fortran`). The file must export a `LanguageConfig` of the same name. Use neighbours as templates — `rust.ts` for a single-manager language, `python.ts` for an ambiguous-manager language, `typescript.ts` for an `extends`-based inheritor.

Minimum viable shape:

```ts
import type { LanguageConfig } from '../types.js';

export const myLang: LanguageConfig = {
  key: 'mylang',
  displayName: 'MyLang',
  extensions: ['ml', 'mli'],                    // file extensions, no leading dot
  manifests: [{ kind: 'mylang.toml', format: 'toml' }],
  lockFiles: [{ filename: 'mylang.lock', manager: 'mylang-pm' }],
};
```

### `LanguageConfig` fields

| Field | Required | What it does |
|-------|----------|--------------|
| `key` | ✓ | Registry id. Lowercase, ASCII, no spaces. Must be unique. |
| `displayName` | ✓ | Human label rendered in prompt scripts and CLAUDE.md. |
| `extensions` | ✓ | File-suffix list (no leading dot). Used by the file-counter fallback when the graph is empty. |
| `manifests` | ✓ | `{ kind, format, manager? }[]`. `kind` matches the file basename (or `*.csproj`-style glob). `format` is one of `json` / `toml` / `yaml` / `xml` / `text` / `mix-exs`. `manager` is only set when the manifest deterministically identifies its manager (e.g. `pom.xml → maven`, `build.gradle → gradle`). |
| `lockFiles` | ✓ | `{ filename, manager }[]`. Drives the manifest → manager mapping when unambiguous. |
| `defaultManager` | optional | Canonical manager identifier when the language has exactly ONE manager but no lock-file entry (e.g. Swift PM, Maven, Gradle, Bundler when multiple lock files exist). |
| `runtimeVersionFiles` | optional | `{ key, filename, extract }[]`. `extract` is a pure function `(contents: string) => string \| null` — pick from `extractors.ts` or write inline. |
| `toolTokens` | optional | `{ linters?, formatters?, typeCheckers?, testRunners?, commonFrameworks?, databases?, externalServiceSdks?, authLibraries?, eventQueueLibraries? }`. Free-form lowercase token arrays drawn from manifest package names. The last three drive composer-view derivation. |
| `commandDefaults` | optional | `{ lint?, format?, typecheck?, test?, build? }` — fallback commands the Phase 5 implementer agent uses when the project's manifest has no scripts. Required when `hasImplementerAgent: true`. |
| `hasImplementerAgent` | optional | `true` when Phase 5 should generate a dedicated `implementer-<key>` agent (vs falling through to `implementer-generic`). Set this on every first-class language with a serious build/test toolchain. |
| `isUtility` | optional | `true` for auxiliary file-types (Shell, SQL, HTML, CSS, …) that participate in file counting but should be suppressed from stack-profile "missing language" warnings and never get an implementer agent. |
| `extends` | optional | `string[]` of other language keys whose manifests / lockFiles / etc. this language inherits (e.g. TypeScript extends JavaScript, Kotlin extends Java). |

### Pick `defaultManager` carefully

The framework's manifest → manager mapping is derived as follows:

1. If the language has **exactly one** lock-file entry, the manifest maps to that lock file's manager.
2. Otherwise, if `defaultManager` is set, the manifest maps to it.
3. Otherwise, if the manifest entry has its own `manager` field, that wins.
4. Otherwise, the manifest is left unmapped (Python's `pyproject.toml` → unmapped because the actual manager could be poetry / pdm / uv / pip).

If your language has **one canonical manager** (Bundler for Ruby, Swift PM for Swift, Maven for plain `pom.xml`), set `defaultManager`. If it's genuinely ambiguous (Python, .NET), leave it off and let the lock-file infer it.

### Runtime version extractors

If your language has a canonical version-pin file (`.python-version`, `.nvmrc`, `.tool-versions`, etc.), register it under `runtimeVersionFiles`. The extractor is a pure function — three helpers exist in `extractors.ts`:

```ts
import { firstLine, regexFirstGroup, trim } from '../extractors.js';

// `.foo-version` containing just "1.2.3"
{ key: 'foo', filename: '.foo-version', extract: firstLine },

// `Cargo.toml` containing `rust-version = "1.78"`
{ key: 'rust', filename: 'Cargo.toml', extract: regexFirstGroup(/^rust-version\s*=\s*"([^"]+)"/m) },

// Whole-file trim
{ key: 'foo', filename: '.foo-version', extract: trim },
```

If extraction needs language-specific logic (e.g. Go's `go.mod` `go 1.22` directive), write it inline:

```ts
runtimeVersionFiles: [
  {
    key: 'go',
    filename: 'go.mod',
    extract: (s) => {
      const m = s.match(/^go\s+([0-9.]+)/m);
      return m ? m[1] : null;
    },
  },
],
```

### Tool tokens

These feed the post-fill detectors (`code-patterns-analyzer/helpers/apply-inspection-postfill.ts`). Whatever tokens you add will be matched against `package.json`-style dependency lists project-side. Keep them lowercase, framework-agnostic, and conservative — false positives are worse than missing detections.

```ts
toolTokens: {
  linters: ['rubocop', 'standardrb', 'reek'],
  formatters: ['rubocop', 'standardrb'],
  testRunners: ['rspec', 'minitest', 'test-unit'],
  commonFrameworks: ['rails', 'sinatra', 'hanami', 'roda'],
  databases: ['pg', 'mysql2', 'sqlite3', 'redis', 'activerecord', 'sequel'],
},
```

### Inheritance via `extends`

When a language is a strict superset of another, use `extends` to avoid duplication:

```ts
export const typescript: LanguageConfig = {
  key: 'typescript',
  displayName: 'TypeScript',
  extensions: ['ts', 'tsx', 'd.ts'],
  manifests: [],          // empty — inherited from javascript
  lockFiles: [],          // empty — inherited from javascript
  extends: ['javascript'], // resolved at registry-load time, no runtime cost
  toolTokens: {
    typeCheckers: ['tsc', 'typescript'],
  },
};
```

The inheritance walker (`inheritanceChain()` in `language-config/index.ts`) merges manifests / lock files / runtime-version files / tool tokens from every ancestor at load time. The child's tokens are additive.

### Implementer-agent setup

Set `hasImplementerAgent: true` and provide `commandDefaults` when the language is a first-class development target:

```ts
export const mylang: LanguageConfig = {
  // … manifest / lockFiles / extensions / toolTokens as above
  commandDefaults: {
    lint: 'mylang-lint .',
    format: 'mylang-fmt .',
    typecheck: 'mylang-check',
    test: 'mylang-test',
    build: 'mylang-build',
  },
  hasImplementerAgent: true,
};
```

Phase 5's `agent-generator.ts` will then emit `implementer-mylang.md` for any service whose stack profile lists `mylang`. Without `hasImplementerAgent`, Phase 5 still renders skills and conventions for the language but routes implementation tasks to `implementer-generic`.

### Auxiliary file-types (utility languages)

For file extensions that aren't full toolchains but should still be counted (Shell, SQL, HTML, CSS, Lua, Perl, …), set `isUtility: true` and leave `manifests` / `lockFiles` empty:

```ts
export const sql: LanguageConfig = {
  key: 'sql',
  displayName: 'SQL',
  extensions: ['sql'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
```

Validators use `isUtility` to suppress "language present but missing from stack profile" warnings for legitimate auxiliary content.

### Stack-agnostic checklist

Before committing, confirm:

- No hardcoded service names, no project-specific paths.
- No assumption about monorepo / multi-repo / serverless structure.
- Tokens are literal package names projects declare in manifests.
- `extensions` are unique across the registry (no collisions with existing languages). Run `pnpm --filter orchestration test:unit -- test/unit/services/framework/language-config/`.
- If `hasImplementerAgent: true`, `commandDefaults` is set with at least `lint`, `test`, and `build`.
- If `isUtility: true`, `manifests` and `lockFiles` are both empty (utility languages don't carry a toolchain).

---

## Step 2 — register in `languages/index.ts`

Add ONE import line and ONE entry to `ALL_LANGUAGE_CONFIGS` (alphabetical):

```ts
import { mylang } from './mylang.js';

export const ALL_LANGUAGE_CONFIGS: ReadonlyArray<LanguageConfig> = [
  // ...
  mylang,
  // ...
];
```

Build:

```bash
pnpm --filter orchestration typecheck
pnpm --filter orchestration test:unit
```

The registry-consistency test (`test/unit/services/framework/language-config/language-config.test.ts`) verifies that:

- No two languages share a `key`.
- Every `extends` reference resolves.
- Every manifest's `format` is a valid `ManifestFormat`.
- Every lock-file `manager` is non-empty.
- `inheritanceChain()` produces no cycles.
- `manifestKindToManagerMap()` covers every manifest with an unambiguous manager.
- `languageExtensionsMap()` returns one entry per registered language with at least one extension.
- `commandDefaultsByLanguage()` is populated for every language that sets `hasImplementerAgent: true`.
- `utilityLanguageKeys()` and `languagesWithImplementerAgent()` are disjoint sets.

If those pass, the registry change is complete — every analyzer / post-fill / renderer / prompt script picks it up automatically.

---

## Step 3 — verify on a real project

The fastest end-to-end check is a real-project initialization on a fixture or a target repo using the new language:

```bash
./scripts/initialize-project.sh /path/to/mylang-project
```

Inspect the generated artefacts:

```bash
cat /path/to/mylang-project/.claude-temp/initialize-project/project-inspection.json
cat /path/to/mylang-project/.claude-temp/initialize-project/framework-config.json
ls /path/to/mylang-project/.claude/skills/
```

Expected:

- `project-inspection.json` lists the new manifest / lock file / runtime version under the right buckets.
- `framework-config.json` has the new language in `stack_profile.detected_languages[]`.
- The `language-config-summary` prompt script (rendered when an analyzer's prompt contains `<<script:language-config-summary>>`) includes a row for the new language.

---

## When to NOT add a language

The registry is for the framework's language *families*, not for individual frameworks or libraries. Don't add a language file for:

- A framework that runs on an existing language family (e.g. Phoenix lives under `elixir`, Nest under `javascript` / `typescript`).
- A DSL hosted in another language (e.g. Liquid / ERB → handled by their host language).
- A configuration format (Dockerfile, k8s YAML, Terraform) — these are covered by the infrastructure analyzers.

If you're unsure, treat the test in `language-config.test.ts` as the contract: if your additions don't introduce a new manifest-or-lock-file shape the existing 21 languages don't already cover, you probably don't need a new language file.

---

## What this is *not*

- Not a place to teach the framework about a new agent / skill / hook. See [Adding Skills](./adding-skills) for skills, `agents/templates/*` for agent templates.
- Not a place for project-specific tuning. The registry is global, shared infrastructure consumed by 6000+ developer machines.
- Not a place for runtime decisions. The registry is loaded once at startup and read-only.

---

## Keeping the docs in sync

The same guide is mirrored in-repo at `docs/guides/ADDING_LANGUAGES.md` (the source of truth Claude / Codex agents read when running in target projects). When you change one, update the other in the same PR.
