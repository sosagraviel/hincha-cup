/**
 * COMPREHENSIVE SYNTHESIS VALIDATOR
 *
 * This validator is the main quality gate for the AI Agentic Framework synthesis output.
 * Used by 600+ projects and 6000+ developers.
 *
 * MUST be identical in BOTH:
 * - agents/hooks/validate-synthesis.ts (stop hook)
 * - src/nodes/initialize-project/phase3/synthesis.node.ts (external validator)
 *
 * @module synthesis-validator
 */

import type { SynthesisValidationResult } from "./types.js";
import { LIMITS } from "./types.js";
import { detectJSONFormat } from "./detect-json-format.js";
import { detectPreambleText } from "./detect-preamble-text.js";
import { detectWriteToolUsage } from "./detect-write-tool-usage.js";
import { validateClaudeMdContent } from "./validate-claude-md-content.js";
import { validateProjectContextContent } from "./validate-project-context-content.js";
import { validateLineCount } from "./validate-line-count.js";
import { extractSynthesisMarkdown } from "./extract-synthesis-markdown.js";
import { formatErrorsForAgent } from "./format-errors-for-agent.js";

/**
 * Comprehensive validator for synthesis agent output.
 *
 * Validates that the output:
 * 1. Is NOT JSON format
 * 2. Has the required section structure
 * 3. Contains valid markdown content
 * 4. Meets line count requirements
 * 5. Has proper YAML frontmatter in project-context
 * 6. Does not contain preamble or meta-descriptions
 *
 * @param output - Raw output from synthesis agent
 * @returns Validation result with specific, actionable errors
 */
export function validateSynthesisOutput(
  output: string,
): SynthesisValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ========================================================================
  // CHECK 1: Reject empty or near-empty output immediately
  // ========================================================================
  if (!output || output.trim().length === 0) {
    return {
      valid: false,
      errors: [
        "OUTPUT IS EMPTY",
        "",
        "🔴 WHAT WENT WRONG:",
        "   Your response contains no content.",
        "",
        "🟢 HOW TO FIX:",
        '   Output the complete markdown content starting with "# CLAUDE.md Content"',
        "",
        "📋 REQUIRED FORMAT:",
        "   # CLAUDE.md Content",
        "   ",
        "   [Your CLAUDE.md markdown here - 30-250 lines]",
        "   ",
        "   ---",
        "   ",
        "   # project-context/SKILL.md Content",
        "   ",
        "   ---",
        "   name: project-context",
        "   ---",
        "   ",
        "   [Your project-context markdown here - 50-600 lines]",
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
    // Don't return early - collect all errors for comprehensive feedback
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
      "",
      "🔴 WHAT WENT WRONG:",
      "   Your output is significantly shorter than expected.",
      "   A proper synthesis should have substantial content for both files.",
      "",
      "🟢 HOW TO FIX:",
      "   - CLAUDE.md should be 30-250 lines with tech stack, file placement, commands",
      "   - project-context should be 50-600 lines with architecture, workflows, gotchas",
    );
  }

  // ========================================================================
  // CHECK 6: Extract and validate sections
  // ========================================================================
  const extracted = extractSynthesisMarkdown(output);

  if (!extracted) {
    errors.push(
      "CANNOT FIND REQUIRED SECTIONS",
      "",
      "🔴 WHAT WENT WRONG:",
      "   Could not locate the required section markers in your output.",
      "",
      "🟡 REQUIRED MARKERS (in order):",
      '   1. "# CLAUDE.md Content" - Section header for CLAUDE.md',
      '   2. "---" - Separator (three dashes on its own line)',
      '   3. "# project-context/SKILL.md Content" - Section header for project-context',
      "",
      "🟢 HOW TO FIX:",
      "   Your ENTIRE response must use this EXACT structure:",
      "",
      "   # CLAUDE.md Content",
      "",
      "   # ProjectName",
      "   ",
      "   ## Tech Stack",
      "   - TypeScript 5.3",
      "   ... (more content, 30-250 lines total)",
      "   ",
      "   ---",
      "   ",
      "   # project-context/SKILL.md Content",
      "   ",
      "   ---",
      "   name: project-context",
      "   description: Deep architectural knowledge",
      "   ---",
      "   ",
      "   # Project Context: ProjectName",
      "   ... (more content, 50-600 lines total)",
    );

    // Can't validate further without sections
    return { valid: false, errors: formatErrorsForAgent(errors) };
  }

  // ========================================================================
  // CHECK 7: Validate CLAUDE.md content
  // ========================================================================
  const claudeErrors = validateClaudeMdContent(extracted.claudemd);
  errors.push(...claudeErrors);

  // ========================================================================
  // CHECK 8: Validate project-context content
  // ========================================================================
  const contextErrors = validateProjectContextContent(extracted.projectContext);
  errors.push(...contextErrors);

  // ========================================================================
  // CHECK 9: Validate line counts
  // ========================================================================
  const claudeLineResult = validateLineCount(
    extracted.claudemd,
    LIMITS.CLAUDE_MD.MIN_LINES,
    LIMITS.CLAUDE_MD.MAX_LINES,
    "CLAUDE.md",
  );
  if (!claudeLineResult.valid) {
    if (claudeLineResult.lineCount < claudeLineResult.minRequired) {
      errors.push(
        `CLAUDE.md CONTENT TOO SHORT (${claudeLineResult.lineCount} lines, minimum ${claudeLineResult.minRequired})`,
        "",
        "🔴 WHAT WENT WRONG:",
        `   CLAUDE.md has only ${claudeLineResult.lineCount} lines but needs at least ${claudeLineResult.minRequired}.`,
        "",
        "🟢 HOW TO FIX:",
        "   CLAUDE.md must include these sections with sufficient detail:",
        "   - # ProjectName (1 line)",
        "   - ## Tech Stack (5-10 lines with exact versions)",
        "   - ## File Placement Guide (10-15 rows in table format)",
        "   - ## Directory Structure (5-10 lines with annotations)",
        "   - ## Essential Commands (5-10 rows in table format)",
        "   - ## Services & Ports (if applicable)",
        "   - ## Path Aliases (if applicable)",
      );
    } else {
      errors.push(
        `CLAUDE.md CONTENT TOO LONG (${claudeLineResult.lineCount} lines, maximum ${claudeLineResult.maxAllowed})`,
        "",
        "🔴 WHAT WENT WRONG:",
        `   CLAUDE.md has ${claudeLineResult.lineCount} lines but maximum is ${claudeLineResult.maxAllowed}.`,
        "",
        "🟢 HOW TO FIX:",
        "   CLAUDE.md should be a QUICK REFERENCE only. Remove:",
        "   - Architecture explanations (put in project-context)",
        "   - Request lifecycle details (put in project-context)",
        "   - Code examples (put in project-context)",
        '   - Any "why" explanations (put in project-context)',
        "   - Reduce File Placement Guide to 15-20 most common types",
      );
    }
  }

  const contextLineResult = validateLineCount(
    extracted.projectContext,
    LIMITS.PROJECT_CONTEXT.MIN_LINES,
    LIMITS.PROJECT_CONTEXT.MAX_LINES,
    "project-context",
  );
  if (!contextLineResult.valid) {
    if (contextLineResult.lineCount < contextLineResult.minRequired) {
      errors.push(
        `PROJECT-CONTEXT CONTENT TOO SHORT (${contextLineResult.lineCount} lines, minimum ${contextLineResult.minRequired})`,
        "",
        "🔴 WHAT WENT WRONG:",
        `   project-context has only ${contextLineResult.lineCount} lines but needs at least ${contextLineResult.minRequired}.`,
        "",
        "🟢 HOW TO FIX:",
        "   project-context must include these sections:",
        "   - YAML frontmatter (name: project-context)",
        "   - # Project Context: ProjectName",
        "   - ## When to Use This Skill",
        "   - ## Architecture Deep Dive",
        "   - ## Request Lifecycle (for backends)",
        "   - ## Authentication & Authorization (if applicable)",
        "   - ## Critical Workflows (with ALL files to modify)",
        "   - ## Gotchas & Non-Obvious Patterns (with code examples)",
        "   - ## Testing Strategy (with example code)",
        "   - ## Multi-File Change Checklists",
      );
    } else {
      errors.push(
        `PROJECT-CONTEXT CONTENT TOO LONG (${contextLineResult.lineCount} lines, maximum ${contextLineResult.maxAllowed})`,
        "",
        "🔴 WHAT WENT WRONG:",
        `   project-context has ${contextLineResult.lineCount} lines but maximum is ${contextLineResult.maxAllowed}.`,
        "",
        "🟢 HOW TO FIX:",
        "   Focus on what is HARD TO DISCOVER. Remove:",
        "   - Full endpoint lists (AI can grep these)",
        "   - Entity field listings (AI can read the code)",
        "   - Module directory inventories (AI can ls)",
        "   - Environment variable tables (AI can read .env.example)",
        "   Keep only: non-obvious patterns, multi-step flows, gotchas",
      );
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
export type { SynthesisValidationResult, LineCountResult } from "./types.js";
export { extractSynthesisMarkdown } from "./extract-synthesis-markdown.js";
