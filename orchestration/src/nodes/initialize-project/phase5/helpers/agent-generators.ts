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
import {
  detectBuildTool,
  extractCommandsFromManifest,
  getDefaultCommands,
} from './command-extractor.js';
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

  // Detect the project's build tool / package manager (per-language) and
  // thread it through both the extracted scripts and the language
  // defaults. The 2026-05-04 gira run shipped `npm` commands on a pnpm
  // project because both helpers hardcoded `npm`; the fix generalises
  // to every supported language family (see §C 1.1 of the
  // gira-exhaustive followup plan). detectBuildTool returns
  // 'unknown' for languages outside the supported matrix; in that case
  // both helpers gracefully fall back to the COMMAND_DEFAULTS verbatim.
  const buildTool = detectBuildTool(projectPath, language);
  const packageCommands = extractCommandsFromManifest(projectPath, language, buildTool);
  const defaultCommands = getDefaultCommands(language, projectPath, buildTool);

  // Resolve every command cell with a strict `package.json → language
  // default` fallback chain. The variable names here MUST match the
  // template's Handlebars placeholders (see
  // `agents/templates/implementer.template.md` — `{{lint_command}}`,
  // `{{type_check_command}}`, `{{unit_test_command}}`, `{{build_command}}`,
  // `{{format_command}}`). Mismatched names render as empty cells; the
  // 2026-05-04 gira run lost typecheck + test + build because of one
  // such mismatch (plan §E.3). The validation guard in writeAgents
  // catches any future drift.
  const lintCommand = packageCommands.lint || defaultCommands.lint || '';
  const formatCommand = packageCommands.format || defaultCommands.format || '';
  const typecheckCommand = packageCommands.typecheck || defaultCommands.typecheck || '';
  const testCommand = packageCommands.test || defaultCommands.test || '';
  const buildCommand = packageCommands.build || defaultCommands.build || '';

  const commands = {
    // Names must match the Handlebars placeholders in the template.
    lint_command: lintCommand,
    format_command: formatCommand,
    type_check_command: typecheckCommand,
    unit_test_command: testCommand,
    build_command: buildCommand,
    // Legacy aliases — keep the old names available so any consumer
    // still using them (e.g. an out-of-tree fork of the template) still
    // renders. Same value, two keys.
    typecheck_command: typecheckCommand,
    test_command: testCommand,
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
