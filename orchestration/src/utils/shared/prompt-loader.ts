/**
 * Generic utilities for loading and parsing prompt-related files
 * NO workflow-specific logic - pure file operations
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import matter from 'gray-matter';
import { getAllProviderManagedDirs } from '../provider-paths.js';

/**
 * Non-provider-specific directories ignored during analysis — build artifacts,
 * dependencies, and tool caches. Provider-managed dirs (.claude*, .codex*) are
 * appended from provider-paths so the list stays in sync with the registry.
 */
const NON_PROVIDER_IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'vendor',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'bower_components',
  'jspm_packages',
  '.gradle',
  '.maven',
  'bin',
  'obj',
  '.terraform',
  'site-packages',
  'pkg',
];

/**
 * Standard directories to ignore during analysis.
 * Composed from static build-artifact list + provider-managed dirs registry.
 */
export const STANDARD_IGNORE_DIRS = [...NON_PROVIDER_IGNORE_DIRS, ...getAllProviderManagedDirs()];

/**
 * Parse .gitignore and extract directory patterns
 */
export function parseGitignore(projectPath: string): string[] {
  const gitignorePath = join(projectPath, '.gitignore');
  if (!existsSync(gitignorePath)) return [];

  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const directories: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const dirName = trimmed
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .replace(/^\*\*\//, '');

      if (dirName.includes('*') || dirName.includes('?') || dirName.includes('/')) continue;
      if (dirName.includes('.') && !dirName.startsWith('.')) continue;

      if (dirName) directories.push(dirName);
    }

    return directories;
  } catch (error) {
    return [];
  }
}

/**
 * Get all directories to exclude from analysis
 */
export function getExcludedDirectories(projectPath: string, frameworkPath?: string): string[] {
  const frameworkDirName = frameworkPath ? basename(frameworkPath) : 'qubika-agentic-framework';

  const gitignoreDirs = parseGitignore(projectPath);
  const projectInsideFramework = frameworkPath ? isPathInside(projectPath, frameworkPath) : false;

  const segments = projectInsideFramework
    ? [...STANDARD_IGNORE_DIRS, ...gitignoreDirs]
    : [frameworkDirName, ...STANDARD_IGNORE_DIRS, ...gitignoreDirs];

  return Array.from(new Set(segments));
}

/**
 * Returns true when `inner` is strictly inside `outer` (either equal or a
 * subdirectory). Both paths are resolved before comparison so symlinks /
 * trailing slashes don't trip the check.
 */
function isPathInside(inner: string, outer: string): boolean {
  const innerResolved = resolve(inner);
  const outerResolved = resolve(outer);
  if (innerResolved === outerResolved) return true;
  return innerResolved.startsWith(outerResolved + '/');
}

/**
 * Load and parse a markdown file with frontmatter
 */
export function loadMarkdownFile(filePath: string): {
  frontmatter: Record<string, any>;
  body: string;
} {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const parsed = matter(content);

  return {
    frontmatter: parsed.data,
    body: parsed.content.trim(),
  };
}

/**
 * Load execution instructions for an agent if they exist
 * Maps agent names to new phase-specific locations
 */
export function loadExecutionInstructions(agentName: string, frameworkPath: string): string | null {
  const executionInstructionsMap: Record<string, string> = {
    'structure-architecture-analyzer':
      'orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/execution-instructions.md',
    'tech-stack-dependencies-analyzer':
      'orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/prompts/execution-instructions.md',
    'code-patterns-testing-analyzer':
      'orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/prompts/execution-instructions.md',
    'data-flows-integrations-analyzer':
      'orchestration/src/nodes/initialize-project/phase1/data-flows-analyzer/prompts/execution-instructions.md',
  };

  const newPath = executionInstructionsMap[agentName];
  if (!newPath) {
    return null;
  }

  const path = join(frameworkPath, newPath);

  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    return null;
  }
}
