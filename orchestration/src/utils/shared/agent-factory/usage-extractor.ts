/**
 * Plan §E, commit C (2026-05-05) — cache hit observability for both
 * CLI modes (Claude CLI + Codex CLI).
 *
 * Before this commit both `cli-agent-impl.ts` and `codex-cli-agent-impl.ts`
 * hardcoded `cache_hit: false` in `emitTokenUsage(...)`. Only DeepAgents
 * read `cache_read_input_tokens` from the response. So `run-stats.ts`
 * always rolled up `Cache hit rate: 0%` for any CLI run — making the
 * sidebar dishonest about whether caching was actually engaged.
 *
 * The data IS available in the JSONL streams the CLIs emit; the framework
 * just wasn't using it for emit-time telemetry. This module is the pure
 * extractor both CLI impls call before `emitTokenUsage` to surface real
 * cache reads.
 *
 * Both extractors are best-effort:
 *   - empty / malformed input → return all-unknown rollup (`-1` tokens,
 *     `cache_hit: false`)
 *   - unknown event shapes → skip
 *   - JSON parse failures → skip
 *
 * `cli-agent-impl.ts` and `codex-cli-agent-impl.ts` swallow exceptions
 * around the call site so observability never breaks the surrounding
 * agent invocation.
 */

export interface UsageRollup {
  /** Sum across the run; -1 means unknown. */
  inputTokens: number;
  outputTokens: number;
  /** Sum of `cache_read_input_tokens`-style fields; -1 means unknown. */
  cacheReadInputTokens: number;
  /** Sum of `cache_creation_input_tokens`-style fields; -1 means unknown. */
  cacheCreationInputTokens: number;
}

const UNKNOWN: UsageRollup = {
  inputTokens: -1,
  outputTokens: -1,
  cacheReadInputTokens: -1,
  cacheCreationInputTokens: -1,
};

/**
 * Walk a Claude Code JSONL transcript stream and sum token usage across
 * every assistant message. Cache fields:
 *
 *   - `cache_creation_input_tokens` — first time the prefix was cached
 *     (charged at ~125% of normal input rate)
 *   - `cache_read_input_tokens` — every subsequent read of the cached
 *     prefix (charged at ~10% of normal input rate)
 *
 * Both are sums across the run; a session with `cacheReadInputTokens > 0`
 * means at least one assistant turn read from the cache.
 *
 * The shape is the one the framework's
 * `claude-transcript.parser.ts:103-106` already extracts. Reusing the
 * field names verbatim keeps the two parsers in sync.
 */
export function extractUsageFromClaudeJsonl(jsonl: string): UsageRollup {
  if (!jsonl || !jsonl.trim()) return { ...UNKNOWN };

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let observedAny = false;

  for (const rawLine of jsonl.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (entry.type !== 'assistant') continue;
    const message = entry.message as { usage?: Record<string, number> } | undefined;
    const usage = message?.usage;
    if (!usage) continue;
    observedAny = true;
    if (typeof usage.input_tokens === 'number') inputTokens += usage.input_tokens;
    if (typeof usage.output_tokens === 'number') outputTokens += usage.output_tokens;
    if (typeof usage.cache_read_input_tokens === 'number') {
      cacheReadInputTokens += usage.cache_read_input_tokens;
    }
    if (typeof usage.cache_creation_input_tokens === 'number') {
      cacheCreationInputTokens += usage.cache_creation_input_tokens;
    }
  }

  if (!observedAny) return { ...UNKNOWN };

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  };
}

/**
 * Walk a Codex CLI `--json` event stream OR a Codex rollout JSONL and
 * sum token usage. Codex emits a `token_count` event with these
 * documented fields per the CLI source (release notes and the OpenAI
 * Responses API protocol):
 *
 *   {
 *     "type": "token_count",
 *     "info": {
 *       "input_tokens": <N>,
 *       "output_tokens": <N>,
 *       "cached_input_tokens": <N>     // OpenAI's term for cache reads
 *     }
 *   }
 *
 * The exact field path varies slightly across Codex CLI releases; the
 * extractor tolerates a few common shapes:
 *   - `entry.info.{input_tokens,output_tokens,cached_input_tokens}`
 *   - `entry.usage.{input_tokens,output_tokens,cached_input_tokens}`
 *   - `entry.payload.usage.*` (older `event_msg` envelope)
 *   - `entry.{input_tokens,output_tokens,cached_input_tokens}` (flat)
 *
 * OpenAI does not currently bill / report a `cache_creation_input_tokens`
 * equivalent — caching is automatic and the platform absorbs the
 * one-time write cost. We surface 0 (not -1) when only the read field
 * exists so downstream `cache_hit` boolean checks work the same way.
 */
export function extractUsageFromCodexJsonl(jsonl: string): UsageRollup {
  if (!jsonl || !jsonl.trim()) return { ...UNKNOWN };

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let observedAny = false;

  for (const rawLine of jsonl.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const usage = pickCodexUsageObject(entry);
    if (!usage) continue;
    const ip = pickNumber(usage, ['input_tokens', 'inputTokens']);
    const op = pickNumber(usage, ['output_tokens', 'outputTokens']);
    const cached = pickNumber(usage, [
      'cached_input_tokens',
      'cache_read_input_tokens',
      'cachedInputTokens',
    ]);
    if (ip === undefined && op === undefined && cached === undefined) continue;
    observedAny = true;
    if (ip !== undefined) inputTokens += ip;
    if (op !== undefined) outputTokens += op;
    if (cached !== undefined) cacheReadInputTokens += cached;
  }

  if (!observedAny) return { ...UNKNOWN };

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    // OpenAI's automatic prompt cache does not surface a creation-cost
    // counter — we report 0 so downstream consumers can still distinguish
    // "no info" (-1) from "info present, no creation".
    cacheCreationInputTokens: 0,
  };
}

/**
 * Pull the candidate usage object out of a Codex rollout / --json entry.
 * The protocol uses a few different envelope shapes across releases:
 *   - `{ type: 'token_count', info: { ... } }`
 *   - `{ type: 'token_count', usage: { ... } }`
 *   - `{ type: 'event_msg', payload: { usage: { ... } } }`
 *   - `{ type: 'task_complete', usage: { ... } }`
 *   - flat `{ input_tokens, output_tokens, cached_input_tokens }` on
 *     some legacy releases
 *
 * Returns the first usage-like object found, or `null` when none of
 * the shapes match.
 */
function pickCodexUsageObject(entry: Record<string, unknown>): Record<string, unknown> | null {
  const type = entry.type;
  const tokenCounting =
    type === 'token_count' ||
    type === 'task_complete' ||
    type === 'event_msg' ||
    type === undefined;
  if (!tokenCounting) return null;

  const info = entry.info as Record<string, unknown> | undefined;
  if (info && typeof info === 'object') return info;

  const usage = entry.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === 'object') return usage;

  const payload = entry.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === 'object') {
    const inner = payload.usage as Record<string, unknown> | undefined;
    if (inner && typeof inner === 'object') return inner;
  }

  // Last-resort: the flat shape. Only treat as usage when at least one
  // recognised field is present so we don't false-positive on every
  // entry.
  const flat = entry as Record<string, unknown>;
  if (
    typeof flat.input_tokens === 'number' ||
    typeof flat.output_tokens === 'number' ||
    typeof flat.cached_input_tokens === 'number' ||
    typeof flat.cache_read_input_tokens === 'number'
  ) {
    return flat;
  }

  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * Convenience: turn a `UsageRollup` into the boolean shape `emitTokenUsage`
 * accepts. `cacheReadInputTokens > 0` means at least one assistant turn
 * read from the cache.
 */
export function rollupToCacheHit(rollup: UsageRollup): boolean {
  return rollup.cacheReadInputTokens > 0;
}
