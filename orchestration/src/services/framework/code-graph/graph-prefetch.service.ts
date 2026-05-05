/**
 * Plan §I.2 (gira-exhaustive followup, 2026-05-05) — graph prefetch
 * snapshot.
 *
 * Phase 0 has the opportunity to call the four cheapest graph
 * orientation queries ONCE and snapshot the results to
 * `<project>/.<provider>-temp/initialize-project/graph-prefetch.json`.
 * Phase 1 analyzers can then read the snapshot from their cache-
 * eligible prefix, skipping those four calls in their own
 * sessions. Saves 4 × 4 = 16 graph tool calls per run.
 *
 * This module ships the SNAPSHOT SHAPE and the READ PATH. The
 * WRITE path (actual MCP-client invocation from Phase 0 against
 * the running `code-review-graph` server) is intentionally
 * deferred to a follow-up commit because invoking an MCP server
 * from TypeScript outside an LLM agent context requires a JSON-RPC
 * client we do not currently build. Until that follow-up lands,
 * the prefetch file is absent on every run; the discipline gracefully
 * treats absence as "no prefetch — call the tools yourself".
 *
 * Why ship the read path now:
 *   - Establishes the canonical filename and JSON shape so any
 *     future writer (TS MCP client, a Phase 0 helper script, a
 *     manual operator snapshot) interoperates cleanly.
 *   - Lets the discipline already reference the prefetch hook so
 *     the agent prompts are stable across the gap.
 *   - The read path is pure file I/O; no risk of misbehaviour
 *     when no file exists.
 *
 * Stack-agnostic: every field is graph-derived (community names,
 * hub/bridge `qualified_name`, file/function counts) — independent
 * of language family.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolveTempPath } from '../../../utils/provider-paths.js';

const PREFETCH_FILENAME = 'graph-prefetch.json';

/**
 * Snapshot shape. Optional fields tolerate writers that only
 * gather a subset (e.g. a future writer that only invokes
 * `get_minimal_context_tool` and skips the others).
 */
export interface GraphPrefetchSnapshot {
  /** ISO 8601 timestamp the snapshot was written. */
  generatedAt: string;
  /**
   * SHA of the graph DB the snapshot was taken against. Consumers
   * MUST verify this matches the current graph SHA before trusting
   * the snapshot — a mismatch means the snapshot is stale.
   */
  graphSha: string;
  /**
   * Output of `mcp__code_graph__get_minimal_context_tool`. ~100
   * tokens of orientation data. Optional: writers that don't
   * gather it leave the field absent.
   */
  minimalContext?: {
    topCommunities?: Array<{ name: string; size?: number; cohesion?: number }>;
    topFlows?: Array<{ id: string; name?: string; criticality?: number }>;
    riskScore?: number;
    suggestedNextTools?: string[];
  };
  /**
   * Output of `mcp__code_graph__list_communities_tool({
   *   detail_level: "minimal"
   * })`. Each entry is the minimal-shape community.
   */
  communities?: Array<{
    name: string;
    size?: number;
    cohesion?: number;
    dominant_language?: string;
  }>;
  /** Output of `mcp__code_graph__get_hub_nodes_tool({ top_n: 10 })`. */
  hubs?: Array<{ qualified_name: string; kind?: string; score?: number }>;
  /** Output of `mcp__code_graph__get_bridge_nodes_tool({ top_n: 10 })`. */
  bridges?: Array<{ qualified_name: string; kind?: string; score?: number }>;
}

/**
 * Returns the on-disk path the prefetch snapshot lives at, given
 * the project + the active provider. Same per-provider temp dir
 * shape the rest of the framework uses.
 */
export function graphPrefetchPath(projectPath: string): string {
  const dir = resolveTempPath(projectPath, 'initialize-project');
  return join(dir, PREFETCH_FILENAME);
}

/**
 * Read the snapshot and verify its `graphSha` matches the current
 * graph DB hash. Returns null when:
 *   - no snapshot file exists;
 *   - the snapshot is unreadable / malformed;
 *   - the snapshot's `graphSha` does not match the supplied current
 *     SHA (the graph was rebuilt since the snapshot was taken).
 *
 * Bounded cost: O(snapshot file size). No graph-tool invocation.
 */
export function readGraphPrefetch(
  projectPath: string,
  currentGraphSha: string,
): GraphPrefetchSnapshot | null {
  const path = graphPrefetchPath(projectPath);
  if (!existsSync(path)) return null;
  let parsed: GraphPrefetchSnapshot;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as GraphPrefetchSnapshot;
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.graphSha !== 'string' ||
    parsed.graphSha.length === 0
  ) {
    return null;
  }
  if (currentGraphSha && parsed.graphSha !== currentGraphSha) {
    return null;
  }
  return parsed;
}

/**
 * Persist a snapshot. Future writers (TS MCP client, manual
 * snapshot tool) call this. Idempotent: overwrites any prior
 * snapshot on the same path.
 */
export function writeGraphPrefetch(projectPath: string, snapshot: GraphPrefetchSnapshot): void {
  const path = graphPrefetchPath(projectPath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/**
 * Compact prose summary of the prefetch snapshot — emitted into
 * the Phase 1 cache-eligible prefix. ≤500 chars by design so the
 * cache prefix doesn't bloat. Returns the empty string when no
 * snapshot is available; callers must treat empty as "no prefetch
 * hint to inject".
 */
export function renderPrefetchHint(snapshot: GraphPrefetchSnapshot | null): string {
  if (!snapshot) return '';

  const sections: string[] = ['### Pre-fetched graph orientation (Phase 0 snapshot)'];
  if (snapshot.minimalContext?.topCommunities?.length) {
    const names = snapshot.minimalContext.topCommunities
      .slice(0, 8)
      .map((c) => c.name)
      .join(', ');
    sections.push(`- Top communities: ${names}.`);
  }
  if (snapshot.communities?.length && !snapshot.minimalContext?.topCommunities) {
    const names = snapshot.communities
      .slice(0, 8)
      .map((c) => c.name)
      .join(', ');
    sections.push(`- Communities (minimal): ${names}.`);
  }
  if (snapshot.hubs?.length) {
    const names = snapshot.hubs
      .slice(0, 5)
      .map((h) => h.qualified_name)
      .join(', ');
    sections.push(`- Top hubs: ${names}.`);
  }
  if (snapshot.bridges?.length) {
    const names = snapshot.bridges
      .slice(0, 5)
      .map((b) => b.qualified_name)
      .join(', ');
    sections.push(`- Top bridges: ${names}.`);
  }
  sections.push(
    `- These four queries are pre-run; you may skip \`get_minimal_context_tool\`, \`list_communities_tool\`, \`get_hub_nodes_tool\`, and \`get_bridge_nodes_tool\` for orientation. Drill in directly from the snapshot above when you need detail beyond it.`,
  );
  return sections.join('\n');
}

export const __INTERNAL = {
  PREFETCH_FILENAME,
};
