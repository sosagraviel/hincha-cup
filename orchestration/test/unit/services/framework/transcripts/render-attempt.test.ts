import { describe, it, expect } from 'vitest';
import { renderAttemptHtml } from '../../../../../src/services/framework/transcripts/renderer/render-attempt.js';
import type { NormalizedEvent } from '../../../../../src/services/framework/transcripts/schemas/normalized-event.schema.js';

describe('renderAttemptHtml', () => {
  it('produces self-contained HTML with inline CSS and JS', async () => {
    const events: NormalizedEvent[] = [
      {
        t: 'session_start',
        provider: 'claude',
        sessionId: 'sess',
        ts: '2026-04-23T00:00:00Z',
        model: 'claude-opus-4-7',
      },
      {
        t: 'user_message',
        provider: 'claude',
        sessionId: 'sess',
        content: [{ type: 'text', text: 'hello' }],
      },
      {
        t: 'assistant_message',
        provider: 'claude',
        sessionId: 'sess',
        model: 'claude-opus-4-7',
        content: [{ type: 'text', text: '# title\n\nbody' }],
        usage: { inputTokens: 10, outputTokens: 2 },
      },
    ];
    const html = await renderAttemptHtml({
      events,
      meta: {
        agentName: 'my-agent',
        phaseId: 'phase-1-discovery',
        phaseLabel: 'Phase 1',
        runId: 'run-1',
        sessionId: 'sess',
        attemptNumber: 1,
        provider: 'claude',
        outcome: 'success',
      },
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).toContain('role assistant');
    expect(html).toContain('data-event-type="user_message"');
    expect(html).toContain('data-event-type="assistant_message"');
    expect(html).toContain('my-agent');
  });
});
