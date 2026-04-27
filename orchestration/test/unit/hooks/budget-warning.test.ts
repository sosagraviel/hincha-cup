import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { emitBudgetWarning } from '../../../src/hooks/budget-warning.hook.js';
import type { TokenUsageRecord } from '../../../src/services/framework/debug-store/token-usage-emitter.js';

function makeRecord(overrides: Partial<TokenUsageRecord>): TokenUsageRecord {
  return {
    ts: '2026-01-01T00:00:00.000Z',
    phase: 'planning',
    agent: 'planner',
    input_tokens: 500,
    output_tokens: 200,
    cache_hit: false,
    duration_ms: 100,
    ...overrides,
  };
}

async function writeJsonl(filePath: string, records: TokenUsageRecord[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(filePath, content, 'utf-8');
}

describe('emitBudgetWarning', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'budget-warning-test-'));
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('returns empty string when JSONL file does not exist', async () => {
    const result = await emitBudgetWarning({ projectPath: tmpDir });
    expect(result).toBe('');
  });

  it('returns empty string when JSONL contains no budget-triggering records', async () => {
    const jsonlPath = path.join(tmpDir, '.claude-temp', 'metrics', 'token-usage.jsonl');
    await writeJsonl(jsonlPath, [
      makeRecord({ agent: 'other-agent', tool: undefined, phase: 'other-phase' }),
    ]);

    const result = await emitBudgetWarning({ projectPath: tmpDir });
    expect(result).toBe('');
  });

  it('returns warning string when JSONL contains over-budget graph query records', async () => {
    const jsonlPath = path.join(tmpDir, '.claude-temp', 'metrics', 'token-usage.jsonl');
    const records = Array.from({ length: 17 }, () =>
      makeRecord({ agent: 'planner', tool: 'mcp__code_graph__query_graph_tool' }),
    );
    await writeJsonl(jsonlPath, records);

    const result = await emitBudgetWarning({ projectPath: tmpDir });
    expect(result).toContain('BUDGET WARNING');
    expect(result).toContain('planner_total_graph_queries');
  });

  it('respects the phase filter when provided', async () => {
    const jsonlPath = path.join(tmpDir, '.claude-temp', 'metrics', 'token-usage.jsonl');
    const wikiTokens = Math.round(200_000 * 0.45);
    const records = [
      makeRecord({
        phase: 'wiki_preload',
        agent: 'loader',
        budget_key: 'wiki_preload',
        input_tokens: wikiTokens,
        output_tokens: 0,
      }),
    ];
    await writeJsonl(jsonlPath, records);

    const resultOtherPhase = await emitBudgetWarning({ projectPath: tmpDir, phase: 'planning' });
    expect(resultOtherPhase).toBe('');

    const resultMatchingPhase = await emitBudgetWarning({
      projectPath: tmpDir,
      phase: 'wiki_preload',
    });
    expect(resultMatchingPhase).toContain('BUDGET WARNING');
  });

  it('uses PROJECT_PATH env variable when projectPath option is not provided', async () => {
    const jsonlPath = path.join(tmpDir, '.claude-temp', 'metrics', 'token-usage.jsonl');
    await mkdir(path.dirname(jsonlPath), { recursive: true });
    await writeFile(jsonlPath, '', 'utf-8');

    vi.stubEnv('PROJECT_PATH', tmpDir);

    const result = await emitBudgetWarning({});
    expect(result).toBe('');
  });
});
