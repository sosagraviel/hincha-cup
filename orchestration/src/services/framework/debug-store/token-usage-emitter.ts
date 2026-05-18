import path from 'path';
import { mkdir, appendFile } from 'fs/promises';
import type { BudgetKey } from '../budgets.js';

/**
 * One record emitted per agent call into `<artifactsDir>/metrics/token-usage.jsonl`.
 *
 * Fields with unknown values at call time are set to -1 (tokens) or false
 * (cache_hit) rather than omitted, so downstream tooling can reliably detect
 * missing data versus zero.
 *
 * The numeric token fields are split so operators can see both the cost
 * picture (uncached + creation) and the savings picture (cached reads):
 *
 *   - `input_tokens`: tokens charged at full input rate (Anthropic) /
 *     OpenAI's `prompt_tokens` minus cache reads. The bit the model
 *     actually re-encoded for this turn.
 *   - `cache_read_input_tokens`: tokens served from cache at ~10% rate.
 *     `> 0` ⇒ caching engaged; `cache_hit` is the boolean form for
 *     downstream consumers that just need a yes/no flag.
 *   - `cache_creation_input_tokens`: tokens written to cache at ~125%
 *     rate (one-time per prefix per TTL). 0 on Codex/OpenAI which
 *     doesn't surface this counter; -1 means unknown / not measured.
 *
 * Why the split: before this commit the run-stats sidebar showed
 * `input_tokens: 49` even on a 19 KB prompt that hit cache, which was
 * technically correct (only 49 uncached tokens) but misleading to
 * operators expecting "input_tokens" to mean total input volume. With
 * the split, the cache savings are visible without overloading the
 * `input_tokens` field's meaning.
 */
export interface TokenUsageRecord {
  ts: string;
  phase: string;
  agent: string;
  tool?: string;
  input_tokens: number;
  output_tokens: number;
  cache_hit: boolean;
  /** Tokens served from the prompt cache. -1 = unknown. */
  cache_read_input_tokens?: number;
  /** Tokens written to the prompt cache (Anthropic only). -1 = unknown. */
  cache_creation_input_tokens?: number;
  duration_ms: number;
  budget_key?: BudgetKey;
  /**
   * Per-agent retry telemetry. Populated by Phase 1 analyzer nodes that wrap
   * `retryWithEnhancedFeedback`. Omitted (`undefined`) when the caller does
   * not participate in the retry loop (e.g. one-shot synthesis agents).
   */
  retry_count?: number;
  /**
   * Best-effort estimate of output tokens spent on FULL-OUTPUT regenerations
   * inside this agent session (e.g. stop-hook rejection → model re-emits
   * the entire 26 KB JSON from scratch). Above `MAX_AGENT_OUTPUT_TOKENS`
   * (see `patch-mode.ts`) the framework surfaces a `regeneration_runaway`
   * warning in Phase 6.
   */
  regeneration_token_count?: number;
  /**
   * Output tokens spent on PATCH MODE responses (small JSON-merge-patch
   * envelopes). When `regeneration_token_count` is high but
   * `patch_token_count` is high too, retries are working as designed.
   */
  patch_token_count?: number;
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
