/**
 * Agent Generators
 *
 * Generate different types of agents with their configurations
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { StackProfile } from '../../../../schemas/index.js';
import type { GeneratedAgent, ResolvedSkill } from '../types.js';
import { SUPPORTED_IMPLEMENTER_LANGUAGES } from '../constants.js';
import { extractPackageCommands, getDefaultCommands } from './command-extractor.js';
import { renderTemplate } from './template-renderer.js';
import { hasFrontendService } from './stack-extractor.js';

/**
 * Generate planner agent
 */
export function generatePlannerAgent(
  templatesPath: string,
  skills: ResolvedSkill[],
): GeneratedAgent | null {
  const templatePath = join(templatesPath, 'planner.template.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const skillNames = skills.map((s) => s.name);

  const content = renderTemplate(template, {
    skills: skillNames,
  });

  return {
    name: 'planner',
    filename: 'planner.md',
    model: 'opus',
    description: 'Create detailed implementation plans with full architecture awareness',
    content,
    path: '', // Will be set when writing
  };
}

/**
 * Generate implementer agent for a specific language
 */
export function generateImplementerAgent(
  templatesPath: string,
  language: string,
  skills: ResolvedSkill[],
  projectPath: string,
): GeneratedAgent | null {
  const templatePath = join(templatesPath, `implementer-${language}.template.md`);
  const genericTemplatePath = join(templatesPath, 'implementer.template.md');

  const actualTemplatePath = existsSync(templatePath) ? templatePath : genericTemplatePath;

  if (!existsSync(actualTemplatePath)) {
    return null;
  }

  const template = readFileSync(actualTemplatePath, 'utf-8');
  const skillNames = skills.map((s) => s.name);

  const packageCommands = extractPackageCommands(projectPath);
  const defaultCommands = getDefaultCommands(language);
  const commands = {
    lint_command: packageCommands.lint || defaultCommands.lint || '',
    format_command: packageCommands.format || defaultCommands.format || '',
    typecheck_command: packageCommands.typecheck || defaultCommands.typecheck || '',
    test_command: packageCommands.test || defaultCommands.test || '',
    build_command: packageCommands.build || defaultCommands.build || '',
  };

  const content = renderTemplate(template, {
    stack: language,
    skills: skillNames,
    ...commands,
  });

  return {
    name: `implementer-${language}`,
    filename: `implementer-${language}.md`,
    model: 'sonnet',
    description: `Implement ${language} code following team conventions`,
    content,
    path: '', // Will be set when writing
  };
}

/**
 * Generate generic implementer agent (for non-code files)
 */
export function generateGenericImplementerAgent(
  templatesPath: string,
  skills: ResolvedSkill[],
): GeneratedAgent | null {
  const templatePath = join(templatesPath, 'implementer-generic.template.md');

  if (!existsSync(templatePath)) {
    return null;
  }

  const template = readFileSync(templatePath, 'utf-8');
  const skillNames = skills.map((s) => s.name);

  const content = renderTemplate(template, {
    skills: skillNames,
  });

  return {
    name: 'implementer-generic',
    filename: 'implementer-generic.md',
    model: 'sonnet',
    description:
      'Expert full-stack and DevOps specialist implementing any file type following best practices',
    content,
    path: '', // Will be set when writing
  };
}

/**
 * Generate visual verifier agent
 */
export function generateVisualVerifierAgent(
  templatesPath: string,
  stackProfile: StackProfile,
): GeneratedAgent | null {
  const hasFrontend = hasFrontendService(stackProfile);

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
    path: '', // Will be set when writing
  };
}

/**
 * Check if a language is supported for dedicated implementer agents
 */
export function isLanguageSupported(language: string): boolean {
  return SUPPORTED_IMPLEMENTER_LANGUAGES.includes(language.toLowerCase());
}
