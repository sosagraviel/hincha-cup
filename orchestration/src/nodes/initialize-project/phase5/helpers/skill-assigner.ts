/**
 * Skill Assigner
 *
 * Assign skills to agents based on configuration
 */

import { join } from 'path';
import type { StackProfile } from '../../../../schemas/index.js';
import type { ResolvedSkill, AgentSkillAssignments } from '../types.js';
import { getLanguagesFromStackProfile } from './stack-extractor.js';

/**
 * Assign skills to agents based on configuration
 * Pure configuration-driven logic - NO hardcoded filters
 */
export function assignSkillsToAgents(
  resolvedSkills: ResolvedSkill[],
  stackProfile: StackProfile,
  frameworkPath: string,
): AgentSkillAssignments {
  const assignments: AgentSkillAssignments = {
    planner: [],
    'implementer-generic': [],
  };

  const languages = getLanguagesFromStackProfile(stackProfile);
  for (const lang of languages) {
    assignments[`implementer-${lang}`] = [];
  }

  // Process resolved skills (from resolveSkills - does NOT include "generated" skills)
  for (const skill of resolvedSkills) {
    // "always" skills are copied but NOT linked to any agents
    if (skill.trigger_mode === 'always') {
      continue; // Skill is copied by resolveSkills but not linked to agents
    }

    // Skip non-linkable skills (external resources like Confluence, Notion)
    if (skill.is_linkable_to_agents === false) {
      continue; // Skill is copied but not added to any agent
    }

    // Only process "triggered" skills for linking
    if (skill.trigger_mode === 'triggered') {
      if (skill.compatible_languages && skill.compatible_languages.length > 0) {
        // Language or framework skill
        assignments.planner.push(skill); // Planner gets all language/framework skills

        for (const compatLang of skill.compatible_languages) {
          const agentName = `implementer-${compatLang}`;
          if (assignments[agentName]) {
            assignments[agentName].push(skill);
          }
        }
      } else {
        // Infrastructure skill (docker, aws-cli) with empty compatible_languages
        // At this point, is_linkable_to_agents is NOT false (already filtered above)
        assignments.planner.push(skill);
        assignments['implementer-generic'].push(skill);
      }
    }
  }

  // IMPORTANT: Manually add project-context to planner + all implementers
  // project-context has trigger_mode="generated" so it's NOT in resolvedSkills
  // NOTE: project-context is saved at root of .claude/skills/ (not in 010-foundation/)
  const projectContextSkill: ResolvedSkill = {
    name: 'project-context',
    path: join(frameworkPath, 'skills/010-foundation/project-context'),
    relative_path: 'project-context',
    reason: 'Always included',
    description: 'Project-specific architecture and patterns',
  };

  assignments.planner.push(projectContextSkill);
  assignments['implementer-generic'].push(projectContextSkill);
  for (const lang of languages) {
    assignments[`implementer-${lang}`].push(projectContextSkill);
  }

  return assignments;
}
