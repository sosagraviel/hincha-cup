/**
 * HTML escape helpers kept in one spot. We deliberately avoid pulling in a
 * sanitizer library — the renderer only ever outputs escaped text nodes or
 * pre-formatted code blocks, so there's no HTML injection surface.
 *
 * `renderMarkdown` is debug-only. On any pathological input it must return
 * SOME string or throw a typed `RenderMarkdownLimitError` that callers
 * convert to the plain-text fallback. Every `while` loop carries a
 * bounded-iteration guard so a malformed fence / runaway list / nested-list
 * pathology cannot hang the debug page.
 */

/** Thrown by `renderMarkdown` when its inner loops exceed `lines.length × 4`
 *  iterations — see Phase 7. Callers catch this and emit a `<pre>` fallback. */
export class RenderMarkdownLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderMarkdownLimitError';
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a Markdown-ish string to HTML using a small in-tree renderer.
 *
 * We support:
 *  - Fenced code blocks (```lang … ```)
 *  - Inline code (`…`)
 *  - Headings (# / ## / ### …)
 *  - Paragraphs + single-line breaks
 *  - Lists (-, *, or numbered)
 *  - Bold / italic
 *  - Links [text](url)
 *
 * The goal is readable output for troubleshooting, not perfect Markdown
 * fidelity. For anything ambitious (tables, footnotes, tasks) we fall back
 * to plain pre-formatted text so the content is never hidden.
 */
export function renderMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  const MAX_ITERATIONS = Math.max(64, lines.length * 4);
  let iterations = 0;
  const tick = (): void => {
    iterations++;
    if (iterations > MAX_ITERATIONS) {
      throw new RenderMarkdownLimitError(
        `renderMarkdown iteration cap exceeded (${MAX_ITERATIONS}) — falling back to <pre>.`,
      );
    }
  };

  let i = 0;
  while (i < lines.length) {
    tick();
    const line = lines[i];
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        tick();
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // closing fence
      out.push(
        `<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`,
      );
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        tick();
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>`);
      for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
      out.push(`</${tag}>`);
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      tick();
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length === 0) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${paraLines.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`);
  s = s.replace(/__([^_]+)__/g, (_m, c) => `<strong>${c}</strong>`);
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, (_m, pre, c) => `${pre}<em>${c}</em>`);
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, (_m, pre, c) => `${pre}<em>${c}</em>`);
  return s;
}

/**
 * Format arbitrary value as a JSON block for tool inputs/results.
 */
export function formatJsonBlock(value: unknown): string {
  let text: string;
  if (typeof value === 'string') text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return `<pre><code class="lang-json">${escapeHtml(text)}</code></pre>`;
}
