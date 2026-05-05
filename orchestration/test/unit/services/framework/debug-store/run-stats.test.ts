/**
 * Plan §F.6 + commit 9 (2026-05-05) — run-level stats observability.
 *
 * The two stats surfaced in the run index sidebar:
 *   - **Cache hit rate**: post-§F caching, Phase 1 analyzers within
 *     a 5-minute TTL should produce ≥ 50% hit rate. The renderer
 *     turns the rate into a sidebar row so operators can verify
 *     caching is engaged without diving into the raw JSONL.
 *   - **Graph overflows**: post-§B spill protocol, this should
 *     stay near zero. A spike means an analyzer is overflowing
 *     repeatedly and bypassing the HARD FAILURE wording.
 *
 * Both stats are best-effort by design — IO/parse failures must
 * never crash the renderer (worse than no observability is a broken
 * debug page).
 */
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'fs/promises';
import {
  computeRunStats,
  formatCacheHitRate,
} from '../../../../../src/services/framework/debug-store/run-stats.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtempPrefix('run-stats-');
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function mkdtempPrefix(prefix: string): Promise<string> {
  const { mkdtemp } = await import('fs/promises');
  return await mkdtemp(join(tmpdir(), prefix));
}

async function writeOutputJson(file: string, body: unknown): Promise<void> {
  await mkdir(file.replace(/\/[^/]+$/, ''), { recursive: true });
  await writeFile(file, JSON.stringify(body), 'utf-8');
}

describe('formatCacheHitRate', () => {
  it('renders null as a dash (unknown — no observations)', () => {
    expect(formatCacheHitRate(null)).toBe('—');
  });

  it('renders 0 as 0% (zero hits IS observed)', () => {
    expect(formatCacheHitRate(0)).toBe('0%');
  });

  it('renders 1 as 100%', () => {
    expect(formatCacheHitRate(1)).toBe('100%');
  });

  it('rounds to integer percent', () => {
    expect(formatCacheHitRate(0.5)).toBe('50%');
    expect(formatCacheHitRate(0.336)).toBe('34%');
    expect(formatCacheHitRate(0.998)).toBe('100%');
  });
});

describe('computeRunStats — token-usage aggregation', () => {
  it('returns zeroed counters when nothing exists yet', async () => {
    const stats = await computeRunStats(tempDir);
    expect(stats.totalAgentCalls).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheHitRate).toBeNull();
    expect(stats.graphOverflowCount).toBe(0);
    expect(stats.graphOverflowTools).toEqual([]);
  });

  it('counts cache hits + total calls from a JSONL file', async () => {
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      {
        ts: '1',
        phase: 'p1',
        agent: 'a',
        cache_hit: true,
        input_tokens: 10,
        output_tokens: 5,
        duration_ms: 100,
      },
      {
        ts: '2',
        phase: 'p1',
        agent: 'b',
        cache_hit: false,
        input_tokens: 20,
        output_tokens: 10,
        duration_ms: 200,
      },
      {
        ts: '3',
        phase: 'p1',
        agent: 'c',
        cache_hit: true,
        input_tokens: 30,
        output_tokens: 15,
        duration_ms: 300,
      },
      {
        ts: '4',
        phase: 'p2',
        agent: 'd',
        cache_hit: false,
        input_tokens: 40,
        output_tokens: 20,
        duration_ms: 400,
      },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.totalAgentCalls).toBe(4);
    expect(stats.cacheHits).toBe(2);
    expect(stats.cacheHitRate).toBe(0.5);
  });

  it('skips malformed JSONL lines without crashing', async () => {
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const lines = [
      JSON.stringify({ ts: '1', cache_hit: true }),
      'not-json{',
      '',
      JSON.stringify({ ts: '2', cache_hit: false }),
    ];
    await writeFile(jsonlPath, lines.join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.totalAgentCalls).toBe(2);
    expect(stats.cacheHits).toBe(1);
  });

  it('treats missing cache_hit field as false (older records)', async () => {
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      { ts: '1', input_tokens: 10 }, // no cache_hit
      { ts: '2', cache_hit: true },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.totalAgentCalls).toBe(2);
    expect(stats.cacheHits).toBe(1);
  });

  it('does not crash when the JSONL file does not exist (silent zero counters)', async () => {
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'does-not-exist.jsonl'),
    });
    expect(stats.totalAgentCalls).toBe(0);
    expect(stats.cacheHitRate).toBeNull();
  });
});

describe('computeRunStats — graph overflow rollup', () => {
  it('sums graph_overflow_count across nested output.json files', async () => {
    await writeOutputJson(
      join(tempDir, 'phase-1', 'agent-a', 'attempt-1', 'sess-x', 'output.json'),
      {
        agent_name: 'a',
        graph_overflow_count: 2,
        graph_overflow_tools: ['mcp__code_graph__list_communities_tool'],
      },
    );
    await writeOutputJson(
      join(tempDir, 'phase-1', 'agent-b', 'attempt-1', 'sess-y', 'output.json'),
      {
        agent_name: 'b',
        graph_overflow_count: 3,
        graph_overflow_tools: [
          'mcp__code_graph__get_community_tool',
          'mcp__code_graph__list_communities_tool',
        ],
      },
    );
    await writeOutputJson(
      join(tempDir, 'phase-2', 'agent-c', 'attempt-1', 'sess-z', 'output.json'),
      {
        agent_name: 'c',
        // no overflow keys
      },
    );

    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'no-jsonl-here'),
    });
    expect(stats.graphOverflowCount).toBe(5);
    // Sorted dedup of tools across all attempts.
    expect(stats.graphOverflowTools).toEqual([
      'mcp__code_graph__get_community_tool',
      'mcp__code_graph__list_communities_tool',
    ]);
  });

  it('returns zero overflows when no output.json files exist', async () => {
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.graphOverflowCount).toBe(0);
    expect(stats.graphOverflowTools).toEqual([]);
  });

  it('survives malformed output.json files (best-effort observability)', async () => {
    const goodPath = join(tempDir, 'phase-1', 'good', 'attempt-1', 'sess', 'output.json');
    await writeOutputJson(goodPath, { graph_overflow_count: 4 });
    const badPath = join(tempDir, 'phase-1', 'bad', 'attempt-1', 'sess', 'output.json');
    await mkdir(badPath.replace(/\/[^/]+$/, ''), { recursive: true });
    await writeFile(badPath, 'not-json{', 'utf-8');

    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.graphOverflowCount).toBe(4);
  });

  it('ignores graph_overflow_tools when not an array (defensive parse)', async () => {
    await writeOutputJson(join(tempDir, 'phase-1', 'a', 'attempt-1', 'sess', 'output.json'), {
      graph_overflow_count: 1,
      graph_overflow_tools: 'not-an-array',
    });
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.graphOverflowCount).toBe(1);
    expect(stats.graphOverflowTools).toEqual([]);
  });
});

// Plan §C 5.3 (gira-exhaustive followup, 2026-05-05): aggregate
// soft_warning arrays from every analyzer's output.json into a
// per-bucket count so the run index sidebar can render the
// breakdown.
describe('computeRunStats — soft_warning rollup', () => {
  it('returns an empty object when no output.json files carry soft_warning', async () => {
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.softWarningCounts).toEqual({});
  });

  it('aggregates soft warnings across multiple attempts', async () => {
    await writeOutputJson(join(tempDir, 'phase-1', 'a', 'attempt-1', 'sess', 'output.json'), {
      soft_warning: ['low_graph_ratio', 'per_tool_budget_exceeded'],
    });
    await writeOutputJson(join(tempDir, 'phase-1', 'b', 'attempt-1', 'sess', 'output.json'), {
      soft_warning: ['per_tool_budget_exceeded', 'graph_overflow_detected'],
    });
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.softWarningCounts).toEqual({
      low_graph_ratio: 1,
      per_tool_budget_exceeded: 2,
      graph_overflow_detected: 1,
    });
  });

  it('ignores soft_warning when not an array (defensive parse)', async () => {
    await writeOutputJson(join(tempDir, 'phase-1', 'a', 'attempt-1', 'sess', 'output.json'), {
      soft_warning: 'not-an-array',
    });
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    expect(stats.softWarningCounts).toEqual({});
  });

  it('ignores non-string entries inside the soft_warning array (defensive parse)', async () => {
    await writeOutputJson(join(tempDir, 'phase-1', 'a', 'attempt-1', 'sess', 'output.json'), {
      soft_warning: ['low_graph_ratio', 42, null, { foo: 'bar' }],
    });
    const stats = await computeRunStats(tempDir, {
      tokenUsageJsonlPath: join(tempDir, 'absent.jsonl'),
    });
    // Strict array-of-strings check rejects the whole array on a
    // mixed-type fixture (defensive); softWarningCounts stays empty.
    expect(stats.softWarningCounts).toEqual({});
  });
});

// Plan §F.6 codex-parity follow-up (2026-05-05) — the run-stats
// rollup now sums cache_read_input_tokens and cache_creation_input_tokens
// from each token-usage record so the sidebar can show real cache
// volumes (not just a hit/miss boolean).
describe('computeRunStats — cache token volume rollup', () => {
  it('sums cache_read_input_tokens across records and reports it', async () => {
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      {
        ts: '1',
        cache_hit: true,
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 0,
      },
      {
        ts: '2',
        cache_hit: true,
        input_tokens: 8,
        output_tokens: 3,
        cache_read_input_tokens: 1200,
        cache_creation_input_tokens: 0,
      },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.cacheReadInputTokens).toBe(2700);
    expect(stats.cacheCreationInputTokens).toBe(0);
  });

  it('sums cache_creation_input_tokens (Anthropic only) when present', async () => {
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      {
        ts: '1',
        cache_hit: false,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 4000,
      },
      {
        ts: '2',
        cache_hit: true,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.cacheReadInputTokens).toBe(4000);
    expect(stats.cacheCreationInputTokens).toBe(4000);
  });

  it('returns -1 when no records carried the cache_read field (older runs)', async () => {
    // Distinguishes "field omitted" from "field measured zero". The
    // renderer hides the row entirely on -1 and shows the row with 0
    // on a real zero.
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      { ts: '1', cache_hit: true, input_tokens: 10, output_tokens: 5 },
      { ts: '2', cache_hit: false, input_tokens: 5, output_tokens: 5 },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.cacheReadInputTokens).toBe(-1);
    expect(stats.cacheCreationInputTokens).toBe(-1);
  });

  it('treats an explicit 0 as "observed zero" not "unknown"', async () => {
    // A run where caching never engaged but the field was recorded
    // (e.g. -1 day before the cache infrastructure landed) → operator
    // sees 0 in the sidebar, not "row missing".
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      {
        ts: '1',
        cache_hit: false,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.cacheReadInputTokens).toBe(0);
    expect(stats.cacheCreationInputTokens).toBe(0);
  });

  it('skips negative sentinel values (-1 means unknown, do not sum)', async () => {
    // Defensive: if a CLI fails to read the transcript, the extractor
    // returns -1 for unknown. We must not sum -1 into the rollup —
    // that would corrupt the savings indicator.
    const jsonlPath = join(tempDir, 'token-usage.jsonl');
    const records = [
      { ts: '1', cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
      { ts: '2', cache_read_input_tokens: -1, cache_creation_input_tokens: -1 },
      { ts: '3', cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const stats = await computeRunStats(tempDir, { tokenUsageJsonlPath: jsonlPath });
    expect(stats.cacheReadInputTokens).toBe(1500);
    expect(stats.cacheCreationInputTokens).toBe(0);
  });
});
