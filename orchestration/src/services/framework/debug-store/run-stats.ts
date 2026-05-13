/**
 * Run-level stats for the debug-store HTML index.
 *
 * Two stats are surfaced as new rows in the index sidebar:
 *
 *   1. **Cache hit rate** — the fraction of agent calls in this run
 *      that read from the Anthropic prompt cache.
 *
 *   2. **Graph overflows** — the total count of graph MCP tool
 *      results that exceeded the per-call token cap.
 *
 * Both stats are best-effort: missing files, malformed JSON, or
 * absent fields silently degrade to "unknown" rather than fail the
 * render.
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
  /**
   * Sum of `cache_read_input_tokens` across every record. Surfaces
   * the volume of cached tokens served at the ~10% rate — i.e., the
   * dollar-weighted savings indicator. -1 when no records carried
   * the field (older runs predate the split).
   */
  cacheReadInputTokens: number;
  /**
   * Sum of `cache_creation_input_tokens` across every record (the
   * one-time write cost at ~125% rate). 0 on Codex-only runs (OpenAI
   * does not surface this counter); -1 when no records carried it.
   */
  cacheCreationInputTokens: number;
  /** Sum of `graph_overflow_count` across every attempt's output.json. */
  graphOverflowCount: number;
  /**
   * Sorted unique list of graph tool names that overflowed at least
   * once anywhere in the run. Useful for spotting one tool that
   * regularly overflows vs. broad spillage.
   */
  graphOverflowTools: string[];
  /**
   * Aggregate counts of soft warnings emitted by the analyzers' output.json
   * `soft_warning` arrays. Empty when no analyzer surfaced any warning.
   *
   * Optional for back-compat with older RunStats fixtures. Renderer treats
   * `undefined` as an empty object.
   */
  softWarningCounts?: Record<string, number>;
}

const EMPTY_STATS: RunStats = {
  totalAgentCalls: 0,
  cacheHits: 0,
  cacheHitRate: null,
  cacheReadInputTokens: -1,
  cacheCreationInputTokens: -1,
  graphOverflowCount: 0,
  graphOverflowTools: [],
  softWarningCounts: {},
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

  const tokenJsonlPath = options.tokenUsageJsonlPath ?? deriveDefaultTokenJsonlPath(runDir);
  let cacheReadObserved = false;
  let cacheCreationObserved = false;
  let cacheReadSum = 0;
  let cacheCreationSum = 0;
  if (tokenJsonlPath) {
    try {
      const body = await readFile(tokenJsonlPath, 'utf-8');
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed);
          if (typeof record === 'object' && record !== null) {
            stats.totalAgentCalls++;
            if (record.cache_hit === true) stats.cacheHits++;
            if (
              typeof record.cache_read_input_tokens === 'number' &&
              record.cache_read_input_tokens >= 0
            ) {
              cacheReadObserved = true;
              cacheReadSum += record.cache_read_input_tokens;
            }
            if (
              typeof record.cache_creation_input_tokens === 'number' &&
              record.cache_creation_input_tokens >= 0
            ) {
              cacheCreationObserved = true;
              cacheCreationSum += record.cache_creation_input_tokens;
            }
          }
        } catch {}
      }
    } catch {}
  }
  stats.cacheReadInputTokens = cacheReadObserved ? cacheReadSum : -1;
  stats.cacheCreationInputTokens = cacheCreationObserved ? cacheCreationSum : -1;
  if (stats.totalAgentCalls > 0) {
    stats.cacheHitRate = stats.cacheHits / stats.totalAgentCalls;
  }

  const overflowToolsSet = new Set<string>();
  const softWarningCounts: Record<string, number> = {};
  await walkOutputJsons(runDir, (outputJson) => {
    const count = pickOverflowCount(outputJson);
    if (typeof count === 'number' && count > 0) {
      stats.graphOverflowCount += count;
    }
    const tools = pickOverflowTools(outputJson);
    for (const t of tools) overflowToolsSet.add(t);

    const warnings = pickSoftWarnings(outputJson);
    for (const w of warnings) {
      softWarningCounts[w] = (softWarningCounts[w] ?? 0) + 1;
    }
  });
  stats.graphOverflowTools = [...overflowToolsSet].sort();
  stats.softWarningCounts = softWarningCounts;

  return stats;
}

/**
 * Best-effort default for the token-usage JSONL path.
 */
function deriveDefaultTokenJsonlPath(runDir: string): string | null {
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
        continue;
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

function pickSoftWarnings(parsed: unknown): string[] {
  if (parsed && typeof parsed === 'object' && 'soft_warning' in parsed) {
    const v = (parsed as Record<string, unknown>).soft_warning;
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
