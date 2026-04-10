/**
 * Phase 6: Validation Constants
 *
 * Centralized constants for Phase 6 validation thresholds and criteria
 */

// ============================================================================
// CONTENT VALIDATION THRESHOLDS
// ============================================================================

/**
 * Minimum content length for markdown files to be considered valid
 */
export const MIN_CONTENT_LENGTH = 100;

// ============================================================================
// AGENT VALIDATION THRESHOLDS
// ============================================================================

/**
 * Minimum number of agents required for a valid setup
 * Must have at least planner + one implementer
 */
export const MIN_AGENT_COUNT = 2;

/**
 * Minimum file count for a language to be considered "significant"
 * and require a dedicated implementer agent
 */
export const SIGNIFICANT_LANGUAGE_THRESHOLD = 10;

// ============================================================================
// DIRECTORY NAMES
// ============================================================================

/**
 * Standard .claude subdirectories that should exist after initialization
 */
export const REQUIRED_DIRECTORIES = {
  SKILLS: 'skills',
  AGENTS: 'agents',
  COMMANDS: 'commands',
  PROJECT_CONTEXT: 'project-context',
} as const;

/**
 * File extensions for validation
 */
export const FILE_EXTENSIONS = {
  MARKDOWN: '.md',
  JSON: '.json',
} as const;
