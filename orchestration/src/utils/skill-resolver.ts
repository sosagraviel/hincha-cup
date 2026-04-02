import { readFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { StackProfile } from '../schemas/index.js';

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
  relative_path: string; // Relative path from skills directory (e.g., "010-foundation/start-task")
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
 * Detected stack with both normalized and original package names
 */
interface DetectedStack {
  normalized: Set<string>;  // For exact matching: "firebase" -> "firebase"
  original: Set<string>;     // For prefix matching with delimiters: "@google-cloud/firestore"
}

/**
 * Extract detected technologies from stack profile
 * Returns both normalized (for exact matching) and original (for delimiter-based prefix matching)
 */
function extractDetectedStack(stackProfile: StackProfile): DetectedStack {
  const normalized = new Set<string>();
  const original = new Set<string>();

  // Extract from services (new service-centric structure)
  if (stackProfile.services && Array.isArray(stackProfile.services)) {
    stackProfile.services.forEach(service => {
      // Add language
      const lang = service.language.toLowerCase();
      normalized.add(lang);
      original.add(lang);

      // Add frameworks
      if (service.frameworks) {
        if (service.frameworks.main) {
          normalized.add(service.frameworks.main.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.main.toLowerCase());
        }
        if (service.frameworks.ui) {
          normalized.add(service.frameworks.ui.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.ui.toLowerCase());
        }
        if (service.frameworks.orm) {
          normalized.add(service.frameworks.orm.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.orm.toLowerCase());
        }
        if (service.frameworks.testing) {
          normalized.add(service.frameworks.testing.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.frameworks.testing.toLowerCase());
        }
        if (service.frameworks.additional) {
          service.frameworks.additional.forEach(f => {
            normalized.add(f.toLowerCase().replace(/[^a-z0-9]/g, ''));
            original.add(f.toLowerCase());
          });
        }
      }

      // Add testing frameworks
      if (service.testing) {
        if (service.testing.unit?.framework) {
          normalized.add(service.testing.unit.framework.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.testing.unit.framework.toLowerCase());
        }
        if (service.testing.integration?.framework) {
          normalized.add(service.testing.integration.framework.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.testing.integration.framework.toLowerCase());
        }
        if (service.testing.e2e?.framework) {
          normalized.add(service.testing.e2e.framework.toLowerCase().replace(/[^a-z0-9]/g, ''));
          original.add(service.testing.e2e.framework.toLowerCase());
        }
      }
    });
  }

  // Add infrastructure (docker, kubernetes, etc.)
  if (stackProfile.infrastructure) {
    stackProfile.infrastructure.forEach(infra => {
      const lower = infra.toLowerCase();
      normalized.add(lower.replace(/[^a-z0-9]/g, ''));
      original.add(lower);
    });
  }

  // Note: Workspace frameworks are now captured through services array above
  // No need to process detected_workspaces separately

  return { normalized, original };
}

/**
 * Check if skill triggers match detected stack
 * Uses delimiter-based prefix matching to avoid false positives
 */
function matchesTriggers(skill: SkillConfig, detectedStack: DetectedStack): {
  matches: boolean;
  matchedTriggers: string[];
} {
  if (!skill.triggers || skill.triggers.length === 0) {
    return { matches: false, matchedTriggers: [] };
  }

  const matchedTriggers: string[] = [];

  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, '');
    const triggerLower = trigger.toLowerCase();

    // Try exact match first (fast path using normalized strings)
    if (detectedStack.normalized.has(triggerNormalized)) {
      matchedTriggers.push(trigger);
      continue;
    }

    // Fallback to prefix matching with delimiter check (using original strings)
    // This prevents false positives like "go" matching "googleapis" or "java" matching "javascript"
    // while allowing "google-cloud" to match "@google-cloud/firestore"
    for (const original of detectedStack.original) {
      // Handle scoped packages: strip leading @ if present
      const packageName = original.startsWith('@') ? original.slice(1) : original;

      if (packageName.startsWith(triggerLower)) {
        const nextCharIndex = triggerLower.length;
        const nextChar = packageName[nextCharIndex];

        // Match if:
        // 1. Trigger matches entire package name (nextChar is undefined), OR
        // 2. Next character is a delimiter: /, -, _, or @
        if (!nextChar || /[\/\-_@]/.test(nextChar)) {
          matchedTriggers.push(trigger);
          break; // Found a match, move to next trigger
        }
      }
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
