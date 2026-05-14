# Prompt Caching

How the framework structures Phase 1 analyzer prompts so Anthropic's automatic prompt cache (and Codex/GPT-5's equivalent) can hit on the second through fourth analyzer spawns within a single `initialize-project` run.

---

## What the cache gives us

Anthropic's prompt cache reads back a previously-seen prompt prefix at ~10% of normal input rate when the cumulative bytes match a prior request within a 5-minute TTL. The Phase 1 analyzers fan out four parallel spawns over the same project — same excluded directories, same project path, same MCP tool catalog, same graph navigation discipline. After commits 7 + 8 (plan §F + §G), that shared content lives in **one byte-identical block at the start of every analyzer prompt**, so analyzers 2–4 pay ~10% input rate for the ~19 KB / ~4.7 K-token prefix.

Per init run, that's roughly **12.7 K cached tokens** the framework no longer pays full price for, on top of the within-prompt dedupe gains from §A. Across 600 projects × multiple re-inits per project, the savings turn into real budget.

The same byte-identical-prefix contract gives Codex/GPT-5's automatic prefix cache a hit on the same boundary. No platform-specific code path needed.

---

## The byte-determinism contract

The prefix is built by **`buildPhase1SharedPrefix(ctx)`** in `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts`. The order is fixed:

1. `<excluded_directories>` — derived from `.gitignore`, same for every analyzer in a single run.
2. `<project_path>` — same for every analyzer in a single run.
3. `<output_format>` — constant body; `agentName` is intentionally NOT interpolated.
4. `=== CODE GRAPH CONTEXT ===` — live MCP tool catalog + graph navigation discipline body. Snapshotted at preflight; same for every analyzer in a single run.

Anything analyzer-specific — authoritative service list, per-analyzer tool-cap table, execution instructions, validation feedback for retries — lives in the **tail**, after the prefix. Putting any of those in the prefix would make it analyzer-specific (or attempt-specific) and break caching silently.

The hard rule: **if you add a field to `SharedPrefixContext`, it MUST be invariant across the four analyzer spawns within a single run.** Adding `agentName`, a timestamp, an attempt counter, or a fresh nonce zeros out caching savings without any visible error.

---

## How to verify caching is engaged

Two places to look after running `/initialize-project`:

1. **Run index sidebar (HTML).** `<project>/.claude-temp/initialize-project/debug/runs/<runId>/index.html` shows two rows:
   - **Cache hit rate** — fraction of agent calls that read from the cache. Phase 1 within a 5-min TTL should be ≥ 50% (3 of 4 analyzers can hit the prefix written by the first).
   - **Graph overflows** — count of graph MCP tool results that exceeded the per-call token cap. Should be 0–2 after commits 1 + 2.

2. **Raw token-usage records.** `<project>/.claude-temp/metrics/token-usage.jsonl` is a JSONL file with one record per agent call. `cache_hit: true` means `cache_read_input_tokens > 0` was reported by the API. Aggregate yourself with `jq` if the index isn't enough:

   ```bash
   jq -s '
     (map(select(.cache_hit == true)) | length) as $hits |
     length as $total |
     {total: $total, hits: $hits, rate: ($hits / $total)}
   ' .claude-temp/metrics/token-usage.jsonl
   ```

If Phase 1 reports 0% cache hit rate after a fresh init, the byte-determinism contract has drifted — see "Maintaining cache eligibility" below.

---

## What's tested

`orchestration/test/unit/nodes/initialize-project/phase1/shared/prompt-builder-cache.test.ts` is the regression net:

- The SHA-256 of `buildPhase1SharedPrefix(ctx)` is identical across the four analyzers given the same context.
- The prefix contains no analyzer-specific tokens (none of the four analyzer names appear).
- The prefix is ≥ 1024 bytes (Anthropic's caching engagement threshold).
- The prefix appears at byte 0 of every full analyzer prompt — no leading whitespace, no banner.
- Validation feedback, the authoritative service list, and per-tool cap tables do NOT leak into the prefix.
- Different `graphContext` invalidates the prefix consistently across all four analyzers (no half-cached state).

`canonical-texts.test.ts` is the long-term enforcement: it greps every `phase1/<analyzer>/prompts/*.md` for distinctive substrings from the cache-eligible prefix. If a future PR pastes "The directories below are off-limits" or "Top-down, never breadth-first" into an analyzer's `agent.md`, the test fails with a pointer to the canonical home.

---

## Maintaining cache eligibility

When you change Phase 1 prompts:

- **Adding a new shared block?** Put it in `buildPhase1SharedPrefix` and add a distinctive substring to `FORBIDDEN_FRAGMENTS_IN_ANALYZER_PROMPTS` in `phase1/shared/canonical-texts.ts`. The drift test will catch any future paste-back.
- **Adding analyzer-specific content?** Put it in the tail (after the prefix). Specifically: in the analyzer's own `agent.md` / `execution-instructions.md`, or in a per-analyzer block inside `buildPhase1AnalyzerPrompt`.
- **Changing the graph tool catalog format?** Make sure the new format remains byte-deterministic for a given catalog input. The catalog is snapshotted once per init at preflight, so the same input renders the same bytes every time.
- **Adding telemetry / debug breadcrumbs?** Do NOT inline them into the prefix. The `metrics/token-usage.jsonl` and `meta.json` per-attempt records are the right places.

If you're not sure whether a change breaks caching, run `pnpm --filter orchestration test:unit prompt-builder-cache.test.ts`. The byte-determinism test fails immediately on drift.

---

## Per-platform behaviour

| Auth mode | Caching mechanism | Telemetry path |
|---|---|---|
| Anthropic API key (DeepAgents) | Claude API automatically caches system prompts ≥ 1024 tokens within a 5-min TTL. DeepAgents passes our concatenated prompt as the subagent system prompt, so the byte-identical prefix gets cached implicitly. Explicit `cache_control` markers would require bypassing DeepAgents and calling the SDK directly — deferred until empirical hit-rate measurements show the implicit caching is insufficient. | `usage.cache_read_input_tokens` from the response, set on the in-process `result.usage` object. |
| Claude CLI (subagent) | Claude Code propagates the user prompt to the Anthropic API; the same automatic prefix-cache mechanism applies. | `cli-agent-impl.ts` re-locates the JSONL transcript at `~/.claude/projects/<slug>/<sessionId>.jsonl` after the run, walks every assistant message's `usage.cache_read_input_tokens`, and feeds the rollup into `emitTokenUsage`. See `extractUsageFromClaudeJsonl` in `usage-extractor.ts`. |
| Codex CLI (GPT-5) | OpenAI Responses API automatically caches prompt prefixes ≥ ~1024 tokens, no opt-in needed. **The user prompt is built as `${run.inputPrompt}\n\n---\n\n${agentBody}` so the byte-identical prefix lives at byte 0** — reversing this order would push analyzer-specific bytes ahead of the prefix and the cache could never hit. | `codex-cli-agent-impl.ts` locates the rollout JSONL via `locateCodexRollout`, parses `token_count` events for `info.cached_input_tokens` (and a few protocol variants for forward-compat), and feeds the rollup into `emitTokenUsage`. See `extractUsageFromCodexJsonl` in `usage-extractor.ts`. |

The framework relies on byte-determinism to make all three platforms hit. There is no per-platform code path for caching itself — one prompt structure serves all three modes — but each CLI provider has its own usage extractor because the transcript shapes differ.

### Maintaining cache eligibility for Codex specifically

The Codex CLI takes a single concatenated prompt string via stdin; unlike Claude CLI it does not have an `--agent` flag that would load the agent body as a separate system message. The framework concatenates `inputPrompt + agentBody` (in that order) inside `codex-cli-agent-impl.ts` so the byte-identical Phase 1 prefix from `buildPhase1SharedPrefix` sits at byte 0 of the user message — exactly where OpenAI's automatic prefix cache can match it. **Reversing this order is the single most common way to silently kill caching on Codex.** The byte-determinism test in `prompt-builder-cache.test.ts` has a Codex-specific `describe` block that fails immediately on drift; it also pins the broken form of the regression so reviewers can see what "broken" looks like.

---

## Verifying cache hits per provider

For all three modes, run `/initialize-project` and inspect the run-index sidebar:
`<project>/.{claude,codex}-temp/initialize-project/debug/runs/<runId>/index.html`. The **Cache hit rate** row reflects real measurements after this commit. For raw aggregation, the same `metrics/token-usage.jsonl` JSONL gets written by every provider; the `jq` snippet in the next section works regardless of which CLI produced it.

---

## Caching contract for quality-assurance skills

The `pr-reviewer` and `security-review` skills run multi-stage agent pipelines (detect-stack → specialists/triage → coordinator/judge → critic → verifier → aggregator). When invoked from `/implement-ticket` Phase 10 they fan out across several sub-agent calls within the same session, often hitting the 3-iteration retry loop. To stay cache-eligible across those calls, every sub-agent in these skills MUST share the same byte-identical prefix:

1. **System prompt** — provider-default system message (Claude Code's or Codex CLI's stock prompt; do not customize per sub-agent).
2. **Project conventions** — `{{INSTRUCTION_FILE}}` body (`CLAUDE.md` / `AGENTS.md`) injected verbatim. Same for every sub-agent in a run.
3. **Skill rubric** — `references/review_criteria.md` (pr-reviewer) or `references/owasp-top-10-2025.md` (security-review). Loaded once at the start of the skill invocation; reused by every specialist agent.
4. **Repo context** — `docs/llm-wiki/index.md` plus a focused excerpt the skill has decided is relevant. Same shape across all agents within a single PR review.

Per-call deltas (the diff under review, SARIF blob, individual finding being triaged, role-specific instruction) live in the **tail** after the prefix. Putting any per-call value above the rubric breaks the prefix and zeros out savings without any visible error — same failure mode documented for Phase 1 above.

### Practical wiring

- The skills' SKILL files document the four prefix blocks in that order. Sub-agent role prompts (the markdown files under `skills/030-quality-assurance/{pr-reviewer,security-review}/agents/`) place their per-role instructions inside the role body, never in any preamble.
- Both skills cap the prefix at one `cache_control: {type: "ephemeral", ttl: "1h"}` breakpoint placed at the boundary between block 4 (repo context) and the per-call payload. 1h TTL is justified: a single `/implement-ticket` run takes 5–30 minutes; review-loop retries reuse the same prefix for up to 3 iterations.
- The Codex variants of these skills follow the same concat order documented for Phase 1 above (`inputPrompt + agentBody`), so OpenAI's automatic prefix cache also matches.

### Verifying cache hits in the review loop

After a `/implement-ticket` run, inspect:
- `<project>/.{claude,codex}-temp/initialize-project/debug/runs/<runId>/index.html` for the per-phase cache-hit rate row.
- `.claude/artifacts/<JIRA_KEY>/{pr,security}/.../review-results.json`'s `tokenUsage.cached_input` field (added in v4.0.0 of pr-reviewer and v2.0.0 of security-review). On the second-and-subsequent iterations of the review loop, `cached_input` should account for at least ~75% of `input` once the prefix exceeds the cacheable-length floor.

### What invalidates the prefix

The same hard rule as Phase 1: **anything that changes per sub-agent must live in the tail.** Specifically:
- Per-specialist role names, per-CWE micro-prompts, per-PR diff bytes, per-finding evidence excerpts — all go in the tail.
- Adding a timestamp, attempt counter, or session ID to block 1–4 silently kills caching. The two skills' SKILL files call this out explicitly; review changes to those skills against the four-block contract above.

---

## Related code

| Concern | File |
|---|---|
| Cache-eligible prefix builder | `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` (`buildPhase1SharedPrefix`) |
| Canonical text constants | `orchestration/src/nodes/initialize-project/phase1/shared/canonical-texts.ts` |
| Token-usage emitter | `orchestration/src/services/framework/debug-store/token-usage-emitter.ts` |
| Run-level stats aggregator | `orchestration/src/services/framework/debug-store/run-stats.ts` |
| Run index renderer (sidebar rows) | `orchestration/src/services/framework/transcripts/renderer/render-run-index.ts` |
| DeepAgents implementation (caching contract docblock) | `orchestration/src/utils/shared/agent-factory/deep-agent-impl.ts` |
| Per-provider usage extractor (cache_read rollup) | `orchestration/src/utils/shared/agent-factory/usage-extractor.ts` |
| Codex graph-tool-uses sidecar (parity for Claude's Stop hook) | `orchestration/src/nodes/initialize-project/phase1/shared/graph-tool-uses-extractor.ts` |
| Sidecar loader plumbing (Claude vs Codex) | `orchestration/src/nodes/initialize-project/phase1/shared/graph-tool-usage.ts` (`loadClaudeSidecar` / `loadCodexSidecar` / `getSidecarLoaderForProvider`) |
| Codex CLI agent impl (concat order + sidecar writer + usage extractor wiring) | `orchestration/src/utils/shared/agent-factory/codex-cli-agent-impl.ts` |
| Claude CLI agent impl (usage extractor wiring) | `orchestration/src/utils/shared/agent-factory/cli-agent-impl.ts` |
| Byte-determinism unit tests (Claude + Codex order) | `orchestration/test/unit/nodes/initialize-project/phase1/shared/prompt-builder-cache.test.ts` |
| Drift-guard unit test | `orchestration/test/unit/nodes/initialize-project/phase1/shared/canonical-texts.test.ts` |
| Codex graph-tool-uses extractor tests | `orchestration/test/unit/nodes/initialize-project/phase1/shared/graph-tool-uses-extractor.test.ts` |
| Sidecar loader tests | `orchestration/test/unit/nodes/initialize-project/phase1/shared/sidecar-loaders.test.ts` |
| Per-provider usage extractor tests | `orchestration/test/unit/utils/shared/agent-factory/usage-extractor.test.ts` |
