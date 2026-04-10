/**
 * Phase Completion Validator
 *
 * Validates all phases completed successfully by checking output files
 * (NEVER uses state - always validates file existence)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import type { PhaseCompletionResult } from '../types.js';

/**
 * Validate all phases completed by checking output files exist
 */
export function validatePhaseCompletion(state: InitializeProjectState): PhaseCompletionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  const projectClaudeDir = join(state.project_path, '.claude');

  // Phase 1: Check analyzer output files exist
  const phase1Dir = join(tempDir, 'phase1-outputs');
  const requiredPhase1Files = [
    '01-structure-architecture.json',
    '02-tech-stack-dependencies.json',
    '03-code-patterns-testing.json',
    '04-data-flows-integrations.json',
  ];
  const phase1Complete = requiredPhase1Files.every((file) => existsSync(join(phase1Dir, file)));

  // Phase 2: Check consolidation file exists
  const phase2Path = join(tempDir, 'phase2-consolidation.json');
  const phase2Complete = existsSync(phase2Path);

  // Phase 3: Check synthesis file exists
  const phase3Path = join(tempDir, 'synthesis-raw.md');
  const phase3Complete = existsSync(phase3Path);

  // Phase 4: Check framework-config.json and CLAUDE.md exist
  const frameworkConfigPath = join(projectClaudeDir, 'framework-config.json');
  const claudeMdPath = join(projectClaudeDir, 'CLAUDE.md');
  const phase4Complete = existsSync(frameworkConfigPath) && existsSync(claudeMdPath);

  if (!phase1Complete) {
    errors.push('Phase 1 analysis outputs not found');
  }
  if (!phase2Complete) {
    errors.push('Phase 2 consolidation file not found');
  }
  if (!phase3Complete) {
    errors.push('Phase 3 synthesis file not found');
  }
  if (!phase4Complete) {
    errors.push('Phase 4 context generation files not found');
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
