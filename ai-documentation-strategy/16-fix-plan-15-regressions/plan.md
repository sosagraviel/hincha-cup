# Plan 16 — Fix the regressions Plan 15 introduced (and one or two it didn't)

**Status:** awaiting confirmation. Do NOT implement until approved.
**Author:** assistant, 2026-05-06
**Triggered by:** gira re-run produced empty `Essential Commands`,
graph-community-shaped service IDs (`src-app`, `chat-handle`,
`scripts-upsert`, `base-aggregation`), and an `infrastructure`
list of category words (`containerization`, `orchestration`)
instead of technology names (`docker`, `docker-compose`).

---

## 0. Honest diagnosis (load-bearing)

I shipped a load-bearing bug in Plan 15 commit 3 (`d1d649c`) that
made the `command_catalog` **always empty for every project**, not
just gira. Plan 15 commit 4 (`af7d39a`) then made the symptom
worse by adding an `(no commands discovered)` placeholder that the
synthesizer renders when the catalog is empty — which is now
always. Two more regressions (service-id shape and infrastructure
shape) are visible on this run but the root causes pre-date plan
15; they were silently masked before and now show through.

This plan fixes **all four** problems, with verification at each
step that I did not trade one regression for another.

---

## A. Evidence (gira run, 2026-05-06)

### A.1 — empty `command_catalog` in every project

`gira/.claude/framework-config.json::stack_profile.command_catalog`
is `{}`. The expected shape (after Plan 15) was a populated map
of operations → ordered command lists. Direct evidence the bug is
in the catalog builder, not the analyzer:

```jsonc
// gira/.claude-temp/initialize-project/phase2-consolidation.json
{
  "consolidated_findings": {
    "01-structure-architecture": { "findings": { ... } },
    "02-tech-stack-dependencies": {
      "findings": {
        "build_tools": {
          "src-app": { "lint_command": "eslint --max-warnings=0", ... },
          "chat-handle": { "test_command": "playwright test", ... },
          ...
        },
        "monorepo": { "build_all_command": "pnpm -r build", "test_all_command": "pnpm -r test", ... }
      }
    },
    ...
  }
}
```

The data IS there — under `consolidated_findings['02-tech-stack-dependencies'].findings.build_tools`.

But `phase3/helpers/build-catalog-from-consolidation.ts` line 50–56
reads:

```ts
const findings = isObject(root.consolidated_findings)
  ? root.consolidated_findings
  : isObject(root.findings)
    ? root.findings
    : {};
// then: findings.build_tools, findings.automation, findings.readme_run_sections, ...
```

`findings.build_tools` is `undefined` because `consolidated_findings`
is keyed by analyzer slug, not flat-merged. Every per-tier walker
reads `undefined`, so the catalog is empty.

**This bug landed in Plan 15 commit 3 and was caught by no test
because every fixture in `build-catalog-from-consolidation.test.ts`
hand-builds a flat-shaped consolidation blob — none of them reflect
the analyzer-keyed shape the consolidator actually emits.** That's
a test-design failure on my part.

`phase3/helpers/trim-synthesis-input.ts` has the **same** path bug
(`build_tools: pickFirst(findings.build_tools, root.build_tools)`)
but it predates Plan 15. It's been silently broken; the closed-book
synthesizer was reading the analyzer JSONs through its tool calls
instead of relying on the trimmed `summary.build_tools`. Plan 15
commits 3+ tied the synthesizer's `Essential Commands` rendering to
the catalog, which collapsed when the catalog was empty.

### A.2 — `(no commands discovered)` placeholder visible

`gira/.claude/CLAUDE.md`:

```md
## Essential Commands

| Command | Description |
|---|---|
| (no commands discovered) | (run analyzers manually to verify) |
```

The synthesizer faithfully followed Plan 15 §D.5's rendering rule:
"if `command_catalog` is empty, output a placeholder row." Combined
with the bug in A.1, every run now shows this. **Plan 15 commit 4
introduced this user-facing failure mode.**

### A.3 — service IDs from graph community names

`gira/.claude/framework-config.json::stack_profile.services[]`:

```jsonc
{ "id": "src-app",         "path": "services/backend",       ... }
{ "id": "chat-handle",     "path": "services/web-frontend",  ... }
{ "id": "scripts-upsert",  "path": "seeds/scripts",          ... }
{ "id": "base-aggregation","path": "packages/shared",        ... }
{ "id": "keycloak",        "path": "services/keycloak",      ... }
```

Four of five IDs are graph community names (the structure analyzer
called `mcp__code_graph__get_community_tool` and adopted the
returned community ID verbatim). Only `keycloak` happens to match
the folder basename.

This is **NOT** a Plan-15 regression directly — the graph-first
directive in `structure-analyzer/prompts/agent.md` predates plan
15. But it's been quietly producing community-shaped IDs and we
only notice now because every other piece of generated content is
broken too. The community IDs are also keys into
`build_tools.<id>` and other downstream maps, so they corrupt
*every* downstream consumer.

### A.4 — infrastructure as category names

`gira/.claude/framework-config.json::stack_profile.infrastructure`:

```jsonc
"infrastructure": ["containerization", "orchestration"]
```

Pre-plan-15 runs reported `["docker", "docker-compose", ...]` —
concrete technology names. The tech-stack analyzer now emits
abstract categories. This **is** a regression but not from Plan
15; the tech-stack analyzer prompt was modified by other recent
changes (probably plan 14's needs_verification quality-hardening,
which made the agent more conservative about asserting concrete
facts and pushed it toward category-level abstraction).

### A.5 — structure analyzer ignores Plan 15 automation prompt

`gira/.claude-temp/initialize-project/phase1-outputs/01-structure-architecture.json`:

```jsonc
findings: {
  services: [ ... 5 services ... ],
  // automation: ABSENT
  // readme_run_sections: ABSENT
  ...
}
```

I told the agent (in Plan 15 commit 2) to populate
`findings.automation` (Make/Just/Task targets, scripts,
devcontainer, CI hints) AND `findings.readme_run_sections`
(verbatim README "Getting Started" extracts). The agent emitted
neither. `gira/Makefile` has 14 documented targets with
`## @group description` comments — the canonical example of what
the prompt asked for. The agent skipped it entirely.

Likely root causes (all of them probably contribute):

- The Plan 15 prompt rewrite is too long and dense; the agent's
  attention budget is saturated by the existing graph-first
  discovery + service inventory. Automation gets dropped.
- The schema marks `automation` and `readme_run_sections` as
  optional. Absence is silently valid. There is no Stop-hook
  validator that fails when the project root contains a `Makefile`
  but the analyzer emitted no targets — I deferred that validator
  in Plan 15 commit 2 ("defer to commit 3") and then never wrote
  it.
- The prompt's "Glob/Read are fallback ONLY" section restricts
  file reads to a narrow list. Automation discovery is in that
  list nominally, but the language is hedged. The agent reads
  the directive as "stay on the graph; use files only for the
  five named exceptions."

So the agent did exactly what I told it: stayed graph-first,
skipped the automation files. The prompt promised file-reading
behavior the surrounding directives discouraged.

---

## B. Stack-agnosticism contract (load-bearing)

Every fix below MUST work on:

- gira (pnpm monorepo + Makefile + docker-compose + Keycloak)
- a serverless repo (multiple Lambda functions in different
  languages, no Makefile, no docker-compose)
- a single-service Python repo (only `pyproject.toml`)
- a multi-repo sibling-clone target (each repo is independent)
- a legacy PHP project (only `composer.json`)
- a polyglot repo (Go + Python + TypeScript with no shared
  wrapper)

In particular: **never assume `docker-compose` exists, never assume
`pnpm` is the manager, never assume `Makefile` is the wrapper.**
The fixes must surface exactly what's there, not a normalised
fiction.

---

## C. Fixes — surgical, in dependency order

### C.1. Fix the catalog navigation (highest-impact bug)

**File:** `orchestration/src/nodes/initialize-project/phase3/helpers/build-catalog-from-consolidation.ts`

Replace the flat-`findings` lookup with an analyzer-keyed walk.
The consolidation shape is:

```ts
{
  consolidated_findings: {
    "<analyzer-slug>": {
      agent_name: string,
      findings: { ... per-analyzer findings ... },
    },
    // ... one entry per analyzer
  }
}
```

The fix:

1. Iterate every value of `consolidated_findings`. For each
   analyzer's `findings` slice, attempt to extract the four data
   sources (automation, readme_run_sections, build_tools,
   documented_commands, monorepo, databases). Merge across
   analyzers — last-write-wins is fine because in practice each
   field lives in exactly one analyzer.
2. Provide a defensive fallback: if `consolidated_findings` is
   FLAT (some legacy callers / tests pass that shape), the walker
   should also probe `consolidated_findings.automation` etc. — so
   pre-existing fixtures stay green.
3. Same change in `trim-synthesis-input.ts` so
   `summary.build_tools` actually carries the per-service
   commands.

**Risk:** low. Pure-function refactor with extensive unit tests.

### C.2. Add an analyzer-keyed fixture to the catalog tests

**File:** `orchestration/test/unit/nodes/initialize-project/phase3/build-catalog-from-consolidation.test.ts`

Add a `describe('analyzer-keyed consolidation shape')` block that
mirrors the actual `phase2-consolidation.json` shape: a
`consolidated_findings` map keyed by `01-structure-architecture` /
`02-tech-stack-dependencies` / etc., each with their own
`findings` sub-object. Assert that the catalog builder extracts
automation, readme_run_sections, build_tools, monorepo
build_all/test_all, and database migration_commands correctly
from this shape. **This is the test we should have shipped with
commit 3/5; without it, the path bug was guaranteed.**

### C.3. Make the structure analyzer actually populate `automation`

**File:** `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md`

Today's prompt is too long and self-contradictory ("graph-first" +
"file-reading is fallback" + "you MUST extract Makefile targets").
Slim and resolve the conflict:

1. Promote automation discovery to a FIRST-CLASS file-reading
   task, NOT a fallback. The graph cannot help with Makefile /
   Justfile / Taskfile / scripts content; the agent must read
   them. Add an explicit "Required file reads (mandatory; not
   fallbacks)" section listing them.
2. Trim the cross-language list (keep ~7 concrete examples; refer
   to a smaller appendix for the rest). Long lists hurt agent
   attention more than they help.
3. Add a self-check: "Before emitting JSON, verify: did you list
   every Makefile / Justfile / Taskfile target with a description?
   Did you populate `readme_run_sections` for every matched
   heading? If not, do it now."

### C.4. Hard Stop-hook validator: Makefile present → automation populated

**Files (new):**
- `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/hooks/validate-automation-discovery.ts`
- Wire into the existing Phase 1 Stop hook for the structure analyzer.

The hook checks the project filesystem (which it already has
access to via `cwd`) for the canonical wrapper files at the repo
root: `Makefile`, `GNUmakefile`, `Justfile`, `Taskfile.yml`,
`scripts/setup`, `bin/setup`. For every file that EXISTS but is
NOT represented in `findings.automation` (an empty list or absent
field), the hook emits a hard error with file paths and instructs
the agent to re-read and emit the targets. This is the validator
I promised in Plan 15 commit 2 §F step 3 and never wrote.

### C.5. Service IDs from folder basename (deterministic post-process)

**File:** `orchestration/src/nodes/initialize-project/phase4/helpers/service-extractor.ts`

The agent's chosen `id` is unreliable (community names, anything
the LLM picks). The downstream consumers — build_tools keys, wiki
service pages, generated agents — depend on stable, predictable
IDs.

Fix at the orchestration boundary, not just in the prompt:

1. After Phase 1 returns, normalise every service's `id` to
   `slugify(basename(path))`. So `path: services/backend` →
   `id: backend`. Where the agent emitted `id: src-app`, override.
2. Build a `legacy_id → canonical_id` map so we can rewrite the
   keys in `build_tools`, `testing.<id>`, `dependencies.by_service`,
   `databases` etc. before they reach Phase 3.
3. The structure analyzer prompt also gets a one-line update:
   "`id` MUST be the basename of `path`. Do NOT use graph
   community names or any other derived identifier."

Two-layer defense: the prompt steers the agent, the post-process
guarantees correctness even when the agent disobeys.

**Risk:** medium. Affects keying across multiple analyzer outputs;
needs a comprehensive test that the rewrite covers every map.

### C.6. Infrastructure: technology names, not categories

**Files:**
- `orchestration/src/nodes/initialize-project/phase4/helpers/infrastructure-extractor.ts`
- `orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/prompts/execution-instructions.md`

Two-layer fix:

1. **Prompt** — add a sentence in the tech-stack analyzer's
   infrastructure step: "Emit concrete technology names
   (`docker`, `docker-compose`, `kubernetes`, `terraform`,
   `pulumi`, `nginx`, …). Do NOT emit category abstractions
   (`containerization`, `orchestration`, `infrastructure-as-code`)
   — those are categories of technologies, not technologies."
2. **Normalizer** — extend `infrastructure-extractor.ts` to
   reject category-shaped strings and substitute concrete tech
   names when evidence exists in the project (e.g. presence of
   `docker-compose.yml` triggers `docker-compose`; presence of
   `Dockerfile` triggers `docker`; presence of `.k8s/` or
   `*.yaml` with `kind:` triggers `kubernetes`). When no evidence
   exists, drop the entry rather than emit a category abstraction.

### C.7. Empty-placeholder rule: only when truly empty

**File:** `orchestration/src/nodes/initialize-project/phase3/prompts/synthesis-instructions.md`

The placeholder I added in Plan 15 commit 4 is correct in
principle (a project with no automation, no scripts, no README
should be flagged) but in practice we trip it whenever the
catalog builder bug fires. After C.1 it'll only trigger on truly
empty catalogs. Keep the placeholder rule but tighten the
condition: emit it ONLY when `command_catalog` is empty AND
`summary.build_tools` is also empty AND no `monorepo.test_all_command`
exists. Belt-and-suspenders: even with C.1 fixed, the synthesizer
has multiple data paths to surface commands, so the placeholder
fires only when nothing is available anywhere.

### C.8. Synthesis-instructions tier-prompt simplification

**File:** `orchestration/src/nodes/initialize-project/phase3/prompts/synthesis-instructions.md`

The current "Essential Commands rendering rule" section (added in
Plan 15 commit 3) is dense and references `command_catalog` as a
black box. Add ONE worked example showing what the synthesizer
should produce for a gira-shape catalog (Make wrapper + per-service
pnpm fallbacks). Examples are stickier than rules.

### C.9. Visibility: log catalog stats at Phase 4 build time

**File:** `orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`

After `buildCatalogFromConsolidation`, log:

```
catalog stats: 8 entries across 5 operations (3 wrapper, 0 readme, 5 package_manager, 0 ci)
```

If C.1 had been instrumented like this from day one, the bug
would have been caught the first time someone ran the framework.
Stack-agnostic; pure observability.

---

## D. Tests

### D.1. New: analyzer-keyed consolidation fixture

`build-catalog-from-consolidation.test.ts` gains a fixture that
mirrors the real `phase2-consolidation.json` shape end-to-end.
Asserts every per-tier extraction works against the analyzer-keyed
shape. **This test must fail today and pass after C.1.**

### D.2. New: gira-shape integration smoke test

`test/unit/nodes/initialize-project/command-catalog-pipeline.test.ts`
gains a `describe('analyzer-keyed gira-shape')` block: builds a
fixture mimicking gira's actual consolidation (Makefile targets in
`01-structure-architecture`, `build_tools.<svc>` in
`02-tech-stack-dependencies`, monorepo in same), runs the chain
end-to-end, asserts:

- `command_catalog.run_tests` first entry is wrapper-tier
  `make tests`.
- `command_catalog.setup` first entry is wrapper-tier `make setup`
  with the verbatim Makefile description.
- Per-service entries appear in the package_manager tier with
  per_service fields populated.

### D.3. Service-id normalisation tests

`test/unit/nodes/initialize-project/phase4/service-id-normalisation.test.ts`:

- Agent emits `id: "src-app"` with `path: "services/backend"` →
  normalised to `id: "backend"`.
- Downstream `build_tools.src-app.lint_command` is rekeyed to
  `build_tools.backend.lint_command`.
- Multi-repo / no-folder fixture (path equals service name) → no
  change.

### D.4. Infrastructure normaliser tests

`test/unit/nodes/initialize-project/phase4/infrastructure-extractor.test.ts`:

- Analyzer emits `["containerization"]`; project has
  `docker-compose.yml` → output `["docker-compose"]`.
- Analyzer emits `["containerization", "docker"]` → output
  `["docker"]` (category dropped, technology kept).
- Analyzer emits `["docker", "docker-compose", "kubernetes"]`
  with no project evidence for kubernetes → output
  `["docker", "docker-compose"]`.

### D.5. Hard-validator tests

`test/unit/nodes/initialize-project/phase1/structure-analyzer/validate-automation-discovery.test.ts`:

- Project root has `Makefile`, analyzer emitted no automation →
  validator fails with retry feedback naming `Makefile`.
- Project root has nothing → validator passes.
- Analyzer populated automation correctly → validator passes.

### D.6. Update existing fixtures that depend on flat shape

The Plan-15 fixtures use flat shape directly (legacy fallback).
After C.1's defensive fallback, they continue to pass — verify.

---

## E. Rollout

| Step | Description | Risk | Commit |
|------|-------------|------|--------|
| 1 | C.1 (catalog navigation) + C.2 (analyzer-keyed test) + C.9 (logging). | low | commit 1/3 |
| 2 | C.3 + C.4 (structure-analyzer prompt + hard validator). | medium | commit 2/3 |
| 3 | C.5 (service-id normalisation) + C.6 (infrastructure normaliser) + C.7 + C.8. Plus D.3 / D.4. | medium | commit 3/3 |

Each commit passes typecheck + lint + format + the unit suite.
Total ≤3 commits — small enough to bisect / revert if anything
goes sideways on the next gira run.

---

## F. Acceptance criteria

After this lands, a fresh `/initialize-project` run on gira must
produce:

**`framework-config.json`:**

- [ ] `stack_profile.services[].id` values are `backend`,
      `web-frontend`, `keycloak`, `scripts`, `shared` (folder
      basenames) — NOT `src-app`, `chat-handle`, etc.
- [ ] `stack_profile.infrastructure` includes `docker` and
      `docker-compose` (concrete tech) — NOT `containerization`,
      `orchestration`.
- [ ] `stack_profile.command_catalog` is non-empty. Specifically:
  - `command_catalog.setup[0]` = `{ tier: "wrapper", command: "make setup", description: "Full dev environment setup …" }`
  - `command_catalog.run_tests[0]` = `{ tier: "wrapper", command: "make tests", … }`
  - `command_catalog.run_lint[0]` is package_manager-tier
    `pnpm --filter backend lint` or similar (lint has no Make
    target in gira).
- [ ] `stack_profile.automation.makefiles[0].targets` lists every
      documented Make target with its description verbatim.
- [ ] `stack_profile.readme_run_sections` is populated.

**`CLAUDE.md` Essential Commands:**

- [ ] `make setup` / `make tests` / `make launch` / etc. surface
      first.
- [ ] `pnpm --filter backend test` / etc. appear in the
      "Per-service commands (low-level)" subtable with the warning
      sentence.
- [ ] No "(no commands discovered)" placeholder.

**`docs/llm-wiki/wiki/getting-started.md`:**

- [ ] Wrapper table populated.
- [ ] Per-service subtable populated.
- [ ] README "Getting Started" extract reproduced verbatim under a
      blockquote with attribution.

**Stack-agnostic regression:**

- [ ] A bare-pnpm fixture (no Makefile, no README setup section)
      still produces a working CLAUDE.md with `pnpm` commands and
      no false placeholder.
- [ ] A python-poetry fixture still works with poetry-tier rows.
- [ ] A multi-repo sibling-clones fixture still produces
      independent per-repo catalogs.

**Stop hook:**

- [ ] If a project has `Makefile` at root and the analyzer emits no
      `automation.makefiles[]`, the structure-analyzer Stop hook
      blocks the run with retry feedback.

---

## G. Risk assessment

The catalog navigation fix (C.1) is the load-bearing change. It
has unit-test coverage from D.1 and an integration assertion from
D.2; the legacy fallback in C.1's implementation keeps the
existing flat-shape fixtures green. Service-id normalisation (C.5)
is the second-riskiest because it touches keying across multiple
analyzer outputs — D.3's coverage is critical. Infrastructure
normaliser (C.6) is contained and well-bounded.

Everything else (prompt edits, log lines, placeholder
tightening) is low-risk prose / observability. Each commit passes
gates before the next is staged.

---

## H. Open question for confirmation

I'd like to also add a **catalog-emptiness Stop hook at the
Phase 4 boundary** that fails the run when `command_catalog` is
empty AND the project has any of {`Makefile`, `package.json`,
`pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `Gemfile`}.
This converts the silent failure into a loud one. **Confirm if
you want this — it's stricter than what's strictly needed to fix
the gira regression, but it would have caught the bug on the
first gira run after Plan 15 landed.**

---

**Awaiting your confirmation or change requests before I touch
any code.**
