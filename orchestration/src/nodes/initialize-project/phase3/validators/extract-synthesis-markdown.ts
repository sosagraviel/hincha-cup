/**
 * Extract synthesis markdown sections from agent output.
 *
 * Phase 3 synthesis emits five sections in a fixed order, separated by `---`
 * lines. This extractor finds each section header anywhere in the output
 * (skipping any preamble) and returns the section bodies. Returns `null`
 * when any required section is missing — the caller (validator) treats that
 * as "the agent did not follow the required output format" and surfaces a
 * retry-feedback message.
 *
 * The order is fixed because the section headers are uniquely-shaped tokens
 * (no other markdown content matches `# CLAUDE.md Content` etc.); we don't
 * use position to disambiguate, only to bound each section's body.
 *
 * Section order (load-bearing):
 *   1. CLAUDE.md / AGENTS.md
 *   2. code-conventions/SKILL.md
 *   3. multi-file-workflows/SKILL.md
 *   4. testing-conventions/SKILL.md
 *   5. Architectural Narrative
 */

import { SECTION_MARKERS, type ExtractedSynthesisSections } from './types.js';

interface SectionDescriptor {
  /** Human-readable name for error messages. */
  label: keyof ExtractedSynthesisSections;
  /** Header tokens to search for; first match wins (provider variants). */
  headers: string[];
}

const SECTIONS: readonly SectionDescriptor[] = [
  {
    label: 'claudemd',
    headers: [SECTION_MARKERS.CLAUDE_MD_HEADER, SECTION_MARKERS.AGENTS_MD_HEADER],
  },
  {
    label: 'codeConventions',
    headers: [SECTION_MARKERS.CODE_CONVENTIONS_HEADER],
  },
  {
    label: 'multiFileWorkflows',
    headers: [SECTION_MARKERS.MULTI_FILE_WORKFLOWS_HEADER],
  },
  {
    label: 'testingConventions',
    headers: [SECTION_MARKERS.TESTING_CONVENTIONS_HEADER],
  },
  {
    label: 'architecturalNarrative',
    headers: [SECTION_MARKERS.ARCHITECTURAL_NARRATIVE_HEADER],
  },
];

interface FoundHeader {
  label: keyof ExtractedSynthesisSections;
  /** Index of the first character AFTER the header token (where the body starts). */
  bodyStart: number;
  /** Index of the header itself in the source (for ordering checks). */
  headerStart: number;
  /** Length of the header token that was matched. */
  headerLength: number;
}

/**
 * Locate every required section header in the output. Returns null when any
 * required header is missing or when the headers are not in the prescribed
 * order. Order matters because the extractor delimits each section's body
 * by the start of the next header.
 */
function locateHeaders(output: string): FoundHeader[] | null {
  const found: FoundHeader[] = [];

  for (const section of SECTIONS) {
    let headerStart = -1;
    let matchedHeader = '';
    for (const header of section.headers) {
      const idx = output.indexOf(header);
      if (idx !== -1 && (headerStart === -1 || idx < headerStart)) {
        headerStart = idx;
        matchedHeader = header;
      }
    }
    if (headerStart === -1) {
      return null;
    }
    found.push({
      label: section.label,
      bodyStart: headerStart + matchedHeader.length,
      headerStart,
      headerLength: matchedHeader.length,
    });
  }

  for (let i = 1; i < found.length; i += 1) {
    if (found[i].headerStart <= found[i - 1].bodyStart) {
      return null;
    }
  }

  return found;
}

/**
 * Trim leading/trailing whitespace and any TRAILING `---` separator line.
 *
 * The synthesizer puts `---` between sections, so each section's body slice
 * ends with `\n---\n` (the separator before the next section's header). We
 * strip that trailing separator so the body ends on real content.
 *
 * We deliberately do NOT strip a leading `---` block — for skill bodies, the
 * leading `---` is the YAML frontmatter open, and stripping it would break
 * frontmatter detection downstream. (Stripping wasn't needed anyway: the
 * body slice starts immediately after a section header, so it never carries
 * a leading inter-section separator.)
 */
function trimSectionBody(body: string): string {
  let result = body.trim();
  result = result.replace(/\n---\s*$/, '').trim();
  return result;
}

export function extractSynthesisMarkdown(output: string): ExtractedSynthesisSections | null {
  if (!output || !output.trim()) return null;

  const headers = locateHeaders(output);
  if (!headers) return null;

  const result: Partial<ExtractedSynthesisSections> = {};

  for (let i = 0; i < headers.length; i += 1) {
    const current = headers[i];
    const next = headers[i + 1];
    const sliceEnd = next ? next.headerStart : output.length;
    const rawBody = output.slice(current.bodyStart, sliceEnd);
    result[current.label] = trimSectionBody(rawBody);
  }

  return result as ExtractedSynthesisSections;
}
