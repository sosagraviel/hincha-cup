import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import type { StackProfile } from './config-generator.js';
import type { ResolvedSkill } from './skill-resolver.js';

// Register Handlebars helpers (matching bash implementation)
Handlebars.registerHelper('formatSkills', (skills: string[] | undefined) => {
  if (!skills?.length) return '[]';
  return '\n  - ' + skills.join('\n  - ');
});

Handlebars.registerHelper('skillsDoc', (skills: string[] | undefined) => {
  if (!skills?.length) return 'No skills preloaded.';
  return (
    'The following skills are preloaded and available:\n\n' +
    skills
      .map((s) => `- **${s}**: Provides patterns and conventions for this area`)
      .join('\n') +
    '\n'
  );
});

/**
 * Agent metadata
 */
export interface AgentMetadata {
  name: string;
  filename: string;
  model: 'opus' | 'sonnet' | 'haiku';
  description: string;
}

/**
 * Generated agent result
 */
export interface GeneratedAgent extends AgentMetadata {
  content: string;
  path: string;
}

/**
 * Command defaults for different languages
 */
const COMMAND_DEFAULTS: Record<string, Record<string, string>> = {
  typescript: {
    lint: 'npm run lint',
    format: 'npm run format',
    typecheck: 'npm run typecheck',
    test: 'npm test',
    build: 'npm run build'
  },
  javascript: {
    lint: 'npm run lint',
    format: 'npm run format',
    test: 'npm test',
    build: 'npm run build'
  },
  python: {
    lint: 'ruff check .',
    format: 'black .',
    typecheck: 'mypy .',
    test: 'pytest',
    build: 'python -m build'
  },
  go: {
    lint: 'golangci-lint run',
    format: 'go fmt ./...',
    typecheck: 'go vet ./...',
    test: 'go test ./...',
    build: 'go build ./...'
  }
};

/**
 * Extract package.json commands (for TypeScript/JavaScript projects)
 */
function extractPackageCommands(projectPath: string): Record<string, string> {
  const packageJsonPath = join(projectPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const scripts = packageJson.scripts || {};

    return {
      lint: scripts.lint ? 'npm run lint' : '',
      format: scripts.format ? 'npm run format' : '',
      typecheck: scripts.typecheck || scripts['type-check'] ? `npm run ${scripts.typecheck ? 'typecheck' : 'type-check'}` : '',
      test: scripts.test ? 'npm test' : '',
      build: scripts.build ? 'npm run build' : ''
    };
  } catch {
    return {};
  }
}

/**
 * Get default commands for a language
 */
function getDefaultCommands(language: string): Record<string, string> {
  const langLower = language.toLowerCase();
  return COMMAND_DEFAULTS[langLower] || COMMAND_DEFAULTS.typescript;
}

/**
 * Agent skill assignments interface
 */
interface AgentSkillAssignments {
  planner: ResolvedSkill[];
  [agentName: string]: ResolvedSkill[]; // implementer-typescript, implementer-python, etc.
}

/**
 * Assign skills to agents based on configuration
 * Pure configuration-driven logic - NO hardcoded filters
 */
function assignSkillsToAgents(
  resolvedSkills: ResolvedSkill[],
  stackProfile: StackProfile,
  frameworkPath: string
): AgentSkillAssignments {
  const assignments: AgentSkillAssignments = {
    planner: [],
    'implementer-generic': []
  };

  // Initialize assignments for each detected language
  for (const lang of stackProfile.languages) {
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
      }
      else {
        // Infrastructure skill (docker, aws-cli) with empty compatible_languages
        // At this point, is_linkable_to_agents is NOT false (already filtered above)
        assignments.planner.push(skill);
        assignments['implementer-generic'].push(skill);
      }
    }
  }

  // IMPORTANT: Manually add project-context to planner + all implementers
  // project-context has trigger_mode="generated" so it's NOT in resolvedSkills
  const projectContextSkill: ResolvedSkill = {
    name: 'project-context',
    path: join(frameworkPath, 'skills/010-foundation/project-context'),
    reason: 'Always included',
    description: 'Project-specific architecture and patterns'
  };

  assignments.planner.push(projectContextSkill);
  assignments['implementer-generic'].push(projectContextSkill);
  for (const lang of stackProfile.languages) {
    assignments[`implementer-${lang}`].push(projectContextSkill);
  }

  return assignments;
}

/**
 * Render template with variables using Handlebars (matching bash implementation)
 */
function renderTemplate(template: string, variables: Record<string, any>): string {
  const compiledTemplate = Handlebars.compile(template);
  return compiledTemplate(variables);
}

/**
 * Generate planner agent
 */
function generatePlannerAgent(
  templatesPath: string,
  skills: ResolvedSkill[]
): GeneratedAgent | null {
  const templatePath = join(templatesPath, 'planner.template.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const skillNames = skills.map(s => s.name);

  const content = renderTemplate(template, {
    skills: skillNames
  });

  return {
    name: 'planner',
    filename: 'planner.md',
    model: 'opus',
    description: 'Create detailed implementation plans with full architecture awareness',
    content,
    path: '' // Will be set when writing
  };
}

/**
 * Generate implementer agent for a specific language
 */
function generateImplementerAgent(
  templatesPath: string,
  language: string,
  skills: ResolvedSkill[],
  projectPath: string
): GeneratedAgent | null {
  const templatePath = join(templatesPath, `implementer-${language}.template.md`);
  const genericTemplatePath = join(templatesPath, 'implementer.template.md');

  const actualTemplatePath = existsSync(templatePath) ? templatePath : genericTemplatePath;

  if (!existsSync(actualTemplatePath)) {
    return null;
  }

  const template = readFileSync(actualTemplatePath, 'utf-8');
  const skillNames = skills.map(s => s.name);

  // Get commands
  const packageCommands = extractPackageCommands(projectPath);
  const defaultCommands = getDefaultCommands(language);
  const commands = {
    lint_command: packageCommands.lint || defaultCommands.lint || '',
    format_command: packageCommands.format || defaultCommands.format || '',
    typecheck_command: packageCommands.typecheck || defaultCommands.typecheck || '',
    test_command: packageCommands.test || defaultCommands.test || '',
    build_command: packageCommands.build || defaultCommands.build || ''
  };

  const content = renderTemplate(template, {
    stack: language,
    skills: skillNames,
    ...commands
  });

  return {
    name: `implementer-${language}`,
    filename: `implementer-${language}.md`,
    model: 'sonnet',
    description: `Implement ${language} code following team conventions`,
    content,
    path: '' // Will be set when writing
  };
}

/**
 * Generate generic implementer agent (for non-code files)
 */
function generateGenericImplementerAgent(
  templatesPath: string,
  skills: ResolvedSkill[]
): GeneratedAgent | null {
  const templatePath = join(templatesPath, 'implementer-generic.template.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const skillNames = skills.map(s => s.name);

  const content = renderTemplate(template, {
    skills: skillNames
  });

  return {
    name: 'implementer-generic',
    filename: 'implementer-generic.md',
    model: 'sonnet',
    description: 'Expert full-stack and DevOps specialist implementing any file type following best practices',
    content,
    path: '' // Will be set when writing
  };
}

/**
 * Generate visual verifier agent
 */
function generateVisualVerifierAgent(
  templatesPath: string,
  stackProfile: StackProfile
): GeneratedAgent | null {
  // Only generate if there are frontend frameworks
  const hasFrontend = stackProfile.frameworks?.frontend && stackProfile.frameworks.frontend.length > 0;

  if (!hasFrontend) {
    return null;
  }

  const templatePath = join(templatesPath, 'visual-verifier.template.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const content = renderTemplate(template, {});

  return {
    name: 'visual-verifier',
    filename: 'visual-verifier.md',
    model: 'opus',
    description: 'Visual verification and UI diff analysis',
    content,
    path: '' // Will be set when writing
  };
}

/**
 * Generate all agents for the project
 */
export function generateAgents(
  stackProfile: StackProfile,
  skills: ResolvedSkill[],
  projectPath: string,
  templatesPath: string,
  frameworkPath: string
): GeneratedAgent[] {
  const agents: GeneratedAgent[] = [];

  // Assign skills to agents using configuration-driven logic
  const assignments = assignSkillsToAgents(skills, stackProfile, frameworkPath);

  // Generate planner
  const planner = generatePlannerAgent(templatesPath, assignments.planner);
  if (planner) {
    agents.push(planner);
  }

  // Generate implementer for each language
  if (stackProfile.languages) {
    for (const language of stackProfile.languages) {
      const agentName = `implementer-${language}`;
      const agentSkills = assignments[agentName];

      if (agentSkills) {
        const implementer = generateImplementerAgent(
          templatesPath,
          language,
          agentSkills,
          projectPath
        );
        if (implementer) {
          agents.push(implementer);
        }
      }
    }
  }

  // Generate generic implementer
  const genericImplementer = generateGenericImplementerAgent(
    templatesPath,
    assignments['implementer-generic']
  );
  if (genericImplementer) {
    agents.push(genericImplementer);
  }

  // Generate visual verifier
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
  const agentsDir = join(projectPath, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  for (const agent of agents) {
    const agentPath = join(agentsDir, agent.filename);
    writeFileSync(agentPath, agent.content);
    agent.path = agentPath;
  }
}
