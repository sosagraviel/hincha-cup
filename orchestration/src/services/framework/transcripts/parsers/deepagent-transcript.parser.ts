import type {
  AssistantMessageEvent,
  ContentBlock,
  NormalizedEvent,
  SessionStartEvent,
  SessionEndEvent,
  UserMessageEvent,
} from '../schemas/normalized-event.schema.js';

/**
 * Synthesize a normalized event stream from a DeepAgents invocation.
 *
 * DeepAgents is in-process (no subprocess, no transcript file). We get a
 * final `messages` array from the returned state. Best we can do without
 * streaming hooks is emit a session_start, one event per message, and a
 * session_end. Good enough for troubleshooting which messages were exchanged.
 */
export function parseDeepAgentMessages(params: {
  sessionId: string;
  model?: string;
  agent?: string;
  startedAt?: string;
  endedAt?: string;
  messages: unknown;
  outcome: 'success' | 'failure';
  systemPrompt?: string;
}): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const ts = params.startedAt ?? new Date().toISOString();

  events.push({
    t: 'session_start',
    provider: 'deepagent',
    sessionId: params.sessionId,
    ts,
    model: params.model,
    agent: params.agent,
  } satisfies SessionStartEvent);

  if (params.systemPrompt) {
    events.push({
      t: 'system',
      provider: 'deepagent',
      sessionId: params.sessionId,
      ts,
      subtype: 'system_prompt',
      text: params.systemPrompt,
    });
  }

  const messages = Array.isArray(params.messages) ? (params.messages as unknown[]) : [];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    const m = msg as Record<string, unknown>;
    const role =
      (m.role as string | undefined) ??
      (m._getType ? safeStr((m._getType as () => string)()) : undefined) ??
      (m.type as string | undefined) ??
      'unknown';
    const content = extractMessageContent(m.content);
    if (role === 'assistant' || role === 'ai' || role === 'aiMessage' || role === 'AIMessage') {
      const asst: AssistantMessageEvent = {
        t: 'assistant_message',
        provider: 'deepagent',
        sessionId: params.sessionId,
        ts,
        content,
      };
      events.push(asst);
      for (const block of content) {
        if (block.type === 'tool_use') {
          events.push({
            t: 'tool_use',
            provider: 'deepagent',
            sessionId: params.sessionId,
            ts,
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }
    } else if (
      role === 'user' ||
      role === 'human' ||
      role === 'humanMessage' ||
      role === 'HumanMessage'
    ) {
      const user: UserMessageEvent = {
        t: 'user_message',
        provider: 'deepagent',
        sessionId: params.sessionId,
        ts,
        content,
      };
      events.push(user);
    } else if (role === 'tool' || role === 'ToolMessage') {
      events.push({
        t: 'tool_result',
        provider: 'deepagent',
        sessionId: params.sessionId,
        ts,
        toolUseId: safeStr((m.tool_call_id as string) ?? (m.name as string) ?? ''),
        content: typeof m.content === 'string' ? (m.content as string) : (m.content as object),
        isError: Boolean(m.is_error),
      });
    } else {
      events.push({
        t: 'system',
        provider: 'deepagent',
        sessionId: params.sessionId,
        ts,
        subtype: `message-${role}`,
        text: JSON.stringify(m),
      });
    }
  }

  events.push({
    t: 'session_end',
    provider: 'deepagent',
    sessionId: params.sessionId,
    ts: params.endedAt ?? new Date().toISOString(),
    outcome: params.outcome,
    code: null,
  } satisfies SessionEndEvent);

  return events;
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  try {
    return String(v);
  } catch {
    return '';
  }
}

function extractMessageContent(raw: unknown): ContentBlock[] {
  if (typeof raw === 'string') return [{ type: 'text', text: raw }];
  if (!Array.isArray(raw)) return raw ? [{ type: 'text', text: JSON.stringify(raw) }] : [];
  const blocks: ContentBlock[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const b = entry as Record<string, unknown>;
    const t = (b.type as string | undefined) ?? 'text';
    if (t === 'text') blocks.push({ type: 'text', text: String(b.text ?? '') });
    else if (t === 'tool_use')
      blocks.push({
        type: 'tool_use',
        id: String(b.id ?? ''),
        name: String(b.name ?? ''),
        input: b.input,
      });
    else if (t === 'tool_result')
      blocks.push({
        type: 'tool_result',
        toolUseId: String(b.tool_use_id ?? ''),
        content: (b.content ?? '') as string | object,
        isError: Boolean(b.is_error),
      });
    else blocks.push({ type: 'text', text: JSON.stringify(b) });
  }
  return blocks;
}
