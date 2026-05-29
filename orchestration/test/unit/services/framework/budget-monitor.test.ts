import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  snapshotBudgets,
  formatBudgetWarnings,
  type BudgetUtilization,
} from '../../../../src/services/framework/budget-monitor.js';
import type { TokenUsageRecord } from '../../../../src/services/framework/debug-store/token-usage-emitter.js';

const CONTEXT_WINDOW = 200_000;

function makeRecord(overrides: Partial<TokenUsageRecord>): TokenUsageRecord {
  return {
    ts: '2026-01-01T00:00:00.000Z',
    phase: 'planning',
    agent: 'planner',
    input_tokens: 1000,
    output_tokens: 500,
    cache_hit: false,
    duration_ms: 200,
    ...overrides,
  };
}

async function writeJsonl(filePath: string, records: TokenUsageRecord[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(filePath, content, 'utf-8');
}

describe('snapshotBudgets', () => {
  let tmpDir: string;
  let jsonlPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'budget-monitor-test-'));
    jsonlPath = path.join(tmpDir, 'metrics', 'token-usage.jsonl');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns all entries with ok status when JSONL file does not exist', () => {
    const results = snapshotBudgets({
      jsonlPath: jsonlPath + '.nonexistent',
      contextWindow: CONTEXT_WINDOW,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((u) => u.status === 'ok')).toBe(true);
    expect(results.every((u) => u.consumed === 0)).toBe(true);
  });

  it('returns all entries with ok status when JSONL is empty', async () => {
    await mkdir(path.dirname(jsonlPath), { recursive: true });
    await writeFile(jsonlPath, '', 'utf-8');
    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    expect(results.every((u) => u.status === 'ok')).toBe(true);
  });

  it('classifies planner graph queries as approaching_target at 7 records (87% of target)', async () => {
    const records = Array.from({ length: 7 }, () =>
      makeRecord({ agent: 'planner', tool: 'mcp__code_graph__semantic_search_nodes_tool' }),
    );
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'planner_total_graph_queries');

    expect(entry).toBeDefined();
    expect(entry!.consumed).toBe(7);
    expect(entry!.status).toBe('approaching_target');
  });

  it('classifies planner graph queries as over_target at 9 records', async () => {
    const records = Array.from({ length: 9 }, () =>
      makeRecord({ agent: 'planner', tool: 'mcp__code_graph__query_graph_tool' }),
    );
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'planner_total_graph_queries');

    expect(entry).toBeDefined();
    expect(entry!.consumed).toBe(9);
    expect(entry!.status).toBe('over_target');
  });

  it('classifies planner graph queries as over_warn at 17 records', async () => {
    const records = Array.from({ length: 17 }, () =>
      makeRecord({ agent: 'planner', tool: 'mcp__code_graph__get_impact_radius_tool' }),
    );
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'planner_total_graph_queries');

    expect(entry).toBeDefined();
    expect(entry!.consumed).toBe(17);
    expect(entry!.status).toBe('over_warn');
  });

  it('classifies wiki preload at 30% of context as over_target', async () => {
    const tokensAt30Percent = Math.round(CONTEXT_WINDOW * 0.3);
    const records = [
      makeRecord({
        phase: 'wiki_preload',
        agent: 'loader',
        tool: undefined,
        input_tokens: tokensAt30Percent,
        output_tokens: 0,
      }),
    ];
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'wiki_preload');

    expect(entry).toBeDefined();
    expect(entry!.consumed).toBe(tokensAt30Percent);
    expect(entry!.status).toBe('over_target');
  });

  it('filters by phase so only matching records contribute', async () => {
    const records = [
      makeRecord({
        phase: 'wiki_preload',
        agent: 'loader',
        input_tokens: 50_000,
        output_tokens: 0,
      }),
      makeRecord({ phase: 'planning', agent: 'planner', input_tokens: 1000, output_tokens: 500 }),
    ];
    await writeJsonl(jsonlPath, records);

    const allResults = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const filteredResults = snapshotBudgets({
      jsonlPath,
      phase: 'wiki_preload',
      contextWindow: CONTEXT_WINDOW,
    });

    const wikiAll = allResults.find((u) => u.budgetKey === 'wiki_preload');
    const wikiFiltered = filteredResults.find((u) => u.budgetKey === 'wiki_preload');

    expect(wikiAll!.consumed).toBe(50_000);
    expect(wikiFiltered!.consumed).toBe(50_000);

    const plannerAll = allResults.find((u) => u.budgetKey === 'planner_total_graph_queries');
    const plannerFiltered = filteredResults.find(
      (u) => u.budgetKey === 'planner_total_graph_queries',
    );

    expect(plannerAll!.consumed).toBe(0);
    expect(plannerFiltered!.consumed).toBe(0);
  });

  it('tolerates malformed JSONL lines without throwing', async () => {
    await mkdir(path.dirname(jsonlPath), { recursive: true });
    const goodRecord = JSON.stringify(
      makeRecord({ agent: 'planner', tool: 'mcp__code_graph__semantic_search_nodes_tool' }),
    );
    await writeFile(jsonlPath, `${goodRecord}\nnot-valid-json\n`, 'utf-8');

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'planner_total_graph_queries');
    expect(entry!.consumed).toBe(1);
  });

  it('uses budget_key field on record when present, overriding classification', async () => {
    const records = [
      makeRecord({
        agent: 'other',
        tool: undefined,
        budget_key: 'wiki_preload',
        input_tokens: 10_000,
        output_tokens: 0,
      }),
    ];
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'wiki_preload');
    expect(entry!.consumed).toBe(10_000);
  });

  it('classifies mcp__code_graph__get_minimal_context_tool as minimal_context_per_ticket', async () => {
    const tokens = Math.round(CONTEXT_WINDOW * 0.07);
    const records = [
      makeRecord({
        agent: 'planner',
        tool: 'mcp__code_graph__get_minimal_context_tool',
        input_tokens: tokens,
        output_tokens: 0,
      }),
    ];
    await writeJsonl(jsonlPath, records);

    const results = snapshotBudgets({ jsonlPath, contextWindow: CONTEXT_WINDOW });
    const entry = results.find((u) => u.budgetKey === 'minimal_context_per_ticket');
    expect(entry!.consumed).toBe(tokens);
    expect(entry!.status).toBe('over_target');
  });
});

describe('formatBudgetWarnings', () => {
  it('returns empty string when all utilizations are ok', () => {
    const utilizations: BudgetUtilization[] = [
      {
        budgetKey: 'planner_total_graph_queries',
        spec: { target: 8, warn: 16 },
        consumed: 3,
        ratio: 3 / 8,
        status: 'ok',
      },
    ];
    expect(formatBudgetWarnings(utilizations)).toBe('');
  });

  it('returns multi-line string for multiple breaches', () => {
    const utilizations: BudgetUtilization[] = [
      {
        budgetKey: 'planner_total_graph_queries',
        spec: { target: 8, warn: 16 },
        consumed: 11,
        ratio: 11 / 8,
        status: 'over_target',
      },
      {
        budgetKey: 'wiki_preload',
        spec: { target: 0.25, warn: 0.4 },
        consumed: 56_000,
        ratio: 56_000 / 200_000,
        status: 'over_target',
        contextWindow: 200_000,
      },
    ];

    const result = formatBudgetWarnings(utilizations);
    const lines = result.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('planner_total_graph_queries');
    expect(lines[0]).toContain('BUDGET WARNING');
    expect(lines[1]).toContain('wiki_preload');
    expect(lines[1]).toContain('BUDGET WARNING');
  });

  it('includes percentage in warning lines', () => {
    const utilizations: BudgetUtilization[] = [
      {
        budgetKey: 'planner_total_graph_queries',
        spec: { target: 8, warn: 16 },
        consumed: 11,
        ratio: 11 / 8,
        status: 'over_target',
      },
    ];

    const result = formatBudgetWarnings(utilizations);
    expect(result).toContain('138%');
  });

  it('skips ok entries and includes only breaches', () => {
    const utilizations: BudgetUtilization[] = [
      {
        budgetKey: 'planner_total_graph_queries',
        spec: { target: 8, warn: 16 },
        consumed: 2,
        ratio: 2 / 8,
        status: 'ok',
      },
      {
        budgetKey: 'wiki_preload',
        spec: { target: 0.25, warn: 0.4 },
        consumed: 60_000,
        ratio: 60_000 / 200_000,
        status: 'over_target',
        contextWindow: 200_000,
      },
    ];

    const result = formatBudgetWarnings(utilizations);
    expect(result).not.toContain('planner_total_graph_queries');
    expect(result).toContain('wiki_preload');
  });
});
