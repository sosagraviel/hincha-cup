/**
 * Defence-in-depth at the wiki layer: even if a Phase 1 analyzer regresses and
 * emits free-form prose in `graph_queries_used`, the wiki frontmatter must
 * never carry anything except canonical `mcp__code_graph__*_tool` names.
 *
 * The Stop hook (`validate-analyzer-json.hook.ts`) and the Phase 1 sidecar
 * consumer are the source-of-truth path; this helper is the secondary fence.
 * Drops anything not matching the canonical shape, dedupes, and sorts ASCII
 * ascending so wiki frontmatter diffs are stable.
 */
const CANONICAL_GRAPH_TOOL_PATTERN = /^mcp__code_graph__[A-Za-z0-9_]+$/;

export function normalizeGraphQueriesUsed(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    if (!CANONICAL_GRAPH_TOOL_PATTERN.test(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  out.sort();
  return out;
}
