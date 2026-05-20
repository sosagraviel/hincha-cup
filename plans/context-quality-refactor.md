# Context-Quality Refactor — Less Code, Sharper Output

**Status:** proposal, awaiting line-by-line review.
**Branch:** `feat/improve-wiki-to-follow-llm-wiki-principles` (current working tree).
**Net change target:** **negative LOC** vs HEAD. If the implementation
adds more code than it removes, the plan has failed.

## 1 — Purpose

The framework serves three flows. Today it leans heavily on LLM
enumeration at init time, which is slow, expensive, and partially
redundant given consumer flows have graph access at runtime.

| Flow | What it consumes | What it needs |
|---|---|---|
| `initialize-project` | source tree | produce `.claude/`, `qaf.config.json`, `docs/llm-wiki/` |
| `create-sdd-ticket` | skills + wiki + graph + jira/markdown | well-formed SDD ticket |
| `implement-ticket` | skills + wiki + graph + ticket | code + tests + PR |

Both consumer flows have **MCP graph access at runtime**. That means
the framework's init-time output does NOT need to enumerate every
endpoint, entity, env var, or test file. It just needs:

1. **Sharp scaffolding** — short, dense, prescriptive skills.
2. **Pointer-rich wiki pages** — Purpose + Shape + "to enumerate X,
   query graph for Y" pointers.
3. **Sharp framework-config** — services (with a real-vs-fake filter),
   paths, languages, frameworks.

This refactor shifts work from init-time LLM enumeration to
runtime graph queries by the consumer agents, and trims the code that
exists only to support exhaustive init-time enumeration.

## 2 — Five principles (every code change is judged against these)

1. **Enumeration belongs at runtime.** Consumer agents have MCP graph
   access. Init-time produces shape + pointers, not exhaustive lists.
2. **Deterministic before LLM.** Anything derivable from manifests,
   inspection.json, graph topology, or post-fill is computed by code.
   LLMs only add judgment (per-service purpose, conventions narrative,
   architectural interpretation).
3. **Sharp prompts > big prompts.** Every generated skill ≤ 200 lines.
   Every per-service wiki page ≤ 200 lines. Synthesis instructions
   prompt ≤ 20 KB on disk.
4. **Stack/structure/architecture-agnostic.** No language tokens, no
   framework names, no path patterns outside `language-config/` and
   the universal regexes in `coverage-families`-style helpers. The
   framework runs the same way on a Swift iOS app, a Python monolith,
   and a TypeScript Nx monorepo.
5. **No new caps, no new hard-reject hooks.** Work is bounded by
   the natural product: `authoritative service list × schema cells`.
   The schema teaches via descriptions rendered into the CRITIC block;
   downstream layers (Phase 2 normalize, composer-views fallback)
   recover from misses without retry loops.

## 3 — Where determinism vs flexibility shifts

| Concern | Today | After refactor |
|---|---|---|
| Test framework per service | LLM analyzer search | Manifest dep scan (post-fill) |
| Quality tools | LLM analyzer guesses | Post-fill from manifest deps |
| Service list | LLM + post-fill blend | Inspection-driven, LLM only flags "is this real?" |
| File counts by language | Post-fill (already) | Same |
| Per-service Purpose paragraph | LLM (judgment) | LLM (judgment) |
| Architectural narrative | LLM (judgment) | LLM (judgment) |
| WRONG/CORRECT code examples | LLM (judgment) | LLM (judgment, citing analyzer findings) |
| "Add a new endpoint" workflow | LLM (judgment) | LLM (judgment, citing existing examples) |
| Per-service wiki "Public API enumeration" | LLM enumerates | LLM cites graph-query pointer |
| Per-service wiki "Data Layer enumeration" | LLM enumerates | LLM cites graph-query pointer |
| Per-service wiki "Env vars enumeration" | LLM enumerates | LLM cites graph-query pointer |

The rule: **facts → deterministic; interpretations → LLM with citation
pointers; enumerations → consumer agents at runtime.**

## 3.5 — Patterns we keep and lean into (no new code)

These are existing HEAD patterns that the refactor explicitly preserves
and uses harder. None of them require new code — they require us to
stop building around them.

| # | Pattern | Where it lives | How the refactor uses it |
|---|---|---|---|
| 1 | **Prompt-cache byte-determinism** of the shared Phase 1 prefix (`<excluded_directories>` + `<project_path>` + `<output_format>` + CODE GRAPH CONTEXT + GRAPH PREFETCH) — identical bytes across all 4 analyzer prompts ⇒ Anthropic prompt cache hits 2nd-4th spawn within 5-min TTL | `phase1/shared/prompt-builder.ts → buildPhase1SharedPrefix` | Audit before/after every step: don't drift the prefix; if we add anything shared, add it INSIDE the prefix in deterministic order |
| 2 | **Schema-driven CRITIC teaching** — analyzer Zod schemas render into a `OUTPUT CONTRACT (CRITIC)` block via `<<script:critic-block>>`. Rules in `.describe()` text reach the agent as authoritative requirements without any hook code | `services/framework/prompt-scripts/scripts/critic-block.ts` + `schemas/phase1-agent-outputs.schema.ts` | When we want an analyzer to follow a rule, we add it to the schema description, NOT to a hook. The CRITIC block teaches; hooks become pure safety nets |
| 3 | **Graph-prefetch reuse** — Phase 0 prefetches 4 graph-orientation queries (`get_minimal_context`, `list_communities`, `get_hub_nodes`, `get_bridge_nodes`); all 4 Phase 1 analyzers consume the same snapshot via the shared prefix, saving 4 × 4 = 16 graph calls per run | `services/framework/code-graph/graph-prefetch.service.ts` | Don't re-fetch in any analyzer prompt; document the prefetch as load-bearing in the synthesis instructions for downstream agents |
| 4 | **Content-hash cache invalidation** — `framework_extra_ignore_hash` for `--ignore` drift; `graphSha` for prefetch snapshots. Cache keys are deterministic SHA-256s, never timestamps | `services/graph-wiki/code-graph.service.ts` + `graph-prefetch.service.ts` | When we add the real-services flag (step 7) we use the same pattern: a content-hash key over inspection.json so re-runs that didn't change services skip rework |
| 5 | **Sidecar telemetry** — `graph_queries_used` is derived from the transcript by the Stop hook into `<sessionId>.graph-tool-uses.json`, NOT self-reported by the LLM. Framework-trusted counts, LLM-untrusted commentary | `phase1/shared/hooks/validate-analyzer-json.hook.ts` + `phase1/shared/graph-tool-usage.ts` | Trust telemetry, not LLM claims. The synthesizer can read graph_queries_used to mention "the analysis used N graph queries" with confidence |
| 6 | **`passthrough()` Zod escape hatch** — every Phase 1 output schema is lenient: extra fields don't reject. Schemas evolve without breaking older fixtures | `schemas/phase1-agent-outputs.schema.ts` | Step 4 (analyzer prompt trimming) is safe — removing emitted fields doesn't break validation |
| 7 | **Composition over enumeration in language-config** — `typescript.ts` has `extends: ['javascript']`; manifest/runner/framework tokens flow transitively | `services/framework/language-config/` | Mobile RN/Expo tokens added to `javascript.ts` cover TypeScript automatically. No language file needs to duplicate. |
| 8 | **Auto-downgrade rejection threshold** — soft-gate codes (E060-E068) hard-block the first N rejections, then auto-downgrade to soft warning per `REJECTION_AUTO_DOWNGRADE_THRESHOLD = 2`. Runs never loop indefinitely | `phase1/shared/rejection-counter.ts` | NO new hooks. Any new rule we surface goes via schema descriptions (pattern #2), not via a new soft-gate code |
| 9 | **Closed-book single-call synthesizer** — Phase 3 is ONE LLM call reading composer-views + instructions from disk, no tool use. Fast (~30-90 s on Sonnet). Investments in its prompt compound across every project the framework ever initializes | `phase3/synthesis.node.ts` | Step 2 (rewrite synthesis-instructions) is the highest-leverage prompt edit in the whole framework. Spend the editorial budget here, not on per-service stuff |
| 10 | **Slice-first read with analyzer fallback** — composer-views read `sliceX ?? analyzerX` so optional richer inputs (per-service slices, future graph-derived structured findings) layer on top of always-present analyzer findings, gracefully | `phase2/composer-views/build-composer-views.ts` | Keep the fallback shape, drop the matrix layer that consumed it. Future richer inputs (none planned right now) can layer in without breaking the digest |

## 3.6 — Hook philosophy: schema teaches, hook accepts, framework recovers

The Claude Code Stop hook protocol is incremental — `blockWithFeedback`
injects the reason as a user message into the *same* session and the
agent produces another assistant turn. It is NOT a from-scratch retry.
But each feedback round still costs **one full LLM turn** (~30-120s
on Sonnet) on top of a growing context, so stacking 5-6 rejections
in one session burns 8-10 min on its own.

The honest design rule for the hook layer is:

> **Hard-reject only what no downstream layer can recover from.
> Everything else gets a soft warning and continues.**

Three concrete buckets (existing machinery in
`classifyRejection`/`SOFT_GATE_CODES`):

| Bucket | What it is | What the hook does | Why |
|---|---|---|---|
| **Shape violations** | schema-validation failures: missing required keys, type mismatches, regex failures, forbidden top-level shapes | **HARD-REJECT** with feedback (same session, agent retries) | The Phase 2/3/4 code reads typed Zod-parsed structures. An output that doesn't parse cannot be recovered — there's no key to normalize, no field to fall back on. |
| **Recoverable content** | service-ID drift (legacy name vs authoritative), test-file or runner-config citations in `code_patterns[].patterns[].source_file`, prose-shape violations in `needs_verification`, missing optional convention fields | **SOFT-WARN unconditionally** (allow + record on `data.soft_warning[]`) | Phase 2 consolidation, Phase 4 `applyServiceIdRewritesToFindings` (drift), composer-views slice-first fallback (citations), synthesizer's "(not determined by analysis)" pattern (missing optional fields) — ALL exist to recover. Forcing a retry burns minutes to fix something the framework already fixes for free. |
| **Judgment gaps** | missing required per-service judgment field (E068), self-contradicting `needs_verification` (E065), graph-internals leaking into user prose (E062) | **SOFT-GATE** via existing `SOFT_GATE_CODES` + `REJECTION_AUTO_DOWNGRADE_THRESHOLD` (HEAD: 2) | A real gap deserves one or two chances to fix — the agent may have just forgotten to fill the cell. After threshold the rejection auto-downgrades to soft, the run completes, the gap is surfaced as a warning the operator can act on. |

**The teaching mechanism is the Zod schema, not the hook.** Every rule
the framework wants the analyzer to follow gets a clear `.describe()`
in the schema field. The `<<script:critic-block>>` renders the schema
into an `OUTPUT CONTRACT (CRITIC)` block at the top of the prompt.
The agent reads the rule before emitting JSON; the hook validates
afterward. When the schema teaches well, the hook rarely fires.

**The threshold for judgment-gap soft-gating is a tunable.** HEAD is 2
(first 2 rejections hard-reject, then auto-downgrade). For production-
grade behavior with 6000+ developer machines and subscription-token
budgets, **threshold = 1 may be the right value**: one chance to fix a
real gap, then accept and move on. The framework's downstream layers
plus the run-level warnings give the operator enough signal. This
is open question §10 Q6 below.

**The mistakes this section catches in retrospect:**

- My short-lived `E069_test_or_config_file_citation` and
  `E070_service_id_drift` rules were added as bucket-1 hard-rejects.
  They belong in bucket 2 (recoverable). Hence my eventual decision
  to either delete them (current state) or downgrade them to
  always-soft. Schema descriptions (pattern §3.5 #2) now teach the
  same rules without a hook code.

## 4 — Code changes (target: net negative)

### 4.1 Remove from working tree (~2000 LOC + tests)

**A. Matrix layer (orphaned after Phase 1 schema rollback):**

| File | Action | LOC |
|---|---|---|
| `orchestration/src/schemas/composer-views.schema.ts` | revert to HEAD | −87 |
| `orchestration/src/nodes/initialize-project/phase2/composer-views/build-composer-views.ts` | revert matrix sections | −355 |
| `orchestration/src/nodes/initialize-project/phase3/prompts/synthesis-instructions.md` | revert family/matrix sections | −167 |
| `orchestration/src/nodes/initialize-project/phase3/prompt-builder.ts` | revert matrix injection | −77 |
| `orchestration/src/nodes/initialize-project/phase3/synthesis.node.ts` | revert composer-view injection | −118 |
| `orchestration/src/nodes/initialize-project/phase3/validators/types.ts` | revert matrix types | −13 |
| `orchestration/src/nodes/initialize-project/phase3/validators/validate-coverage-matrix.ts` | delete (untracked) | −197 |
| `orchestration/src/nodes/initialize-project/shared/coverage-families.ts` | delete (untracked) | −302 |
| Aligned tests (build-composer-views, synthesis-validator, synthesizer-prompt-budget, context-generation, service-floor, coverage-families, validate-coverage-matrix) | revert / delete | −1500 |

**B. Wiki page enumeration directives (overreach):**

| File | Action | LOC |
|---|---|---|
| `orchestration/src/services/graph-wiki/document-specs.ts` | rewrite service-page section to "Purpose + Shape + Pointers" | −80 (after rewrite) |

**C. Phase 6 enforcement overreach:**

| File | Action | LOC |
|---|---|---|
| `orchestration/src/nodes/initialize-project/phase6/helpers/file-validator.ts` | drop required-heading validation | −47 |
| `orchestration/src/nodes/initialize-project/phase6/helpers/phase-completion-validator.ts` | drop heading-warning bits | −13 |

### 4.2 Rewrite (not extend) for sharper content (~+50 LOC net)

These are content rewrites, not file additions. They REPLACE existing
content with tighter, denser content. Each rewrite must produce a file
no larger than what it replaces.

| File | What changes | Net LOC |
|---|---|---|
| `phase3/prompts/synthesis-instructions.md` | drop matrix/family rendering; add sharp per-skill guidance (code-conventions, multi-file-workflows, testing-conventions, CLAUDE.md) | 0 (after −167 removal above) |
| `phase4/wiki-generator/prompts/agent.md` | tighten "graph-augmented" framing to "graph for shape + missing-fact lookup, not exhaustive enumeration" | +20 |
| `services/graph-wiki/document-specs.ts` (service-page section) | "Purpose + Shape + Pointers" framing | (counted in 4.1.B) |
| `phase1/code-patterns-analyzer/prompts/execution-instructions.md` | already done (3 surgical edits) | (already applied) |
| `phase1/structure-analyzer/prompts/execution-instructions.md` | trim redundant enumeration steps (post-fill handles them) | ~−15 |
| `phase1/tech-stack-dependencies-analyzer/prompts/execution-instructions.md` | trim where post-fill handles | ~−10 |
| `phase1/data-flows-analyzer/prompts/execution-instructions.md` | trim where post-fill handles | ~−10 |

### 4.3 Keep (real fixes — already confirmed)

| Area | Files |
|---|---|
| `--ignore` flag (1.A) | parse-ignore-flag, code-review-graphignore service, prompt-loader, phase0 plumbing, state schema, CLI, scripts, docs |
| Cap removal (1.B) | graph-tool-usage.ts, prompt-builder import cleanup, aligned tests, phase1-base comment |
| Wiki-generator graph-augmented (1.C) | wiki-generator/prompts/agent.md, wiki-generator.service.test.ts |
| Language-config additions (1.D) | csharp.ts, go.ts, java.ts, javascript.ts (mobile tokens) |
| Code-patterns execution-instructions surgical fix (already applied) | code-patterns-analyzer/prompts/execution-instructions.md |
| Phase 4 normalisation restoration (already applied) | context-generation.node.ts |
| Document-specs Phase 1.5 ref scrub (already applied) | document-specs.ts (5 line-edits, kept) |

## 5 — How each of the three flows is affected

### 5.1 `initialize-project`

**Phase 0 — Graph foundation:** no change. Builds graph, runs prefetch,
syncs `--ignore` paths.

**Phase 1 — Analyzers:** prompts trimmed to "judgment + cite". Each
analyzer is shorter, faster, more focused. The framework's post-fill
already derives frameworks/languages/file-counts/quality-tools from
manifests; analyzers stop redoing that work.

**Phase 2 — Consolidation + composer-views:** composer-views becomes
a thin per-service digest (Purpose, key conventions, key examples).
**No matrix.** No family identifiers. No scaffold outline. Roughly
half the current LOC.

**Phase 3 — Synthesis:** sharper instructions, shorter total prompt.
Skills are short, dense, pointer-rich. Each rule cites a graph query
the consumer agent can run.

**Phase 4 — Context + wiki:**
- `qaf.config.json`: real-services filter (production-file count
  criterion added alongside existing thresholds, ≤ 20 LOC addition).
- Per-service wiki: **Purpose + Shape + Pointers**, not exhaustive
  enumeration. Consumer agents enumerate at runtime via graph.

**Phase 5 — Resources:** no change.

**Phase 6 — Validation:** drop the required-heading validator I
added; revert to HEAD's frontmatter-only checks.

### 5.2 `create-sdd-ticket`

No code change in `skills/020-development-workflow/create-sdd-ticket/`.
The improvement comes for free: the skill consumes the sharper
synthesizer output + the pointer-rich wiki + the graph at runtime.
With sharper init-time output, gap detection runs against denser
context.

### 5.3 `implement-ticket`

Same — no code change in `skills/020-development-workflow/implement-ticket/`.
The 14-phase workflow already uses MCP graph and reads the framework's
skills + wiki. Sharper init-time output → tighter implementation context.

## 6 — Acceptance criteria

A working refactor must meet ALL of these:

1. **Net LOC vs HEAD: negative.** Measured via `git diff --shortstat
   HEAD` on a stride-origin-equivalent run. Refactor fails if positive.
2. **Phase 1 analyzers: HEAD parity or better wall-clock.** No analyzer
   exceeds its HEAD baseline by more than 10%.
3. **Synthesis prompt size: ≤ 20 KB on disk** (the
   `synthesis-instructions.md` file; current ratchet allows 30 KB,
   tightened here to enforce sharpness).
4. **Generated skill files: each ≤ 200 lines.**
5. **Per-service wiki pages: each ≤ 200 lines.**
6. **No new caps, no new hard-reject hooks, no new sub-agents, no new
   per-service walks.**
7. **All existing unit tests pass** without ratchet relaxation. If a
   test asserts removed matrix behavior, the test is also removed.
8. **End-to-end stride-origin run < 30 min.**
9. **Prompt cache hits preserved.** The Phase 1 shared prefix
   (`buildPhase1SharedPrefix`) stays byte-identical across all 4
   analyzers. The existing `prompt-builder-cache.test.ts` SHA-256s the
   prefix across analyzers and fails on drift — that test stays green
   without modification. If a refactor step modifies prefix contents,
   the test catches it before merge.
10. **No new soft-gate codes, no new hard-reject codes, no new hook
    blocks.** Rules surface via schema `.describe()` text rendered into
    the CRITIC block (pattern §3.5 #2).

## 7 — Implementation order (one commit per step)

| Step | Action | Net LOC | Gate |
|---|---|---|---|
| 1 | Drop matrix layer (composer-views, schemas, synthesis, validators, untracked files) + aligned tests | −2000 | gates green |
| 2 | Rewrite synthesis-instructions: sharp per-skill guidance, ≤ 20 KB | 0 net | gates green |
| 3 | Rewrite document-specs service-page: Purpose + Shape + Pointers | −80 | gates green |
| 4 | Trim Phase 1 execution-instructions where post-fill covers (structure, tech-stack, data-flows) | −35 | gates green |
| 5 | Tighten wiki-generator/prompts/agent.md "graph for shape + lookup" framing | +20 | gates green |
| 6 | Drop Phase 6 required-heading validator | −60 | gates green |
| 7 | Add `service_is_real?: boolean` judgment field to the structure analyzer's per-service schema (`.describe()` explains when to set false); composer-views filter on it via the slice-first pattern (#10). No new helper, no deterministic enumerator — the existing analyzer makes the call. | +10 schema + +5 filter | gates green |
| 8 | End-to-end stride-origin run; verify acceptance criteria | 0 | criteria met |

After step 8: review generated skills + wiki by hand. If any reads
worse than the pre-refactor output, iterate on the relevant prompt
(steps 2-5). Do NOT add new infrastructure.

## 8 — Risks and mitigations

| Risk | Mitigation |
|---|---|
| Consumer agents (create-sdd-ticket, implement-ticket) expected matrix data | Verify: grep their SKILL.md files for matrix references. If any exist, surface them now and adjust scope. |
| Pointer-rich wiki is too thin for consumer agents to plan effectively | After step 8, hand-review the SDD ticket created on stride-origin with the new wiki. If the ticket reads thin, tune the pointer-rendering in document-specs (NOT by re-adding enumeration directives). |
| Phase 1 trim makes an analyzer skip something load-bearing | The synthesizer's Zod schema + CRITIC block surface the rules. If an analyzer omits a required cell, the existing E068 judgment-field validator catches it and emits a soft warning (already auto-downgrades after threshold). |
| Real-services filter drops a legitimate service | Three signals must all fail for a service to drop: file-count below threshold AND no manifest AND no production-source file. A service the team actually cares about will satisfy at least one signal. |

## 9 — What this plan does NOT do

- Does not add new analyzers or sub-agents.
- Does not add new validators or hooks.
- Does not add catalogs (no families, no workflow enums, no scaffold lists).
- Does not change any consumer-skill code (`create-sdd-ticket`, `implement-ticket`).
- Does not change the LangGraph node wiring.
- Does not introduce any per-service LLM fan-out.
- Does not add CLI flags beyond `--ignore`.
- Does not edit `skills/`, `agents/`, `docs/architecture/`,
  `docs-site-content/`, `website/` content trees.

## 10 — Open questions for the reviewer

1. **Skill size limit of 200 lines** — is that the right ceiling? Could
   be 300 if quality drops too much. Calibration after step 8.
2. **`service_is_real` (step 7)** — confirmed approach: ONE
   judgment field on the structure analyzer's per-service entry.
   Composer-views filter on it via the slice-first read pattern
   (§3.5 #10). +15 LOC total. Approve or counter-propose?
3. **Synthesis prompt size ratchet (20 KB)** — HEAD's
   `synthesizer-prompt-budget.test.ts` currently asserts ≤ 30 KB.
   Tightening to 20 KB enforces sharpness at step 2; relaxing keeps
   current budget. Pick one.
4. **Wiki-generator graph-augmented (1.C, kept)** — confirmed kept,
   but should the per-page graph-call frame go in the agent.md or in
   `document-specs.ts` service-page section? Currently both touch it.
   Single-source is cleaner.
5. **Prompt-cache audit step** — should step 1 include a one-line
   `prompt-builder-cache.test.ts` health check in the commit message
   ("prefix SHA unchanged: ✓")? Trivial, but documents the cache
   commitment for future readers.
6. **Judgment-gap soft-gate threshold (§3.6)** — HEAD is
   `REJECTION_AUTO_DOWNGRADE_THRESHOLD = 2`. Each hard-reject for a
   judgment-gap code (E060-E068) costs one LLM turn. Tightening to
   `1` means "one chance to fix, then accept and move on" — better
   for the 6000+ developer / subscription-token target. Loosening
   keeps current "give the agent 2 chances" behavior. Pick one.

---

When you approve, I implement step 1 first, run gates, surface the
diff numbers, then ask for step-2 approval. Each step independently
reviewable.
