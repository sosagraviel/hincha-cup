import { readFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { StackProfile } from '../../../schemas/index.js';
import { SkillsConfigFileSchema } from './types.js';
import type { SkillConfig, ResolvedSkill } from './types.js';
import { extractDetectedStack } from './helpers/stack-detector.js';
import { matchesTriggers } from './helpers/trigger-matcher.js';
import { resolveConfigPath, getActiveProvider } from '../../../utils/provider-paths.js';
import { copySkillForProvider } from './helpers/skill-copier.js';

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
export function resolveSkills(stackProfile: StackProfile, frameworkPath: string): ResolvedSkill[] {
  const skills = loadSkillsConfig(frameworkPath);
  const detectedStack = extractDetectedStack(stackProfile);
  const resolved: ResolvedSkill[] = [];

  for (const skill of skills) {
    // Skip generated skills — those are emitted per-project by Phase 3
    // synthesis (currently: code-conventions, multi-file-workflows,
    // testing-conventions). Their bodies live at
    // <project>/.claude/skills/<name>/SKILL.md and are attached to agents
    // by the skill-assigner, not by resolveSkills.
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
        is_linkable_to_agents: skill.is_linkable_to_agents,
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
        is_linkable_to_agents: skill.is_linkable_to_agents,
      });
    }
  }

  // NOTE: the three generated convention skills (code-conventions,
  // multi-file-workflows, testing-conventions) are NOT added here —
  // skill-assigner injects them onto every agent's allowlist after
  // resolveSkills returns.
  return resolved;
}

/**
 * Copy resolved skills to project.
 * Flattens the directory structure — all skills are copied directly to the
 * provider-specific skills/ dir (e.g., `.claude/skills/` or `.codex/skills/`).
 *
 * Provider-aware: selects SKILL.<provider>.md over SKILL.md when present,
 * applies placeholder substitution to `.md` files. See helpers/skill-copier.ts.
 */
export function copyResolvedSkills(resolvedSkills: ResolvedSkill[], projectPath: string): number {
  const skillsTargetDir = resolveConfigPath(projectPath, 'skills');
  mkdirSync(skillsTargetDir, { recursive: true });

  const provider = getActiveProvider();
  let totalFiles = 0;

  for (const skill of resolvedSkills) {
    // Flatten the structure - use skill name only (last directory in path)
    const targetPath = join(skillsTargetDir, skill.name);
    const copiedFiles = copySkillForProvider(skill.path, targetPath, provider);
    totalFiles += copiedFiles;
  }

  return totalFiles;
}
