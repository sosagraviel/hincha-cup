import { readFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { StackProfile } from "../../../schemas/index.js";
import { SkillConfigSchema, SkillsConfigFileSchema } from "./types.js";
import type { SkillConfig, ResolvedSkill } from "./types.js";
import { extractDetectedStack } from "./helpers/stack-detector.js";
import { matchesTriggers } from "./helpers/trigger-matcher.js";

/**
 * Load skills configuration
 */
function loadSkillsConfig(frameworkPath: string): SkillConfig[] {
  const configPath = join(frameworkPath, 'skills', 'skills.config.json');

  if (!existsSync(configPath)) {
    throw new Error(`Skills config not found: ${configPath}`);
  }

  const configData = JSON.parse(readFileSync(configPath, 'utf-8'));
  const parsed = SkillsConfigFileSchema.parse(configData);

  return parsed.skills;
}


/**
 * Resolve skills based on stack profile
 */
export function resolveSkills(
  stackProfile: StackProfile,
  frameworkPath: string
): ResolvedSkill[] {
  const skills = loadSkillsConfig(frameworkPath);
  const detectedStack = extractDetectedStack(stackProfile);
  const resolved: ResolvedSkill[] = [];

  for (const skill of skills) {
    // Skip generated skills (like project-context)
    if (skill.trigger_mode === 'generated') {
      continue;
    }

    // Always include "always" skills
    if (skill.trigger_mode === 'always') {
      resolved.push({
        name: skill.name,
        path: join(frameworkPath, 'skills', skill.path),
        relative_path: skill.path,
        reason: 'Always included',
        description: skill.description,
        compatible_languages: skill.compatible_languages,
        trigger_mode: skill.trigger_mode,
        is_linkable_to_agents: skill.is_linkable_to_agents
      });
      continue;
    }

    // Check if triggered skills match
    const { matches, matchedTriggers } = matchesTriggers(skill, detectedStack);
    if (matches) {
      resolved.push({
        name: skill.name,
        path: join(frameworkPath, 'skills', skill.path),
        relative_path: skill.path,
        reason: `Triggered by: ${matchedTriggers.join(', ')}`,
        description: skill.description,
        compatible_languages: skill.compatible_languages,
        trigger_mode: skill.trigger_mode,
        is_linkable_to_agents: skill.is_linkable_to_agents
      });
    }
  }

  // NOTE: project-context is NOT added here because it's marked as "generated"
  // Agents will add it manually after filtering to ensure it's always included
  return resolved;
}

/**
 * Copy skill directory recursively
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
 * Copy resolved skills to project
 * Preserves the directory structure from the source (e.g., 010-foundation/start-task)
 */
export function copyResolvedSkills(
  resolvedSkills: ResolvedSkill[],
  projectPath: string
): number {
  const skillsTargetDir = join(projectPath, '.claude', 'skills');
  mkdirSync(skillsTargetDir, { recursive: true });

  let totalFiles = 0;

  for (const skill of resolvedSkills) {
    // Use relative_path to preserve directory structure
    const targetPath = join(skillsTargetDir, skill.relative_path);
    const copiedFiles = copySkillDirectory(skill.path, targetPath);
    totalFiles += copiedFiles;
  }

  return totalFiles;
}
