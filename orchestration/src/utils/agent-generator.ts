import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { StackProfile } from './config-generator.js';
import type { ResolvedSkill } from './skill-resolver.js';

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
 * Filter skills for planner (all language and framework skills)
 */
function filterSkillsForPlanner(skills: ResolvedSkill[], stackProfile: StackProfile): string[] {
  const allLanguages = stackProfile.languages.map(l => l.toLowerCase());

  return skills
    .filter(s => {
      // Check if this is a language skill
      const isLanguageSkill = allLanguages.some(lang =>
        s.reason?.toLowerCase().includes(lang)
      );

      // Check if this is a framework skill
      const isFrameworkSkill = s.reason?.toLowerCase().includes('triggered by:') && !isLanguageSkill;

      return isLanguageSkill || isFrameworkSkill;
    })
    .map(s => s.name);
}

/**
 * Filter skills for implementer (only relevant language and framework skills)
 */
function filterSkillsForImplementer(
  skills: ResolvedSkill[],
  language: string,
  stackProfile: StackProfile
): string[] {
  const langLower = language.toLowerCase();
  const allLanguages = stackProfile.languages.map(l => l.toLowerCase());

  return skills
    .filter(s => {
      // Check if this skill is triggered by a programming language
      const isLanguageSkill = allLanguages.some(lang =>
        s.reason?.toLowerCase().includes(lang)
      );

      if (isLanguageSkill) {
        // Only keep if it matches THIS implementer's language
        return s.reason?.toLowerCase().includes(langLower);
      }

      // Check if this is a framework skill
      const isFrameworkSkill = s.reason?.toLowerCase().includes('triggered by:') && !isLanguageSkill;

      if (isFrameworkSkill) {
        // Use compatible_languages to determine if this framework works with this language
        if (s.compatible_languages && s.compatible_languages.length > 0) {
          return s.compatible_languages.some(compatLang =>
            compatLang.toLowerCase() === langLower
          );
        }
        // If no compatible_languages defined, include it
        return true;
      }

      // Filter out "always" skills
      return false;
    })
    .map(s => s.name);
}

/**
 * Render template with variables
 */
function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    const replacement = Array.isArray(value) ? value.join(', ') : String(value);
    rendered = rendered.replaceAll(placeholder, replacement);
  }

  return rendered;
}

/**
 * Generate planner agent
 */
function generatePlannerAgent(
  templatesPath: string,
  skills: ResolvedSkill[],
  stackProfile: StackProfile
): GeneratedAgent | null {
  const templatePath = join(templatesPath, 'planner.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const filteredSkills = filterSkillsForPlanner(skills, stackProfile);

  const content = renderTemplate(template, {
    skills: filteredSkills
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
  stackProfile: StackProfile,
  projectPath: string
): GeneratedAgent | null {
  const templatePath = join(templatesPath, `implementer-${language}.md`);
  const genericTemplatePath = join(templatesPath, 'implementer.md');

  const actualTemplatePath = existsSync(templatePath) ? templatePath : genericTemplatePath;

  if (!existsSync(actualTemplatePath)) {
    return null;
  }

  const template = readFileSync(actualTemplatePath, 'utf-8');
  const filteredSkills = filterSkillsForImplementer(skills, language, stackProfile);

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
    skills: filteredSkills,
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

  const templatePath = join(templatesPath, 'visual-verifier.md');

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
  templatesPath: string
): GeneratedAgent[] {
  const agents: GeneratedAgent[] = [];

  // Generate planner
  const planner = generatePlannerAgent(templatesPath, skills, stackProfile);
  if (planner) {
    agents.push(planner);
  }

  // Generate implementer for each language
  if (stackProfile.languages) {
    for (const language of stackProfile.languages) {
      const implementer = generateImplementerAgent(
        templatesPath,
        language,
        skills,
        stackProfile,
        projectPath
      );
      if (implementer) {
        agents.push(implementer);
      }
    }
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
