/**
 * Phase Completion Validator
 *
 * Validates all phases completed successfully by checking output files
 * (NEVER uses state - always validates file existence)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../../state/schemas/initialize-project.schema.js';
import type { PhaseCompletionResult } from '../types.js';
import { getExpectedLlmWikiFiles } from '../../../../services/graph-wiki/wiki-generator.service.js';
import {
  resolveConfigPath,
  resolveTempPath,
  getInstructionFileName,
} from '../../../../utils/provider-paths.js';

/**
 * Validate all phases completed by checking output files exist
 */
export function validatePhaseCompletion(state: InitializeProjectState): PhaseCompletionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const projectConfigDir = resolveConfigPath(state.project_path);

  const phase1Dir = join(tempDir, 'phase1-outputs');
  const requiredPhase1Files = [
    '01-structure-architecture.json',
    '02-tech-stack-dependencies.json',
    '03-code-patterns-testing.json',
    '04-data-flows-integrations.json',
  ];
  const phase1Complete = requiredPhase1Files.every((file) => existsSync(join(phase1Dir, file)));

  const phase2Path = join(tempDir, 'phase2-consolidation.json');
  const phase2Complete = existsSync(phase2Path);

  const phase3Path = join(tempDir, 'synthesis-raw.md');
  const phase3Complete = existsSync(phase3Path);

  const frameworkConfigPath = join(projectConfigDir, 'framework-config.json');
  const claudeMdPath = join(projectConfigDir, getInstructionFileName());
  const phase4Complete = existsSync(frameworkConfigPath) && existsSync(claudeMdPath);

  const shouldValidateWiki = Boolean(state.llm_wiki_path || state.phase4_wiki_generation);
  const llmWikiPath = state.llm_wiki_path || join(state.project_path, 'docs', 'llm-wiki');
  const expectedWikiFiles = getExpectedLlmWikiFiles(
    readStackProfileForWiki(state, frameworkConfigPath),
  );
  const phase4WikiComplete =
    !shouldValidateWiki ||
    expectedWikiFiles.every((fileName) => existsSync(join(llmWikiPath, String(fileName))));

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
  if (!phase4WikiComplete) {
    errors.push('Phase 4 wiki generation files not found');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    phase1Complete,
    phase2Complete,
    phase3Complete,
    phase4Complete,
    phase4WikiComplete,
  };
}

function readStackProfileForWiki(
  state: InitializeProjectState,
  frameworkConfigPath: string,
): unknown {
  if (state.phase4_context?.stack_profile) {
    return state.phase4_context.stack_profile;
  }

  try {
    const config = JSON.parse(readFileSync(frameworkConfigPath, 'utf-8')) as {
      stack_profile?: unknown;
    };
    return config.stack_profile;
  } catch {
    return undefined;
  }
}
