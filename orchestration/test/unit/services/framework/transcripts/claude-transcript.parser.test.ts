import { describe, it, expect } from 'vitest';
import { parseClaudeTranscript } from '../../../../../src/services/framework/transcripts/parsers/claude-transcript.parser.js';

describe('parseClaudeTranscript', () => {
  it('parses user + assistant messages', () => {
    const jsonl = [
      JSON.stringify({
        type: 'user',
        timestamp: '2026-04-23T00:00:00Z',
        sessionId: 'abc',
        cwd: '/repo',
        version: '2.1.0',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-04-23T00:00:01Z',
        sessionId: 'abc',
        message: {
          role: 'assistant',
          model: 'claude-opus-4-7',
          content: [{ type: 'text', text: 'hi back' }],
          usage: { input_tokens: 10, output_tokens: 3 },
          stop_reason: 'end_turn',
        },
      }),
    ].join('\n');
    const events = parseClaudeTranscript(jsonl);
    expect(events.length).toBeGreaterThanOrEqual(3); // session_start + user + assistant
    expect(events[0].t).toBe('session_start');
    expect(events.some((e) => e.t === 'user_message')).toBe(true);
    expect(events.some((e) => e.t === 'assistant_message')).toBe(true);
  });

  it('extracts tool_use and tool_result as standalone events', () => {
    const jsonl = [
      JSON.stringify({
        type: 'assistant',
        sessionId: 'abc',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { cmd: 'ls' } }],
        },
      }),
      JSON.stringify({
        type: 'user',
        sessionId: 'abc',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file.txt' }],
        },
      }),
    ].join('\n');
    const events = parseClaudeTranscript(jsonl);
    expect(events.some((e) => e.t === 'tool_use')).toBe(true);
    expect(events.some((e) => e.t === 'tool_result')).toBe(true);
  });

  it('tolerates unknown entry types as system passthrough', () => {
    const jsonl = JSON.stringify({ type: 'weird', foo: 'bar' });
    const events = parseClaudeTranscript(jsonl);
    expect(events.some((e) => e.t === 'system' && e.subtype?.startsWith('passthrough'))).toBe(true);
  });
});
