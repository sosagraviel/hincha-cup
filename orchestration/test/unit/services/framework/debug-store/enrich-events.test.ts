import { describe, expect, it } from 'vitest';
import {
  enrichEventsJsonl,
  EVENTS_JSONL_SCHEMA_VERSION,
} from '../../../../../src/services/framework/debug-store/debug-store.js';

describe('enrichEventsJsonl', () => {
  it('prepends a meta line carrying the current schema version', () => {
    const out = enrichEventsJsonl(
      '{"t":"system","subtype":"start"}\n{"t":"user","subtype":"input"}',
    );
    const lines = out.split('\n');
    const meta = JSON.parse(lines[0]);
    expect(meta.t).toBe('meta');
    expect(meta.schemaVersion).toBe(EVENTS_JSONL_SCHEMA_VERSION);
    expect(typeof meta.generatedAt).toBe('string');
  });

  it('handles empty input by returning a meta-only payload', () => {
    const out = enrichEventsJsonl('');
    const meta = JSON.parse(out);
    expect(meta.t).toBe('meta');
    expect(meta.schemaVersion).toBe(EVENTS_JSONL_SCHEMA_VERSION);
  });

  it('is idempotent — re-enriching does not duplicate the meta line', () => {
    const once = enrichEventsJsonl('{"t":"system","subtype":"start"}');
    const twice = enrichEventsJsonl(once);
    const headOnce = JSON.parse(once.split('\n')[0]);
    const headTwice = JSON.parse(twice.split('\n')[0]);
    expect(headOnce.t).toBe('meta');
    expect(headTwice.t).toBe('meta');
    // Only one meta line in the twice-enriched output.
    expect(twice.split('\n').filter((l) => l.includes('"t":"meta"')).length).toBe(1);
  });

  it('dedups consecutive identical passthrough-* events', () => {
    const input = [
      '{"t":"system","subtype":"passthrough-ai-title","text":"\\"hello\\""}',
      '{"t":"system","subtype":"passthrough-ai-title","text":"\\"hello\\""}',
      '{"t":"system","subtype":"start"}',
      '{"t":"system","subtype":"passthrough-ai-title","text":"\\"hello\\""}',
    ].join('\n');
    const out = enrichEventsJsonl(input);
    const lines = out.split('\n').slice(1); // skip meta
    // First two are dups → second dropped.
    // Third (different subtype) interrupts the run.
    // Fourth (passthrough again, different "key chain") kept.
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('"text":"\\"hello\\""');
    expect(lines[1]).toContain('"start"');
    expect(lines[2]).toContain('"text":"\\"hello\\""');
  });

  it('does not dedup non-passthrough events (preserves real event volume)', () => {
    const input = [
      '{"t":"assistant","subtype":"text","text":"hi"}',
      '{"t":"assistant","subtype":"text","text":"hi"}',
    ].join('\n');
    const out = enrichEventsJsonl(input);
    const lines = out.split('\n').slice(1);
    // Both kept — only passthrough-* dedups.
    expect(lines.length).toBe(2);
  });

  it('preserves non-JSON-parseable lines unchanged (defensive)', () => {
    const input = 'not-valid-json-line-1\n{"t":"system","subtype":"start"}';
    const out = enrichEventsJsonl(input);
    const lines = out.split('\n');
    expect(lines.length).toBe(3); // meta + bad line + good line
    expect(lines[1]).toBe('not-valid-json-line-1');
  });
});
