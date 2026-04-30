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
import { Provider } from '../../../providers/types.js';
import { rewriteAgentFrontmatter } from './helpers/agent-frontmatter.js';
import {
  inlineSkillBodiesForCodex,
  makeCodexSkillPathResolver,
} from './helpers/codex-skill-inliner.js';
import {
  generatePlannerAgent,
  generateImplementerAgent,
  generateGenericImplementerAgent,
  generateVisualVerifierAgent,
  isLanguageSupported,
} from './helpers/agent-generators.js';

/**
 * Generate all agents for the project.
 *
 * Each generated agent carries its resolved-skill list on the
 * `assignedSkills` field so downstream Codex inlining (in `writeAgents`)
 * can re-resolve which skill bodies to embed without recomputing the
 * skill-assigner output.
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
    planner.assignedSkills = assignments.planner;
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
          implementer.assignedSkills = agentSkills;
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
    genericImplementer.assignedSkills = assignments['implementer-generic'];
    agents.push(genericImplementer);
  }

  const visualVerifier = generateVisualVerifierAgent(templatesPath, stackProfile);
  if (visualVerifier) {
    // visual-verifier is template-only; it doesn't carry the convention
    // skills (it has its own visual-verification responsibilities), so it
    // gets an empty assignedSkills list and the Codex inliner is a no-op.
    visualVerifier.assignedSkills = [];
    agents.push(visualVerifier);
  }

  return agents;
}

/**
 * Write agents to project.
 *
 * Per-provider transforms applied to the rendered template before flushing:
 *
 *   - Frontmatter rewrite (always):
 *     * Claude — pass-through.
 *     * Codex — `model:` remapped to GPT-5; `tools:` line dropped.
 *
 *   - Codex skill-body inlining (Codex only):
 *     Claude Code subagents auto-load every skill listed in the frontmatter
 *     `skills:` line at spawn — full body, not just the name. Codex CLI
 *     does NOT (the framework strips `skills:` at spawn). Without an
 *     intervention, Codex agents would see `skills: [code-conventions, ...]`
 *     as dead text and ship with zero prescriptive context. The inliner
 *     reads each assigned skill body from the target project's `.codex/`
 *     skills tree and embeds it into the agent prompt body, wrapped in
 *     `<skill name="...">` tags. See helpers/codex-skill-inliner.ts.
 *
 *     This is invariant-preserving on the Claude side: Claude passes
 *     through `rewriteAgentFrontmatter` unchanged AND skips the inliner,
 *     so its agents continue to rely on the native skill-preload mechanic.
 */
export function writeAgents(agents: GeneratedAgent[], projectPath: string): void {
  const agentsDir = resolveConfigPath(projectPath, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  const provider = getActiveProvider();
  // Resolve each Codex skill-body path relative to the target project's
  // .codex/skills/ tree. The skills have already been copied there by
  // `copyResolvedSkills` (run in resources.node.ts BEFORE writeAgents).
  // Generated convention skills live alongside framework skills under the
  // same flattened `<provider>/skills/<name>/SKILL.md` shape.
  const codexSkillsRoot = join('.codex', 'skills');
  const resolveCodexSkillPath = makeCodexSkillPathResolver(projectPath, codexSkillsRoot);

  // Single chokepoint for committed .claude/.codex writes — asserts the rendered
  // template body contains no machine-specific absolute paths before flushing.
  const portableWriter = new PortableWriter(new PortablePathResolver(asAbsolutePath(projectPath)));
  for (const agent of agents) {
    const agentPath = join(agentsDir, agent.filename);
    let content = rewriteAgentFrontmatter(agent.content, provider);

    if (provider === Provider.CODEX) {
      content = inlineSkillBodiesForCodex(content, {
        projectPath,
        skills: agent.assignedSkills ?? [],
        resolveSkillPath: resolveCodexSkillPath,
      });
    }

    portableWriter.writeMarkdown(asAbsolutePath(agentPath), content);
    agent.path = agentPath;
  }
}
