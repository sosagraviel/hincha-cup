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
