# Adding a New Language

Teach the framework to recognise a new language by dropping one TypeScript file into the language registry. Every analyzer, post-fill, and renderer reads from the registry — no other files need touching.

The registry currently covers 21 language families. Adding the 22nd is a one-file change.

---

## Where the registry lives

```
orchestration/src/services/framework/language-config/
├── extractors.ts                          # tiny helpers: firstLine, regexFirstGroup, trim
├── types.ts                               # LanguageConfig schema
├── index.ts                               # public API (loaded by every analyzer)
└── languages/
    ├── index.ts                           # `ALL_LANGUAGE_CONFIGS` — add ONE import here
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

The runtime consumers (`apply-inspection-postfill.ts`, `language-config-summary` prompt script, manifest/lock-file/runtime-version tables, etc.) are auto-derived from the registry. There is no other "language list" anywhere in the codebase.

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
| `toolTokens` | optional | `{ linters?, formatters?, typeCheckers?, testRunners?, commonFrameworks?, databases? }`. Free-form lowercase token arrays drawn from manifest package names. |
| `extends` | optional | `string[]` of other language keys whose manifests / lockFiles / etc. this language inherits (e.g. TypeScript extends JavaScript). |

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

### Stack-agnostic checklist

Before committing, confirm:

- [ ] No hardcoded service names, no project-specific paths.
- [ ] No assumption about monorepo / multi-repo / serverless structure.
- [ ] Tokens are literal package names projects declare in manifests.
- [ ] `extensions` are unique across the registry (no collisions with existing languages). Run `pnpm --filter orchestration test:unit -- test/unit/services/framework/language-config/`.

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

If those pass, the registry change is complete — every analyzer / post-fill / renderer / prompt script picks it up automatically.

---

## Step 3 — verify on a real project

The fastest end-to-end check is a real-project initialization on a fixture or a target repo using the new language:

```bash
./scripts/initialize-project.sh /path/to/<lang>-project
```

Inspect the generated artefacts:

```bash
cat /path/to/<lang>-project/.claude-temp/initialize-project/project-inspection.json
cat /path/to/<lang>-project/.claude-temp/initialize-project/framework-config.json
ls /path/to/<lang>-project/.claude/skills/
```

Expected:

- `project-inspection.json` lists the new manifest / lock file / runtime version under the right buckets.
- `framework-config.json` has the new language in `stack_profile.detected_languages[]`.
- `language-config-summary` prompt script (rendered when an analyzer's prompt contains `<<script:language-config-summary>>`) includes a row for the new language.

---

## When to NOT add a language

The registry is for the framework's language *families*, not for individual frameworks or libraries. Don't add a language file for:

- A framework that runs on an existing language family (e.g. Phoenix lives under `elixir`, Nest under `javascript` / `typescript`).
- A DSL hosted in another language (e.g. Liquid / ERB → handled by their host language).
- A configuration format (Dockerfile, k8s YAML, Terraform) — these are covered by the infrastructure analyzers.

If you're unsure, treat the test in `language-config.test.ts` as the contract: if your additions don't introduce a new manifest-or-lock-file shape the existing 21 languages don't already cover, you probably don't need a new language file.

---

## What this is *not*

- Not a place to teach the framework about a new agent / skill / hook. See `ADDING_SKILLS.md` for skills, `agents/templates/*` for agent templates.
- Not a place for project-specific tuning. The registry is global, shared infrastructure consumed by 6000+ developer machines.
- Not a place for runtime decisions. The registry is loaded once at startup and read-only.

---

## Need the GitHub Pages version?

The same guide is published at `website/docs/guides/adding-languages.md` (Docusaurus source for the public docs site). When you change one, update the other in the same PR.
