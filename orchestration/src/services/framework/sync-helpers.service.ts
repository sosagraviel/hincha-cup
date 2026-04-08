/**
 * Framework Sync Helpers
 *
 * Thin wrappers around existing utilities for syncing individual skills/agents.
 * Uses the core logic from skill-resolver.ts and agent-generator.ts.
 */

import { resolveSkills, type ResolvedSkill } from '../../utils/skill-resolver.js';
import { generateAgents, writeAgents, type GeneratedAgent } from '../../utils/agent-generator.js';
import type { StackProfile } from '../../schemas/index.js';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Copy a skill directory recursively (extracted from skill-resolver.ts internal function)
 */
function copySkillDirectory(srcPath: string, destPath: string): number {
  let fileCount = 0;

  if (!existsSync(srcPath)) {
    return 0;
  }

  mkdirSync(destPath, { recursive: true });

  const entries = readdirSync(srcPath);

  for (const entry of entries) {
    const srcEntryPath = join(srcPath, entry);
    const destEntryPath = join(destPath, entry);

    const stat = statSync(srcEntryPath);

    if (stat.isDirectory()) {
      fileCount += copySkillDirectory(srcEntryPath, destEntryPath);
    } else {
      copyFileSync(srcEntryPath, destEntryPath);
      fileCount++;
    }
  }

  return fileCount;
}

/**
 * Update a single skill from framework to project
 * Uses existing skill-resolver logic but for one skill
 */
export async function updateSingleSkill(
  skillName: string,
  projectPath: string,
  frameworkPath: string
): Promise<{ updated: boolean; filesChanged: number }> {
  const skillsDir = join(frameworkPath, 'skills');

  // Find the skill in framework
  const skillPath = findSkillPath(skillsDir, skillName);

  if (!skillPath) {
    throw new Error(`Skill ${skillName} not found in framework`);
  }

  // Get relative path for preserving directory structure
  const relativePath = skillPath.replace(skillsDir + '/', '');
  const targetPath = join(projectPath, '.claude', 'skills', relativePath);

  // Copy the skill
  const filesChanged = copySkillDirectory(skillPath, targetPath);

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
  frameworkPath: string
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
  frameworkPath: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    // Read framework-config.json to get stack profile
    const configPath = join(projectPath, '.claude', 'framework-config.json');
    if (!existsSync(configPath)) {
      return {
        success: false,
        error: 'Framework config not found',
      };
    }

    const frameworkConfig = JSON.parse(
      readFileSync(configPath, 'utf-8')
    );
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
      frameworkPath
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
