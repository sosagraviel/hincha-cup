/**
 * Plan v9 Phase 7 — `renderMarkdown` bounded-execution tests.
 *
 * The transcript renderer is debug-only. It must never hang and must
 * always return SOME string OR throw a typed `RenderMarkdownLimitError`
 * that the caller converts to a `<pre>`-escaped fallback.
 *
 * Stress shapes covered:
 *  - 1 MB of random ASCII (paragraph-heavy).
 *  - 1 MB of repeated triple-backtick fences (fence pathology).
 *  - 1 MB of nested-list lines (list-loop pathology).
 *
 * Each case must finish well under 200 ms — the renderer runs on debug
 * pages, but a debug page hang is still a hang.
 */

import { describe, expect, it } from 'vitest';
import {
  renderMarkdown,
  RenderMarkdownLimitError,
} from '../../../../../src/services/framework/transcripts/renderer/html-escape.js';

const SIZE = 1 * 1024 * 1024;
const TIME_BUDGET_MS = 200;

function buildRandomAscii(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz 0123456789\n\n\n';
  const out: string[] = [];
  let n = 0;
  while (n < SIZE) {
    const len = 1 + (n % 80);
    const slice: string[] = [];
    for (let j = 0; j < len; j++) {
      slice.push(chars[(n + j) % chars.length]);
    }
    slice.push('\n');
    out.push(slice.join(''));
    n += len + 1;
  }
  return out.join('').slice(0, SIZE);
}

function buildFencePathology(): string {
  // Alternating fences with no language and no closing fence — exactly
  // the shape the gira 2026-05-12 run blew up on.
  return '```\n'.repeat(Math.ceil(SIZE / 4)).slice(0, SIZE);
}

function buildNestedListPathology(): string {
  const out: string[] = [];
  let n = 0;
  let depth = 0;
  while (n < SIZE) {
    const indent = '  '.repeat(depth);
    const line = `${indent}- item ${depth}\n`;
    out.push(line);
    n += line.length;
    depth = (depth + 1) % 20;
  }
  return out.join('').slice(0, SIZE);
}

function timedRender(source: string): { ms: number; threw: boolean } {
  const start = Date.now();
  let threw = false;
  try {
    renderMarkdown(source);
  } catch (e) {
    threw = true;
    if (!(e instanceof RenderMarkdownLimitError)) {
      throw e; // Unexpected error class — fail the test.
    }
  }
  return { ms: Date.now() - start, threw };
}

describe('renderMarkdown bounded execution (Plan v9 Phase 7)', () => {
  it('returns within time budget for 1 MB random ASCII', () => {
    const result = timedRender(buildRandomAscii());
    expect(result.ms).toBeLessThan(TIME_BUDGET_MS);
  });

  it('returns OR throws RenderMarkdownLimitError for 1 MB of fences', () => {
    const result = timedRender(buildFencePathology());
    expect(result.ms).toBeLessThan(TIME_BUDGET_MS);
  });

  it('returns OR throws RenderMarkdownLimitError for 1 MB nested lists', () => {
    const result = timedRender(buildNestedListPathology());
    expect(result.ms).toBeLessThan(TIME_BUDGET_MS);
  });

  it('typed error class is publicly importable for caller fallback', () => {
    expect(typeof RenderMarkdownLimitError).toBe('function');
    const err = new RenderMarkdownLimitError('test');
    expect(err.name).toBe('RenderMarkdownLimitError');
    expect(err.message).toBe('test');
  });

  // Regression — gira 2026-05-12 run. A thinking block contained a
  // line starting with ` ``` ` followed by inline content (not a clean
  // fence opener). The fence regex refused to open, AND the paragraph
  // inner-loop guard `!/^```/` refused to consume the line. Result:
  // `i` never advanced and the renderer infinite-looped until the
  // iteration cap fired. The fix forces the paragraph branch to
  // consume the offending line as raw text so `i` always advances.
  it('does not infinite-loop on stray backtick prose (gira regression)', () => {
    const source = [
      "There's a JSON syntax error in my output.",
      '',
      'Looking at the JSON I generated, I see the issue.',
      '',
      '```json',
      '"code": "foo"',
      '```',
      '',
      'But then later:',
      '``` I need to complete the partial thought first.',
      '',
      'Let me fix all the backticks and template literals.',
    ].join('\n');
    const result = renderMarkdown(source);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('<p>');
    // The stray-backtick line must end up rendered (as escaped text),
    // not silently swallowed.
    expect(result).toContain('I need to complete the partial thought');
  });

  it('does not infinite-loop on a line that is JUST stray backticks-with-content', () => {
    const result = renderMarkdown('``` not actually a fence opener');
    expect(result.length).toBeGreaterThan(0);
  });
});
