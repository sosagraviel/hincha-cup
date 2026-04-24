import { describe, it, expect } from 'vitest';
import { parseCodexTranscript } from '../../../../../src/services/framework/transcripts/parsers/codex-transcript.parser.js';

describe('parseCodexTranscript', () => {
  it('parses session_meta and message items', () => {
    const lines = [
      JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-04-23T00:00:00Z',
        meta: {
          id: 'sess-1',
          timestamp: '2026-04-23T00:00:00Z',
          cwd: '/repo',
          originator: 'cli',
          cli_version: '0.121.0',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-04-23T00:00:01Z',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'hello' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        item: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'Bash',
          arguments: '{"cmd":"ls"}',
        },
      }),
    ].join('\n');
    const events = parseCodexTranscript(lines, { sessionId: 'sess-1' });
    expect(events[0].t).toBe('session_start');
    expect(events.some((e) => e.t === 'assistant_message')).toBe(true);
    expect(events.some((e) => e.t === 'tool_use')).toBe(true);
  });

  it('falls back to system passthrough for unknown tags', () => {
    const lines = JSON.stringify({ type: 'novel_tag', foo: 'bar' });
    const events = parseCodexTranscript(lines);
    expect(events.some((e) => e.t === 'system')).toBe(true);
  });
});
