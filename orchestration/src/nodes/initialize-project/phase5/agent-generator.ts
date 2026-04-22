import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { StackProfile } from '../../../schemas/index.js';
import type { ResolvedSkill, GeneratedAgent } from './types.js';
import { registerHandlebarsHelpers } from './helpers/handlebars-helpers.js';
import { getLanguagesFromStackProfile } from './helpers/stack-extractor.js';
import { assignSkillsToAgents } from './helpers/skill-assigner.js';
import { resolveConfigPath } from '../../../utils/provider-paths.js';
import {
  generatePlannerAgent,
  generateImplementerAgent,
  generateGenericImplementerAgent,
  generateVisualVerifierAgent,
  isLanguageSupported,
} from './helpers/agent-generators.js';

/**
 * Generate all agents for the project
 */
export function generateAgents(
  stackProfile: StackProfile,
  skills: ResolvedSkill[],
  projectPath: string,
  templatesPath: string,
  frameworkPath: string,
): GeneratedAgent[] {
  // Register Handlebars helpers before generating agents
  registerHandlebarsHelpers();

  const agents: GeneratedAgent[] = [];

  const assignments = assignSkillsToAgents(skills, stackProfile, frameworkPath);

  const planner = generatePlannerAgent(templatesPath, assignments.planner);
  if (planner) {
    agents.push(planner);
  }

  const languages = getLanguagesFromStackProfile(stackProfile);
  if (languages.length > 0) {
    for (const language of languages) {
      const langLower = language.toLowerCase();

      // Only generate dedicated implementer for framework-supported languages
      if (!isLanguageSupported(langLower)) {
        // Unsupported language (e.g., SQL) - will be handled by implementer-generic
        continue;
      }

      const agentName = `implementer-${language}`;
      const agentSkills = assignments[agentName];

      if (agentSkills) {
        const implementer = generateImplementerAgent(
          templatesPath,
          language,
          agentSkills,
          projectPath,
        );
        if (implementer) {
          agents.push(implementer);
        }
      }
    }
  }

  const genericImplementer = generateGenericImplementerAgent(
    templatesPath,
    assignments['implementer-generic'],
  );
  if (genericImplementer) {
    agents.push(genericImplementer);
  }

  const visualVerifier = generateVisualVerifierAgent(templatesPath, stackProfile);
  if (visualVerifier) {
    agents.push(visualVerifier);
  }

  return agents;
}

/**
 * Write agents to project
 */
export function writeAgents(agents: GeneratedAgent[], projectPath: string): void {
  const agentsDir = resolveConfigPath(projectPath, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  for (const agent of agents) {
    const agentPath = join(agentsDir, agent.filename);
    writeFileSync(agentPath, agent.content);
    agent.path = agentPath;
  }
}
