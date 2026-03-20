import { readFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { StackProfile } from './config-generator.js';

/**
 * Skill Config Schema
 */
const SkillConfigSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  triggers: z.array(z.string()).optional(),
  trigger_mode: z.enum(['always', 'triggered', 'generated']).default('triggered'),
  compatible_languages: z.array(z.string()).optional(),
  is_linkable_to_agents: z.boolean().optional()
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

const SkillsConfigFileSchema = z.object({
  skills: z.array(SkillConfigSchema)
});

/**
 * Resolved skill with reason
 */
export interface ResolvedSkill {
  name: string;
  path: string;
  reason: string;
  description: string;
  compatible_languages?: string[];
  trigger_mode?: 'always' | 'triggered' | 'generated';
  is_linkable_to_agents?: boolean;
}

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
 * Extract detected technologies from stack profile
 */
function extractDetectedStack(stackProfile: StackProfile): Set<string> {
  const detected = new Set<string>();

  // Add languages
  if (stackProfile.languages) {
    stackProfile.languages.forEach(lang => detected.add(lang.toLowerCase()));
  }

  // Add frameworks
  if (stackProfile.frameworks) {
    if (stackProfile.frameworks.frontend) {
      stackProfile.frameworks.frontend.forEach(f => detected.add(f.toLowerCase().replace(/[^a-z0-9]/g, '')));
    }
    if (stackProfile.frameworks.backend) {
      stackProfile.frameworks.backend.forEach(f => detected.add(f.toLowerCase().replace(/[^a-z0-9]/g, '')));
    }
    if (stackProfile.frameworks.mobile) {
      stackProfile.frameworks.mobile.forEach(f => detected.add(f.toLowerCase().replace(/[^a-z0-9]/g, '')));
    }
  }

  // Add testing frameworks
  if (stackProfile.testing_frameworks) {
    Object.values(stackProfile.testing_frameworks).forEach((tests: unknown) => {
      if (Array.isArray(tests)) {
        tests.forEach((t: string) => detected.add(t.toLowerCase().replace(/[^a-z0-9]/g, '')));
      }
    });
  }

  return detected;
}

/**
 * Check if skill triggers match detected stack
 */
function matchesTriggers(skill: SkillConfig, detectedStack: Set<string>): {
  matches: boolean;
  matchedTriggers: string[];
} {
  if (!skill.triggers || skill.triggers.length === 0) {
    return { matches: false, matchedTriggers: [] };
  }

  const matchedTriggers: string[] = [];

  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (detectedStack.has(triggerNormalized)) {
      matchedTriggers.push(trigger);
    }
  }

  return {
    matches: matchedTriggers.length > 0,
    matchedTriggers
  };
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
 */
export function copyResolvedSkills(
  resolvedSkills: ResolvedSkill[],
  projectPath: string
): number {
  const skillsTargetDir = join(projectPath, '.claude', 'skills');
  mkdirSync(skillsTargetDir, { recursive: true });

  let totalFiles = 0;

  for (const skill of resolvedSkills) {
    const targetPath = join(skillsTargetDir, skill.name);
    const copiedFiles = copySkillDirectory(skill.path, targetPath);
    totalFiles += copiedFiles;
  }

  return totalFiles;
}
