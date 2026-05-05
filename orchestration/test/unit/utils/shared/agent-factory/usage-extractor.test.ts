/**
 * Plan §E, commit C (2026-05-05) — cache hit observability for both
 * CLI modes. The extractors here are pure: feed in a JSONL string,
 * get a `UsageRollup`. CLI impls (`cli-agent-impl.ts` and
 * `codex-cli-agent-impl.ts`) call them around `emitTokenUsage` so the
 * run-stats sidebar reflects real cache reads instead of always
 * showing 0%.
 */
import { describe, expect, it } from 'vitest';
import {
  extractUsageFromClaudeJsonl,
  extractUsageFromCodexJsonl,
  rollupToCacheHit,
} from '../../../../../src/utils/shared/agent-factory/usage-extractor.js';

describe('rollupToCacheHit', () => {
  it('is true when cacheReadInputTokens > 0 (real read)', () => {
    expect(
      rollupToCacheHit({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 1500,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(true);
  });

  it('is false when cacheReadInputTokens is 0 (caching not engaged this turn)', () => {
    expect(
      rollupToCacheHit({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(false);
  });

  it('is false when cacheReadInputTokens is -1 (unknown)', () => {
    // Distinguishes "we measured zero hits" from "we have no measurement".
    expect(
      rollupToCacheHit({
        inputTokens: -1,
        outputTokens: -1,
        cacheReadInputTokens: -1,
        cacheCreationInputTokens: -1,
      }),
    ).toBe(false);
  });
});

describe('extractUsageFromClaudeJsonl', () => {
  it('returns unknown markers for empty input', () => {
    const result = extractUsageFromClaudeJsonl('');
    expect(result.inputTokens).toBe(-1);
    expect(result.outputTokens).toBe(-1);
    expect(result.cacheReadInputTokens).toBe(-1);
    expect(result.cacheCreationInputTokens).toBe(-1);
  });

  it('skips malformed lines without throwing', () => {
    const lines = [
      'not-json',
      JSON.stringify({
        type: 'assistant',
        message: { usage: { input_tokens: 100, output_tokens: 50 } },
      }),
      '   ',
      'still-not-json{',
    ].join('\n');
    const result = extractUsageFromClaudeJsonl(lines);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it('sums token usage across multiple assistant turns', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 800,
          },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 150,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 0,
          },
        },
      }),
    ].join('\n');
    const result = extractUsageFromClaudeJsonl(lines);
    expect(result.inputTokens).toBe(1100);
    expect(result.outputTokens).toBe(350);
    expect(result.cacheReadInputTokens).toBe(800);
    expect(result.cacheCreationInputTokens).toBe(800);
  });

  it('detects cache_hit via the rollup helper when cache_read_input_tokens > 0', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 1500,
          },
        },
      }),
    ].join('\n');
    const result = extractUsageFromClaudeJsonl(lines);
    expect(rollupToCacheHit(result)).toBe(true);
  });

  it('ignores user/system entries (only assistant carries usage)', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: [] } }),
      JSON.stringify({ type: 'system', subtype: 'stop_hook_summary' }),
      JSON.stringify({ type: 'summary', summary: 'x' }),
      JSON.stringify({
        type: 'assistant',
        message: { usage: { input_tokens: 42, output_tokens: 7 } },
      }),
    ].join('\n');
    const result = extractUsageFromClaudeJsonl(lines);
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(7);
  });

  it('returns unknown markers when no assistant entries had usage', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: [] } }),
      JSON.stringify({ type: 'assistant', message: { content: [] } }), // no usage field
    ].join('\n');
    const result = extractUsageFromClaudeJsonl(lines);
    expect(result.inputTokens).toBe(-1);
  });
});

describe('extractUsageFromCodexJsonl', () => {
  it('returns unknown markers for empty input', () => {
    const result = extractUsageFromCodexJsonl('');
    expect(result.inputTokens).toBe(-1);
    expect(result.outputTokens).toBe(-1);
    expect(result.cacheReadInputTokens).toBe(-1);
  });

  it('extracts the canonical token_count.info shape', () => {
    const line = JSON.stringify({
      type: 'token_count',
      info: {
        input_tokens: 1500,
        output_tokens: 300,
        cached_input_tokens: 1200,
      },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(1500);
    expect(result.outputTokens).toBe(300);
    expect(result.cacheReadInputTokens).toBe(1200);
    // OpenAI doesn't surface a creation-cost counter; we report 0 so
    // downstream consumers can still distinguish "no info" (-1) from
    // "info present, no creation".
    expect(result.cacheCreationInputTokens).toBe(0);
  });

  it('extracts token_count with .usage envelope', () => {
    const line = JSON.stringify({
      type: 'token_count',
      usage: {
        input_tokens: 200,
        output_tokens: 50,
        cached_input_tokens: 100,
      },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(200);
    expect(result.cacheReadInputTokens).toBe(100);
  });

  it('extracts task_complete with .usage', () => {
    const line = JSON.stringify({
      type: 'task_complete',
      usage: { input_tokens: 100, output_tokens: 25, cached_input_tokens: 80 },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(100);
    expect(result.cacheReadInputTokens).toBe(80);
  });

  it('extracts event_msg.payload.usage envelope (older releases)', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      payload: {
        usage: { input_tokens: 90, output_tokens: 30, cached_input_tokens: 0 },
      },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(90);
    expect(result.outputTokens).toBe(30);
    expect(result.cacheReadInputTokens).toBe(0);
  });

  it('tolerates camelCase field names', () => {
    const line = JSON.stringify({
      type: 'token_count',
      info: { inputTokens: 50, outputTokens: 20, cachedInputTokens: 30 },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(20);
    expect(result.cacheReadInputTokens).toBe(30);
  });

  it('tolerates Anthropic-style cache_read_input_tokens key', () => {
    // Some Codex CLI versions surface the Anthropic key name. Be liberal.
    const line = JSON.stringify({
      type: 'token_count',
      info: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.cacheReadInputTokens).toBe(7);
  });

  it('sums usage across multiple events', () => {
    const lines = [
      JSON.stringify({
        type: 'token_count',
        info: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 0 },
      }),
      JSON.stringify({
        type: 'token_count',
        info: { input_tokens: 50, output_tokens: 25, cached_input_tokens: 90 },
      }),
    ].join('\n');
    const result = extractUsageFromCodexJsonl(lines);
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(75);
    expect(result.cacheReadInputTokens).toBe(90);
  });

  it('skips unrelated events (response_item, session_meta) without false-positive', () => {
    const lines = [
      JSON.stringify({
        type: 'session_meta',
        meta: { id: 'sess-x', cli_version: '0.1.0' },
      }),
      JSON.stringify({
        type: 'response_item',
        item: { type: 'function_call', name: 'mcp__code_graph__list_communities_tool' },
      }),
      JSON.stringify({
        type: 'token_count',
        info: { input_tokens: 42, output_tokens: 7, cached_input_tokens: 1 },
      }),
    ].join('\n');
    const result = extractUsageFromCodexJsonl(lines);
    expect(result.inputTokens).toBe(42);
    expect(result.cacheReadInputTokens).toBe(1);
  });

  it('skips malformed JSONL lines without throwing', () => {
    const lines = [
      'not-json{',
      JSON.stringify({
        type: 'token_count',
        info: { input_tokens: 50, output_tokens: 10, cached_input_tokens: 0 },
      }),
      '',
    ].join('\n');
    const result = extractUsageFromCodexJsonl(lines);
    expect(result.inputTokens).toBe(50);
  });

  it('ignores entries that look usage-shaped but have no recognised keys', () => {
    const line = JSON.stringify({ type: 'token_count', info: { something_else: 100 } });
    const result = extractUsageFromCodexJsonl(line);
    expect(result.inputTokens).toBe(-1);
  });

  it('detects cache_hit via the rollup helper when cached_input_tokens > 0', () => {
    const line = JSON.stringify({
      type: 'token_count',
      info: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 1200 },
    });
    const result = extractUsageFromCodexJsonl(line);
    expect(rollupToCacheHit(result)).toBe(true);
  });
});

describe('UsageRollup contract', () => {
  it('Claude and Codex extractors return the same UsageRollup shape', () => {
    // Anti-regression: the fields and types must match across the two
    // extractors so downstream `emitTokenUsage` and `rollupToCacheHit`
    // can consume either without per-provider branching.
    const claude = extractUsageFromClaudeJsonl(
      JSON.stringify({
        type: 'assistant',
        message: { usage: { input_tokens: 1, output_tokens: 1 } },
      }),
    );
    const codex = extractUsageFromCodexJsonl(
      JSON.stringify({ type: 'token_count', info: { input_tokens: 1, output_tokens: 1 } }),
    );
    const claudeKeys = Object.keys(claude).sort();
    const codexKeys = Object.keys(codex).sort();
    expect(claudeKeys).toEqual(codexKeys);
    for (const key of claudeKeys) {
      expect(typeof (claude as any)[key]).toBe(typeof (codex as any)[key]);
    }
  });
});
