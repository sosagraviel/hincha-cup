/**
 * Splice helpers for the Phase 3.5 context verifier.
 *
 * Phase 3 emits one synthesis blob containing five sections separated by `---`
 * (see `phase3/validators/types.ts`). The verifier corrects only the
 * `# CLAUDE.md Content` / `# AGENTS.md Content` section, so these helpers
 * isolate that section from the blob and splice a corrected body back in
 * without disturbing the other four sections.
 */

import { SECTION_MARKERS } from '../../phase3/validators/types.js';

const CLAUDE_HEADERS = [SECTION_MARKERS.CLAUDE_MD_HEADER, SECTION_MARKERS.AGENTS_MD_HEADER];

/**
 * Locate the cheat-sheet header in the blob. Returns the earliest match of the
 * Claude or Codex header variant, or null when neither is present.
 */
function findClaudeHeader(blob: string): { token: string; index: number } | null {
  let best: { token: string; index: number } | null = null;
  for (const token of CLAUDE_HEADERS) {
    const index = blob.indexOf(token);
    if (index !== -1 && (best === null || index < best.index)) {
      best = { token, index };
    }
  }
  return best;
}

/**
 * The cheat-sheet section ends where the next section (`code-conventions`)
 * begins. Returns that index, or the blob length when no following section
 * exists (cheat-sheet is the only/last section).
 */
function findSectionEnd(blob: string, bodyStart: number): number {
  const next = blob.indexOf(SECTION_MARKERS.CODE_CONVENTIONS_HEADER, bodyStart);
  return next === -1 ? blob.length : next;
}

/**
 * Extract the cheat-sheet section body (without its header line) from the
 * synthesis blob. Returns null when the header is absent.
 */
export function extractClaudeMdBody(blob: string): string | null {
  const header = findClaudeHeader(blob);
  if (!header) return null;
  const bodyStart = header.index + header.token.length;
  const end = findSectionEnd(blob, bodyStart);
  return blob
    .slice(bodyStart, end)
    .replace(/\n---\s*$/, '')
    .trim();
}

/**
 * Replace the cheat-sheet section body in the synthesis blob with
 * `correctedBody`, preserving the header line, the inter-section `---`
 * separator, and every other section verbatim. Returns null when the
 * cheat-sheet header cannot be located (caller should keep the original blob).
 */
export function spliceClaudeMdBody(blob: string, correctedBody: string): string | null {
  const header = findClaudeHeader(blob);
  if (!header) return null;
  const bodyStart = header.index + header.token.length;
  const end = findSectionEnd(blob, bodyStart);
  const hasFollowingSection = end < blob.length;
  const before = blob.slice(0, bodyStart);
  const after = blob.slice(end);
  const separator = hasFollowingSection ? `\n\n${SECTION_MARKERS.SEPARATOR}\n` : '\n';
  return `${before}\n\n${correctedBody.trim()}${separator}${after}`;
}

/**
 * Normalize raw verifier agent output into a clean cheat-sheet body. The verifier
 * is instructed to emit the corrected file only, but a model may wrap it in a code
 * fence, re-emit the `# CLAUDE.md Content` header, or prepend a "what I changed"
 * explanation. None of that may reach the file, so this strips, in order: a
 * wrapping code fence; a `# CLAUDE.md Content` / `# AGENTS.md Content` wrapper found
 * anywhere (handles a wrapper preceded by preamble); and any remaining leading
 * preamble before the first top-level `# ` heading (the project-name line).
 *
 * When no top-level `# ` heading is present the text is returned unchanged so the
 * downstream content validator rejects it and the retry loop fires — better than
 * silently emitting prose.
 */
export function normalizeVerifierOutput(raw: string): string {
  let out = raw.trim();
  const fenceMatch = out.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) out = fenceMatch[1].trim();
  for (const token of CLAUDE_HEADERS) {
    const idx = out.indexOf(token);
    if (idx !== -1) {
      out = out
        .slice(idx + token.length)
        .replace(/\n---\s*$/, '')
        .trim();
      break;
    }
  }
  const headingMatch = out.match(/^# \S.*$/m);
  if (headingMatch && headingMatch.index !== undefined && headingMatch.index > 0) {
    out = out.slice(headingMatch.index).trim();
  }
  return out;
}
