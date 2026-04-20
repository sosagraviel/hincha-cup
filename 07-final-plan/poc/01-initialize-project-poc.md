# POC Phase 1 — Graph-enhanced `/initialize-project`

Proof-of-concept plan for applying the Graph + Wiki features from the [final plan](../phases/) to the `/initialize-project` command. Deliberately minimal: prove the concept with one analyzer and one wiki document, defer breadth.

---

## Goal

Demonstrate end-to-end, on one fixture project, that:

1. A global code graph can be built as a new Phase 0 before any LLM work.
2. A Phase 1 analyzer can consume graph data via MCP and produce structurally richer output than the current grep/glob flow.
3. A post–Phase 4 node can generate an AI-written architecture document from graph queries + analyzer findings.

If all three work, the pattern is sound and the rest of the final plan (other analyzers, full wiki, hooks) is mechanical extension.

---

## Assumptions (deliberate, POC-only)

- `code-review-graph` CLI is installed on `PATH`. If not, the pipeline fails loudly — no auto-setup script, no `--no-graph` flag.
- MCP transport is stdio: Claude CLI spawns `code-review-graph mcp --db …` per agent session. No long-lived HTTP server.
- The wiki generator node calls `code-review-graph` CLI directly (JSON output), not via an HTTP client.
- Running against a fixture may overwrite `.code-graph.db` and `docs/ai-knowledge/ARCHITECTURE.md` — that's fine for POC.
- Phase 0 and the new wiki node run unconditionally. Failure aborts the whole `/initialize-project` run.
- Only the `structure-architecture-analyzer` prompt is rewritten. The other three Phase 1 analyzers are untouched and will keep working as-is (the graph's existence doesn't break them).

---

## File changes

### New files

#### 1. `orchestration/src/nodes/initialize-project/phase0/code-graph-builder.node.ts`

LangGraph node. Responsibilities:

- Verify `code-review-graph --version` resolves. Throw if not.
- Shell out:
  ```
  code-review-graph build \
    --path <projectPath> \
    --output <projectPath>/.code-graph.db \
    --exclude node_modules --exclude dist --exclude .git --exclude .claude-temp
  ```
- Merge-write `<projectPath>/.claude/settings.local.json` (preserve any existing keys):
  ```jsonc
  {
    "mcpServers": {
      "code-review-graph": {
        "command": "code-review-graph",
        "args": ["mcp", "--db", ".code-graph.db"]
      }
    },
    "permissions": {
      "allow": ["mcp__code-review-graph__*"]
    }
  }
  ```
- Return `{ code_graph_available: true, code_graph_db_path: '<projectPath>/.code-graph.db' }`.

No stats collection, no health check. ~80 LOC.

#### 2. `orchestration/src/nodes/initialize-project/phase4_5/wiki-architecture.node.ts`

LangGraph node. Responsibilities:

- Shell to `code-review-graph list-communities --db … --format json` and `code-review-graph overview --db … --format json` (exact subcommand names depend on the real CLI — adjust during implementation).
- Read Phase 1 structure output from `.claude-temp/initialize-project/phase1-outputs/01-structure-architecture.json`.
- Build a single prompt combining (communities, overview, structure analyzer findings). Invoke the existing LLM factory (same one used by `synthesis.node.ts`).
- Write `<projectPath>/docs/ai-knowledge/ARCHITECTURE.md` with frontmatter:
  ```yaml
  ---
  document_type: architecture
  generated_at: <ISO8601>
  graph_db_sha: <sha256 of .code-graph.db, first 12 chars>
  ---
  ```
- Return `{ wiki_architecture_path: '<projectPath>/docs/ai-knowledge/ARCHITECTURE.md' }`.

No ADRs, no SERVICES.md, no index. ~120 LOC.

### Modified files

#### 3. `orchestration/src/state/schemas/initialize-project.schema.ts`

Add three optional annotations:

```ts
code_graph_available: Annotation<boolean>({ default: () => false }),
code_graph_db_path: Annotation<string | undefined>(),
wiki_architecture_path: Annotation<string | undefined>(),
```

#### 4. `orchestration/src/graphs/initialize-project.graph.ts`

- Register two new nodes: `build_code_graph`, `wiki_architecture`.
- Change `routeToPhase` for `case 1` to return `'build_code_graph'` (single string) instead of the four-analyzer array.
- Add edges:
  - `build_code_graph` → fan-out to the four existing Phase 1 analyzers.
  - `context_generation` → `wiki_architecture` → `resources` (instead of `context_generation` → `resources` directly).
- Leave all other edges untouched.

#### 5. `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md`

Full rewrite per final plan [§ Task 1.1](../phases/02-phase1-analyzer-overhaul.md). Key points:

- Role: graph-first senior architect.
- Mandate: call `get_minimal_context`, `list_communities`, `get_community`, `get_architecture_overview` **before** any `Read`, `Grep`, or `Glob`.
- Read files only for manifests and configs the graph doesn't cover.
- Output schema: keep all existing fields; add optional `graph_community_id: string` on each service entry.
- Keep READ-ONLY constraint and JSON-only output discipline from the existing prompt.

#### 6. `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/settings.json`

Extend to grant MCP access to this analyzer's Claude CLI subprocess:

```jsonc
{
  "mcpServers": {
    "code-review-graph": {
      "command": "code-review-graph",
      "args": ["mcp", "--db", "${PROJECT_PATH}/.code-graph.db"]
    }
  },
  "permissions": {
    "allow": ["mcp__code-review-graph__*"]
  },
  "hooks": { /* existing Stop hook untouched */ }
}
```

(If the CLI subprocess already inherits `.claude/settings.local.json` from `PROJECT_PATH`, this duplication may be unnecessary — confirm during implementation and simplify.)

### Explicitly NOT changed

- Other three Phase 1 analyzer prompts / settings.
- Zod schemas for Phase 1 output (the new `graph_community_id` field is optional, tolerated by existing validator without changes).
- `scripts/initialize-project.sh` (no `--no-graph`, no install script).
- `framework-config.json` generation (no stats block).
- Any hooks system.

---

## Execution order

1. **Schema + Phase 0 node** (#3, #1). Wire into graph (#4). Run the pipeline on a fixture and confirm `.code-graph.db` + merged `settings.local.json` appear. Analyzers still run unchanged.
2. **Structure analyzer rewrite** (#5, #6). Re-run Phase 1. Inspect `.claude-temp/initialize-project/phase1-outputs/01-structure-architecture.json` — look for populated `graph_community_id` and (ideally) better `cross_service_relationships` than the baseline run from step 1.
3. **Wiki node** (#2). Re-run. Confirm `docs/ai-knowledge/ARCHITECTURE.md` is created with frontmatter and references community names.

Each step is independently verifiable; commit in three chunks.

---

## Verification checklist

Run against one fixture (suggest `orchestration/test/fixtures/automation-projects/npm-project` or the framework repo itself):

| Check | Command | Expected |
|-------|---------|----------|
| Graph DB built | `test -f <project>/.code-graph.db` | exit 0 |
| MCP registered | `jq '.mcpServers["code-review-graph"]' <project>/.claude/settings.local.json` | non-null |
| Analyzer used graph | `jq '[.findings.services[] \| select(.graph_community_id)] \| length' <project>/.claude-temp/initialize-project/phase1-outputs/01-structure-architecture.json` | ≥ 1 |
| Wiki doc exists | `test -f <project>/docs/ai-knowledge/ARCHITECTURE.md` | exit 0 |
| Wiki references communities | grep community names (from `list-communities`) in the doc | ≥ 2 matches |

Baseline comparison: save a copy of `01-structure-architecture.json` from the pre-rewrite run and diff against the post-rewrite run. Expectation: richer/more-accurate relationship data. Non-blocking but the key qualitative signal.

---

## Scope cuts vs. the full final plan

Accepted trade-offs:

- No `setup-code-graph.sh`, no Python/pip/pipx detection logic.
- No graph-client TypeScript service, no caching, no singleton.
- No health checker module separate from the builder.
- No rewrite of tech-stack, code-patterns, or data-flows analyzers.
- No `SERVICES.md`, `DATA-FLOWS.md`, `PATTERNS.md`, per-service docs, ADR extraction, or `index.md`.
- No pre-tool hooks.
- No graph-aware fallback — if the graph fails, the run fails.
- No `framework-config.json` graph-stats block.
- No state field for graph build metrics.

If the POC works, each of these becomes its own follow-up ticket.

---

## Estimated size

- ~2 new TS files (~200 LOC combined).
- 1 full prompt rewrite (~120 lines).
- 3 small TS/JSON edits.
- 1 PR, ideally one reviewer-sitting.

---

## Open items to resolve during implementation

1. Exact `code-review-graph` subcommand names for community listing, overview, and build. Plan assumes `build`, `list-communities`, `overview`, `mcp` — confirm against the real CLI and adjust.
2. Whether Claude CLI merges `.claude/settings.local.json` from the target project with the per-analyzer `settings.json` passed via `settingsPath`. If yes, the MCP block in file #6 is redundant. Keep it defensively for POC.
3. Where to place `wiki_architecture` in the graph if `synthesis` or `context_generation` shape changes — this plan assumes current topology.
