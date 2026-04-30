/**
 * Skill Assigner
 *
 * Assign skills to agents based on configuration.
 *
 * Each skill in skills.config.json may declare `agent_roles` as a subset
 * of `["planner", "implementer"]`. When the field is omitted the skill
 * defaults to BOTH roles (backwards compatible). The assigner filters
 * the candidate list per role so the planner does NOT inherit
 * tooling-only skill bodies (test runners, container helpers, cloud
 * CLIs) that bloat its context for zero gain — see plan.md §B.
 */

import { join } from 'path';
import type { StackProfile } from '../../../../schemas/index.js';
import type { AgentRole, ResolvedSkill, AgentSkillAssignments } from '../types.js';
import { getLanguagesFromStackProfile } from './stack-extractor.js';

/**
 * Returns true when the skill's `agent_roles` allows this role. A skill
 * with no `agent_roles` field defaults to BOTH roles.
 */
function attachesToRole(skill: ResolvedSkill, role: AgentRole): boolean {
  if (!skill.agent_roles || skill.agent_roles.length === 0) return true;
  return skill.agent_roles.includes(role);
}

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
      const attachesToPlanner = attachesToRole(skill, 'planner');
      const attachesToImplementer = attachesToRole(skill, 'implementer');

      if (skill.compatible_languages && skill.compatible_languages.length > 0) {
        // Language or framework skill
        if (attachesToPlanner) {
          assignments.planner.push(skill);
        }

        if (attachesToImplementer) {
          for (const compatLang of skill.compatible_languages) {
            const agentName = `implementer-${compatLang}`;
            if (assignments[agentName]) {
              assignments[agentName].push(skill);
            }
          }
        }
      } else {
        // Infrastructure skill (docker, aws-cli) with empty compatible_languages
        // At this point, is_linkable_to_agents is NOT false (already filtered above)
        if (attachesToPlanner) {
          assignments.planner.push(skill);
        }
        if (attachesToImplementer) {
          assignments['implementer-generic'].push(skill);
        }
      }
    }
  }

  // IMPORTANT: Manually attach the three prescriptive convention skills that
  // Phase 3 synthesis emits per project. Each is `trigger_mode="generated"`,
  // so they are written to disk by Phase 4a but NOT loaded by skill-resolver
  // (resolveSkills explicitly skips generated skills). They are stack-agnostic
  // by construction — every project gets all three regardless of language —
  // and replace the old monolithic project-context skill.
  //
  // The bodies live at <project>/.claude/skills/<name>/SKILL.md (or .codex/
  // on Codex). The `path` field below is informational only; the on-disk
  // bodies are read by Claude's subagent skill-preload mechanic via the
  // `skills:` frontmatter line on each generated agent.
  const generatedConventionSkills: ResolvedSkill[] = [
    {
      name: 'code-conventions',
      path: join(frameworkPath, 'skills/010-foundation/code-conventions'),
      relative_path: 'code-conventions',
      reason: 'Generated per project — prescriptive code-style + gotchas',
      description: 'Project-specific coding conventions, gotchas, and WRONG/CORRECT examples',
    },
    {
      name: 'multi-file-workflows',
      path: join(frameworkPath, 'skills/010-foundation/multi-file-workflows'),
      relative_path: 'multi-file-workflows',
      reason: 'Generated per project — prescriptive cross-file checklists',
      description: 'Ordered checklists for cross-cutting changes (add endpoint, add entity, etc.)',
    },
    {
      name: 'testing-conventions',
      path: join(frameworkPath, 'skills/010-foundation/testing-conventions'),
      relative_path: 'testing-conventions',
      reason: 'Generated per project — prescriptive testing rules',
      description: 'Project-specific testing conventions, fixtures, mocking rules, and examples',
    },
  ];

  for (const skill of generatedConventionSkills) {
    assignments.planner.push(skill);
    assignments['implementer-generic'].push(skill);
    for (const lang of languages) {
      assignments[`implementer-${lang}`].push(skill);
    }
  }

  return assignments;
}
