import { readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { LANGUAGE_EXTENSIONS, isToolingConfigFile } from './constants.js';
import { getExcludedDirectories } from '../../../utils/shared/prompt-loader.js';

/**
 * File count information for a specific language
 */
export interface FileCount {
  language: string;
  extensions: string[];
  count: number;
  directories: string[];
}

/**
 * Result of file counting operation
 */
export interface FileCountResult {
  total_files: number;
  by_language: FileCount[];
  scanned_directories: number;
  errors: string[];
  /**
   * Per-language count of tooling-config files we deliberately excluded
   * (e.g. `eslint.config.mjs`, `commitlint.config.js`). Useful for
   * diagnostics — callers can surface this in warnings without letting it
   * influence language detection.
   */
  tooling_config_counts?: Record<string, number>;
}

/**
 * Count files by programming language in a project directory.
 *
 * Exclusions applied (all at any depth):
 *   - `STANDARD_IGNORE_DIRS` (node_modules, dist, build, .git, .venv, etc.)
 *   - Provider-managed dirs (`.claude`, `.codex`, `.claude-temp`, …)
 *   - Directories listed in the project's `.gitignore`
 *   - The framework checkout at `<project>/<frameworkDirName>/`
 *   - Tooling-config filenames (`*.config.{js,mjs,cjs,ts}`, `.*rc.*`)
 *     — these are legitimate JS/TS but don't describe the project's
 *     source language.
 *
 * @param projectPath  Absolute path to the project root
 * @param maxDepth     Maximum directory depth to scan (default: 10)
 * @param frameworkPath Absolute path to the framework directory — its
 *                     basename is added to the excluded dir list
 * @returns File count results by language
 */
export async function countFilesByLanguage(
  projectPath: string,
  maxDepth: number = 10,
  frameworkPath?: string,
): Promise<FileCountResult> {
  const excludedDirSet = new Set(getExcludedDirectories(projectPath, frameworkPath));

  const languageFiles = new Map<string, Set<string>>();
  const toolingConfigCounts = new Map<string, number>();
  const errors: string[] = [];
  let directoriesScanned = 0;

  for (const lang of Object.keys(LANGUAGE_EXTENSIONS)) {
    languageFiles.set(lang, new Set());
  }

  await scanDirectory(projectPath, 0);

  const byLanguage: FileCount[] = [];
  let totalFiles = 0;

  for (const [language, files] of languageFiles.entries()) {
    if (files.size > 0) {
      const extensions = LANGUAGE_EXTENSIONS[language];
      const directories = new Set<string>();

      for (const file of files) {
        const dir = file.substring(projectPath.length + 1, file.lastIndexOf('/'));
        if (dir) directories.add(dir);
      }

      byLanguage.push({
        language,
        extensions,
        count: files.size,
        directories: Array.from(directories).sort(),
      });

      totalFiles += files.size;
    }
  }

  byLanguage.sort((a, b) => b.count - a.count);

  return {
    total_files: totalFiles,
    by_language: byLanguage,
    scanned_directories: directoriesScanned,
    errors,
    tooling_config_counts: Object.fromEntries(toolingConfigCounts),
  };

  /**
   * Recursively scan a directory for source files.
   */
  async function scanDirectory(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    directoriesScanned++;

    let entries: import('fs').Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      errors.push(
        `Error reading directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          if (excludedDirSet.has(entry.name)) continue;
          await scanDirectory(fullPath, currentDepth + 1);
          continue;
        }

        if (!entry.isFile()) continue;

        const ext = extname(entry.name).toLowerCase();
        for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
          if (!extensions.includes(ext)) continue;

          if (isToolingConfigFile(entry.name)) {
            toolingConfigCounts.set(language, (toolingConfigCounts.get(language) ?? 0) + 1);
            break;
          }

          languageFiles.get(language)?.add(fullPath);
          break;
        }
      } catch (error) {
        errors.push(
          `Error accessing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

/**
 * Get supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_EXTENSIONS);
}

/**
 * Get file extensions for a specific language
 */
export function getLanguageExtensions(language: string): string[] | undefined {
  return LANGUAGE_EXTENSIONS[language.toLowerCase()];
}

/**
 * Detect language from file extension
 */
export function detectLanguageFromExtension(filename: string): string | undefined {
  const ext = extname(filename).toLowerCase();
  for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (extensions.includes(ext)) return language;
  }
  return undefined;
}

export { isToolingConfigFile, TOOLING_CONFIG_PATTERNS } from './constants.js';
export { basename };
