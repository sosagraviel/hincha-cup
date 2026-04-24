/**
 * HTML escape helpers kept in one spot. We deliberately avoid pulling in a
 * sanitizer library — the renderer only ever outputs escaped text nodes or
 * pre-formatted code blocks, so there's no HTML injection surface.
 */
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
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // closing fence
      out.push(
        `<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`,
      );
      continue;
    }
    // Heading
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }
    // List block (consecutive lines starting with `-`, `*`, or `<number>.`)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>`);
      for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
      out.push(`</${tag}>`);
      continue;
    }
    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Paragraph: gather consecutive non-blank, non-block lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${paraLines.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

function renderInline(text: string): string {
  let s = escapeHtml(text);
  // Inline code (apply before other replacements so we don't mangle it)
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // Links
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`);
  s = s.replace(/__([^_]+)__/g, (_m, c) => `<strong>${c}</strong>`);
  // Italic
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
