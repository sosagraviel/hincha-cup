import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  emitTokenUsage,
  resolveTokenUsageJsonlPath,
  resolveMetricsSummaryPath,
} from '../../../../../src/services/framework/debug-store/token-usage-emitter.js';

describe('token-usage-emitter', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'token-emitter-test-'));
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('writes a JSON line to the default metrics/token-usage.jsonl path', async () => {
    await emitTokenUsage(projectPath, {
      ts: '2026-01-01T00:00:00.000Z',
      phase: 'phase-1-discovery',
      agent: 'structure-architecture-analyzer',
      input_tokens: 1000,
      output_tokens: 500,
      cache_hit: false,
      duration_ms: 1200,
    });

    const jsonlPath = path.join(projectPath, '.claude-temp', 'metrics', 'token-usage.jsonl');
    expect(existsSync(jsonlPath)).toBe(true);

    const content = await readFile(jsonlPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;

    expect(parsed.ts).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.phase).toBe('phase-1-discovery');
    expect(parsed.agent).toBe('structure-architecture-analyzer');
    expect(parsed.input_tokens).toBe(1000);
    expect(parsed.output_tokens).toBe(500);
    expect(parsed.cache_hit).toBe(false);
    expect(parsed.duration_ms).toBe(1200);
  });

  it('appends multiple records as separate JSON lines', async () => {
    await emitTokenUsage(projectPath, {
      ts: '2026-01-01T00:00:00.000Z',
      phase: 'phase-1-discovery',
      agent: 'agent-a',
      input_tokens: 100,
      output_tokens: 50,
      cache_hit: false,
      duration_ms: 500,
    });

    await emitTokenUsage(projectPath, {
      ts: '2026-01-01T00:01:00.000Z',
      phase: 'phase-2-consolidation',
      agent: 'agent-b',
      input_tokens: 200,
      output_tokens: 80,
      cache_hit: true,
      duration_ms: 800,
    });

    const jsonlPath = path.join(projectPath, '.claude-temp', 'metrics', 'token-usage.jsonl');
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.agent).toBe('agent-a');
    expect(first.input_tokens).toBe(100);

    const second = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(second.agent).toBe('agent-b');
    expect(second.cache_hit).toBe(true);
  });

  it('uses ARTIFACTS_DIR env variable when set', async () => {
    const customDir = path.join(projectPath, 'custom-artifacts');
    vi.stubEnv('ARTIFACTS_DIR', customDir);

    await emitTokenUsage(projectPath, {
      ts: '2026-01-01T00:00:00.000Z',
      phase: 'phase-unknown',
      agent: 'test-agent',
      input_tokens: -1,
      output_tokens: -1,
      cache_hit: false,
      duration_ms: 0,
    });

    const jsonlPath = path.join(customDir, 'metrics', 'token-usage.jsonl');
    expect(existsSync(jsonlPath)).toBe(true);

    const content = await readFile(jsonlPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed.input_tokens).toBe(-1);
    expect(parsed.output_tokens).toBe(-1);
  });

  it('includes optional budget_key when provided', async () => {
    await emitTokenUsage(projectPath, {
      ts: '2026-01-01T00:00:00.000Z',
      phase: 'phase-3-planning',
      agent: 'planner',
      input_tokens: 500,
      output_tokens: 200,
      cache_hit: false,
      duration_ms: 900,
      budget_key: 'planner_total_graph_queries',
    });

    const jsonlPath = path.join(projectPath, '.claude-temp', 'metrics', 'token-usage.jsonl');
    const content = await readFile(jsonlPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed.budget_key).toBe('planner_total_graph_queries');
  });

  it('does not throw when the filesystem write fails', async () => {
    vi.stubEnv('ARTIFACTS_DIR', '/this/path/does/not/exist/and/cannot/be/created/xyz123');

    await expect(
      emitTokenUsage(projectPath, {
        ts: '2026-01-01T00:00:00.000Z',
        phase: 'phase-unknown',
        agent: 'test-agent',
        input_tokens: -1,
        output_tokens: -1,
        cache_hit: false,
        duration_ms: 0,
      }),
    ).resolves.toBeUndefined();
  });

  it('resolveTokenUsageJsonlPath returns correct default path', () => {
    const result = resolveTokenUsageJsonlPath(projectPath);
    expect(result).toBe(path.join(projectPath, '.claude-temp', 'metrics', 'token-usage.jsonl'));
  });

  it('resolveMetricsSummaryPath returns correct default path', () => {
    const result = resolveMetricsSummaryPath(projectPath);
    expect(result).toBe(path.join(projectPath, '.claude-temp', 'metrics', 'summary.md'));
  });

  it('resolveTokenUsageJsonlPath respects ARTIFACTS_DIR override', () => {
    vi.stubEnv('ARTIFACTS_DIR', '/custom/dir');
    const result = resolveTokenUsageJsonlPath(projectPath);
    expect(result).toBe('/custom/dir/metrics/token-usage.jsonl');
  });
});
