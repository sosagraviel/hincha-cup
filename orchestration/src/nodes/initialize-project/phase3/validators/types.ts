/**
 * Types and constants for synthesis validation.
 *
 * Phase 3 synthesis emits FIVE sections in a single agent response (a single
 * Opus call). Phase 4 splits the output into:
 *
 *   1. CLAUDE.md (or AGENTS.md) — the project cheat-sheet (file placement,
 *      tech stack, essential commands). Written to `<project>/.claude/CLAUDE.md`
 *      (or `.codex/AGENTS.md`).
 *   2. code-conventions/SKILL.md — prescriptive code rules: gotchas with
 *      WRONG/CORRECT examples, error handling, naming, data-layer rules,
 *      organization rules. Written to `<project>/.claude/skills/code-conventions/SKILL.md`.
 *   3. multi-file-workflows/SKILL.md — ordered checklists for cross-cutting
 *      changes. Written to `<project>/.claude/skills/multi-file-workflows/SKILL.md`.
 *   4. testing-conventions/SKILL.md — prescriptive testing rules: mocking
 *      strategy, fixture conventions, coverage expectations. Written to
 *      `<project>/.claude/skills/testing-conventions/SKILL.md`.
 *   5. Architectural Narrative — descriptive narrative consumed by the
 *      Phase 4b wiki-generator as part of its `digestedUpstream.synthesis`
 *      input. NOT written to disk as a skill or document; the wiki agent
 *      compiles it (along with analyzer output) into wiki/ARCHITECTURE.md
 *      and per-service docs. This block is what carries cross-service flow
 *      narrative, request-lifecycle prose, and other structural narrative
 *      that doesn't belong in a prescriptive skill.
 *
 * The split enforces the descriptive/prescriptive line documented in
 * `ai-documentation-strategy/09-context-strategy/analysis.md`:
 *   - WIKI = descriptive (what IS).
 *   - SKILLS = prescriptive (what to DO).
 *   - CLAUDE.md = cheat sheet (WHERE / WHAT command).
 *
 * Phase 3's role is to produce all five in one shot from the consolidated
 * Phase 1+2 data; Phase 4 splits them; Phase 4b consumes the narrative for
 * the wiki and ignores the four prescriptive sections.
 */

export interface ExtractedSynthesisSections {
  /** CLAUDE.md (or AGENTS.md on Codex) cheat-sheet body, no header line. */
  claudemd: string;
  /** code-conventions/SKILL.md body (excluding the section header). */
  codeConventions: string;
  /** multi-file-workflows/SKILL.md body. */
  multiFileWorkflows: string;
  /** testing-conventions/SKILL.md body. */
  testingConventions: string;
  /** Architectural narrative passed to the Phase 4b wiki-generator. */
  architecturalNarrative: string;
}

export interface SynthesisValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  extracted?: ExtractedSynthesisSections;
}

export interface LineCountResult {
  valid: boolean;
  lineCount: number;
  minRequired: number;
  maxAllowed: number;
}

/**
 * Per-section line-count bounds. Each prescriptive skill is intentionally
 * smaller than the legacy project-context monolith (which was ≤600 lines):
 * splitting forces the synthesizer to keep each skill focused, and keeps
 * the planner / implementer subagent preload cost bounded (~1.5–2k tokens
 * per skill).
 */
export const LIMITS = {
  CLAUDE_MD: {
    MIN_LINES: 30,
    MAX_LINES: 250,
  },
  CODE_CONVENTIONS: {
    MIN_LINES: 30,
    MAX_LINES: 250,
  },
  MULTI_FILE_WORKFLOWS: {
    MIN_LINES: 20,
    MAX_LINES: 200,
  },
  TESTING_CONVENTIONS: {
    MIN_LINES: 25,
    MAX_LINES: 200,
  },
  ARCHITECTURAL_NARRATIVE: {
    MIN_LINES: 30,
    MAX_LINES: 400,
  },
  TOTAL_MIN_CHARS: 800,
} as const;

/**
 * Section markers the synthesizer must emit verbatim, separated by a `---`
 * delimiter line. Order is fixed; the extractor depends on it.
 *
 * Provider-aware: the cheat-sheet section header is `# CLAUDE.md Content`
 * for Claude and `# AGENTS.md Content` for Codex; the extractor accepts
 * either.
 */
export const SECTION_MARKERS = {
  CLAUDE_MD_HEADER: '# CLAUDE.md Content',
  AGENTS_MD_HEADER: '# AGENTS.md Content',
  CODE_CONVENTIONS_HEADER: '# code-conventions/SKILL.md Content',
  MULTI_FILE_WORKFLOWS_HEADER: '# multi-file-workflows/SKILL.md Content',
  TESTING_CONVENTIONS_HEADER: '# testing-conventions/SKILL.md Content',
  ARCHITECTURAL_NARRATIVE_HEADER: '# Architectural Narrative Content',
  SEPARATOR: '---',
} as const;

export const PREAMBLE_PATTERNS = [
  /^(let me|i('ll| will)|here('s| is)|now i|allowing me to)/i,
  /^(based on|according to|as requested|following your)/i,
  /^(i have (generated|created|produced|written))/i,
  /^(the (following|output|content|result) (is|contains|shows))/i,
  /^(here are the|below (is|are))/i,
  /^outputting/i,
  /^generating/i,
];

export const WRITE_TOOL_PATTERNS = [
  /wrote\s+(to|file|content)/i,
  /created\s+(file|directory)/i,
  /saved.{0,20}(to|file|as)/i,
  /write\s+tool/i,
  /writefilesync/i,
  /fs\.write/i,
  /using\s+write/i,
];
