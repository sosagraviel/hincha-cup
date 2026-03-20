import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { mkdirSync, copyFileSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { resolveSkills, copyResolvedSkills } from '../../utils/skill-resolver.js';
import { generateAgents, writeAgents } from '../../utils/agent-generator.js';
import type { StackProfile } from '../../utils/config-generator.js';

/**
 * Phase 5: Resources Node
 *
 * This node:
 * - Resolves and copies filtered skills based on detected stack
 * - Generates agents (planner, implementers, visual-verifier)
 * - Copies commands from framework
 * - Sets up project directory structure
 *
 * @param state - Current workflow state
 * @returns Updated state with resources copied
 */
export async function resourcesNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  console.log('\n[Phase 5: Resources] Copying resources...');

  // Verify Phase 4 completed
  if (!state.phase4_context?.framework_config_generated) {
    throw new Error('Phase 4 context generation not completed');
  }

  try {
    const projectClaudeDir = join(state.project_path, '.claude');

    // Read framework-config.json to get stack profile
    const frameworkConfigPath = join(projectClaudeDir, 'framework-config.json');
    const frameworkConfig = JSON.parse(readFileSync(frameworkConfigPath, 'utf-8'));
    const stackProfile: StackProfile = frameworkConfig.stack_profile;

    console.log(`[Phase 5: Resources] Stack profile loaded`);
    console.log(`[Phase 5: Resources] Languages: ${stackProfile.languages?.join(', ') || 'none'}`);

    // Step 1: Resolve and copy filtered skills
    console.log('[Phase 5: Resources] Resolving skills...');
    const resolvedSkills = resolveSkills(stackProfile, state.framework_path);

    console.log(`[Phase 5: Resources] Resolved ${resolvedSkills.length} skills`);

    // Copy resolved skills
    const copiedSkillsCount = copyResolvedSkills(resolvedSkills, state.project_path);

    console.log(`[Phase 5: Resources] ✓ Copied ${resolvedSkills.length} skills (${copiedSkillsCount} files)`);

    // Step 2: Generate agents
    console.log('[Phase 5: Resources] Generating agents...');
    const templatesPath = join(state.framework_path, 'agents', 'templates');
    const agents = generateAgents(
      stackProfile,
      resolvedSkills,
      state.project_path,
      templatesPath,
      state.framework_path
    );

    // Write agents to disk
    writeAgents(agents, state.project_path);

    console.log(`[Phase 5: Resources] ✓ Generated ${agents.length} agents`);

    // Step 3: Copy commands
    console.log('[Phase 5: Resources] Copying commands...');
    const commandsTargetDir = join(projectClaudeDir, 'commands');
    const frameworkCommandsDir = join(state.framework_path, 'commands');

    mkdirSync(commandsTargetDir, { recursive: true });

    const commandFiles = readdirSync(frameworkCommandsDir)
      .filter(file => file.endsWith('.md') && file !== 'initialize-project.md');

    for (const cmdFile of commandFiles) {
      copyFileSync(
        join(frameworkCommandsDir, cmdFile),
        join(commandsTargetDir, cmdFile)
      );
    }

    console.log(`[Phase 5: Resources] ✓ Copied ${commandFiles.length} commands`);

    // Copy Claude Code hooks from framework
    const frameworkHooksDir = join(state.framework_path, 'orchestration', 'resources', 'claude-hooks');
    const hooksTargetDir = join(projectClaudeDir, 'hooks');

    console.log(`[Phase 5: Resources] Copying Claude Code hooks...`);
    const hooksCopied = copyDirectoryRecursive(frameworkHooksDir, hooksTargetDir);
    console.log(`[Phase 5: Resources] ✓ Copied ${hooksCopied} hook files`);

    console.log('[Phase 5: Resources] ✓ Resource copying complete');

    return {
      current_phase: 'phase5_resources'
    };

  } catch (error) {
    const errorMessage = `Resources copying failed: ${(error as Error).message}`;
    console.error(`[Phase 5: Resources] ✗ ${errorMessage}`);
    console.error((error as Error).stack);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}

/**
 * Recursively copy directory
 */
function copyDirectoryRecursive(src: string, dest: string): number {
  let fileCount = 0;

  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      fileCount += copyDirectoryRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      fileCount++;
    }
  }

  return fileCount;
}
