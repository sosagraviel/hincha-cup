import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TokenUsageRecord } from '../../../src/services/framework/debug-store/index.js';

const execFileAsync = promisify(execFile);
const AGGREGATOR_CLI = path.resolve(import.meta.dirname, '../../../src/cli/aggregate-metrics.ts');
const TSX = path.resolve(import.meta.dirname, '../../../node_modules/.bin/tsx');

async function runAggregator(artifactsDir: string): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(
    TSX,
    [AGGREGATOR_CLI, '--artifacts-dir', artifactsDir],
    {
      env: { ...process.env, ARTIFACTS_DIR: artifactsDir },
      timeout: 30000,
    },
  );
  return { stdout, stderr };
}

function makeRecord(overrides: Partial<TokenUsageRecord> = {}): TokenUsageRecord {
  return {
    ts: new Date().toISOString(),
    phase: 'phase-1-discovery',
    agent: 'structure-architecture-analyzer',
    input_tokens: 1000,
    output_tokens: 500,
    cache_hit: false,
    duration_ms: 1200,
    ...overrides,
  };
}

describe('aggregate-metrics CLI', () => {
  let tmpDir: string;
  let metricsDir: string;
  let jsonlPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'agg-metrics-test-'));
    metricsDir = path.join(tmpDir, 'metrics');
    await mkdir(metricsDir, { recursive: true });
    jsonlPath = path.join(metricsDir, 'token-usage.jsonl');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes summary.md and prints its path when no JSONL exists', async () => {
    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);
    expect(existsSync(summaryPath)).toBe(true);
    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('No token-usage data found');
  });

  it('writes per-phase totals table from seeded JSONL', async () => {
    const records: TokenUsageRecord[] = [
      makeRecord({
        phase: 'phase-1-discovery',
        input_tokens: 2000,
        output_tokens: 800,
        duration_ms: 3000,
      }),
      makeRecord({
        phase: 'phase-1-discovery',
        input_tokens: 1500,
        output_tokens: 600,
        duration_ms: 2000,
      }),
      makeRecord({
        phase: 'phase-2-consolidation',
        input_tokens: 3000,
        output_tokens: 1000,
        duration_ms: 4000,
      }),
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('## Per-Phase Totals');
    expect(content).toContain('phase-1-discovery');
    expect(content).toContain('phase-2-consolidation');
    expect(content).toContain('3,500');
    expect(content).toContain('## Budget Comparisons');
  });

  it('emits WARN status for planner_total_graph_queries above target', async () => {
    const records: TokenUsageRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        phase: 'phase-3-planning',
        agent: `planner-query-${i}`,
        budget_key: 'planner_total_graph_queries',
        input_tokens: 500,
        output_tokens: 200,
      }),
    );
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('planner_total_graph_queries');
    expect(content).toMatch(/WARN|BREACHED/);
    expect(content).toContain('## Warnings');
    expect(content).toContain('planner_total_graph_queries');
  });

  it('emits BREACHED status for planner_total_graph_queries above warn threshold', async () => {
    const records: TokenUsageRecord[] = Array.from({ length: 20 }, (_, i) =>
      makeRecord({
        phase: 'phase-3-planning',
        agent: `planner-query-${i}`,
        budget_key: 'planner_total_graph_queries',
        input_tokens: 300,
        output_tokens: 100,
      }),
    );
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('BREACHED');
    expect(content).toContain('## Warnings');
    expect(content).toContain('Refactor the planner');
  });

  it('reports ok for all budgets when counts are within target', async () => {
    const records: TokenUsageRecord[] = [
      makeRecord({
        phase: 'phase-3-planning',
        budget_key: 'planner_total_graph_queries',
        input_tokens: 1000,
        output_tokens: 400,
      }),
      makeRecord({
        phase: 'phase-3-planning',
        budget_key: 'planner_total_graph_queries',
        input_tokens: 900,
        output_tokens: 350,
      }),
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('planner_total_graph_queries');
    expect(content).not.toContain('## Warnings');
  });

  it('handles malformed JSONL lines gracefully without throwing', async () => {
    const goodRecord = makeRecord({ phase: 'phase-1-discovery', input_tokens: 800 });
    const lines = [
      JSON.stringify(goodRecord),
      'not-valid-json{{{',
      '',
      JSON.stringify(makeRecord({ phase: 'phase-2-consolidation', input_tokens: 600 })),
    ].join('\n');
    await writeFile(jsonlPath, lines, 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('phase-1-discovery');
    expect(content).toContain('phase-2-consolidation');
    expect(content).toContain('Total agent calls: 2');
  });

  it('sentinel -1 tokens are not counted in totals', async () => {
    const records: TokenUsageRecord[] = [
      makeRecord({ phase: 'phase-1-discovery', input_tokens: -1, output_tokens: -1 }),
      makeRecord({ phase: 'phase-1-discovery', input_tokens: 1000, output_tokens: 400 }),
    ];
    await writeFile(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');

    const { stdout } = await runAggregator(tmpDir);
    const summaryPath = path.join(metricsDir, 'summary.md');
    expect(stdout).toContain(summaryPath);

    const content = await readFile(summaryPath, 'utf-8');
    expect(content).toContain('phase-1-discovery');
    expect(content).not.toContain('2,000');
  });
});
