/**
 * Types and constants for synthesis validation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SynthesisValidationResult {
  valid: boolean;
  errors: string[]; // Specific, actionable error messages
  warnings?: string[]; // Non-blocking issues
  extracted?: {
    claudemd: string;
    projectContext: string;
  };
}

export interface LineCountResult {
  valid: boolean;
  lineCount: number;
  minRequired: number;
  maxAllowed: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const LIMITS = {
  CLAUDE_MD: {
    MIN_LINES: 30,
    MAX_LINES: 250,
  },
  PROJECT_CONTEXT: {
    MIN_LINES: 50,
    MAX_LINES: 600,
  },
  TOTAL_MIN_CHARS: 500,
} as const;

export const SECTION_MARKERS = {
  CLAUDE_MD_HEADER: "# CLAUDE.md Content",
  PROJECT_CONTEXT_HEADER: "# project-context/SKILL.md Content",
  SEPARATOR: "---",
} as const;

// Patterns that indicate the agent is describing what it did instead of outputting content
export const PREAMBLE_PATTERNS = [
  /^(let me|i('ll| will)|here('s| is)|now i|allowing me to)/i,
  /^(based on|according to|as requested|following your)/i,
  /^(i have (generated|created|produced|written))/i,
  /^(the (following|output|content|result) (is|contains|shows))/i,
  /^(here are the|below (is|are))/i,
  /^outputting/i,
  /^generating/i,
];

// Patterns that indicate Write tool usage or file operations
export const WRITE_TOOL_PATTERNS = [
  /wrote\s+(to|file|content)/i,
  /created\s+(file|directory)/i,
  /saved.{0,20}(to|file|as)/i, // Allow up to 20 chars between "saved" and "to/file/as"
  /write\s+tool/i,
  /writefilesync/i,
  /fs\.write/i,
  /using\s+write/i,
];
