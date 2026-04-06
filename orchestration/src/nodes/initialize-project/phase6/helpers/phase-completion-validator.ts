/**
 * Phase Completion Validator
 *
 * Validates all phases completed successfully
 */

import type { InitializeProjectState } from "../../../../state/schemas/initialize-project.schema.js";
import type { PhaseCompletionResult } from "../types.js";

/**
 * Validate all phases completed
 */
export function validatePhaseCompletion(state: InitializeProjectState): PhaseCompletionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const phase1Complete = state.phase1_analysis?.all_completed || false;
  const phase2Complete = !!state.phase2_consolidation;
  const phase3Complete = !!state.phase3_synthesis;
  const phase4Complete = state.phase4_context?.framework_config_generated || false;

  if (!phase1Complete) {
    errors.push("Phase 1 analysis not marked as complete");
  }
  if (!phase2Complete) {
    errors.push("Phase 2 consolidation missing");
  }
  if (!phase3Complete) {
    errors.push("Phase 3 synthesis missing");
  }
  if (!phase4Complete) {
    errors.push("Phase 4 context generation not complete");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    phase1Complete,
    phase2Complete,
    phase3Complete,
    phase4Complete,
  };
}
