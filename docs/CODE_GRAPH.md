# Code Graph

How the `code-review-graph` MCP server is built, advertised to analyzers, and verified at the end of every Phase 1 attempt.

---

## On disk

There is exactly **one** code-graph database per project, at:

```
<project>/.code-review-graph/graph.db
```

The legacy `.code-graph.db` file at the project root has been retired. `<project>/.code-review-graph/` also holds:

| File | Purpose |
|---|---|
| `graph.db` | The SQLite database `code-review-graph` writes (WAL mode). |
| `code-review-graph` | A wrapper script that locks the launcher to whichever resolution `setup-code-graph.sh` succeeded with (`uvx code-review-graph`, the bare binary, or a pip-installed copy). |
| `launcher.json` | Resolution metadata: command, args, version, timestamp. The TypeScript layer reads this so it never re-resolves the binary from scratch. |

The path is computed in two places, both deriving from the project root:

- TypeScript: `graphDbPath(projectPath)` in `orchestration/src/services/graph-wiki/code-graph.service.ts`.
- Bash: `CODE_GRAPH_DB_PATH="$PROJECT_PATH/.code-review-graph/graph.db"` in `scripts/setup-code-graph.sh`.

---

## What's excluded

`<project>/.code-review-graphignore` lists path globs that `code-review-graph build` should skip. The canonical template is checked in at:

```
templates/code-review-graphignore
```

`setup-code-graph.sh` and `sync-framework-resources.sh` copy it into `<project>/.code-review-graphignore` idempotently — they only seed the file if it does not already exist, so projects can edit theirs without it being clobbered. The framework root no longer carries its own copy: `code-review-graph build --repo <project>` reads from `<project>`, so a copy at the framework root would be inert.

---

## How analyzers learn the tool names

The bug this replaces: every Phase 1 analyzer prompt used to hard-code `mcp__code_graph__<name>` strings. The live `code-review-graph` 2.3.x server exposes those tools with a `_tool` suffix (e.g. `mcp__code_graph__list_communities_tool`), so the hand-written names silently failed and analyzers fell back to file scanning.

The fix lives at three layers:

1. **Phase 0 fetches the catalog.** After `code-review-graph build` succeeds, `graphFoundationNode` calls `fetchCodeGraphToolCatalog({projectPath, frameworkPath})` (see `orchestration/src/services/framework/code-graph/tool-catalog.service.ts`). The service spawns `bash <framework>/scripts/code-review-graph-mcp.sh serve --repo <project>`, sends a JSON-RPC 2.0 `initialize` + `tools/list` over stdio, and returns `[{name, description}]` for every tool the live server exposes. The result is memoised module-level for the duration of the run.

2. **Phase 1 templates the catalog into every prompt.** `phase1/shared/prompt-builder.ts` renders the catalog as a bullet list inside a `=== CODE GRAPH CONTEXT ===` block. Each analyzer's `agent.md` carries a directive: *"Call only the tool names listed in your CODE GRAPH CONTEXT block. Do not invent variants or shorten them."* The execution-instructions playbooks still mention semantic tool names (e.g. `list_communities`) for readability, but their preamble explicitly defers to the catalog for the canonical name.

3. **The Stop hook verifies usage from the transcript and writes a sidecar.** `phase1/shared/hooks/validate-analyzer-json.hook.ts` reads `transcript.jsonl` from the analyzer's session directory, counts `tool_use` events whose `name` matches `^mcp__code_graph__`, and writes a `<sessionId>.graph-tool-uses.json` sidecar next to the transcript with the canonical sorted unique list of `mcp__code_graph__*_tool` names. If the analyzer is graph-required and the count is zero, the hook BLOCKS the agent (exit 2) with retry-feedback naming the available tools.

4. **The Phase 1 orchestration node overwrites `graph_queries_used` from the sidecar.** `phase1/shared/graph-tool-usage.ts` reads the sidecar after `retryWithEnhancedFeedback` succeeds and replaces whatever the agent put in the field with the canonical list. The agent's value is discarded unconditionally — the field is no longer agent-owned. If the sidecar is missing or malformed, the helper logs a warning and forces `graph_queries_used: []` (honest empty array beats fabricated list).

5. **The Stop hook also counts tool-result overflows and the orchestration surfaces them.** Each call whose result starts with the `Error: result (NNN characters) exceeds maximum allowed tokens. Output has been saved to /Users/.../tool-results/...txt` sentinel is recorded in the sidecar's `overflows: [{tool, callIndex}]` array. The orchestration node stamps `graph_overflow_count` and `graph_overflow_tools` onto the persisted analyzer JSON, and Phase 2 consolidation emits a `WARN` line for any analyzer with `graph_overflow_count > 0`. This makes silently-degraded runs impossible to ignore.

---

## Graph navigation discipline

The four Phase 1 analyzers must call graph tools top-down: cheap entry point first, drill in selectively. The discipline is enforced at five places — one source of truth, five consumers — so an analyzer / planner / implementer / wiki-consumer / ad-hoc agent cannot bypass it:

1. **Single source.** `orchestration/src/services/graph-wiki/graph-navigation-discipline.ts` exports the canonical text. Any change here propagates to every consumer below.
2. **Phase 1 prompts.** `shared/prompt-builder.ts::buildGraphContext` embeds the discipline in every analyzer's system prompt. Per-analyzer `execution-instructions.md` defers all "how to call" decisions to it.
3. **Generated `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`).** Phase 4b upserts the discipline as a `<!-- GRAPH_DISCIPLINE_START -->` fenced section. Visible to every ambient agent session in the target project.
4. **Generated `<project>/.claude/skills/project-context/SKILL.md`.** Same upsert call as #3.
5. **Wiki router doc and ticket skills.** Cross-reference the canonical fenced section in #3 (no duplication of the body).

### The forbid

`mcp__code_graph__get_architecture_overview_tool` is **forbidden**. Its response has no bounding knob and always returns full member lists for every community; on any non-trivial codebase it overflows Claude's tool-result token cap (5/5 calls overflowed in the gira run before this redesign). Information-equivalent alternatives (`get_minimal_context_tool` + `list_communities_tool({ detail_level: "minimal" })` + selective `get_community_tool({ include_members: false })` + `get_hub_nodes_tool` + `get_bridge_nodes_tool`) are bounded.

### Lean defaults at a glance

| Tool | Default this way |
|---|---|
| `list_communities_tool` | `detail_level: "minimal"`, `min_size: 10` |
| `get_community_tool` | `include_members: false` (≤3 with members) |
| `list_flows_tool` | `detail_level: "minimal"`, `limit: 30` |
| `get_flow_tool` | `include_source: false` (cap 1 with source) |
| `semantic_search_nodes_tool` | `limit: 20` MAX, `detail_level: "minimal"` |
| `find_large_functions_tool` | `min_lines: 50`, `limit: 30` (never `min_lines: 1`) |

---

## MCP transport

The transport is **stdio**, not a TCP port. Earlier prompts advertised `MCP Port: 3100`; that string was a fiction — `code-review-graph serve --repo <project>` reads JSON-RPC frames from stdin and writes them to stdout. There is no port to configure, no listener to start.

The project-level MCP config files are written by Phase 0 (`upsertCodeGraphMcpConfig` in `services/framework/mcp-config.service.ts`):

| Provider | File | Why |
|---|---|---|
| Claude | `<project>/.mcp.json` | Per-spawn analyzers receive `--mcp-config` pointing at a per-node mcp.json. Downstream phases (e.g. implement-ticket) read the project-level file. The wiki-generator no longer calls graph tools at all (closed-book synthesis from already-digested upstream — see `docs/LLM_WIKI.md`); graph queries live exclusively in Phase 0 + Phase 1. |
| Codex | `<project>/.codex/config.toml` | Codex CLI auto-discovers MCP servers from this file at session start; there is no per-spawn flag. Writing it in Phase 0 — *before* Phase 1 spawns analyzers — is the parity fix that lets `--provider codex` runs use the graph. |

---

## Debugging "graph not used" failures

When the Stop hook rejects an analyzer for making zero graph calls, look in this order:

1. **Was the catalog fetched at all?** Phase 0 logs `MCP tools: <N> available`. If you see `MCP tool catalog fetch FAILED` instead, the run is already aborted — the workflow returns `current_phase: failed`. The fix is upstream: the MCP server failed to start. Try `bash <framework>/scripts/code-review-graph-mcp.sh serve --repo <project>` interactively and watch for the error.

2. **Did the analyzer actually receive the catalog?** The `=== CODE GRAPH CONTEXT ===` block lives in the system prompt and is logged into `.claude-temp/initialize/runs/<runId>/phase-1-discovery/<agent>/attempt-*/<sessionId>/system-prompt.md`. If the block is empty or absent, `prompt-builder.ts` is broken; if it's present but the analyzer ignored it, the agent prompt itself is at fault.

3. **Did the analyzer call something that the server doesn't expose?** The transcript shows `tool_use` events with the actual names tried. If you see `mcp__code_graph__list_communities` (no `_tool`), the analyzer hallucinated against the directive — escalate by tightening the directive line in `agent.md`.

4. **Does the graph have content?** Some projects produce empty graphs (single-language, all-excluded). The hook does not currently distinguish "graph empty" from "analyzer ignored graph". Inspect `<project>/.code-review-graph/graph.db` with `code-review-graph status --repo <project>`.

---

## Setup script details

`scripts/setup-code-graph.sh` (state-first; cheapest tier wins):

1. **Tier 0 — install resolution.** Short-circuits when `code-review-graph` is already on `PATH`. Otherwise: bootstraps `uv` from `https://astral.sh/uv/install.sh` and runs through the fallback chain (`uv tool install` → `bootstrap_uv` → `pipx` → `pip --user`). Skipped entirely on hot runs where the binary is already resolvable.
2. **Tier 1 / 2 / 3 decision** — `decide_graph_tier` reads `<project>/.code-review-graph/extraction-manifest.json::sha`, compares against `git rev-parse HEAD`, and returns:
   - `tier1` (no work): graph DB exists, manifest sha == HEAD → return immediately.
   - `tier2` (incremental): graph DB exists, manifest sha != HEAD → `code-review-graph update` (~1 s).
   - `tier3` (full build): no graph DB or no manifest → `code-review-graph build` (~4 s on a small repo).
3. Seeds `<project>/.code-review-graphignore` from the template (idempotent).
4. Re-emits the launcher wrapper and `launcher.json` (compare-then-write).
5. Re-syncs the framework allowlist `.code-review-graph/.gitignore` (`templates/code-review-graph-gitignore`) over the upstream tool's auto-emitted `*` rule.
6. **Auto-migration** (idempotent, safe to re-run): if `.code-review-graph/extraction-manifest.json` is currently tracked by git from an older framework version, the script untracks it (`git rm --cached`) so the new `.gitignore` rules can take effect. The file stays on disk; only its tracked status changes. Reason: the manifest's `created_at` field rotates on every Tier 2/3 run, producing churn-only commits whenever multiple teammates ran the preflight. See plan §D for the regression history.
7. Asserts `<project>/.code-review-graph/graph.db` exists.

The script is idempotent end-to-end: hot runs (Tier 1) finish in well under one second of actual work.

---

## Team onboarding (zero-setup)

Skills auto-bootstrap everything. A teammate cloning a framework-managed project runs `/create-sdd-ticket` or `/implement-ticket` directly — no manual installs, no MCP approval prompts, no environment variables. The deterministic preflight (`scripts/ensure-context.sh`, called by both skills as Phase 0) handles:

- Auto-installing `uv` / `uvx` / `code-review-graph` via the fallback chain in `setup-code-graph.sh`.
- Building the graph (Tier 3) on first use, or incrementally updating it (Tier 2) when a teammate's commit moved HEAD.
- Re-emitting `.mcp.json` (Claude) or `.codex/config.toml`'s `[mcp_servers.code_graph]` block (Codex) with this machine's absolute paths.
- Refreshing the LLM wiki when `.state.json::graph_sha` or `last_indexed_commit` drift is detected.

The committed surface (what teammates check in vs what the preflight regenerates) is:

| Path | Committed? | Owner |
|---|---|---|
| `.code-review-graph/graph.db` | No (per-developer; binary + absolute paths inside SQLite) | preflight |
| `.code-review-graph/launcher.json` | No (machine-local install resolution) | preflight |
| `.code-review-graph/extraction-manifest.json` | No (per-developer freshness signal; older framework versions tracked it — current `.gitignore` excludes it and `setup-code-graph.sh` auto-untracks on next run) | preflight |
| `.code-review-graph/.gitignore` | Yes (allowlist over the tool's `*`) | framework template |
| `.code-review-graphignore` | Yes (project's exclude list; editable) | first init seeds it |
| `.mcp.json` (Claude) | No (gitignored — local absolute paths) | preflight |
| `.codex/config.toml` (Codex) | Yes, but the `[mcp_servers.code_graph]` block is stripped by Phase 6 housekeeping; preflight re-emits it locally | preflight + Phase 6 housekeeping |
| `docs/llm-wiki/wiki/**` | Yes (target of Phase 8.5 wiki refresh + diff reviews) | implement-ticket Phase 8.5 |
| `docs/llm-wiki/.state.json` | Yes (freshness signals: `graph_sha` + `last_indexed_commit`) | wiki refresh |

If any teammate manually edits the graph DB or its launcher metadata, the next preflight overwrites or no-ops based on the freshness check. Editing the framework allowlist `.gitignore` or `.code-review-graphignore` is fine — the preflight only seeds the latter when missing.

---

## Production debugging

When the preflight fails on a teammate's machine, look at three things in order:

1. **The success marker.** `cat <artifacts-dir>/.preflight-ok` (default artifacts dir: `.claude-temp/preflight/` or `.codex-temp/preflight/`). If it exists and `git_head` matches the local HEAD, the preflight ran cleanly. Subsequent skill phases trust this.
2. **The failure marker.** `cat <artifacts-dir>/.preflight-failed` carries `{reason, git_head, ran_at}`. Reasons:
   - `graph_build_failed` — re-run with `bash $FRAMEWORK_PATH/scripts/setup-code-graph.sh` and read the logs.
   - `wiki_not_initialized` — the project has never been initialised; run `/initialize-project` once and the wiki appears.
3. **Manual re-run.** `bash $FRAMEWORK_PATH/scripts/ensure-context.sh --artifacts-dir <artifacts-dir>` — same script the skills call, just invoked by hand. Add `--force-graph` to force a Tier 3 rebuild, `--force-wiki` to force a full wiki regeneration.

---

## See also

- [`PROMPT_CACHING.md`](./PROMPT_CACHING.md) — how the graph tool catalog ends up in the cache-eligible Phase 1 prompt prefix and what to do if your change risks breaking byte-determinism.

---

## Related code

| Concern | File |
|---|---|
| Graph build + verification (state-first) | `orchestration/src/services/graph-wiki/code-graph.service.ts` |
| Tool-catalog fetch + disk cache | `orchestration/src/services/framework/code-graph/tool-catalog.service.ts` |
| Project-level MCP config | `orchestration/src/services/framework/mcp-config.service.ts` |
| Codex TOML upsert + strip | `orchestration/src/services/framework/codex-mcp-toml.ts` |
| Phase 0 node | `orchestration/src/nodes/initialize-project/phase0/graph-foundation.node.ts` |
| Catalog templating | `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` |
| Stop-hook verifier | `orchestration/src/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json.hook.ts` |
| Phase 6 portability housekeeping | `orchestration/src/nodes/initialize-project/phase6/helpers/portability-validator.ts` |
| Setup script (state-first tiers) | `scripts/setup-code-graph.sh` |
| Skill preflight entry point | `scripts/ensure-context.sh` |
| MCP serve wrapper | `scripts/code-review-graph-mcp.sh` |
| Project-side ignore template | `templates/code-review-graphignore` |
| Framework allowlist for graph DB | `templates/code-review-graph-gitignore` |
