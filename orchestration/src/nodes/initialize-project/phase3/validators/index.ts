/**
 * COMPREHENSIVE SYNTHESIS VALIDATOR
 *
 * This validator is the main quality gate for the AI Agentic Framework
 * synthesis output. Used by 600+ projects and 6000+ developers.
 *
 * MUST be identical in BOTH:
 * - phase3/hooks/validate-synthesis.hook.ts (Claude stop hook)
 * - phase3/synthesis.node.ts (external validator used by both providers)
 *
 * Phase 3 synthesis emits FIVE sections (see `types.ts` header for the full
 * contract). The validator checks:
 *   - Output is markdown, not JSON.
 *   - No preamble / Write-tool descriptions.
 *   - Total length floor.
 *   - All five section headers present in the prescribed order.
 *   - CLAUDE.md body validity (cheat-sheet shape).
 *   - Each prescriptive skill body's validity (frontmatter + name + H1 +
 *     code-examples-where-required).
 *   - Each section within its line-count bounds.
 *
 * @module synthesis-validator
 */

import type { SynthesisValidationResult } from './types.js';
import { LIMITS } from './types.js';
import { detectJSONFormat } from './detect-json-format.js';
import { detectPreambleText } from './detect-preamble-text.js';
import { detectWriteToolUsage } from './detect-write-tool-usage.js';
import { validateClaudeMdContent } from './validate-claude-md-content.js';
import { validateSkillContent } from './validate-skill-content.js';
import { validateLineCount } from './validate-line-count.js';
import { extractSynthesisMarkdown } from './extract-synthesis-markdown.js';
import { formatErrorsForAgent } from './format-errors-for-agent.js';
import { detectInputUnavailableStub } from './detect-input-unavailable-stub.js';
import { detectNonPortableAbsolutePath } from './detect-non-portable-absolute-path.js';

const REQUIRED_FORMAT_HINT = [
  '📋 REQUIRED FORMAT (in this exact order, separated by --- on its own line):',
  '   # CLAUDE.md Content',
  '   …',
  '   ---',
  '   # code-conventions/SKILL.md Content',
  '   ---',
  '   name: code-conventions',
  '   ---',
  '   # Code conventions',
  '   …',
  '   ---',
  '   # multi-file-workflows/SKILL.md Content',
  '   …',
  '   ---',
  '   # testing-conventions/SKILL.md Content',
  '   …',
  '   ---',
  '   # Architectural Narrative Content',
  '   …',
];

/**
 * Comprehensive validator for synthesis agent output.
 *
 * @param output - Raw output from synthesis agent
 * @returns Validation result with specific, actionable errors
 */
export function validateSynthesisOutput(output: string): SynthesisValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ========================================================================
  // CHECK 1: Reject empty or near-empty output immediately
  // ========================================================================
  if (!output || output.trim().length === 0) {
    return {
      valid: false,
      errors: [
        'OUTPUT IS EMPTY',
        '',
        '🔴 WHAT WENT WRONG:',
        '   Your response contains no content.',
        '',
        '🟢 HOW TO FIX:',
        '   Output the complete markdown content starting with "# CLAUDE.md Content".',
        '',
        ...REQUIRED_FORMAT_HINT,
      ],
    };
  }

  // ========================================================================
  // CHECK 2: Detect JSON format (most common error)
  // ========================================================================
  const trimmedOutput = output.trim();
  const jsonError = detectJSONFormat(trimmedOutput);
  if (jsonError) {
    errors.push(jsonError);
  }

  // ========================================================================
  // CHECK 3: Detect preamble text (agent describing what it will do)
  // ========================================================================
  const preambleError = detectPreambleText(trimmedOutput);
  if (preambleError) {
    errors.push(preambleError);
  }

  // ========================================================================
  // CHECK 4: Detect Write tool usage
  // ========================================================================
  const writeToolError = detectWriteToolUsage(trimmedOutput);
  if (writeToolError) {
    errors.push(writeToolError);
  }

  // ========================================================================
  // CHECK 5: Minimum total length
  // ========================================================================
  if (output.length < LIMITS.TOTAL_MIN_CHARS) {
    errors.push(
      `OUTPUT TOO SHORT (${output.length} characters, minimum ${LIMITS.TOTAL_MIN_CHARS})`,
      '',
      '🔴 WHAT WENT WRONG:',
      '   Your output is significantly shorter than expected.',
      '   A proper synthesis emits five non-trivial sections.',
      '',
      '🟢 HOW TO FIX:',
      '   - CLAUDE.md: 30–250 lines (cheat-sheet)',
      '   - code-conventions: 30–250 lines (rules + WRONG/CORRECT examples)',
      '   - multi-file-workflows: 20–200 lines (ordered checklists)',
      '   - testing-conventions: 25–200 lines (test rules + examples)',
      '   - Architectural Narrative: 30–400 lines (cross-cutting prose for the wiki)',
    );
  }

  // ========================================================================
  // CHECK 6: Extract and validate sections (all five must be present, in
  // order, well-bounded by their headers + the `---` separators)
  // ========================================================================
  const extracted = extractSynthesisMarkdown(output);

  if (!extracted) {
    errors.push(
      'CANNOT FIND ALL FIVE REQUIRED SECTIONS',
      '',
      '🔴 WHAT WENT WRONG:',
      '   Could not locate every required section header in your output, OR',
      '   the sections are not in the prescribed order.',
      '',
      '🟡 REQUIRED HEADERS (in this exact order, each on its own line, with',
      '   `---` separators between sections):',
      '   1. "# CLAUDE.md Content" (or "# AGENTS.md Content" on Codex)',
      '   2. "# code-conventions/SKILL.md Content"',
      '   3. "# multi-file-workflows/SKILL.md Content"',
      '   4. "# testing-conventions/SKILL.md Content"',
      '   5. "# Architectural Narrative Content"',
      '',
      ...REQUIRED_FORMAT_HINT,
    );
    return { valid: false, errors: formatErrorsForAgent(errors) };
  }

  // ========================================================================
  // CHECK 7: Validate CLAUDE.md content
  // ========================================================================
  const claudeErrors = validateClaudeMdContent(extracted.claudemd);
  errors.push(...claudeErrors);

  // ========================================================================
  // CHECK 8: Validate each prescriptive skill body
  // ========================================================================
  errors.push(
    ...validateSkillContent(extracted.codeConventions, {
      skillLabel: 'code-conventions',
      expectedName: 'code-conventions',
      requiresCodeExamples: true,
    }),
  );
  errors.push(
    // Plan §C 4.2 (gira-exhaustive followup, 2026-05-05): the
    // multi-file-workflows skill needs language-appropriate code
    // scaffolds for the operator to grok the wiring at a glance.
    // Pre-fix the gira run shipped a multi-file-workflows skill body
    // with zero fenced code blocks — pure checklists. Now matches the
    // rule for code-conventions and testing-conventions: ≥1 fenced
    // block required.
    ...validateSkillContent(extracted.multiFileWorkflows, {
      skillLabel: 'multi-file-workflows',
      expectedName: 'multi-file-workflows',
      requiresCodeExamples: true,
    }),
  );
  errors.push(
    ...validateSkillContent(extracted.testingConventions, {
      skillLabel: 'testing-conventions',
      expectedName: 'testing-conventions',
      requiresCodeExamples: true,
    }),
  );

  // ========================================================================
  // CHECK 8b: Plan v4 Phase F — reject input-unavailable apology stubs
  // and non-portable absolute paths in EVERY section. The stubs leak into
  // the operator's CLAUDE.md / SKILL.md when a composer view is empty;
  // user-home absolute paths leak the developer's local machine state
  // onto the 6000+ machines the framework ships to.
  // ========================================================================
  for (const [label, body] of [
    ['CLAUDE.md', extracted.claudemd],
    ['code-conventions', extracted.codeConventions],
    ['multi-file-workflows', extracted.multiFileWorkflows],
    ['testing-conventions', extracted.testingConventions],
    ['architectural-narrative', extracted.architecturalNarrative],
  ] as const) {
    const stubError = detectInputUnavailableStub(body);
    if (stubError) errors.push(`[${label}] ${stubError}`);
    const pathError = detectNonPortableAbsolutePath(body);
    if (pathError) errors.push(`[${label}] ${pathError}`);
  }

  // ========================================================================
  // CHECK 9: Architectural narrative is text only, no schema; just non-empty
  // ========================================================================
  if (!extracted.architecturalNarrative || !extracted.architecturalNarrative.trim()) {
    errors.push(
      'ARCHITECTURAL NARRATIVE IS EMPTY',
      '',
      '🔴 WHAT WENT WRONG:',
      '   The Architectural Narrative section emitted no content. The wiki',
      '   generator needs this prose to compile ARCHITECTURE.md and the',
      '   per-service docs.',
      '',
      '🟢 HOW TO FIX:',
      '   After the four file-bound sections, emit `# Architectural Narrative',
      '   Content` followed by descriptive prose: monorepo / multi-repo shape,',
      '   service boundaries, cross-service flow narrative, request lifecycles,',
      '   integration points. Stay descriptive (what IS) — prescriptive rules',
      '   belong in the conventions skills, not here.',
    );
  }

  // ========================================================================
  // CHECK 10: Validate per-section line counts
  // ========================================================================
  const lineCountChecks: Array<{
    label: string;
    body: string;
    min: number;
    max: number;
    purpose: string;
  }> = [
    {
      label: 'CLAUDE.md',
      body: extracted.claudemd,
      min: LIMITS.CLAUDE_MD.MIN_LINES,
      max: LIMITS.CLAUDE_MD.MAX_LINES,
      purpose:
        'cheat-sheet (tech stack, file placement, commands). Move architecture / workflows / examples to the conventions skills or Architectural Narrative.',
    },
    {
      label: 'code-conventions',
      body: extracted.codeConventions,
      min: LIMITS.CODE_CONVENTIONS.MIN_LINES,
      max: LIMITS.CODE_CONVENTIONS.MAX_LINES,
      purpose:
        'gotchas with WRONG/CORRECT examples + error handling + naming + data-layer rules. Keep purely prescriptive; move descriptive narrative to the Architectural Narrative section.',
    },
    {
      label: 'multi-file-workflows',
      body: extracted.multiFileWorkflows,
      min: LIMITS.MULTI_FILE_WORKFLOWS.MIN_LINES,
      max: LIMITS.MULTI_FILE_WORKFLOWS.MAX_LINES,
      purpose:
        'ordered checklists for cross-cutting changes. Each checklist is a numbered list of file edits.',
    },
    {
      label: 'testing-conventions',
      body: extracted.testingConventions,
      min: LIMITS.TESTING_CONVENTIONS.MIN_LINES,
      max: LIMITS.TESTING_CONVENTIONS.MAX_LINES,
      purpose:
        'test rules with example code: what to mock / not mock, fixture conventions, coverage expectations.',
    },
    {
      label: 'architectural-narrative',
      body: extracted.architecturalNarrative,
      min: LIMITS.ARCHITECTURAL_NARRATIVE.MIN_LINES,
      max: LIMITS.ARCHITECTURAL_NARRATIVE.MAX_LINES,
      purpose:
        'cross-cutting descriptive prose consumed by the wiki generator. Stay descriptive (what IS). No prescriptive rules here.',
    },
  ];

  for (const check of lineCountChecks) {
    const result = validateLineCount(check.body, check.min, check.max, check.label);
    if (!result.valid) {
      if (result.lineCount < result.minRequired) {
        errors.push(
          `${check.label.toUpperCase()} CONTENT TOO SHORT (${result.lineCount} lines, minimum ${result.minRequired})`,
          '',
          '🔴 WHAT WENT WRONG:',
          `   ${check.label} has only ${result.lineCount} lines but needs at least ${result.minRequired}.`,
          '',
          '🟢 HOW TO FIX:',
          `   ${check.label} should cover: ${check.purpose}`,
        );
      } else {
        errors.push(
          `${check.label.toUpperCase()} CONTENT TOO LONG (${result.lineCount} lines, maximum ${result.maxAllowed})`,
          '',
          '🔴 WHAT WENT WRONG:',
          `   ${check.label} has ${result.lineCount} lines but maximum is ${result.maxAllowed}.`,
          '',
          '🟢 HOW TO FIX:',
          `   ${check.label} should cover: ${check.purpose}`,
        );
      }
    }
  }

  // ========================================================================
  // FINAL RESULT
  // ========================================================================
  if (errors.length > 0) {
    return {
      valid: false,
      errors: formatErrorsForAgent(errors),
      warnings,
      extracted,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    extracted,
  };
}

// Re-export types for convenience
export type {
  SynthesisValidationResult,
  LineCountResult,
  ExtractedSynthesisSections,
} from './types.js';
export { extractSynthesisMarkdown } from './extract-synthesis-markdown.js';
