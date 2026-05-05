/**
 * Plan §F.6 + commit 9 (2026-05-05) — run-level stats for the
 * debug-store HTML index.
 *
 * Two stats are surfaced as new rows in the index sidebar:
 *
 *   1. **Cache hit rate** — the fraction of agent calls in this run
 *      that read from the Anthropic prompt cache. Computed from
 *      `metrics/token-usage.jsonl` records; `cache_hit: true` is set
 *      when `cache_read_input_tokens > 0` in the response. Phase 1
 *      analyzers within a 5-minute TTL window should produce ≥ 50%
 *      cache hit rate after commits 7 + 8 land.
 *
 *   2. **Graph overflows** — the total count of graph MCP tool
 *      results that exceeded the per-call token cap. Aggregated by
 *      reading each attempt's `output.json`, summing the
 *      `graph_overflow_count` field that the Phase 1 analyzer Stop
 *      hook writes (see `applyGraphToolUsageFromSidecar`). After
 *      commits 1 + 2, the gira run target is 0–2 overflows total
 *      (was 10 before the spill-protocol HARD FAILURE wording).
 *
 * Both stats are best-effort: missing files, malformed JSON, or
 * absent fields silently degrade to "unknown" rather than fail the
 * render. Observability that crashes the renderer is worse than no
 * observability.
 */
import { readFile, readdir } from 'fs/promises';
import path from 'path';

export interface RunStats {
  /** Total agent calls observed in token-usage.jsonl (or 0 when missing). */
  totalAgentCalls: number;
  /** Calls where `cache_hit: true`. */
  cacheHits: number;
  /**
   * Fraction in [0, 1]. `null` when there are zero observations —
   * "unknown" instead of "0%" so the renderer can show a hint
   * rather than a misleading number.
   */
  cacheHitRate: number | null;
  /** Sum of `graph_overflow_count` across every attempt's output.json. */
  graphOverflowCount: number;
  /**
   * Sorted unique list of graph tool names that overflowed at least
   * once anywhere in the run. Useful for spotting one tool that
   * regularly overflows vs. broad spillage.
   */
  graphOverflowTools: string[];
}

const EMPTY_STATS: RunStats = {
  totalAgentCalls: 0,
  cacheHits: 0,
  cacheHitRate: null,
  graphOverflowCount: 0,
  graphOverflowTools: [],
};

/**
 * Compute aggregate stats for a debug run. Pass the run dir
 * (e.g. `.claude-temp/initialize-project/debug/runs/<runId>`).
 *
 * The function resolves token-usage from `<runDir>/../../../metrics/
 * token-usage.jsonl` (the emitter writes per-project, not per-run,
 * so the JSONL is one level above the workflow's debug folder).
 * Caller may override the path for tests.
 */
export async function computeRunStats(
  runDir: string,
  options: { tokenUsageJsonlPath?: string } = {},
): Promise<RunStats> {
  const stats: RunStats = { ...EMPTY_STATS, graphOverflowTools: [] };

  // -------------------------- token-usage rollup --------------------------
  const tokenJsonlPath = options.tokenUsageJsonlPath ?? deriveDefaultTokenJsonlPath(runDir);
  if (tokenJsonlPath) {
    try {
      const body = await readFile(tokenJsonlPath, 'utf-8');
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed);
          // Defensive: only count records whose phase belongs to THIS run.
          // Without runId on the record we use the simple proxy: count
          // every record in the JSONL (the emitter is per-project, but
          // the debug-store uses one run per init invocation).
          if (typeof record === 'object' && record !== null) {
            stats.totalAgentCalls++;
            if (record.cache_hit === true) stats.cacheHits++;
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file missing — leave totals at 0
    }
  }
  if (stats.totalAgentCalls > 0) {
    stats.cacheHitRate = stats.cacheHits / stats.totalAgentCalls;
  }

  // -------------------------- graph overflow rollup -----------------------
  const overflowToolsSet = new Set<string>();
  await walkOutputJsons(runDir, (outputJson) => {
    const count = pickOverflowCount(outputJson);
    if (typeof count === 'number' && count > 0) {
      stats.graphOverflowCount += count;
    }
    const tools = pickOverflowTools(outputJson);
    for (const t of tools) overflowToolsSet.add(t);
  });
  stats.graphOverflowTools = [...overflowToolsSet].sort();

  return stats;
}

/**
 * Best-effort default for the token-usage JSONL path. The emitter
 * writes to `<projectPath>/.claude-temp/metrics/token-usage.jsonl`;
 * the run dir lives at
 * `<projectPath>/.claude-temp/<workflow>/debug/runs/<runId>`.
 * Walk up four segments to land at `<projectPath>/.claude-temp` and
 * then `metrics/token-usage.jsonl`.
 */
function deriveDefaultTokenJsonlPath(runDir: string): string | null {
  // .../<projectPath>/.claude-temp/<workflow>/debug/runs/<runId>
  // up 4 = `.claude-temp`
  const ancestor = path.resolve(runDir, '..', '..', '..', '..');
  if (!ancestor) return null;
  return path.join(ancestor, 'metrics', 'token-usage.jsonl');
}

async function walkOutputJsons(rootDir: string, visit: (parsed: unknown) => void): Promise<void> {
  let dirents: import('fs').Dirent[] = [];
  try {
    dirents = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    const full = path.join(rootDir, d.name);
    if (d.isDirectory()) {
      await walkOutputJsons(full, visit);
    } else if (d.isFile() && d.name === 'output.json') {
      try {
        const body = await readFile(full, 'utf-8');
        const parsed = JSON.parse(body);
        visit(parsed);
      } catch {
        // skip unreadable / malformed
      }
    }
  }
}

function pickOverflowCount(parsed: unknown): number | undefined {
  if (parsed && typeof parsed === 'object' && 'graph_overflow_count' in parsed) {
    const v = (parsed as Record<string, unknown>).graph_overflow_count;
    if (typeof v === 'number') return v;
  }
  return undefined;
}

function pickOverflowTools(parsed: unknown): string[] {
  if (parsed && typeof parsed === 'object' && 'graph_overflow_tools' in parsed) {
    const v = (parsed as Record<string, unknown>).graph_overflow_tools;
    if (Array.isArray(v) && v.every((s) => typeof s === 'string')) {
      return v as string[];
    }
  }
  return [];
}

/**
 * Format a hit rate fraction as a human-readable percentage.
 * `null` (no observations) → '—' so the renderer shows a hint
 * rather than a deceptive '0%'.
 */
export function formatCacheHitRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(0)}%`;
}
