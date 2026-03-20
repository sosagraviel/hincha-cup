import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { generateFrameworkConfig, type StackProfile } from '../../utils/config-generator.js';

/**
 * Phase 4: Context Generation Node
 *
 * This node:
 * - Extracts CLAUDE.md and project-context content from Phase 3 synthesis using regex
 * - Runs stack detection using existing utilities
 * - Generates framework-config.json with all phase outputs
 * - Writes all files to project directory
 *
 * Features:
 * - Fast regex-based extraction (no LLM calls)
 * - Deterministic and reliable
 * - Matches bash flow implementation
 *
 * @param state - Current workflow state
 * @returns Updated state with context generation results
 */
export async function contextGenerationNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  console.log('\n[Phase 4: Context Generation] Starting file extraction...');

  // Verify Phase 3 completed
  if (!state.phase3_synthesis?.synthesis_content) {
    throw new Error('Phase 3 synthesis not found in state');
  }

  try {
    const synthesisContent = state.phase3_synthesis.synthesis_content;

    // Extract CLAUDE.md using regex (matches bash implementation)
    console.log('[Phase 4: Context Generation] Extracting CLAUDE.md...');
    const claudeMatch = synthesisContent.match(/# CLAUDE\.md Content\s*\n+([\s\S]*?)(?=\n+---\s*\n+# project-context)/);
    if (!claudeMatch) {
      throw new Error('Could not find CLAUDE.md Content section in synthesis');
    }
    const claudeMdContent = claudeMatch[1].trim();
    const claudeMdLines = claudeMdContent.split('\n').length;
    console.log(`[Phase 4: Context Generation] ✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);

    // Extract project-context/SKILL.md using regex (matches bash implementation)
    console.log('[Phase 4: Context Generation] Extracting project-context/SKILL.md...');
    const contextMatch = synthesisContent.match(/# project-context\/SKILL\.md Content\s*\n+([\s\S]*$)/);
    if (!contextMatch) {
      throw new Error('Could not find project-context/SKILL.md Content section in synthesis');
    }
    const projectContextContent = contextMatch[1].trim();
    const projectContextLines = projectContextContent.split('\n').length;
    console.log(`[Phase 4: Context Generation] ✓ Extracted project-context/SKILL.md (${projectContextLines} lines)`);

    // Write CLAUDE.md
    const claudeMdPath = join(state.project_path, '.claude', 'CLAUDE.md');
    mkdirSync(join(state.project_path, '.claude'), { recursive: true });
    writeFileSync(claudeMdPath, claudeMdContent);
    console.log(`[Phase 4: Context Generation] ✓ Written: ${claudeMdPath}`);

    // Write project-context/SKILL.md
    const projectContextDir = join(state.project_path, '.claude', 'project-context');
    mkdirSync(projectContextDir, { recursive: true });
    const projectContextPath = join(projectContextDir, 'SKILL.md');
    writeFileSync(projectContextPath, projectContextContent);
    console.log(`[Phase 4: Context Generation] ✓ Written: ${projectContextPath}`);

    // Run stack detection to generate stack profile
    console.log('[Phase 4: Context Generation] Running stack detection...');
    const stackProfileRaw = await runStackDetection(state.project_path, state.framework_path);

    // Validate and parse stack profile
    const stackProfile: StackProfile = {
      languages: Array.isArray(stackProfileRaw.languages) ? stackProfileRaw.languages as string[] : [],
      primary_language: stackProfileRaw.primary_language as string | undefined,
      frameworks: {
        frontend: Array.isArray((stackProfileRaw.frameworks as any)?.frontend)
          ? (stackProfileRaw.frameworks as any).frontend as string[]
          : [],
        backend: Array.isArray((stackProfileRaw.frameworks as any)?.backend)
          ? (stackProfileRaw.frameworks as any).backend as string[]
          : [],
        mobile: Array.isArray((stackProfileRaw.frameworks as any)?.mobile)
          ? (stackProfileRaw.frameworks as any).mobile as string[]
          : []
      },
      testing_frameworks: stackProfileRaw.testing_frameworks as Record<string, string[]> | undefined,
      detected_workspaces: stackProfileRaw.detected_workspaces as any[] | undefined,
      file_counts: stackProfileRaw.file_counts as Record<string, number> | undefined,
      workspaces: stackProfileRaw.workspaces as any[] | undefined,
      package_manager: stackProfileRaw.package_manager as string | undefined,
      workspace_type: stackProfileRaw.workspace_type as string | undefined
    };

    // Save stack profile to temp dir for reference
    const stackProfilePath = join(state.temp_dir!, 'stack-profile.json');
    writeFileSync(stackProfilePath, JSON.stringify(stackProfile, null, 2));

    // Generate framework-config.json using TypeScript utility
    console.log('[Phase 4: Context Generation] Generating framework-config.json...');
    const frameworkConfig = generateFrameworkConfig(state, stackProfile, state.framework_path);

    const configPath = join(state.project_path, '.claude', 'framework-config.json');
    writeFileSync(configPath, JSON.stringify(frameworkConfig, null, 2));
    console.log(`[Phase 4: Context Generation] ✓ Written: ${configPath}`);

    return {
      phase3_synthesis: {
        ...state.phase3_synthesis,
        extracted_files: {
          claude_md: claudeMdContent,
          project_context_md: projectContextContent
        }
      },
      phase4_context: {
        claude_md_written: true,
        project_context_written: true,
        stack_profile: stackProfile,
        framework_config_generated: true,
        timestamp: new Date().toISOString()
      },
      framework_config_path: configPath,
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      current_phase: 'phase4_context'
    };

  } catch (error) {
    const errorMessage = `Context generation failed: ${(error as Error).message}`;
    console.error(`[Phase 4: Context Generation] ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}

/**
 * Run stack detection using existing framework utilities
 */
async function runStackDetection(
  projectPath: string,
  frameworkPath: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const stackCli = join(frameworkPath, 'utils', 'stack', 'cli.js');

    const proc = spawn('node', [stackCli, projectPath], {
      cwd: projectPath,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const profile = JSON.parse(stdout);
          resolve(profile);
        } catch (error) {
          reject(new Error(`Failed to parse stack detection output: ${(error as Error).message}`));
        }
      } else {
        reject(new Error(`Stack detection failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn stack detection CLI: ${error.message}`));
    });
  });
}

