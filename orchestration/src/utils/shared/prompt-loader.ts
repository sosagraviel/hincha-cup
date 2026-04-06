/**
 * Generic utilities for loading and parsing prompt-related files
 * NO workflow-specific logic - pure file operations
 */

import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";

/**
 * Standard directories to ignore during analysis
 */
export const STANDARD_IGNORE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "bower_components",
  "jspm_packages",
  ".gradle",
  ".maven",
  "bin",
  "obj",
  ".claude",
  ".claude-temp",
  ".claude-backups",
];

/**
 * Parse .gitignore and extract directory patterns
 */
export function parseGitignore(projectPath: string): string[] {
  const gitignorePath = join(projectPath, ".gitignore");
  if (!existsSync(gitignorePath)) return [];

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const directories: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      let dirName = trimmed
        .replace(/^\//, "") // Remove leading slash
        .replace(/\/$/, "") // Remove trailing slash
        .replace(/^\*\*\//, ""); // Remove **/ prefix

      // Skip patterns with wildcards or subdirectories
      if (
        dirName.includes("*") ||
        dirName.includes("?") ||
        dirName.includes("/")
      )
        continue;
      // Skip file patterns (contain dots but not starting with dot)
      if (dirName.includes(".") && !dirName.startsWith(".")) continue;

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
export function getExcludedDirectories(
  projectPath: string,
  frameworkPath?: string,
): string[] {
  const frameworkDirName = frameworkPath
    ? basename(frameworkPath)
    : "quibika-agentic-framework";
  const gitignoreDirs = parseGitignore(projectPath);

  return Array.from(
    new Set([frameworkDirName, ...STANDARD_IGNORE_DIRS, ...gitignoreDirs]),
  );
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

  const content = readFileSync(filePath, "utf-8");
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
export function loadExecutionInstructions(
  agentName: string,
  frameworkPath: string,
): string | null {
  // Map agent names to new execution-instructions locations
  const executionInstructionsMap: Record<string, string> = {
    'structure-architecture-analyzer': 'orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/execution-instructions.md',
    'tech-stack-dependencies-analyzer': 'orchestration/src/nodes/initialize-project/phase1/tech-stack-analyzer/prompts/execution-instructions.md',
    'code-patterns-testing-analyzer': 'orchestration/src/nodes/initialize-project/phase1/code-patterns-analyzer/prompts/execution-instructions.md',
    'data-flows-integrations-analyzer': 'orchestration/src/nodes/initialize-project/phase1/data-flows-analyzer/prompts/execution-instructions.md',
  };

  const newPath = executionInstructionsMap[agentName];
  const path = newPath
    ? join(frameworkPath, newPath)
    : join(frameworkPath, "orchestration/agents/execution-instructions", `${agentName}.md`);

  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return null;
  }
}
