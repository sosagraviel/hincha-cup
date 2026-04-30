import type {
  AssistantMessageEvent,
  ContentBlock,
  NormalizedEvent,
  UserMessageEvent,
  Usage,
} from '../schemas/normalized-event.schema.js';
import type { AttemptMeta } from '../../debug-store/types.js';
import { escapeHtml, formatJsonBlock, renderMarkdown } from './html-escape.js';
import { INLINE_STYLES, INLINE_VIEWER_JS } from './inline-assets.js';

export interface RenderAttemptOptions {
  events: NormalizedEvent[];
  meta: Partial<AttemptMeta>;
  /** Optional extra sections (e.g. validation errors) pinned under the sidebar. */
  extras?: Array<{ title: string; html: string; variant?: 'warning' | 'danger' | 'success' }>;
  /** Page label to show in title (used when paginating). */
  pageLabel?: string;
}

/**
 * Render a single-attempt transcript HTML page. Returns a complete HTML
 * document string — CSS and JS are inlined so the file is droppable.
 */
export async function renderAttemptHtml(opts: RenderAttemptOptions): Promise<string> {
  const { events, meta } = opts;
  const css = INLINE_STYLES;
  const js = INLINE_VIEWER_JS;

  const sessionUsage = aggregateUsage(events);
  const typeCounts = countByType(events);

  const body = events.map(renderEvent).join('\n');
  const extras = (opts.extras ?? [])
    .map((e) => {
      const cls = e.variant ? ` ${e.variant}` : '';
      return `<div class="event extras${cls}"><div class="event-header"><span class="role warning">${escapeHtml(e.title)}</span></div><div class="event-body">${e.html}</div></div>`;
    })
    .join('\n');

  const title = buildTitle(meta, opts.pageLabel);
  const subtitle = buildSubtitle(meta);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <h1>Transcript</h1>
    <dl class="meta-card">
      ${metaRow('Workflow', meta.workflow)}
      ${metaRow('Run', meta.runId)}
      ${metaRow('Phase', meta.phaseLabel ?? meta.phaseId)}
      ${metaRow('Agent', meta.agentName)}
      ${metaRow('Attempt', meta.attemptNumber ? String(meta.attemptNumber) : undefined)}
      ${metaRow('Session', meta.sessionId)}
      ${metaRow('Provider', meta.provider)}
      ${metaRow('Model', meta.model)}
      ${metaRow('Started', meta.startedAt)}
      ${metaRow('Ended', meta.endedAt)}
      ${metaRow('Duration', formatDuration(meta.durationMs))}
      ${metaRow('Outcome', meta.outcome)}
    </dl>
    ${renderBadges(meta)}
    ${renderUsage(sessionUsage)}
    <div class="filters">
      ${renderFilters(typeCounts)}
    </div>
  </aside>
  <main class="main">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
    ${extras}
    ${body.length > 0 ? body : '<div class="empty">No events captured for this attempt.</div>'}
  </main>
</div>
<script>${js}</script>
</body>
</html>`;
}

function renderEvent(event: NormalizedEvent, idx: number): string {
  switch (event.t) {
    case 'session_start':
      return renderSystemEvent(
        idx,
        'session_start',
        'Session started',
        [
          kv('Model', event.model),
          kv('Agent', event.agent),
          kv('Cwd', event.cwd),
          kv('CLI', event.cliVersion),
        ]
          .filter(Boolean)
          .join(' · '),
        event,
      );
    case 'session_end':
      return renderSystemEvent(
        idx,
        'session_end',
        `Session ended · ${event.outcome}`,
        `code=${event.code ?? 'n/a'}`,
        event,
      );
    case 'user_message':
      return renderMessageEvent(idx, event);
    case 'assistant_message':
      return renderMessageEvent(idx, event);
    case 'tool_use':
      return renderToolUseEvent(idx, event);
    case 'tool_result':
      return renderToolResultEvent(idx, event);
    case 'thinking':
      return renderThinkingEvent(idx, event);
    case 'reasoning':
      return renderThinkingEvent(idx, {
        ts: event.ts,
        text: [event.summary, event.text].filter(Boolean).join('\n\n'),
      });
    case 'system':
      return renderSystemEvent(
        idx,
        'system',
        event.subtype ?? 'system',
        '',
        event,
        event.text ?? '',
      );
    case 'validation_error':
      return renderValidationErrorEvent(idx, event.errors, event.iteration, event.ts);
    default:
      return '';
  }
}

function renderMessageEvent(idx: number, event: UserMessageEvent | AssistantMessageEvent): string {
  const role = event.t === 'assistant_message' ? 'assistant' : 'user';
  const body = event.content.map(renderContentBlock).join('\n');
  const usageBadge =
    event.t === 'assistant_message' && event.usage
      ? `<span class="usage">${formatUsage(event.usage)}</span>`
      : '';
  const modelBadge =
    event.t === 'assistant_message' && event.model
      ? `<span class="usage">${escapeHtml(event.model)}</span>`
      : '';
  return `<article class="event message" id="event-${idx}" data-event-type="${role === 'assistant' ? 'assistant_message' : 'user_message'}">
    <header class="event-header">
      <span class="role ${role}">${role}</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(event.ts ?? '')}</span>
      <span class="spacer"></span>
      ${modelBadge}
      ${usageBadge}
    </header>
    <div class="event-body">${body}</div>
  </article>`;
}

function renderContentBlock(block: ContentBlock): string {
  switch (block.type) {
    case 'text': {
      // Prefer Markdown when the block looks like prose.
      if (looksLikeMarkdown(block.text)) {
        return renderMarkdown(block.text);
      }
      return `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
    }
    case 'thinking':
      return `<div class="thinking">${renderMarkdown(block.text)}</div>`;
    case 'tool_use':
      return `<details class="collapsible"><summary>tool_use · ${escapeHtml(block.name)} · ${escapeHtml(block.id)}</summary>${formatJsonBlock(block.input)}</details>`;
    case 'tool_result':
      return `<details class="collapsible" open><summary>tool_result · ${escapeHtml(block.toolUseId)}${block.isError ? ' · error' : ''}</summary>${formatJsonBlock(block.content)}</details>`;
    case 'image':
      if (block.data && block.mediaType) {
        return `<img style="max-width:100%;border:1px solid var(--border);border-radius:6px" alt="image" src="data:${escapeHtml(block.mediaType)};base64,${escapeHtml(block.data)}"/>`;
      }
      if (block.url) {
        return `<a href="${escapeHtml(block.url)}" target="_blank" rel="noopener noreferrer">image (${escapeHtml(block.url)})</a>`;
      }
      return '<em>image</em>';
  }
}

function renderToolUseEvent(
  idx: number,
  ev: { id: string; name: string; input: unknown; ts?: string },
): string {
  return `<article class="event tool_use" id="event-${idx}" data-event-type="tool_use">
    <header class="event-header">
      <span class="role tool_use">tool_use</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(ev.ts ?? '')}</span>
      <span class="spacer"></span>
      <span class="usage">${escapeHtml(ev.name)} · ${escapeHtml(ev.id)}</span>
    </header>
    <div class="event-body tool-body">${formatJsonBlock(ev.input)}</div>
  </article>`;
}

function renderToolResultEvent(
  idx: number,
  ev: { toolUseId: string; content: unknown; isError?: boolean; ts?: string },
): string {
  return `<article class="event tool_result ${ev.isError ? 'error' : ''}" id="event-${idx}" data-event-type="tool_result">
    <header class="event-header">
      <span class="role tool_result">tool_result${ev.isError ? ' · error' : ''}</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(ev.ts ?? '')}</span>
      <span class="spacer"></span>
      <span class="usage">${escapeHtml(ev.toolUseId)}</span>
    </header>
    <div class="event-body tool-body">${formatJsonBlock(ev.content)}</div>
  </article>`;
}

function renderThinkingEvent(idx: number, ev: { text: string; ts?: string }): string {
  return `<article class="event thinking" id="event-${idx}" data-event-type="thinking">
    <header class="event-header">
      <span class="role thinking">thinking</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(ev.ts ?? '')}</span>
    </header>
    <div class="event-body">${renderMarkdown(ev.text)}</div>
  </article>`;
}

function renderSystemEvent(
  idx: number,
  cls: string,
  title: string,
  subtitle: string,
  ev: NormalizedEvent,
  textOverride?: string,
): string {
  const text = textOverride ?? ('text' in ev ? (ev as unknown as { text?: string }).text : '');
  const body = text
    ? `<div class="event-body"><pre><code>${escapeHtml(text)}</code></pre></div>`
    : '';
  return `<article class="event ${cls}" id="event-${idx}" data-event-type="${cls}">
    <header class="event-header">
      <span class="role system">${escapeHtml(title)}</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(ev.ts ?? '')}</span>
      <span class="spacer"></span>
      <span class="usage">${escapeHtml(subtitle)}</span>
    </header>
    ${body}
  </article>`;
}

function renderValidationErrorEvent(
  idx: number,
  errors: string[],
  iteration?: number,
  ts?: string,
): string {
  const body = `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  return `<article class="event validation_error" id="event-${idx}" data-event-type="validation_error">
    <header class="event-header">
      <span class="role validation_error">validation_error</span>
      <span>#${idx + 1}</span>
      <span>${escapeHtml(ts ?? '')}</span>
      <span class="spacer"></span>
      <span class="usage">iteration=${iteration ?? 'n/a'}</span>
    </header>
    <div class="event-body">${body}</div>
  </article>`;
}

function renderBadges(meta: Partial<AttemptMeta>): string {
  const badges: string[] = [];
  if (meta.outcome === 'success') badges.push('<span class="badge success">success</span>');
  else if (meta.outcome === 'failure') badges.push('<span class="badge failure">failure</span>');
  else if (meta.outcome) badges.push(`<span class="badge">${escapeHtml(meta.outcome)}</span>`);
  if (meta.rateLimit) badges.push('<span class="badge warning">rate limited</span>');
  if (meta.internalValidationExhausted)
    badges.push('<span class="badge warning">validation exhausted</span>');
  if (meta.transcriptSource === 'none')
    badges.push('<span class="badge warning">no native transcript</span>');
  return badges.length > 0 ? `<div class="badges">${badges.join('')}</div>` : '';
}

function renderFilters(counts: Record<string, number>): string {
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const types = [
    'user_message',
    'assistant_message',
    'tool_use',
    'tool_result',
    'thinking',
    'system',
    'validation_error',
    'session_start',
    'session_end',
  ];
  const chips = [
    `<button type="button" class="filter active" data-filter="all">all <span class="count">(${all})</span></button>`,
    ...types
      .filter((t) => counts[t])
      .map(
        (t) =>
          `<button type="button" class="filter" data-filter="${t}">${t} <span class="count">(${counts[t]})</span></button>`,
      ),
  ];
  return chips.join('');
}

function renderUsage(u: Usage | undefined): string {
  if (!u) return '';
  return `<dl class="meta-card" style="margin-top:10px">
    <dt>Tokens</dt>
    <dd>in ${u.inputTokens ?? '-'} · out ${u.outputTokens ?? '-'}</dd>
    <dt>Cache</dt>
    <dd>create ${u.cacheCreationInputTokens ?? '-'} · read ${u.cacheReadInputTokens ?? '-'}</dd>
  </dl>`;
}

function aggregateUsage(events: NormalizedEvent[]): Usage | undefined {
  let u: Usage | undefined;
  for (const ev of events) {
    if (ev.t === 'assistant_message' && ev.usage) {
      u = u ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      };
      u.inputTokens = (u.inputTokens ?? 0) + (ev.usage.inputTokens ?? 0);
      u.outputTokens = (u.outputTokens ?? 0) + (ev.usage.outputTokens ?? 0);
      u.cacheCreationInputTokens =
        (u.cacheCreationInputTokens ?? 0) + (ev.usage.cacheCreationInputTokens ?? 0);
      u.cacheReadInputTokens = (u.cacheReadInputTokens ?? 0) + (ev.usage.cacheReadInputTokens ?? 0);
    }
  }
  return u;
}

function countByType(events: NormalizedEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of events) {
    out[ev.t] = (out[ev.t] ?? 0) + 1;
  }
  return out;
}

function metaRow(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function buildTitle(meta: Partial<AttemptMeta>, pageLabel?: string): string {
  const parts = [meta.phaseLabel ?? meta.phaseId ?? '', meta.agentName ?? ''].filter(Boolean);
  const base = parts.join(' · ') || 'transcript';
  return pageLabel ? `${base} — ${pageLabel}` : base;
}

function buildSubtitle(meta: Partial<AttemptMeta>): string {
  const parts = [
    meta.runId ? `run ${meta.runId}` : null,
    meta.attemptNumber ? `attempt ${meta.attemptNumber}` : null,
    meta.sessionId ? `session ${meta.sessionId}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function kv(label: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return `${label}: ${String(value)}`;
}

function formatDuration(ms: number | undefined): string | undefined {
  if (!ms && ms !== 0) return undefined;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUsage(u: Usage): string {
  const parts: string[] = [];
  if (u.inputTokens !== undefined) parts.push(`in ${u.inputTokens}`);
  if (u.outputTokens !== undefined) parts.push(`out ${u.outputTokens}`);
  if (u.cacheReadInputTokens) parts.push(`cache-read ${u.cacheReadInputTokens}`);
  return parts.join(' · ');
}

function looksLikeMarkdown(text: string): boolean {
  return /^#\s|\n#\s|```|^-\s|^\*\s|\n-\s|\n\*\s|\[[^\]]+\]\(/.test(text);
}
