# Adding a Language Guide

Add a new language to the framework so it's detected, supported by `implement-ticket`, and ships with a knowledge skill.

> **Reference PRs** (use these as your blueprint):
> [Scala #71](https://github.com/thisisqubika/qubika-agentic-framework/pull/71) (canonical) ·
> [Ruby/Rails #88](https://github.com/thisisqubika/qubika-agentic-framework/pull/88) (with Rails framework patterns) ·

---

## TL;DR

A language PR usually touches **8–11 files**:

```
orchestration/src/nodes/initialize-project/phase4/constants.ts          # detection
orchestration/src/nodes/initialize-project/phase5/constants.ts          # commands + supported list
orchestration/src/services/implement-ticket/command-resolver.service.ts # runtime fallbacks
orchestration/src/services/implement-ticket/project-config-reader.service.ts
orchestration/test/unit/services/implement-ticket/command-resolver.service.test.ts
orchestration/test/unit/services/implement-ticket/project-config-reader.service.test.ts
skills/050-language-frameworks/mastering-<lang>-skill/SKILL.md          # the skill itself
skills/skills.config.json                                               # register the skill
agents/templates/implementer.template.md                                # Comment Policy line
docs/guides/USER_GUIDE.md                                               # detected-languages line
```

If your language already has detection on `development` (extensions + manifest in `phase4/constants.ts`), skip step 1 below.

---

## Author Checklist

### 1. Detection — [phase4/constants.ts](../../orchestration/src/nodes/initialize-project/phase4/constants.ts)

- [ ] `LANGUAGE_EXTENSIONS[<lang>]` — source file extensions
- [ ] `MANIFEST_FILES['<file>']` — **exact filename only** (no globs); `{ language, type }`. For .NET, `*.csproj` cannot be added — use a fixed-name file like `global.json` instead
- [ ] `PRIMARY_MANIFESTS` — **only** if the file is a true project root. Skip for tooling pins (`global.json`, `.nvmrc`, etc.) that often coexist with another primary manifest in the same directory — adding them flips `is_monorepo` to `true` incorrectly

### 2. Runtime — Phase 5 + services

- [ ] [phase5/constants.ts](../../orchestration/src/nodes/initialize-project/phase5/constants.ts)
  - Append to `SUPPORTED_IMPLEMENTER_LANGUAGES`
  - Add a `<lang>` block to `COMMAND_DEFAULTS` (lint/format/typecheck/test/build; empty string allowed for "no such tool")
- [ ] [command-resolver.service.ts](../../orchestration/src/services/implement-ticket/command-resolver.service.ts) — fallbacks for **all six** paths: test, build, lint, format, package-manager getter, install case
- [ ] [project-config-reader.service.ts](../../orchestration/src/services/implement-ticket/project-config-reader.service.ts)
  - `getBuildCommands` fallback (`build` and `start`)
  - `generateTestCommands` framework patterns (e.g. `rspec`, `scalatest`, `xctest`, `xunit`)

### 3. Tests

- [ ] [command-resolver.service.test.ts](../../orchestration/test/unit/services/implement-ticket/command-resolver.service.test.ts) — one case per fallback you added
- [ ] [project-config-reader.service.test.ts](../../orchestration/test/unit/services/implement-ticket/project-config-reader.service.test.ts) — build/start fallbacks + each test framework

### 4. Skill

- [ ] `skills/050-language-frameworks/mastering-<lang>-skill/SKILL.md` with frontmatter (`name`, `description`, `allowed-tools`)
- [ ] Optional `references/` per-topic split for big skills (see [Ruby's references/](../../skills/050-language-frameworks/mastering-ruby-skill/references/) and [Swift's references/](../../skills/050-language-frameworks/mastering-swift-skill/references/))
- [ ] [skills.config.json](../../skills/skills.config.json) — single clean entry with `triggers` + `compatible_languages`. Include framework triggers too (Ruby added `rails`, `rspec`, `sidekiq`, `devise`, …)

### 5. Docs (parity, easy to forget)

- [ ] [agents/templates/implementer.template.md](../../agents/templates/implementer.template.md) — add the doc-comment style line in the **Comment Policy** block, e.g. `**DocC** (Swift): \`/// Description\``
- [ ] [docs/guides/USER_GUIDE.md](USER_GUIDE.md) detected-languages bullet — add the language name

### 6. Optional: Phase 1 analyzer hints (above blueprint)

For framework-rich languages (Rails, SwiftUI, ASP.NET, Spring), extend the LLM analyzer prompts so detection picks up the framework's conventions:

- `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/execution-instructions.md`
- `orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/prompts/execution-instructions.md`

Only [Ruby PR #88](https://github.com/thisisqubika/qubika-agentic-framework/pull/88) has done this so far. Skip if your language doesn't have a dominant framework.

### 7. Quality gates — must all pass

```bash
pnpm --filter orchestration typecheck
pnpm --filter orchestration lint
pnpm --filter orchestration format:check   # most common failure (see Pitfalls)
pnpm --filter orchestration test:unit
```

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `format:check` fails on your new files | TS string literals using `"double quotes"` | Run `pnpm --filter orchestration format:fix` |
| `skills.config.json` shows `+220 / −46` (or similar) in the diff | Editor ran Prettier and expanded inline arrays elsewhere | `git checkout development -- skills/skills.config.json`, then re-add only your new entry |
| Sample repo with `global.json` + `package.json` reports `is_monorepo: true` | New manifest added to `PRIMARY_MANIFESTS` while it commonly coexists with another | Keep it in `MANIFEST_FILES` only, not `PRIMARY_MANIFESTS` |
| `MANIFEST_FILES['*.csproj']` doesn't match | `MANIFEST_FILES` is exact-filename lookup, no globs | Register a fixed-name analog (`global.json`); rely on Phase 1 LLM analyzers for `*.csproj` |
| Implementer agent has no commands for the language | Forgot `phase5/COMMAND_DEFAULTS` block or `command-resolver` fallbacks | Add both — they're independent paths |

---

## Reviewer Checklist

**Required surfaces present**
- [ ] `phase5/constants.ts` — both `SUPPORTED_IMPLEMENTER_LANGUAGES` and `COMMAND_DEFAULTS` updated
- [ ] `command-resolver.service.ts` — all 6 fallback paths (test/build/lint/format/pkg-mgr/install)
- [ ] `project-config-reader.service.ts` — both `getBuildCommands` and `generateTestCommands` updated
- [ ] Tests added for every new fallback
- [ ] `implementer.template.md` Comment Policy line added
- [ ] `USER_GUIDE.md` detected-languages line updated

**`PRIMARY_MANIFESTS` red flag**
- [ ] Did the PR add a manifest there? If yes: *can this file appear alongside another primary manifest in the same directory?* If yes → ask the author to remove it from `PRIMARY_MANIFESTS` (keep in `MANIFEST_FILES` only)

**Quality gates green**
- [ ] All four gates pass: `typecheck`, `lint`, `format:check`, `test:unit`

**Framework-rich languages**
- [ ] If the language has a dominant framework (Rails, SwiftUI, ASP.NET, Spring): did the author extend the Phase 1 analyzer prompts? Not required, but improves detection significantly

---

## Why these files? (one-liner each)

| File | Role |
|------|------|
| `phase4/constants.ts` | Static workspace + language detection at scan time |
| `phase5/constants.ts` | Default commands + which languages get a dedicated implementer |
| `command-resolver.service.ts` | Runtime command fallback chain when `framework-config.json` lacks explicit commands |
| `project-config-reader.service.ts` | Build/test command derivation when reading `framework-config.json` |
| `skills/.../SKILL.md` | The knowledge the implementer agent reads to write idiomatic code |
| `skills.config.json` | Registers the skill so initialize-project copies it into target repos |
| `implementer.template.md` | Generic implementer prompt (Comment Policy) — the language's doc-comment style |
| `USER_GUIDE.md` | User-facing description of what the framework auto-detects |
| `phase1/.../execution-instructions.md` | LLM-driven detection patterns for framework conventions |
