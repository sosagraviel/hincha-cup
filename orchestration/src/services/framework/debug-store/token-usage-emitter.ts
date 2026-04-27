import path from 'path';
import { mkdir, appendFile } from 'fs/promises';
import type { BudgetKey } from '../budgets.js';

/**
 * One record emitted per agent call into `<artifactsDir>/metrics/token-usage.jsonl`.
 *
 * Fields with unknown values at call time are set to -1 (tokens) or false
 * (cache_hit) rather than omitted, so downstream tooling can reliably detect
 * missing data versus zero.
 */
export interface TokenUsageRecord {
  ts: string;
  phase: string;
  agent: string;
  tool?: string;
  input_tokens: number;
  output_tokens: number;
  cache_hit: boolean;
  duration_ms: number;
  budget_key?: BudgetKey;
}

function resolveArtifactsDir(projectPath: string): string {
  const fromEnv = process.env.ARTIFACTS_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return path.join(projectPath, '.claude-temp');
}

/**
 * Appends a single token-usage record as a JSON line to
 * `<artifactsDir>/metrics/token-usage.jsonl`.
 *
 * Failures are silently swallowed with a one-line warning to stderr so that
 * metric emission never blocks or fails the surrounding agent call.
 */
export async function emitTokenUsage(projectPath: string, record: TokenUsageRecord): Promise<void> {
  try {
    const artifactsDir = resolveArtifactsDir(projectPath);
    const metricsDir = path.join(artifactsDir, 'metrics');
    await mkdir(metricsDir, { recursive: true });
    const jsonlPath = path.join(metricsDir, 'token-usage.jsonl');
    await appendFile(jsonlPath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    process.stderr.write(
      `[token-usage-emitter] warn: failed to emit record — ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Resolve the full path to `token-usage.jsonl` for a given project path,
 * following the same env-variable override logic as the emitter.
 */
export function resolveTokenUsageJsonlPath(projectPath: string): string {
  const artifactsDir = resolveArtifactsDir(projectPath);
  return path.join(artifactsDir, 'metrics', 'token-usage.jsonl');
}

/**
 * Resolve the full path to the metrics summary for a given project path.
 */
export function resolveMetricsSummaryPath(projectPath: string): string {
  const artifactsDir = resolveArtifactsDir(projectPath);
  return path.join(artifactsDir, 'metrics', 'summary.md');
}
