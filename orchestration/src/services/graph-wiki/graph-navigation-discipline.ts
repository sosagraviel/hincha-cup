/**
 * Single source of truth for the graph-navigation discipline.
 *
 * One canonical text consumed by five surfaces:
 *
 *   1. Phase 1 analyzer prompts — embedded by
 *      `nodes/initialize-project/phase1/shared/prompt-builder.ts::buildGraphContext`.
 *   2. Generated `<project>/.claude/CLAUDE.md` (or `.codex/AGENTS.md`) —
 *      upserted as a `<!-- GRAPH_DISCIPLINE_START -->` fenced section by
 *      `nodes/initialize-project/phase4/wiki-generation.node.ts`. Visible to
 *      every ambient agent session in the target project.
 *   3. Generated `<project>/.claude/skills/project-context/SKILL.md` (or the
 *      Codex variant) — same upsert mechanism as #2.
 *   4. Wiki router doc (`<project>/docs/llm-wiki/CLAUDE.md` or `AGENTS.md`) —
 *      templated subsection by
 *      `services/graph-wiki/wiki-generator.service.ts::buildSchemaDocBody`.
 *   5. Ticket skills (create-sdd-ticket / implement-ticket) — one-line
 *      cross-reference; the skills do NOT duplicate the body.
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
export const GRAPH_NAVIGATION_DISCIPLINE_TEXT = `Top-down, never breadth-first. When you call a code-graph MCP tool, start with the cheapest entry point and only drill into the small priority set you need to answer your specific question. The MCP server has a strict tool-result token cap; unbounded calls overflow silently and dump 200+ KB to a sidecar file you cannot usefully consume.

### 1. Always start with the cheapest entry point

Call \`mcp__code_graph__get_minimal_context_tool({ task: "<your goal>" })\` first. ~100 tokens. Returns top communities, top flows, risk score, suggested next tools. This is the map; everything else is a drill-in from here.

### 2. Default to LEAN parameters on every tool that exposes them

| Tool | Default this way |
|---|---|
| \`mcp__code_graph__list_communities_tool\` | \`{ detail_level: "minimal", min_size: 10, sort_by: "size" }\`. **NEVER** \`detail_level: "standard"\` — that returns full member lists per community and overflows on graphs with > 10 communities. |
| \`mcp__code_graph__get_community_tool\` | \`{ include_members: false }\` by default. Only set \`true\` for ≤3 specific communities you have a concrete reason to drill into. |
| \`mcp__code_graph__list_flows_tool\` | \`{ detail_level: "minimal", limit: 30, sort_by: "criticality" }\`. |
| \`mcp__code_graph__get_flow_tool\` | \`{ include_source: false }\` by default. \`include_source: true\` only for the single flow whose source you genuinely need (cap: 1). |
| \`mcp__code_graph__semantic_search_nodes_tool\` | \`{ limit: 20 }\` MAX. Use \`kind\` to filter (\`Class\` / \`Function\` / \`File\` / \`Type\` / \`Test\`). \`detail_level: "minimal"\` when surveying. |
| \`mcp__code_graph__find_large_functions_tool\` | \`{ min_lines: 50, limit: 30 }\`. **NEVER** \`min_lines: 1\` — that returns every function. |
| \`mcp__code_graph__query_graph_tool\` | \`{ detail_level: "minimal" }\`. |
| \`mcp__code_graph__traverse_graph_tool\` | \`{ token_budget: 2000, depth: 3 }\` (depth 1-6 max). |
| \`mcp__code_graph__get_hub_nodes_tool\` / \`get_bridge_nodes_tool\` | \`{ top_n: 10 }\`. |

### 3. Forbidden tool

- \`mcp__code_graph__get_architecture_overview_tool\` — **DO NOT CALL**. The response has no bounding knob and always returns full member lists for ALL communities; it overflows on any non-trivial codebase. Equivalent information is reachable via \`get_minimal_context_tool\` + \`list_communities_tool({ detail_level: "minimal" })\` + selective \`get_community_tool({ include_members: false })\` + \`get_hub_nodes_tool\` + \`get_bridge_nodes_tool\`. The combination is information-equivalent and bounded.

### 4. Drill-in budget per call session (soft caps)

- ≤5 community drill-ins via \`get_community_tool({ include_members: false })\`
- ≤3 community drill-ins with \`include_members: true\`
- ≤5 flow drill-ins via \`get_flow_tool\`
- ≤8 semantic searches with \`limit: 20\`

### 5. Result-spill protocol

If any tool result starts with a sentinel like \`Error: result (NNN characters) exceeds maximum allowed tokens. Output has been saved to /Users/.../tool-results/...txt\` — that is a calling error, not a fact. **Do not read the spillover file.** Re-call the same tool with tighter parameters (\`detail_level: "minimal"\`, smaller \`limit\`, narrower \`kind\` filter, \`include_members: false\`). If you still cannot bound the call, switch to a different tool from the lean set above. Each overflow you cause is logged by the framework's Stop hook; ignoring the sentinel is treated as a regression.`;
