/**
 * Framework Sync Helpers
 *
 * Thin wrappers around existing utilities for syncing individual skills/agents.
 * Uses the core logic from skill-resolver.ts and agent-generator.ts.
 */

import { resolveSkills } from '../../nodes/initialize-project/phase5/skill-resolver.js';
import {
  generateAgents,
  writeAgents,
} from '../../nodes/initialize-project/phase5/agent-generator.js';
import { copySkillForProvider } from '../../nodes/initialize-project/phase5/helpers/skill-copier.js';
import type { StackProfile } from '../../schemas/index.js';
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveConfigPath,
  resolveFrameworkConfigPath,
  getActiveProvider,
} from '../../utils/provider-paths.js';

/**
 * Update a single skill from framework to project
 * Uses existing skill-resolver logic but for one skill
 */
export async function updateSingleSkill(
  skillName: string,
  projectPath: string,
  frameworkPath: string,
): Promise<{ updated: boolean; filesChanged: number }> {
  const skillsDir = join(frameworkPath, 'skills');

  // Find the skill in framework
  const skillPath = findSkillPath(skillsDir, skillName);

  if (!skillPath) {
    throw new Error(`Skill ${skillName} not found in framework`);
  }

  // Use flat structure (skill name only, not nested path)
  const targetPath = resolveConfigPath(projectPath, 'skills', skillName);

  // Copy the skill (provider-aware: selects matching SKILL.<provider>.md and applies placeholder substitution)
  const filesChanged = copySkillForProvider(skillPath, targetPath, getActiveProvider());

  return {
    updated: filesChanged > 0,
    filesChanged,
  };
}

/**
 * Add a single new skill to project
 * Same as updateSingleSkill but explicitly for new skills
 */
export async function addSingleSkill(
  skillName: string,
  projectPath: string,
  frameworkPath: string,
): Promise<{ added: boolean; filesAdded: number }> {
  const result = await updateSingleSkill(skillName, projectPath, frameworkPath);

  return {
    added: result.updated,
    filesAdded: result.filesChanged,
  };
}

/**
 * Regenerate a single agent from template
 * Uses existing agent-generator logic but for one agent
 */
export async function regenerateSingleAgent(
  agentName: string,
  projectPath: string,
  frameworkPath: string,
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    // Read framework-config.json to get stack profile
    const configPath = resolveFrameworkConfigPath(projectPath);
    if (!existsSync(configPath)) {
      return {
        success: false,
        error: 'Framework config not found',
      };
    }

    const frameworkConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    const stackProfile: StackProfile = frameworkConfig.stack_profile;

    // Resolve skills to get current skill list
    const resolvedSkills = resolveSkills(stackProfile, frameworkPath);

    // Generate ALL agents (using existing logic)
    const templatesPath = join(frameworkPath, 'agents', 'templates');
    const allAgents = generateAgents(
      stackProfile,
      resolvedSkills,
      projectPath,
      templatesPath,
      frameworkPath,
    );

    // Find the specific agent to regenerate
    const agentToWrite = allAgents.find((a) => a.name === agentName);

    if (!agentToWrite) {
      return {
        success: false,
        error: `Agent ${agentName} not found in generated agents`,
      };
    }

    // Write only this agent
    writeAgents([agentToWrite], projectPath);

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Helper: Find skill path by name in skills directory
 */
function findSkillPath(skillsDir: string, skillName: string): string | null {
  // Skills are organized in subdirectories like "010-foundation/start-task"
  // We need to search recursively for the skill

  const searchDir = (dir: string): string | null => {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Check if this directory name matches the skill name
        if (entry === skillName) {
          return fullPath;
        }

        // Recursively search subdirectories
        const found = searchDir(fullPath);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  return searchDir(skillsDir);
}
