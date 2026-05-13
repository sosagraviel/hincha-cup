/**
 * Single source of truth for the graph-navigation discipline.
 *
 * One canonical text consumed by four surfaces:
 *
 *   1. Phase 1 analyzer prompts — embedded by
 *      `nodes/initialize-project/phase1/shared/prompt-builder.ts::buildGraphContext`.
 *   2. Generated `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`) —
 *      upserted as a `<!-- GRAPH_DISCIPLINE_START -->` fenced section by
 *      `nodes/initialize-project/phase4/wiki-generation.node.ts`. Visible to
 *      every ambient agent session in the target project.
 *   3. Wiki router doc (`<project>/docs/llm-wiki/CLAUDE.md` or `AGENTS.md`) —
 *      templated subsection by
 *      `services/graph-wiki/wiki-generator.service.ts::buildSchemaDocBody`.
 *   4. Ticket skills (create-sdd-ticket / implement-ticket) — one-line
 *      cross-reference; the skills do NOT duplicate the body.
 *
 * The previous fifth surface — the project-context skill — was retired when
 * Phase 3 synthesis switched to emitting three prescriptive convention skills
 * (none of which carries the wiki-context section).
 *
 * Any tweak to the discipline propagates to every consumer automatically.
 *
 * The text below is deliberately consumer-agnostic: it works as a stand-alone
 * markdown chunk inside an instruction file AND as a templated block inside an
 * analyzer system prompt. No project-specific names; no provider-specific names.
 */

export const GRAPH_NAVIGATION_DISCIPLINE_HEADING = '## Graph navigation discipline';

/**
 * Canonical discipline text. Markdown body only — no leading/trailing
 * heading, no fence markers; consumers wrap with their own heading and
 * (optionally) sentinel comments.
 */
export const GRAPH_NAVIGATION_DISCIPLINE_TEXT = `Top-down, never breadth-first. Start cheap, drill into a small priority set. MCP tool results have a strict token cap; unbounded calls overflow into a sidecar.

### 0. Tool-call conventions

**Do not pass \`repo_root\`.** The MCP launcher already pins the server to this project via launch flags — \`repo_root\` is always redundant.

**Upstream bug.** \`get_hub_nodes_tool\`, \`get_bridge_nodes_tool\`, \`get_knowledge_gaps_tool\`, \`get_surprising_connections_tool\`, \`get_suggested_questions_tool\` may return \`'str' object has no attribute 'resolve'\` or \`'NoneType' object has no attribute 'resolve'\`. The framework's \`setup-code-graph.sh\` patches this at install time; if you still see it, retry once and fall back to \`get_minimal_context_tool\` + \`list_communities_tool\` + \`get_community_tool({ include_members: false })\`. Surface a \`needs_verification\` entry so the operator re-runs preflight.

**First-call startup race.** Your first \`mcp__code_graph__*\` call may return \`tool_use_error: No such tool available: <name>\` for a name that's in the catalog. This is a known registration race — retry the SAME call once. Do not switch tools, do not abandon the graph, do not invent a fallback.

**Fat communities — HARD RULE.** Communities can overflow on the bare metadata + description alone, even with \`include_members: false\`, when \`size > 50\` OR the community name matches one of these patterns:

- test-descriptor leaks: \`it:|should|describe:|assert:|test:|spec:|expect:\`
- cross-cutting noun roots: \`exceptions\`, \`helpers\`, \`utils\`, \`shared\`, \`base\`, \`core\`
- generated-code markers: \`__generated\`, \`pb_\`, \`schema_\`, \`autogen\`
- module-barrel signals: \`*-index\`, \`*-exports\`, \`*-barrel\`
- mixed-prefix services with i18n keys (e.g. \`service-it:should\`, \`feature-en:must\`)

**Required pre-check.** Before EVERY \`get_community_tool\` call, you MUST have observed the community's \`size\` field in a recent \`list_communities_tool\` response. Only call \`get_community_tool\` when \`size ≤ 50\` AND the name does NOT match the patterns above. Otherwise drill in via \`query_graph_tool({ pattern: "file_summary", target: <name>, detail_level: "minimal" })\` instead — it returns the same architectural signal (file/symbol roster) with a bounded payload.

### 1. Always start with the cheapest entry point

\`mcp__code_graph__get_minimal_context_tool({ task: "<your goal>" })\` first. ~100 tokens; returns the map.

### 2. Default to LEAN parameters

| Tool | Defaults |
|---|---|
| \`list_communities_tool\` | \`detail_level: "minimal"\`, \`min_size: 10\`, \`sort_by: "size"\`. Never \`detail_level: "standard"\`. |
| \`get_community_tool\` | Requires a prior \`list_communities_tool\` with \`size ≤ 50\` AND name does NOT match fat-community patterns (§0). \`include_members: false\` always; \`true\` only for ≤3 communities ≤30 members. Otherwise use \`query_graph_tool({ pattern: "file_summary" })\`. |
| \`list_flows_tool\` | \`detail_level: "minimal"\`, \`limit: 30\`, \`sort_by: "criticality"\`. |
| \`get_flow_tool\` | \`include_source: false\`; \`true\` for at most 1 flow. |
| \`semantic_search_nodes_tool\` | \`limit: 20\` MAX. Filter by \`kind\`. \`detail_level: "minimal"\` when surveying. \`query\` is a SINGLE token (e.g. \`"stripe"\`, \`"typeorm"\`) — multi-token prose queries return zero results. |
| \`find_large_functions_tool\` | \`min_lines: 50\`, \`limit: 30\`. Never \`min_lines: 1\`. |
| \`query_graph_tool\` / \`traverse_graph_tool\` | \`detail_level: "minimal"\`; traverse \`token_budget: 2000\`, \`depth: 3\`. |
| \`get_hub_nodes_tool\` / \`get_bridge_nodes_tool\` | \`top_n: 10\`. |

### 3. Forbidden tool

\`mcp__code_graph__get_architecture_overview_tool\` — DO NOT CALL. No bounding knob; overflows on any non-trivial codebase. Use \`get_minimal_context_tool\` + \`list_communities_tool\` + selective \`get_community_tool({ include_members: false })\` + hubs/bridges instead.

### 4. Drill-in budget per session (soft)

≤5 community drill-ins, ≤3 with \`include_members: true\`, ≤5 flow drill-ins, ≤8 semantic searches.

### 5. Result-spill protocol — RECOVER, do not abandon

Overflow sentinels (\`Error: result (NNN characters) exceeds maximum allowed tokens. Output has been saved to .../tool-results/...\`) are a **HARD FAILURE**. Do not read the spillover file — the tokens cost the same as if the call succeeded.

**On the next turn:**
1. Switch to a tighter shape per §2. Specifically: \`get_community_tool\` overflow → \`query_graph_tool({ pattern: "file_summary", target: <name>, detail_level: "minimal" })\`. \`semantic_search_nodes_tool\` overflow → drop \`limit\` to ≤10 + add a \`kind\` filter. \`find_large_functions_tool\` overflow → raise \`min_lines\` to 100.
2. Overflows count DOUBLE against that tool's remaining budget for the session.
3. **Continue the planned graph workflow.** Do NOT fall back to filesystem enumeration (Glob, Read, find, ls, grep, Get-ChildItem, fd, ripgrep) — those cannot replicate community membership, hub/bridge centrality, or flow topology. The overflow is a parameter problem, not a data problem; one of the alternative call shapes will return the answer within budget.

The Stop hook detects overflow sentinels automatically; the count is rendered into the run's \`index.html\` and treated as a regression in CI smoke tests.`;
