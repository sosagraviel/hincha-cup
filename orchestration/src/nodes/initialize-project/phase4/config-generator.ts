import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import {
  FrameworkConfigSchema,
  type FrameworkConfig,
  type StackProfile,
} from '../../../schemas/index.js';
import type { Phase1AnalysisData } from './types.js';

/**
 * Generate project hash for tracking changes
 */
function generateProjectHash(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Generate framework configuration from disk files and stack profile
 * This function is idempotent - it reads from disk files, not state
 */
export function generateFrameworkConfig(
  // _projectPath: kept for API stability; was used to populate the now-removed
  // project_metadata.project_path field (verified zero readers).
  _projectPath: string,
  tempDir: string,
  phase1Data: Phase1AnalysisData,
  phase3SynthesisContent: string,
  stackProfile: StackProfile,
  frameworkPath: string,
): FrameworkConfig {
  const packageJsonPath = join(frameworkPath, 'package.json');
  let frameworkVersion = '2.0.0';
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    frameworkVersion = packageJson.version || '2.0.0';
  }

  // Service-centric stack profile (pass through directly)
  const stackProfileData: any = {
    // CORE: Services array (source of truth)
    services: stackProfile.services,

    // METADATA
    is_monorepo: stackProfile.is_monorepo,
    workspace_tool: stackProfile.workspace_tool,
    package_manager: stackProfile.package_manager,
    infrastructure: stackProfile.infrastructure,
    file_counts: stackProfile.file_counts,
  };

  const config: FrameworkConfig = {
    version: frameworkVersion,
    schema_version: '1.0.0',
    framework_version: frameworkVersion,
    project_metadata: {
      // The legacy `project_path` field carried an absolute path to the first
      // developer's worktree, breaking portability. It has zero readers across
      // the codebase (verified by full-codebase grep) and has been removed —
      // the file's own location is the project anchor.
      last_analysis: new Date().toISOString(),
      initialization_hash: generateProjectHash(),
    },
    stack_profile: stackProfileData,
    resource_state: {
      skills: {},
      agents: {},
      last_sync: new Date().toISOString(),
    },
  };

  FrameworkConfigSchema.parse(config);

  return config;
}
