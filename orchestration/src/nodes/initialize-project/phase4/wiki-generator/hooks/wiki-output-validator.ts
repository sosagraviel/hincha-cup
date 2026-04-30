/**
 * Pure validator for wiki-generator agent output. Extracted from the Stop
 * hook entry-point so it can be unit-tested without spawning the CLI.
 *
 * Contract enforced (rejects on any violation):
 *
 *   1. Output starts with a level-1 markdown heading `# Title`. No YAML
 *      frontmatter delimiter `---` — the wiki-generation node prepends
 *      frontmatter deterministically.
 *   2. No inline `^[...]` citation markers. Provenance lives in YAML
 *      frontmatter (`sources:` + `confidence:`); inline `^[id]` is
 *      non-standard markdown (GitHub strips it; Obsidian's `^[content]`
 *      extension treats the brackets as the footnote BODY, not an id, so
 *      `^[architectural-narrative]` would render as a footnote whose
 *      entire text is literally "architectural-narrative" — a citation
 *      that says nothing). Pages must also be self-contained —
 *      references like `^[claude-md]` would point OUTSIDE the wiki tree
 *      to a file like `.claude/CLAUDE.md`, breaking the wiki's "follow
 *      [[wikilinks]] only" navigation contract.
 *   3. No framework-internal jargon ("automated run", "exceeded token
 *      limit", "tool result overflow", "the X tool overflowed", etc.)
 *      leaking into user-facing prose. Wiki readers are developers
 *      consulting the wiki months later — they don't know what an
 *      "automated run" is.
 *
 * Stack-agnostic: every check operates on the agent's text output only;
 * no language, framework, or repo-shape assumptions.
 *
 * Returns a list of violation messages (empty array = pass). Caller
 * (the hook entry-point) decides what to do — typically: print to stderr
 * and exit 2 to block the agent's Stop.
 */

const FRAMEWORK_JARGON_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bautomated run\b/i, label: '"automated run"' },
  { pattern: /\bduring the framework run\b/i, label: '"during the framework run"' },
  { pattern: /\bexceeded token limit\b/i, label: '"exceeded token limit"' },
  { pattern: /\bexceeds maximum allowed tokens\b/i, label: '"exceeds maximum allowed tokens"' },
  { pattern: /\btool result overflow\b/i, label: '"tool result overflow"' },
  { pattern: /\btool-result overflow\b/i, label: '"tool-result overflow"' },
  {
    pattern: /\bthe [a-z_-]+ tool overflowed\b/i,
    label: 'phrasings of "the <tool> overflowed"',
  },
  { pattern: /\bspilled to a sidecar file\b/i, label: '"spilled to a sidecar file"' },
];

/**
 * Walk the page body line-by-line; collect every `^[...]` occurrence that
 * is NOT inside a fenced code block. Code fences are legitimate places to
 * show an example of the syntax (e.g. *demonstrating* what the wiki used
 * to use), so we don't false-positive on those.
 */
export function extractProvenanceTags(text: string): Array<{ tag: string; line: number }> {
  const out: Array<{ tag: string; line: number }> = [];
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const matches = line.matchAll(/\^\[([^\]]+)\]/g);
    for (const m of matches) {
      out.push({ tag: m[1], line: i + 1 });
    }
  }
  return out;
}

/**
 * Validate a wiki-generator output payload against the three rules
 * documented in the module header. Returns an array of violation strings
 * (each one ready to print as a bullet). Empty array means pass.
 *
 * The function is pure — no I/O, no process.exit, no globals — so it can
 * be exercised by unit tests with arbitrary string inputs.
 */
export function validateWikiOutput(text: string): string[] {
  const violations: string[] = [];

  if (!text || !text.trim()) {
    violations.push(
      '  • Empty wiki output. Return the page as a single markdown document starting with `# Heading`.',
    );
    return violations;
  }

  // Rule 1: starts with `# ` (no frontmatter — the wiki-generation node
  // adds frontmatter deterministically).
  const firstNonBlank = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  if (firstNonBlank.trim().startsWith('---')) {
    violations.push(
      '  • Output starts with a YAML frontmatter delimiter `---`. Do NOT include frontmatter — the framework prepends it deterministically. Output the markdown body only, starting with a `# Heading`.',
    );
  } else if (!/^#\s+\S/.test(firstNonBlank.trim())) {
    violations.push(
      '  • Output must start with a level-1 markdown heading like `# <Title>`. Do not start with prose, a list, or a code fence.',
    );
  }

  // Rule 2: NO inline `^[...]` markers anywhere outside fenced code blocks.
  const tags = extractProvenanceTags(text);
  if (tags.length > 0) {
    const examples = tags
      .slice(0, 8)
      .map(({ tag, line }) => `      line ${line}: ^[${tag}]`)
      .join('\n');
    violations.push(
      '  • Found inline `^[...]` citation markers in the page body:\n' +
        examples +
        (tags.length > 8 ? `\n      … and ${tags.length - 8} more` : '') +
        '\n    Inline citations are FORBIDDEN. Provenance lives in YAML frontmatter (sources: and confidence:), auto-injected by the framework — you do NOT need to mark sources per claim. ' +
        '\n    Replacements: for in-wiki cross-references use `[[wikilinks]]` (e.g. `[[ARCHITECTURE]]`); for gaps write `(not determined by analysis)`; otherwise drop the marker and keep the prose plain.',
    );
  }

  // Rule 3: framework-internal jargon must not leak.
  const jargonHits: Array<{ label: string; line: number; snippet: string }> = [];
  const textLines = text.split('\n');
  for (let i = 0; i < textLines.length; i += 1) {
    for (const { pattern, label } of FRAMEWORK_JARGON_PATTERNS) {
      if (pattern.test(textLines[i])) {
        jargonHits.push({
          label,
          line: i + 1,
          snippet: textLines[i].trim().slice(0, 160),
        });
      }
    }
  }
  if (jargonHits.length > 0) {
    const examples = jargonHits
      .slice(0, 6)
      .map(({ label, line, snippet }) => `      line ${line} (${label}): ${snippet}`)
      .join('\n');
    violations.push(
      '  • Found framework-internal phrasing in user-facing prose:\n' +
        examples +
        (jargonHits.length > 6 ? `\n      … and ${jargonHits.length - 6} more` : '') +
        '\n    The wiki is read by developers months after the run — they do not know what an "automated run" or a "tool overflow" is. Rewrite each offending sentence to describe the project state directly. ' +
        'If the underlying fact is not actually known, write `(not determined by analysis)` instead.',
    );
  }

  return violations;
}
