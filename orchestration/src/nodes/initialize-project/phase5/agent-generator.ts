import { mkdirSync } from 'fs';
import {
  PortablePathResolver,
  PortableWriter,
  asAbsolutePath,
} from '../../../services/framework/portable-paths/index.js';
import { join } from 'path';
import type { StackProfile } from '../../../schemas/index.js';
import type { ResolvedSkill, GeneratedAgent } from './types.js';
import { registerHandlebarsHelpers } from './helpers/handlebars-helpers.js';
import { getLanguagesFromStackProfile } from './helpers/stack-extractor.js';
import { assignSkillsToAgents } from './helpers/skill-assigner.js';
import { resolveConfigPath, getActiveProvider } from '../../../utils/provider-paths.js';
import { rewriteAgentFrontmatter } from './helpers/agent-frontmatter.js';
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
 * Write agents to project.
 *
 * Rewrites the frontmatter per provider before writing — Claude passes
 * through unchanged; Codex gets `model:` remapped to GPT-5 and `tools:` removed.
 */
export function writeAgents(agents: GeneratedAgent[], projectPath: string): void {
  const agentsDir = resolveConfigPath(projectPath, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  const provider = getActiveProvider();
  // Single chokepoint for committed .claude/.codex writes — asserts the rendered
  // template body contains no machine-specific absolute paths before flushing.
  const portableWriter = new PortableWriter(new PortablePathResolver(asAbsolutePath(projectPath)));
  for (const agent of agents) {
    const agentPath = join(agentsDir, agent.filename);
    const content = rewriteAgentFrontmatter(agent.content, provider);
    portableWriter.writeMarkdown(asAbsolutePath(agentPath), content);
    agent.path = agentPath;
  }
}
