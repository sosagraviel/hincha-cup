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

3. **The Stop hook verifies usage from the transcript.** `phase1/shared/hooks/validate-analyzer-json.hook.ts` reads `transcript.jsonl` from the analyzer's session directory, counts `tool_use` events whose `name` matches `^mcp__code_graph__`, and overwrites the analyzer's reported `graph_queries_used` with the real list. If the analyzer is graph-required and the count is zero, the hook writes a retry-feedback file naming the available tools and exits non-zero so the orchestration retries the analyzer.

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

`scripts/setup-code-graph.sh`:

1. Resolves Python ≥ 3.10. Bootstraps `uv` from `https://astral.sh/uv/install.sh` if necessary; falls through to `pipx`/pip-user installs.
2. Seeds `<project>/.code-review-graphignore` from the template (idempotent).
3. Runs `code-review-graph build --repo <project>` (with a fallback `cd <project> && code-review-graph build`).
4. Writes the wrapper launcher and `launcher.json`.
5. Asserts `<project>/.code-review-graph/graph.db` exists.

The script is idempotent: re-running it after a successful build is a no-op except for re-resolving the launcher.

---

## Related code

| Concern | File |
|---|---|
| Graph build + verification | `orchestration/src/services/graph-wiki/code-graph.service.ts` |
| Tool-catalog fetch | `orchestration/src/services/framework/code-graph/tool-catalog.service.ts` |
| Project-level MCP config | `orchestration/src/services/framework/mcp-config.service.ts` |
| Phase 0 node | `orchestration/src/nodes/initialize-project/phase0/graph-foundation.node.ts` |
| Catalog templating | `orchestration/src/nodes/initialize-project/phase1/shared/prompt-builder.ts` |
| Stop-hook verifier | `orchestration/src/nodes/initialize-project/phase1/shared/hooks/validate-analyzer-json.hook.ts` |
| Setup script | `scripts/setup-code-graph.sh` |
| MCP serve wrapper | `scripts/code-review-graph-mcp.sh` |
| Ignore-file template | `templates/code-review-graphignore` |
