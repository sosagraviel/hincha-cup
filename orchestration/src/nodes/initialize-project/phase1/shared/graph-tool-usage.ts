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
): Record<string, unknown> {
  const base: Record<string, unknown> =
    typeof data === 'object' && data !== null ? { ...(data as Record<string, unknown>) } : {};

  if (!sessionId) {
    logger.warn(
      '[graph_queries_used] No sessionId for analyzer attempt — forcing graph_queries_used=[]',
    );
    return { ...base, graph_queries_used: [], graph_overflow_count: 0, graph_overflow_tools: [] };
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
    return { ...base, graph_queries_used: [], graph_overflow_count: 0, graph_overflow_tools: [] };
  }

  let parsed: GraphToolUsesSidecar;
  try {
    const raw = readFileSync(sidecarPath, 'utf-8');
    parsed = JSON.parse(raw) as GraphToolUsesSidecar;
  } catch (err) {
    logger.warn(
      `[graph_queries_used] Failed to read sidecar ${sidecarPath}: ${err instanceof Error ? err.message : String(err)} — forcing graph_queries_used=[]`,
    );
    return { ...base, graph_queries_used: [], graph_overflow_count: 0, graph_overflow_tools: [] };
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

  return {
    ...base,
    graph_queries_used: [...names].sort(),
    graph_overflow_count: overflows.length,
    graph_overflow_tools: overflowTools,
  };
}
