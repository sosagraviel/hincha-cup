import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { logger } from '../../../../utils/logger.js';
import { claudeProjectSlug } from '../../../../services/framework/transcripts/capture.js';

/**
 * Sidecar contract written by `validate-analyzer-json.hook.ts` next to the
 * Claude session transcript. Source-of-truth for "which graph tools did the
 * analyzer actually call AND which results overflowed".
 *
 * Path: `~/.claude/projects/<claudeProjectSlug(projectPath)>/<sessionId>.graph-tool-uses.json`
 */
export interface GraphToolUsesSidecar {
  count: number;
  uniqueNames: string[];
  /**
   * One entry per overflowing tool result (sentinel match in the transcript).
   * Optional for back-compat with older sidecars that predate Phase 3 of the
   * graph-navigation redesign. When the sidecar lacks this field, treat as 0
   * overflows.
   */
  overflows?: Array<{ tool: string; callIndex: number }>;
  /**
   * Per-tool call counts for graph tools (e.g.
   * `{ "mcp__code_graph__semantic_search_nodes_tool": 16 }`). Drives the
   * `graph_search_overuse` soft warning. Optional for back-compat — older
   * sidecars predate the gira-init-run audit Phase E and have no value.
   */
  nameCounts?: Record<string, number>;
  /**
   * Total non-graph tool_use events (Read/Glob/Grep/Bash/etc.). Drives the
   * `low_graph_ratio` soft warning. Optional for back-compat.
   */
  nonGraphCount?: number;
}

/**
 * Per-analyzer soft caps for total tool calls. Exceeding the cap surfaces a
 * `tool_call_budget_exceeded` soft warning in the persisted output but does
 * NOT fail the run. Caps were derived from the gira-run distribution
 * (51/57/52/43 across the four analyzers) — the goal is to nudge the
 * agent toward graph-first behaviour, not enforce a hard limit. Stack-
 * agnostic: the values are wall-clock budgets, not language-specific.
 */
export const PER_ANALYZER_TOOL_CALL_CAPS: Record<string, number> = {
  'structure-architecture-analyzer': 25,
  'tech-stack-dependencies-analyzer': 20,
  'code-patterns-testing-analyzer': 25,
  'data-flows-integrations-analyzer': 30,
};

/**
 * Per-analyzer per-tool soft caps. Templated into the analyzer prompt as a
 * markdown table the agent re-reads mid-session. Exceeding any per-tool cap
 * surfaces `per_tool_budget_exceeded` in the soft-warning list, but does NOT
 * fail the run.
 *
 * Caps were derived from the gira-run audit (2026-05-04): the
 * structure-architecture-analyzer made 38 `get_community_tool` calls and
 * caused 4 overflows in a single Phase 1 run. Each overflow blows ~22 KB
 * of sidecar-pointer text into the agent's context — the per-tool cap is
 * the structural fix.
 *
 * The `_default` row is used when the analyzer is not explicitly listed
 * (forward-compat for any future analyzer added without updating this
 * table). The overflow-doubling rule (an overflow on a tool counts double
 * against that tool's remaining budget) is enforced by the discipline
 * itself; this table is the soft-cap baseline.
 *
 * Stack-agnostic: the values are call counts, not language-specific.
 */
export const PER_ANALYZER_PER_TOOL_CAPS: Record<string, Record<string, number>> = {
  'structure-architecture-analyzer': {
    // The 2026-05-04 gira run had structure-architecture making 38
    // get_community_tool calls + 4 overflows. The community / hub /
    // bridge tools are the targeted regression — capped tight.
    // semantic_search is the discovery workhorse — kept generous.
    mcp__code_graph__get_minimal_context_tool: 2,
    mcp__code_graph__list_communities_tool: 2,
    mcp__code_graph__get_community_tool: 4,
    mcp__code_graph__get_hub_nodes_tool: 2,
    mcp__code_graph__get_bridge_nodes_tool: 2,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 6,
    mcp__code_graph__get_impact_radius_tool: 2,
    mcp__code_graph__list_flows_tool: 2,
    mcp__code_graph__get_flow_tool: 2,
    mcp__code_graph__find_large_functions_tool: 2,
    mcp__code_graph__traverse_graph_tool: 2,
  },
  'tech-stack-dependencies-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 4,
    mcp__code_graph__find_large_functions_tool: 1,
  },
  'code-patterns-testing-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    // Workhorse for this analyzer — pattern detection leans on semantic
    // search across the full surface area.
    mcp__code_graph__semantic_search_nodes_tool: 8,
    mcp__code_graph__query_graph_tool: 4,
    mcp__code_graph__find_large_functions_tool: 4,
  },
  'data-flows-integrations-analyzer': {
    mcp__code_graph__get_minimal_context_tool: 1,
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 3,
    mcp__code_graph__list_flows_tool: 2,
    mcp__code_graph__get_flow_tool: 4,
    mcp__code_graph__semantic_search_nodes_tool: 6,
    mcp__code_graph__query_graph_tool: 6,
    mcp__code_graph__traverse_graph_tool: 2,
  },
};

/**
 * Render the per-analyzer per-tool cap table as a markdown table the analyzer
 * can read mid-session. Returns an empty string when the analyzer name is not
 * in `PER_ANALYZER_PER_TOOL_CAPS` (no cap table to inject — fall back to the
 * total-cap warning only).
 */
export function renderPerToolCapsTable(agentName: string): string {
  const caps = PER_ANALYZER_PER_TOOL_CAPS[agentName];
  if (!caps) return '';

  const rows = Object.entries(caps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, cap]) => `| \`${tool}\` | ${cap} |`)
    .join('\n');

  return [
    '### Per-tool soft caps (this analyzer)',
    '',
    '| Tool | Max calls |',
    '|---|---:|',
    rows,
    '',
    "An overflow sentinel from any tool counts DOUBLE against that tool's remaining budget. Exceeding any cap surfaces `per_tool_budget_exceeded` in this analyzer's soft-warning list — non-blocking, but visible in the run report.",
  ].join('\n');
}

/**
 * Threshold for `graph_search_overuse`: more than 8 semantic_search calls
 * in a single analyzer run is a code smell — the agent is brute-forcing
 * the graph instead of drilling top-down.
 */
const SEMANTIC_SEARCH_OVERUSE_THRESHOLD = 8;

/**
 * Threshold for `low_graph_ratio`: when graph_call_count / total_tool_calls
 * is below 0.4 the analyzer is grep-spamming over the graph. The graph is
 * the language-agnostic primitive; non-graph tools should be the minority
 * of calls, not the majority.
 */
const LOW_GRAPH_RATIO_THRESHOLD = 0.4;

/**
 * Compute the soft-warning list for an analyzer run. Returns sorted unique
 * strings drawn from a fixed vocabulary so downstream consumers can switch
 * on them. Empty array when no signal fires.
 *
 * Stack-agnostic — every check is a pure number comparison.
 */
export function computeSoftWarnings(
  agentName: string,
  graphCount: number,
  nonGraphCount: number,
  nameCounts: Record<string, number>,
  overflows: Array<{ tool: string; callIndex: number }> = [],
): string[] {
  const warnings = new Set<string>();
  const total = graphCount + nonGraphCount;

  if (total > 0) {
    const ratio = graphCount / total;
    if (ratio < LOW_GRAPH_RATIO_THRESHOLD) {
      warnings.add('low_graph_ratio');
    }
  }

  const semanticSearchCount = nameCounts['mcp__code_graph__semantic_search_nodes_tool'] ?? 0;
  if (semanticSearchCount > SEMANTIC_SEARCH_OVERUSE_THRESHOLD) {
    warnings.add('graph_search_overuse');
  }

  const cap = PER_ANALYZER_TOOL_CALL_CAPS[agentName];
  if (typeof cap === 'number' && total > cap) {
    warnings.add('tool_call_budget_exceeded');
  }

  // Per-tool budget — an overflow on a tool counts DOUBLE against that
  // tool's remaining budget (per the discipline's spill protocol §5).
  // Surface `per_tool_budget_exceeded` when any tool's effective count
  // (calls + overflows) exceeds its cap from PER_ANALYZER_PER_TOOL_CAPS.
  const perToolCaps = PER_ANALYZER_PER_TOOL_CAPS[agentName];
  if (perToolCaps) {
    const overflowsByTool: Record<string, number> = {};
    for (const ov of overflows) {
      overflowsByTool[ov.tool] = (overflowsByTool[ov.tool] ?? 0) + 1;
    }
    for (const [tool, perToolCap] of Object.entries(perToolCaps)) {
      const calls = nameCounts[tool] ?? 0;
      const ov = overflowsByTool[tool] ?? 0;
      // Overflows count double — the discipline's "an overflow counts
      // DOUBLE against that tool's remaining budget" rule.
      const effective = calls + ov;
      if (effective > perToolCap) {
        warnings.add('per_tool_budget_exceeded');
        break;
      }
    }
  }

  // Any overflow at all is worth surfacing — the discipline says reading
  // the spillover file costs the same tokens as if the call had succeeded,
  // so an overflow that the agent then ignores blows the run's budget.
  if (overflows.length > 0) {
    warnings.add('graph_overflow_detected');
  }

  return Array.from(warnings).sort();
}

/**
 * Replace `data.graph_queries_used` with the canonical sorted list of
 * `mcp__code_graph__*_tool` names taken from the Stop hook's sidecar.
 *
 * The agent is no longer the source of truth for this field — it has been
 * lying about it (writing free-form prose like
 * `"list_communities({ detail_level: 'standard' }) — exceeded token limit"`
 * which then leaks into wiki frontmatter). The Stop hook reads the same
 * transcript Claude CLI wrote and records the canonical names; this helper
 * plugs that record into the persisted analyzer JSON.
 *
 * Failure modes:
 *   - `sessionId` is undefined → the agent never produced a session (e.g.
 *     DeepAgents API mode where no Claude transcript exists). Force `[]` so
 *     downstream consumers cannot inherit the agent's value.
 *   - sidecar file missing → log warn, force `[]`.
 *   - sidecar malformed → log warn, force `[]`.
 *
 * The hook BLOCKS on the harder failure mode (agent claims graph use with
 * zero tool_use events). This helper handles the softer case: the agent
 * legitimately ran, the hook recorded honestly, and we just need to swap
 * the agent's free-form value for the canonical list.
 */
export function applyGraphToolUsageFromSidecar(
  data: unknown,
  projectPath: string,
  sessionId: string | undefined,
  agentName?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof data === 'object' && data !== null ? { ...(data as Record<string, unknown>) } : {};

  if (!sessionId) {
    logger.warn(
      '[graph_queries_used] No sessionId for analyzer attempt — forcing graph_queries_used=[]',
    );
    return {
      ...base,
      graph_queries_used: [],
      graph_overflow_count: 0,
      graph_overflow_tools: [],
      soft_warning: [],
    };
  }

  const slug = claudeProjectSlug(path.resolve(projectPath));
  const sidecarPath = path.join(
    os.homedir(),
    '.claude',
    'projects',
    slug,
    `${sessionId}.graph-tool-uses.json`,
  );

  if (!existsSync(sidecarPath)) {
    logger.warn(
      `[graph_queries_used] Sidecar missing for session ${sessionId} — forcing graph_queries_used=[] (expected at ${sidecarPath})`,
    );
    return {
      ...base,
      graph_queries_used: [],
      graph_overflow_count: 0,
      graph_overflow_tools: [],
      soft_warning: [],
    };
  }

  let parsed: GraphToolUsesSidecar;
  try {
    const raw = readFileSync(sidecarPath, 'utf-8');
    parsed = JSON.parse(raw) as GraphToolUsesSidecar;
  } catch (err) {
    logger.warn(
      `[graph_queries_used] Failed to read sidecar ${sidecarPath}: ${err instanceof Error ? err.message : String(err)} — forcing graph_queries_used=[]`,
    );
    return {
      ...base,
      graph_queries_used: [],
      graph_overflow_count: 0,
      graph_overflow_tools: [],
      soft_warning: [],
    };
  }

  const names = Array.isArray(parsed.uniqueNames)
    ? parsed.uniqueNames.filter((n): n is string => typeof n === 'string' && n.length > 0)
    : [];

  const overflows = Array.isArray(parsed.overflows) ? parsed.overflows : [];
  const overflowTools = [
    ...new Set(
      overflows
        .map((o) => (typeof o.tool === 'string' ? o.tool : ''))
        .filter((t): t is string => t.length > 0),
    ),
  ].sort();

  // Soft warnings (non-blocking telemetry) — derived from sidecar data
  // when present. When the sidecar predates the gira-init-run audit
  // Phase E (no nameCounts / nonGraphCount), softWarning is empty.
  const nameCounts = (parsed.nameCounts ?? {}) as Record<string, number>;
  const nonGraphCount = typeof parsed.nonGraphCount === 'number' ? parsed.nonGraphCount : 0;
  const softWarnings =
    agentName && (parsed.nameCounts !== undefined || parsed.nonGraphCount !== undefined)
      ? computeSoftWarnings(agentName, parsed.count ?? 0, nonGraphCount, nameCounts, overflows)
      : [];

  return {
    ...base,
    graph_queries_used: [...names].sort(),
    graph_overflow_count: overflows.length,
    graph_overflow_tools: overflowTools,
    soft_warning: softWarnings,
  };
}
