/**
 * Phase 6: Validation Types
 *
 * Centralized type definitions for Phase 6 validation components
 */

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Result of a validation check
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * File validation result with content analysis
 */
export interface FileValidationResult extends ValidationResult {
  exists: boolean;
  contentLength?: number;
  path?: string;
}

/**
 * Directory validation result with file counts
 */
export interface DirectoryValidationResult extends ValidationResult {
  exists: boolean;
  fileCount?: number;
  files?: string[];
}

/**
 * Agent coverage validation result
 */
export interface AgentCoverageResult extends ValidationResult {
  agentCount: number;
  hasPlannerAgent: boolean;
  missingImplementers: string[];
  significantLanguages: string[];
}

/**
 * Phase completion validation result
 */
export interface PhaseCompletionResult extends ValidationResult {
  phase1Complete: boolean;
  phase2Complete: boolean;
  phase3Complete: boolean;
  phase4Complete: boolean;
  phase4WikiComplete?: boolean;
}

/**
 * Overall validation summary
 */
export interface ValidationSummary {
  success: boolean;
  errors: string[];
  warnings: string[];
  totalDuration?: number;
  completedAt: string;
}
