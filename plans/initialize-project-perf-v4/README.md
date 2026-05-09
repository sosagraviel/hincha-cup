# `initialize-project` performance plan v4 — clean restart with all the lessons learned

> **Status:** PROPOSAL. Replaces v1 / v2 / v3 — none of them shipped a measured improvement. v4 starts from the pushed baseline and adds one bounded, measured change at a time, keeping the philosophy ("smarter analyzers, simpler synthesizer") that was right while abandoning the implementations that backfired.

---

## 0. What we know after 100 iterations

### 0.1 The hypothesis was right; the implementation was wrong

> "Analyzers should produce richer, more structured output so the synthesizer can compose deterministically and Phase 4 / Phase 5 / future workflows get a richer `framework-config.json`."

That is still the right north star. v3 §B.3 implemented it as **one heavyweight analyzer doing 5 sub-objects × N services × per-snippet provenance in a single agent session**. On a 5-service project, that produced 17 KB of JSON in 1092 s — a 13× output growth and 7× wall-clock regression vs. the pushed baseline (1 KB / 155 s).

The fix is **distribution, not retreat**: keep the rich output, but produce it via N parallel per-service sub-agents (orchestrator-workers pattern; Anthropic's _Building Effective Agents_, December 2024). Phase 4's wiki-generator already uses this pattern successfully (per-service docs in parallel: 49 s – 133 s each).

### 0.2 What every prior plan got right (do not throw away)

- **Phase 0 graph + project-inspection** (v3 §A): deterministic, stack-agnostic-by-enumeration, no perf regression.
- **Disk-first idempotency**: every phase persists output to `.claude-temp/` before returning state.
- **Composer views shape** (v3 §D.4): one input view per output section, with `present.*` flags so the synthesizer skips empty sections instead of fabricating. Schema is sound.
- **Synthesizer-as-composer** (v3 §D.1): the prompt becomes a recipe over pre-flattened views. Drops Phase 3 from 405 s to ≤ 290 s on the most recent run.
- **Free-form `strategy` / `library` / `pattern` / `kind` / `layer` strings** (v3 §B): lets a Go project emit `error-return-with-fmt-errorf`, an Erlang project emit `actor-mailbox`, a Rust project emit `result-propagation-via-?-operator`. No closed enums on stack-specific values. Keep this design.
- **Lookup tables for stack-specific decisions**: lock-file-table (21 entries), manifest-parser-table (24 entries), runtime-version-table (16 entries), CI-provider-table (13 entries), infrastructure-table (16 entries). Adding a stack is a one-row append. Keep this design.

### 0.3 What every prior plan got wrong (drop or restructure)

- **v3 §B.3 monolithic per-service work in a single analyzer session** — caused the 7× regression. **Restructure** into Phase 1.5 fan-out.
- **v2 cookbook in cache prefix** — pushed the prefix above Opus 4.7's 4096-token cache minimum but didn't help wall-clock; v3 §F.1 already moved it to a Read-on-demand resource. Keep that move.
- **Hardcoded role-name redirects in PreToolUse hooks** — stack-bias killed it. Hook scope stays SAFETY only (path exclusion, MCP overflow). Discipline lives in the prompt + Stop hook.
- **Closed enums on free-form fields** — never. Always `z.string()` for `strategy` / `pattern` / `library` / `role` / `layer` / `kind`.

### 0.4 Confirmed bugs that must land regardless

These are not optimisations; they are functional bugs the framework must fix:

1. **Synthesizer `permissions.deny` shadows `permissions.allow`** (`cli-agent-impl.ts:264`). `buildClaudeDenyRules()` does not honour `excludedDirsOverride`, so the synthesizer's reads to `<tempDir>/composer-views/` are silently denied. **Fix:** thread the override through. (Already prototyped as FIX 1 in iteration 99; ~ 10 lines.)
2. **Dialect tokens leak into `Languages:` rendering** (`tsx`/`bash`/`mts`). `extractLanguagesFromPhase1` and the Phase 3 deterministic CLAUDE.md renderer don't pass values through `normalizeLanguage` before deduping. **Fix:** apply `normalizeLanguage` at every entry point. (Already merged as commit `5749184`; preserve.)
3. **`LANGUAGE_EXTENSIONS` missing canonical languages** (no `shell`, `sql`, `dart`, `lua`, `r`, `julia`, `perl`, `powershell`, `html`, `css`, `fsharp`, `vbnet`, `objectivec`, `erlang`). Single-`.sh` / single-`.sql` files trip the "no files found" warning. (Already merged as commit `5749184`; preserve.)
4. **Validator can't tell "no source" from "only tooling-config files"** (`stack-profile-validator.ts`). The file-counter tracks `tooling_config_counts` separately but the validator's type was missing the field. **Fix:** add field to type, validator differentiates. (Already merged as commit `5749184`; preserve.)

### 0.5 Stack / structure / naming agnostic — the constants

These are non-negotiable; every change in v4 is checked against them.

- **Stack-agnostic**: never hardcode language names or framework names in semantic logic. Use lookup tables (one-row append to extend) or free-form analyzer-emitted strings. Examples in prompts are illustrative, not exhaustive.
- **Structure-agnostic**: never assume `src/`, `apps/`, `services/`, `packages/`, `backend/`, `frontend/` directory shapes. Use the structure-analyzer's discovered `services[]` (already universal).
- **Naming-agnostic**: never pattern-match on `Controller` / `Service` / `Repository` / `*_test.go` / `*.spec.ts` style class or filename suffixes. Use the graph (which knows the project's actual names) or analyzer-emitted patterns.

---

## 1. The migration: commit + backup + reset

The current branch (`feat/improve-wiki-to-follow-llm-wiki-principles`) has 35 unpushed commits stacked from v1 → v2 → v3 → FIX 1-5. None measured better than the pushed baseline. We restart from the pushed state, but lose nothing: every unpushed commit is preserved on an archive branch + tag, fully recoverable.

### 1.1 Steps

```bash
# 1. Commit any work-in-progress (currently the v4 plan file itself).
#    Result: a clean working tree on the v3-stacked branch.
git add plans/initialize-project-perf-v4/README.md
git commit -m "docs(plan-v4): proposal — clean restart with lessons learned"

# 2. Archive the entire current branch state.
#    Three protections so the work is recoverable from anywhere:
#    a) A named branch that NEVER moves: archive/v3-iteration-100
#    b) A lightweight tag at the same commit: archive-v3-iteration-100
#    c) Push BOTH to origin so the work survives a local-disk loss.
git branch archive/v3-iteration-100 HEAD
git tag archive-v3-iteration-100 HEAD
git push origin archive/v3-iteration-100
git push origin archive-v3-iteration-100

# 3. Hard reset the working branch to the pushed baseline.
#    The working tree matches origin/feat/improve-wiki-to-follow-llm-wiki-principles
#    bit-for-bit.
git reset --hard origin/feat/improve-wiki-to-follow-llm-wiki-principles

# 4. Re-introduce the v4 plan file (cherry-picked off the archive).
git checkout archive/v3-iteration-100 -- plans/initialize-project-perf-v4/
git add plans/initialize-project-perf-v4/
git commit -m "docs(plan-v4): proposal — clean restart with lessons learned"
```

### 1.2 Recovery

If at any point we want to see / cherry-pick / revisit anything from the v3 stack:

```bash
git log archive/v3-iteration-100 --oneline       # browse all 35 commits
git show archive-v3-iteration-100:<path>         # read any file at HEAD of archive
git cherry-pick <sha-from-archive>               # bring one commit forward
```

### 1.3 What's preserved

- All v1 / v2 / v3 commit history with messages, rationale, and code.
- All schema files (composer-views, phase1-base, phase1-agent-outputs additions).
- All v3 §A project-inspection helper.
- All FIX 1-5 patches.
- The four READMEs under `plans/initialize-project-perf-{v2,v3,performance,synthesizer-improvement,v4}/` are public history.

### 1.4 What's discarded from `main` working state

The 35 commits between `origin/feat/improve-wiki-to-follow-llm-wiki-principles` and the archive tag, all of which are recoverable as above. Nothing else.

---

## 2. v0 baseline measurement (before any change)

Run `initialize-project` on gira from the reset state. Record per-phase wall-clock + key counts. This is the **real** "before" — the user's recollection that "it was working better" anchors here. Every subsequent change is judged against these numbers.

### 2.1 Required artefacts

- `phase0.metrics.json` — graph build, MCP tools available, prefetch outcome.
- `phase1.metrics.json` — per-analyzer wall-clock + soft warnings + tool counts.
- `phase2.metrics.json` — gaps, conflicts, consolidation path.
- `phase3.metrics.json` — synthesizer wall-clock + output bytes.
- `phase4.metrics.json` — services extracted, infra detected, bytes.
- `phase6.metrics.json` — validation errors / warnings.
- `run-summary.json` — total wall-clock + aggregates.

### 2.2 Acceptance for v4 going forward

Every phase below specifies a numeric guardrail vs. v0 baseline. A change that fails its guardrail is reverted, not "iterated on".

---

## 3. The phases (each independent, each measurable, each one PR)

> Each phase is one PR. Each PR includes: code change + unit tests + one explicit measurement against v0 baseline + commit-message footer with the measured numbers (Plan v3 §E.3 process commitment, kept). No "Phase B implements §B.1, §B.2, §B.3" omnibus PRs — those are how Plan v3 ended up with a +822 s regression nobody noticed mid-flight.

### Phase A — Functional bug fixes (no perf hypothesis)

**Goal:** unblock the synthesizer + correct false stack data. NOT a perf optimisation; just bugs.

**A.1 Synthesizer deny-rule override** (`cli-agent-impl.ts` + `excluded-paths.ts`)
- Thread `excludedDirsOverride` through `buildClaudeDenyRules()`.
- Test: assert resolved settings.json deny list excludes `.claude-temp/**` when override is set.
- Acceptance: re-run gira, Phase 3 reads composer views successfully (no `denied by your permission settings` errors in synthesizer transcript).

**A.2 Dialect normalisation** (cherry-pick commit `5749184`)
- `language-extractor.ts`, `language-validator.ts`, `extract-render-input.ts`, `build-composer-views.ts::collectPrimaryLanguages`, `stack-profile-validator.ts` — all run language tokens through `normalizeLanguage`.
- `LANGUAGE_EXTENSIONS` extended with `shell`, `sql`, `dart`, `lua`, `r`, `julia`, `perl`, `powershell`, `html`, `css`, `fsharp`, `vbnet`, `objectivec`, `erlang`.
- `FileCountResult.tooling_config_counts` typed; validator differentiates "no source" vs "only tooling configs".
- Test: regression coverage of `tsx → typescript`, `bash → shell`, `1 .sh → shell counted`, `JS-config-only → info not warn`.
- Acceptance: re-run gira, no `Languages: typescript, tsx, bash, …` in output, no spurious `no files found` warnings.

**Combined acceptance for Phase A**: total wall-clock not worse than v0 baseline ± 5 %. (Bug fixes; no expected speedup.)

---

### Phase B — Phase 0 project-inspection helper (cherry-pick from v3 §A)

**Goal:** deterministic pre-extraction of manifests / lock files / runtime versions / CI / infra / env templates. Cuts redundant filesystem walking across all four analyzers.

**Scope:**
- `services/framework/project-inspection/` — three lookup tables + main inspector + `<tempDir>/project-inspection.json` write at Phase 0.
- Stack-agnostic by enumeration; ~ 0.5 s overhead at Phase 0.
- Per-analyzer prompt update: each prompt's "Step 0" reads `inspection.<field>` instead of globbing.

**Acceptance:** Phase 1 max wall-clock drops by ≥ 30 % vs. v0 baseline on gira, OR the change is reverted. The prompt update must include a hard glob-ban table mapping forbidden Glob patterns to the inspection field that already covers them (Plan v3 §C.3 + FIX 4 form).

**Stack-agnostic guardrail:** every glob pattern in the analyzer's "you must NOT Glob" list maps to a structural file shape (`**/Dockerfile*`, `**/.env*`), not a language-specific role name. Naming-agnostic by construction.

**Tests added in this phase:**
- `inspector.service.test.ts` — 13 cases covering 9 distinct project shapes (TS pnpm monorepo, Python single-service, Go, PHP, Rust workspace, empty repo, GitHub Actions, GitLab CI, exotic Crystal/Gleam).
- `redundant-glob-detector.test.ts` — counts the analyzer's globs in the transcript; surfaces `tech_stack_inspection_redundant_glob` soft warning when forbidden patterns appear (FIX 4 idea, with a ratchet — each subsequent run must not increase the count).

---

### Phase C — Phase 1 keeps light: schema additions ONLY (no per-service rich fields yet)

**Goal:** add the structured analyzer-output fields the synthesizer needs to compose, BUT only the cheap project-level ones. No per-service `code_patterns` map, no per-snippet provenance, no `representative_examples`. Phase 1's contract growth is the regression source — keep it bounded.

**Scope:**
- `phase1-base.schema.ts` — shared base + `buildPhase1AnalyzerSchema(name, findings)` factory + `CodeSnippetSchema` + `NeedsVerificationEntrySchema`. ~ 80 lines of duplication removed across analyzers.
- Structure analyzer: + `repository_shape_summary` (≤ 600 chars, ONE paragraph) + `architecture_decisions[]` (≤ 8 entries, project-level only). NO per-service `architecture_decisions[]` yet.
- Tech-stack analyzer: + `runtime_versions{}` (verbatim from inspection) + `external_services[]` with optional `sample_usage_quote`. Per-service `notable[]` deferred to Phase D.
- Code-patterns analyzer: + `quality_tools.enforcement_summary` (project-level, ≤ 600 chars). NO per-service `code_patterns` map yet (deferred to Phase D fan-out).
- Data-flows analyzer: + `event_pipeline?` and `auth_flow?` (project-level, single object each). NO per-service `request_lifecycle` map yet (deferred to Phase D).

**Acceptance:** Phase 1 max wall-clock NOT worse than v0 + Phase A + Phase B by more than 10 %. (Cheap project-level fields cost a small amount of output growth, bounded.)

**Stack-agnostic guardrail:** every new field is a free-form string or a free-form record. The schema-completeness tests exercise Go / Erlang / Haskell-style values to lock in the no-closed-enum design.

---

### Phase D — Per-service detail extraction via parallel sub-agents (the actual win)

**Goal:** the §B.3 "richer per-service contract" but distributed across N parallel orchestrator-workers, not a single serial analyzer. This is the architecture v3 §B.3 should have been.

**Architecture:**

```
Phase 1 finishes (4 base analyzers in parallel — light contract)
  ↓
Phase 1.5 (NEW): orchestrator reads structure-analyzer's services[]
  ↓ spawns N parallel `service-detail-extractor` sub-agents (one per service)
  ↓ each sub-agent has TINY scope:
  ↓   - input: ONE service's slice of structure-analyzer output + project-inspection.json + graph
  ↓   - output: <tempDir>/service-details/<service-id>.json with:
  ↓       - code_patterns: {naming/error_handling/validation/data_layer/gotchas}
  ↓       - testing.<kind>.representative_examples
  ↓       - request_lifecycle (when service.type accepts external input)
  ↓       - notable[] dependencies for THIS service
  ↓ wall-clock = max(per-service-extraction) ≈ 90-150 s
  ↓
Phase 2 (consolidator) merges per-service slices into composer views (unchanged shape)
  ↓
Phase 3 synthesizer (composer over views — Plan v3 §D.1, validated)
```

**Why this works where v3 §B.3 didn't:**
- Single-agent §B.3 work was sequential: 5 services × 5 sub-objects in one session = 17 KB output + 172 messages = 1092 s.
- Per-service sub-agent: 1 service × 5 sub-objects = ~ 3 KB output + ~ 30 messages = ~ 90 s.
- Parallel: 5 sub-agents at once, wall-clock = max ≈ 100 s.
- Net: 1092 s → ~ 100 s. **10× win.**

**Stack-agnostic guardrails:**
- Sub-agent fan-out is dynamic (driven by `services[]` from the structure analyzer). No hardcoded service count.
- Per-service prompt is a TEMPLATE — the same prompt for every service, parameterised by service id + path + language + type. No language-specific branches.
- Soft-warning when `services.length > MAX_PARALLEL_FANOUT` (default 8): sub-agents run in batched waves of MAX_PARALLEL_FANOUT to avoid API rate-limit thrash. The cap is a knob, never a hardcoded service count.
- Per-service prompt's "snippet selection" instruction reuses Plan v3 §C.2 wording: "select 1 representative member per pattern, quote ≤ 30 lines"; the analyzer chooses snippets via the graph (which knows the project's actual names), never via hardcoded role lists.

**Hooks for resilience:**
- Per-sub-agent Stop hook: validates the per-service slice schema (`ServiceDetailSlice`) BEFORE writing to disk. Bad slice → in-session feedback, not external retry.
- Sub-agent timeout: 5 min per sub-agent. Exceeding → soft warning + empty slice (composer view marks `present.<field>: false` for that service; synthesizer skips).
- Idempotency: each sub-agent writes `<tempDir>/service-details/<service-id>.json`. Re-runs check disk first.

**Acceptance:**
- Phase 1 + Phase 1.5 combined max wall-clock ≤ Phase 1 v0 baseline × 1.2 (i.e. ≤ 20 % worse than the lightest baseline; the §B.3 fields are added back at this small cost).
- Composer views populate non-trivially: at least 50 % of services have non-empty `code_patterns` AND `testing.representative_examples`.
- Synthesizer gets enough data to compose without needing fallbacks.

**Tests:**
- `phase1.5/service-detail-extractor.test.ts` — schema, prompt rendering, parallel orchestration, batched waves, timeout handling, idempotency.
- Integration test: simulate a 12-service monorepo, assert wall-clock = max(per-sub-agent), not sum.

---

### Phase E — Phase 2 composer views over per-service slices (cherry-pick v3 §D.4)

**Goal:** consolidator merges Phase 1 + Phase 1.5 outputs into 4 pre-flattened composer views the synthesizer reads.

**Scope:**
- `phase2/.../helpers/build-composer-views.ts` — reads structure / tech-stack / code-patterns / data-flows analyzer outputs (Phase 1) + per-service slices (Phase 1.5) and produces:
  - `code-conventions.input.json`
  - `multi-file-workflows.input.json`
  - `testing-conventions.input.json`
  - `architecture-narrative.input.json`
- Schemas in `schemas/composer-views.schema.ts` — strict shape, all leaf fields free-form strings.
- `present.*` flags so the synthesizer knows which sections to emit / skip.

**Acceptance:** every composer view validates against its Zod schema on the gira run. No section is empty unless the underlying analyzer + sub-agent output was empty for it.

**Stack-agnostic guardrail:** the merge logic uses universal structural categorisation (`service.type` ∈ 9 values) — never matches on service names or framework strings. Free-form `strategy` / `pattern` / `library` strings flow through verbatim.

---

### Phase F — Synthesizer composer + path-restriction hook (cherry-pick v3 §D.1 + §D.2)

**Goal:** the synthesizer reads ONE composer view per output section and composes deterministically. Forbidden from walking the project source tree (the analyzers + Phase 1.5 already did that).

**Scope:**
- `phase3/prompts/synthesis-instructions.md` — composition recipe, table mapping `present.<flag>` → H2 to emit.
- `phase3/hooks/restrict-synthesizer-reads.hook.ts` — PreToolUse hook rejects any Read outside `<tempDir>/`, rejects Glob/Bash/Write/Edit/MultiEdit/LS/NotebookEdit. Research surface: Read (under `<tempDir>/`) + Grep only.
- `phase3/validators/index.ts` — Stop hook adds two detectors:
  1. `detectInputUnavailableStub` — rejects "data unavailable" markers (5 phrase variants).
  2. `detectNonPortableAbsolutePath` — rejects `/Users/<name>/...` and `/home/<name>/...` paths in body. Whitelists `<tempDir>/...`, `/tmp/`, `/usr/`, `/opt/`.

**Path-shape rule for the prompt body:** project-relative paths only, `<tempDir>/...` placeholder allowed, system paths allowed, user-home absolute paths forbidden. Stack/structure-agnostic — the rule shape doesn't assume any project layout.

**Acceptance:** Phase 3 wall-clock ≤ 60 s on gira (Plan v3 §D.1 target). Synthesizer output passes all four section validators (line bounds, frontmatter, fenced code).

---

### Phase G — Stronger hooks with better feedback (the "hooks should be smarter" piece)

**Goal:** every soft warning surfaces in the run report. Stop hooks reject the right failures with actionable feedback. PreToolUse hooks remain SAFETY-only (no naming-convention enforcement).

**Scope:**
- `phase1/shared/graph-tool-usage.ts::computeSoftWarnings` — keep the existing list (`low_graph_ratio`, `tool_call_budget_exceeded`, `per_tool_budget_exceeded`, `graph_overflow_count`).
- ADD detectors for the regression classes we hit:
  - `mcp_completely_unavailable` — agent attempted ≥ 1 MCP tool, ALL failed → surface loud.
  - `inspection_redundant_glob` — analyzer globbed a path Phase 0's inspection already covered (FIX 4 idea, ratchet against v0).
  - `service_detail_slice_timeout` — Phase 1.5 sub-agent timed out (only fires when applicable).
  - `composer_view_empty_section_count` — count of `present.*: false` flags across all views (operator visibility, never blocking).
- Per-analyzer Stop hook: validates output against its Zod schema; bad output → in-session feedback message naming the failing field. NO retry (`code_patterns_silent_skip` from FIX 3 was a soft-warning-only because re-running the same prompt usually hits the same budget exhaustion; that lesson holds).
- Phase 1.5 sub-agent Stop hook: validates per-service slice schema; failures land in-session.
- Phase 3 synthesizer Stop hook: see Phase F.

**Stack-agnostic guardrail:** every detector uses shape-level pattern matching (regex on framework-emitted phrases, byte-count comparisons, field-presence checks). Never inspects project naming or language.

**Acceptance:** every soft warning has a corresponding test fixture. The run-summary aggregator surfaces them in `aggregate.soft_warnings_by_phase`.

---

### Phase H — Prompt slim (cut + improve, do not just cut)

**Goal:** every analyzer prompt under 25 KB. Synthesizer prompt under 10 KB. Cookbook stays as Read-on-demand resource (v3 §F.1). The cuts come from removing duplication and over-specification, not from removing the load-bearing rules.

**Scope:**
- Each analyzer's `execution-instructions.md` audited:
  - Step counts trimmed: with Phase B's project-inspection delegation + Phase D's per-service fan-out, many "discovery" steps disappear.
  - Tool-budget reminders kept (load-bearing — measured on the v3 runs to suppress over-tooling).
  - Agent file frontmatter `tools:` — keep `mcp__code_graph` namespace shorthand BUT add the safety check that expands it at spawn time to the live catalog (so a Claude CLI version that doesn't honour the shorthand still works). Stack-agnostic — tool names from the live `tools/list` JSON-RPC, not hardcoded.
- Synthesizer prompt audited:
  - The `present.<flag>` → H2 mapping tables are inlined for prompt-stability. They cost ~ 2 KB but eliminate a Read indirection.
  - Move per-output recipe to a separate file the synthesizer reads on demand (analogue of v3 §F.1 cookbook move).

**Acceptance:**
- Sum of analyzer execution-instructions.md sizes ≤ 75 KB (vs. current 95 KB cap, the v3 ratchet).
- Synthesizer first-attempt prompt ≤ 7 KB (Plan v3 §E.4 target).
- No regression on Phase 1 / Phase 3 wall-clock vs. Phase D / Phase F baseline.

---

### Phase I — Telemetry + run-summary aggregator + acceptance lock

**Goal:** every phase emits structural metrics; the run-summary aggregator surfaces high-signal numbers. Acceptance criteria for each phase are encoded as run-summary thresholds and asserted in CI.

**Scope:**
- Per-phase `phase<N>.metrics.json` already exists. Extend with:
  - Phase 1.5: `service_detail_slice_durations_ms`, `service_detail_slice_failures`, `service_detail_slice_timeouts`.
  - Phase 1: `redundant_globs_count_per_analyzer`, `analyzer_output_bytes`.
  - Phase 3: `synthesizer_reads_total`, `synthesizer_reads_outside_tempdir` (should always be 0 with the hook), `synthesizer_globs` (should always be 0).
- `run-summary.json` aggregator extended with a `regression_guards` block:
  - `phase1_max_wall_clock_ms` (v0 baseline + max acceptable delta per phase).
  - `phase3_wall_clock_ms` (target ≤ 60 s).
  - `total_wall_clock_ms` (target ≤ v0 × 0.85 = 13.3 min on gira if v0 is 15.6 min).
- New `aggregate-metrics` CLI extension: dumps a comparison table of the last N runs so we can see trend.

**Acceptance:** the run-summary table is checked into a `runs/` directory in the repo (gitignored body, manifest committed) so we can diff runs over time.

---

## 4. Sequencing — what ships first

| Order | Phase | One-PR scope | Acceptance vs. v0 |
| --- | --- | --- | --- |
| 1 | Migration §1 | Branch + tag + reset | n/a (mechanical) |
| 2 | v0 measurement §2 | Run gira, record | n/a (data) |
| 3 | Phase A | Functional bugs | total wall-clock ± 5 % |
| 4 | Phase B | Phase 0 inspection | Phase 1 max −30 % |
| 5 | Phase C | Schema additions (cheap fields only) | Phase 1 max +10 % |
| 6 | Phase D | Per-service fan-out (the win) | Phase 1+1.5 max ≤ baseline × 1.2 |
| 7 | Phase E | Composer views | views populate non-trivially |
| 8 | Phase F | Synthesizer composer + hooks | Phase 3 ≤ 60 s |
| 9 | Phase G | Stronger hooks | every soft warning lit when applicable |
| 10 | Phase H | Prompt slim | analyzer prompts ≤ 75 KB total |
| 11 | Phase I | Telemetry + lock | run-summary regression-guards in place |

Each phase = 1 PR with measured acceptance footer. **No omnibus PRs.** No "phase B + phase C in one commit because they're related". That's how we got here.

---

## 5. Stack / structure / naming agnostic — the audit checklist

Every PR checks against this list before merge:

- [ ] No `if (lang === '<some-lang>')` checks in semantic logic.
- [ ] No hardcoded folder names (`src/`, `apps/`, `packages/`, `services/`, `backend/`, `frontend/`) — use analyzer-emitted `services[].path` or `services[].type` enum.
- [ ] No hardcoded role-name patterns (`*Controller`, `*Service`, `*Repository`, `*_test.go`, `*.spec.ts`) — use the graph (which knows the project's actual names) or analyzer-emitted patterns.
- [ ] No closed `z.enum()` on free-form fields — `strategy`, `pattern`, `library`, `kind`, `layer`, `role`, `purpose` stay `z.string()`.
- [ ] Lookup tables for stack-specific decisions — adding a stack is a one-row append.
- [ ] PreToolUse hooks scope = SAFETY only (path exclusion, MCP overflow). No semantic enforcement.
- [ ] Prompts use illustrative examples ("e.g. `backend`, `web-frontend`") never authoritative lists.
- [ ] Free-form strings preserve verbatim through the pipeline — no normalisation that could collapse stack-specific values.

---

## 6. Risk register

| Risk | Mitigation |
| --- | --- |
| Per-service fan-out hits API rate limits on huge monorepos (50+ services) | Batch in waves of `MAX_PARALLEL_FANOUT` (default 8). Soft warning when batched. |
| MCP server fails to start in Claude CLI subprocess | Phase 0 already smoke-tests MCP. Add post-Phase-0 assertion that surfaces actionable error if MCP unhealthy. Analyzer prompts handle "graph unavailable" gracefully. |
| Per-service prompt drift (each sub-agent's prompt slightly different) | Single template in `phase1.5/prompts/service-detail-extractor.md`, parameterised at spawn. Schema-completeness test catches drift. |
| Composer view shape changes break the synthesizer prompt | Schema versioning (`schema_version: 1`); synthesizer's prompt asserts version on Read; bumping requires explicit migration. |
| Hooks block legitimate work | Every hook block message includes "if you genuinely need X, do Y". In-session feedback only — never external retry on a content-level rejection. |
| 600+ projects in the wild, each different — what works on gira may regress on a Maven multi-module Java app | Stack-agnostic guardrails (§5) checked per PR. Test fixtures cover 9+ project shapes. New shape regressions tracked via the soft-warning telemetry. |

---

## 7. Open questions for the user before we start

1. **MAX_PARALLEL_FANOUT default:** 8 sub-agents in parallel is conservative for Claude CLI subscription tier. Anthropic API has no hard limit but burns tokens fast. Default to 8, let users override via env var `QAF_MAX_PARALLEL_FANOUT`?

2. **Phase 1.5 timeout per sub-agent:** 5 min default. A pathological project (a service with 5000 source files) might genuinely need longer. Over-cap to 10 min and let soft warning surface late completions?

3. **Phase D acceptance fallback:** if Phase D doesn't hit `Phase 1+1.5 max ≤ baseline × 1.2`, do we revert and ship Plan v4 without §B.3 fields, or do we iterate on Phase D's prompt? The plan as written says revert (no iteration); the user should confirm.

4. **Rollback strategy for in-flight runs:** if a developer is mid-run when v4 lands, do we offer a `framework-config.schema_version` migration? Or just require a fresh `initialize-project` run?

---

## 8. References

- Anthropic, _Building Effective Agents_ (December 2024) — orchestrator-workers pattern for parallel sub-agent fan-out.
- Plan v3 README (`plans/initialize-project-perf-v3/README.md`) — the §B.3 contract design (kept conceptually; rebuilt as Phase D in v4).
- Plan v2 README (`plans/initialize-project-perf-v2/README.md`) — XML-scaffold prompt structure (kept).
- gira run audits — `2026-05-08T18-26-08`, `2026-05-08T23-30-20`, `2026-05-09T00-21-00` — the empirical evidence behind the regression diagnosis.
- Claude Code `--mcp-config` + `--allowedTools` semantics — https://docs.claude.com/en/docs/claude-code/mcp + https://docs.claude.com/en/docs/claude-code/iam.

---

## 9. Out of scope for v4 (defer)

- `ts-prune` audit on the schema split — quality-of-life, not perf.
- Documentation regeneration for `.claude/CLAUDE.md` and `docs/workflows/INITIALIZE_PROJECT.md` — auto-generated from the canonical doc generator (already in place); will pick up v4 changes incrementally.
- Codex provider parity for Phase 1.5 — the orchestrator-workers fan-out works with both providers (the framework spawns CLI subprocesses; both Claude CLI and Codex CLI support that). Verify in a separate PR after Phase D lands on Claude.
- Wiki-refresh workflow — separate workflow, separate plan; not affected.
