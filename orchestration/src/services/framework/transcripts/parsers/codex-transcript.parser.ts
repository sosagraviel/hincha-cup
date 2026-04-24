import type {
  AssistantMessageEvent,
  ContentBlock,
  NormalizedEvent,
  ReasoningEvent,
  SessionStartEvent,
  SystemEvent,
  UserMessageEvent,
} from '../schemas/normalized-event.schema.js';

/**
 * Parse a Codex CLI rollout JSONL file — one `RolloutLine` per line.
 *
 * Each line is tagged by a `type` / `item.type` discriminator coming from
 * the Rust protocol:
 *
 *   session_meta    { meta: { id, timestamp, cwd, originator, cli_version, ... } }
 *   response_item   { item: { type: "message" | "reasoning" | "function_call" | ... } }
 *   turn_context    { cwd, model, ... }
 *   event_msg       { msg: { type: "error" | "task_started" | ... }, id? }
 *   compacted       { message, replacement_history? }
 *
 * This parser is tolerant — unknown shapes are surfaced as `system` events so
 * the raw JSONL is never the only way to see what happened.
 */
export function parseCodexTranscript(
  jsonlContent: string,
  opts: { sessionId?: string } = {},
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const lines = jsonlContent.split('\n').filter((l) => l.trim().length > 0);

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const ts = (entry.timestamp as string | undefined) ?? undefined;
    const sessionId = opts.sessionId;

    // Codex rollout files flatten `item` into the top-level object, so either
    // form can appear. Discover the type.
    const type = (entry.type as string | undefined) ?? undefined;

    switch (type) {
      case 'session_meta': {
        const meta =
          (entry.meta as
            | {
                id?: string;
                timestamp?: string;
                cwd?: string;
                originator?: string;
                cli_version?: string;
                agent_nickname?: string;
                agent_path?: string;
                model_provider?: string;
              }
            | undefined) ?? undefined;
        const start: SessionStartEvent = {
          t: 'session_start',
          provider: 'codex',
          sessionId: meta?.id ?? sessionId,
          ts: meta?.timestamp ?? ts,
          cwd: meta?.cwd,
          originator: meta?.originator,
          cliVersion: meta?.cli_version,
          agent: meta?.agent_nickname ?? meta?.agent_path,
        };
        events.push(start);
        break;
      }
      case 'turn_context': {
        const sys: SystemEvent = {
          t: 'system',
          provider: 'codex',
          sessionId,
          ts,
          subtype: 'turn_context',
          text: JSON.stringify(entry),
        };
        events.push(sys);
        break;
      }
      case 'compacted': {
        const sys: SystemEvent = {
          t: 'system',
          provider: 'codex',
          sessionId,
          ts,
          subtype: 'compact_boundary',
          text: String(entry.message ?? ''),
        };
        events.push(sys);
        break;
      }
      case 'response_item':
      case 'message':
      case 'reasoning':
      case 'function_call':
      case 'function_call_output':
      case 'local_shell_call':
      case 'custom_tool_call':
      case 'web_search_call': {
        const item =
          (entry.item as Record<string, unknown> | undefined) ??
          (type !== 'response_item' ? entry : undefined);
        const resolvedType = (item?.type as string | undefined) ?? type;
        if (resolvedType === 'message') {
          pushMessageItem(events, item ?? entry, ts, sessionId);
        } else if (resolvedType === 'reasoning') {
          pushReasoningItem(events, item ?? entry, ts, sessionId);
        } else if (
          resolvedType === 'function_call' ||
          resolvedType === 'local_shell_call' ||
          resolvedType === 'custom_tool_call' ||
          resolvedType === 'web_search_call'
        ) {
          pushToolCallItem(events, item ?? entry, ts, sessionId, resolvedType);
        } else if (resolvedType === 'function_call_output') {
          pushToolResultItem(events, item ?? entry, ts, sessionId);
        } else {
          events.push({
            t: 'system',
            provider: 'codex',
            sessionId,
            ts,
            subtype: `response-${resolvedType ?? 'unknown'}`,
            text: JSON.stringify(item ?? entry),
          } satisfies SystemEvent);
        }
        break;
      }
      case 'event_msg': {
        const msg =
          (entry.msg as { type?: string; message?: string; error?: string } | undefined) ??
          undefined;
        const subtype = msg?.type ?? 'event';
        events.push({
          t: 'system',
          provider: 'codex',
          sessionId,
          ts,
          subtype: `event-${subtype}`,
          text: msg?.message ?? msg?.error ?? JSON.stringify(msg ?? entry),
        } satisfies SystemEvent);
        break;
      }
      default: {
        events.push({
          t: 'system',
          provider: 'codex',
          sessionId,
          ts,
          subtype: `passthrough-${type ?? 'unknown'}`,
          text: JSON.stringify(entry),
        } satisfies SystemEvent);
      }
    }
  }

  return events;
}

function pushMessageItem(
  events: NormalizedEvent[],
  item: Record<string, unknown>,
  ts: string | undefined,
  sessionId: string | undefined,
): void {
  const role = (item.role as string | undefined) ?? 'user';
  const content = extractCodexContent(item.content);
  if (role === 'assistant') {
    const asst: AssistantMessageEvent = {
      t: 'assistant_message',
      provider: 'codex',
      sessionId,
      ts,
      content,
      model: item.model as string | undefined,
    };
    events.push(asst);
  } else {
    const user: UserMessageEvent = {
      t: 'user_message',
      provider: 'codex',
      sessionId,
      ts,
      content,
    };
    events.push(user);
  }
}

function pushReasoningItem(
  events: NormalizedEvent[],
  item: Record<string, unknown>,
  ts: string | undefined,
  sessionId: string | undefined,
): void {
  const summary = Array.isArray(item.summary)
    ? (item.summary as unknown[])
        .map((s) => (typeof s === 'string' ? s : JSON.stringify(s)))
        .join('\n')
    : typeof item.summary === 'string'
      ? (item.summary as string)
      : undefined;
  const text = typeof item.content === 'string' ? (item.content as string) : undefined;
  const ev: ReasoningEvent = {
    t: 'reasoning',
    provider: 'codex',
    sessionId,
    ts,
    summary,
    text,
  };
  events.push(ev);
}

function pushToolCallItem(
  events: NormalizedEvent[],
  item: Record<string, unknown>,
  ts: string | undefined,
  sessionId: string | undefined,
  kind: string,
): void {
  const id = (item.call_id as string | undefined) ?? (item.id as string | undefined) ?? '';
  const name = (item.name as string | undefined) ?? (item.tool_name as string | undefined) ?? kind;
  let input: unknown = item.arguments ?? item.input ?? item.query ?? undefined;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      // leave as string
    }
  }
  events.push({
    t: 'tool_use',
    provider: 'codex',
    sessionId,
    ts,
    id,
    name,
    input,
  });
}

function pushToolResultItem(
  events: NormalizedEvent[],
  item: Record<string, unknown>,
  ts: string | undefined,
  sessionId: string | undefined,
): void {
  const id =
    (item.call_id as string | undefined) ?? (item.function_call_id as string | undefined) ?? '';
  const content = (item.output ?? item.result ?? '') as string | object;
  events.push({
    t: 'tool_result',
    provider: 'codex',
    sessionId,
    ts,
    toolUseId: id,
    content,
    isError: Boolean(item.is_error),
  });
}

function extractCodexContent(raw: unknown): ContentBlock[] {
  if (typeof raw === 'string') return [{ type: 'text', text: raw }];
  if (!Array.isArray(raw)) return [];
  const blocks: ContentBlock[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const b = entry as Record<string, unknown>;
    const t = (b.type as string | undefined) ?? '';
    if (t === 'input_text' || t === 'output_text' || t === 'text') {
      blocks.push({ type: 'text', text: String(b.text ?? '') });
    } else if (t === 'input_image') {
      blocks.push({
        type: 'image',
        url: String(b.image_url ?? ''),
        mediaType: b.media_type as string | undefined,
      });
    } else {
      blocks.push({ type: 'text', text: JSON.stringify(b) });
    }
  }
  return blocks;
}
