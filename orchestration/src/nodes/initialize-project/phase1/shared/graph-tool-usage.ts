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
      ? computeSoftWarnings(agentName, parsed.count ?? 0, nonGraphCount, nameCounts)
      : [];

  return {
    ...base,
    graph_queries_used: [...names].sort(),
    graph_overflow_count: overflows.length,
    graph_overflow_tools: overflowTools,
    soft_warning: softWarnings,
  };
}
