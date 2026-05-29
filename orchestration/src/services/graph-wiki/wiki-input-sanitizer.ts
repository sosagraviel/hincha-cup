/**
 * Sanitization helpers for the digested-upstream content fed into the wiki-generator agent.
 *
 * 1. **Framework-internal jargon must not leak into user-facing wiki prose.**
 *    Strips phrases like "exceeded token limit" or "the community tool overflowed
 *    during the automated run" from synthesis, CLAUDE.md, and the architectural narrative.
 *
 * 2. **Per-service upstream slicing keeps prompts cheap.**
 *    Retains only sections mentioning the target service by id, name, or path token.
 */
import type { WikiDigestedUpstream } from './types.js';

/**
 * Patterns that match framework-internal noise in user-facing wiki prose.
 * Applied with the `g` flag; hits are replaced with empty string and surrounding
 * whitespace collapsed.
 */
const FRAMEWORK_INTERNAL_PATTERNS: RegExp[] = [
  /the [a-z_-]+ tool overflowed during the automated run\b/gi,
  /tool result overflow\b/gi,
  /tool-result overflow\b/gi,
  /exceeded token limit\b/gi,
  /exceeds maximum allowed tokens\b/gi,
  /\bduring the automated run\b/gi,
  /\bduring the framework run\b/gi,
  /\bthe automated run\b/gi,
  /\bspilled to a sidecar file\b/gi,
];

/**
 * Returns the input text with every framework-internal phrase stripped.
 * Idempotent + side-effect-free. When `text` is undefined or empty, returns
 * it unchanged (keeps the upstream-shape contract intact).
 */
export function stripFrameworkInternalJargon(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const pattern of FRAMEWORK_INTERNAL_PATTERNS) {
    out = out.replace(pattern, '');
  }
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return out;
}

/**
 * Apply `stripFrameworkInternalJargon` to every text-bearing field of a
 * `WikiDigestedUpstream`. Returns a new object; does not mutate the input.
 */
export function sanitizeWikiUpstream(
  upstream: WikiDigestedUpstream | undefined,
): WikiDigestedUpstream | undefined {
  if (!upstream) return upstream;
  return {
    synthesis: stripFrameworkInternalJargon(upstream.synthesis),
    claudeMd: stripFrameworkInternalJargon(upstream.claudeMd),
    architecturalNarrative: stripFrameworkInternalJargon(upstream.architecturalNarrative),
  };
}

/**
 * Build the lowercase token set used for per-service upstream filtering.
 * Stack-agnostic — pulls only descriptive identifiers (id, name, path
 * leaves). No language-specific or role-specific synonyms.
 *
 * The leaf segment of `path` (e.g. `apps/web` → `web`, `services/Worker` →
 * `worker`) is included because most narrative refers to services by their
 * folder name rather than the full id.
 */
export function buildServiceMatchTokens(service: {
  id: string;
  name?: string;
  path?: string;
}): Set<string> {
  const tokens = new Set<string>();
  const add = (raw: string | undefined): void => {
    if (!raw) return;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length < 2) return;
    tokens.add(trimmed);
  };
  add(service.id);
  add(service.name);
  if (service.path) {
    const leaf = service.path.replace(/\/+$/, '').split('/').pop();
    add(leaf);
  }
  return tokens;
}

/**
 * Filter a markdown document down to sections (headings + bodies) that
 * mention at least one of the supplied lowercase tokens. The match is
 * case-insensitive and respects word boundaries — the token "api" matches
 * "API surface" but not "captain". When no section matches, returns an
 * empty string (a service doc with zero relevant upstream prose is
 * acceptable; the analyzer slice still has the structural facts).
 */
export function scopeMarkdownToTokens(markdown: string, tokens: Set<string>): string {
  if (tokens.size === 0) return markdown;
  if (!markdown.trim()) return '';
  const tokenList = Array.from(tokens);
  const matchers = tokenList.map((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i'));

  const lines = markdown.split('\n');
  const sections: { level: number; heading: string | null; body: string[] }[] = [];
  let preamble: string[] = [];
  let current: { level: number; heading: string | null; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = /^(#{1,3})\s+/.exec(line);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { level: headingMatch[1].length, heading: line, body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const matched = sections.filter((s) => {
    const hay = `${s.heading ?? ''}\n${s.body.join('\n')}`;
    return matchers.some((m) => m.test(hay));
  });

  if (matched.length === 0) return '';

  const matchedSet = new Set(matched);
  const h1Sections = sections.filter((s) => s.level === 1);
  const carriers: typeof sections = [];
  for (const h1 of h1Sections) {
    if (!matchedSet.has(h1)) carriers.push(h1);
  }

  const out: string[] = [];
  if (preamble.some((l) => l.trim().length > 0)) {
    out.push(preamble.join('\n').trimEnd());
    out.push('');
  }
  for (const section of sections) {
    if (matchedSet.has(section) || carriers.includes(section)) {
      if (section.heading) out.push(section.heading);
      out.push(...section.body);
    }
  }
  return out.join('\n').trim();
}

/**
 * Per-service upstream slicer. Returns the same digested-upstream shape with
 * each text field narrowed to sections that mention the target service's id,
 * name, or path leaf.
 */
export function scopeUpstreamForService(
  upstream: WikiDigestedUpstream | undefined,
  service: { id: string; name?: string; path?: string },
): WikiDigestedUpstream | undefined {
  if (!upstream) return upstream;
  const tokens = buildServiceMatchTokens(service);
  return {
    synthesis: upstream.synthesis ? scopeMarkdownToTokens(upstream.synthesis, tokens) : undefined,
    claudeMd: upstream.claudeMd ? scopeMarkdownToTokens(upstream.claudeMd, tokens) : undefined,
    architecturalNarrative: upstream.architecturalNarrative
      ? scopeMarkdownToTokens(upstream.architecturalNarrative, tokens)
      : undefined,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
