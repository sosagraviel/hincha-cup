import type {
  AssistantMessageEvent,
  ContentBlock,
  NormalizedEvent,
  SessionStartEvent,
  SystemEvent,
  UserMessageEvent,
} from '../schemas/normalized-event.schema.js';

/**
 * Parse a Claude Code JSONL transcript (one JSON entry per line) into the
 * cross-provider normalized event stream.
 *
 * Claude Code entries look like:
 *   { "type": "user", "message": { "role": "user", "content": [...] }, ... }
 *   { "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": {...} } }
 *   { "type": "summary", "summary": "..." }
 *   { "type": "system", "subtype": "stop_hook_summary", ... }
 *
 * Content blocks: `text`, `image`, `tool_use`, `tool_result`, `thinking`.
 *
 * This parser is intentionally liberal — any entry it can't interpret is
 * surfaced as a `system` event with subtype `passthrough` so nothing is lost.
 */
export function parseClaudeTranscript(
  jsonlContent: string,
  opts: { sessionId?: string } = {},
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const lines = jsonlContent.split('\n').filter((l) => l.trim().length > 0);
  let sessionStartEmitted = false;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = entry.type as string | undefined;
    const ts = (entry.timestamp as string | undefined) ?? undefined;
    const sessionId = (entry.sessionId as string | undefined) ?? opts.sessionId;

    if (!sessionStartEmitted && (entry.cwd || entry.gitBranch || entry.version)) {
      const start: SessionStartEvent = {
        t: 'session_start',
        provider: 'claude',
        sessionId,
        ts,
        cwd: entry.cwd as string | undefined,
        cliVersion: entry.version as string | undefined,
        agent: entry.agentId as string | undefined,
      };
      events.push(start);
      sessionStartEmitted = true;
    }

    switch (type) {
      case 'user': {
        const message = entry.message as { role?: string; content?: unknown } | undefined;
        const content = extractContentBlocks(message?.content);
        const userEv: UserMessageEvent = {
          t: 'user_message',
          provider: 'claude',
          sessionId,
          ts,
          content,
        };
        events.push(userEv);
        // Tool results arrive as user messages with tool_result blocks —
        // surface them as standalone events too so filters work nicely.
        for (const block of content) {
          if (block.type === 'tool_result') {
            events.push({
              t: 'tool_result',
              provider: 'claude',
              sessionId,
              ts,
              toolUseId: block.toolUseId,
              content: block.content,
              isError: block.isError,
            });
          }
        }
        break;
      }
      case 'assistant': {
        const message = entry.message as
          | {
              role?: string;
              content?: unknown;
              model?: string;
              usage?: Record<string, number>;
              stop_reason?: string;
            }
          | undefined;
        const content = extractContentBlocks(message?.content);
        const usage = message?.usage
          ? {
              inputTokens: message.usage.input_tokens,
              outputTokens: message.usage.output_tokens,
              cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
              cacheReadInputTokens: message.usage.cache_read_input_tokens,
              serviceTier: message.usage.service_tier as unknown as string | undefined,
            }
          : undefined;
        const asst: AssistantMessageEvent = {
          t: 'assistant_message',
          provider: 'claude',
          sessionId,
          ts,
          model: message?.model,
          content,
          usage,
          stopReason: message?.stop_reason,
        };
        events.push(asst);
        for (const block of content) {
          if (block.type === 'tool_use') {
            events.push({
              t: 'tool_use',
              provider: 'claude',
              sessionId,
              ts,
              id: block.id,
              name: block.name,
              input: block.input,
            });
          } else if (block.type === 'thinking') {
            events.push({
              t: 'thinking',
              provider: 'claude',
              sessionId,
              ts,
              text: block.text,
            });
          }
        }
        break;
      }
      case 'summary': {
        const sys: SystemEvent = {
          t: 'system',
          provider: 'claude',
          sessionId,
          ts,
          subtype: 'summary',
          text: entry.summary as string | undefined,
        };
        events.push(sys);
        break;
      }
      case 'system': {
        const sys: SystemEvent = {
          t: 'system',
          provider: 'claude',
          sessionId,
          ts,
          subtype: (entry.subtype as string | undefined) ?? 'system',
          text:
            (entry.content as string | undefined) ??
            (typeof entry === 'object' && entry ? JSON.stringify(entry, null, 0) : undefined),
          level: entry.level as string | undefined,
        };
        events.push(sys);
        break;
      }
      default: {
        const sys: SystemEvent = {
          t: 'system',
          provider: 'claude',
          sessionId,
          ts,
          subtype: `passthrough-${type ?? 'unknown'}`,
          text: JSON.stringify(entry),
        };
        events.push(sys);
        break;
      }
    }
  }

  return events;
}

function extractContentBlocks(raw: unknown): ContentBlock[] {
  if (typeof raw === 'string') {
    return [{ type: 'text', text: raw }];
  }
  if (!Array.isArray(raw)) return [];
  const blocks: ContentBlock[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const block = entry as Record<string, unknown>;
    switch (block.type as string | undefined) {
      case 'text':
        blocks.push({ type: 'text', text: String(block.text ?? '') });
        break;
      case 'image': {
        const source = block.source as
          | { data?: string; media_type?: string; url?: string }
          | undefined;
        blocks.push({
          type: 'image',
          mediaType: source?.media_type,
          data: source?.data,
          url: source?.url,
        });
        break;
      }
      case 'tool_use':
        blocks.push({
          type: 'tool_use',
          id: String(block.id ?? ''),
          name: String(block.name ?? ''),
          input: block.input,
        });
        break;
      case 'tool_result':
        blocks.push({
          type: 'tool_result',
          toolUseId: String(block.tool_use_id ?? ''),
          content: (block.content ?? '') as ContentBlock['type'] extends 'tool_result'
            ? string | object
            : never,
          isError: Boolean(block.is_error),
        });
        break;
      case 'thinking':
        blocks.push({ type: 'thinking', text: String(block.thinking ?? '') });
        break;
      default:
        // Unknown block type — stringify as text so content is not lost.
        blocks.push({ type: 'text', text: JSON.stringify(block) });
    }
  }
  return blocks;
}
