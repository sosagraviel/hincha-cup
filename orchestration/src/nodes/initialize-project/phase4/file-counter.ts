import { readdir, stat } from "fs/promises";
import { join, extname, relative, basename } from "path";
import { logger } from "../../../utils/logger.js";
import { LANGUAGE_EXTENSIONS, IGNORE_DIRS } from "./constants.js";

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
}


/**
 * Count files by programming language in a project directory
 *
 * @param projectPath - Absolute path to the project root
 * @param maxDepth - Maximum directory depth to scan (default: 10)
 * @param frameworkPath - Absolute path to the framework directory
 * @returns File count results by language
 */
export async function countFilesByLanguage(
  projectPath: string,
  maxDepth: number = 10,
  frameworkPath?: string,
): Promise<FileCountResult> {
  // Determine framework directory name to exclude
  // CRITICAL: This must match the logic in prompt-loader.ts and preflight-checks.ts
  // Framework is ALWAYS at project root: <project>/<framework-name>/
  const frameworkDirName = frameworkPath
    ? basename(frameworkPath)
    : "qubika-agentic-framework"; // Fallback if not provided
  // Map: language -> Set of file paths
  const languageFiles = new Map<string, Set<string>>();
  const errors: string[] = [];
  let directoriesScanned = 0;

  // Initialize map for all languages
  for (const lang of Object.keys(LANGUAGE_EXTENSIONS)) {
    languageFiles.set(lang, new Set());
  }

  // Recursive scan
  await scanDirectory(projectPath, 0, maxDepth, languageFiles, errors, frameworkDirName);

  // Convert to result format
  const byLanguage: FileCount[] = [];
  let totalFiles = 0;

  for (const [language, files] of languageFiles.entries()) {
    if (files.size > 0) {
      const extensions = LANGUAGE_EXTENSIONS[language];
      const directories = new Set<string>();

      // Extract unique directories
      for (const file of files) {
        const dir = file.substring(
          projectPath.length + 1,
          file.lastIndexOf("/"),
        );
        if (dir) {
          directories.add(dir);
        }
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

  // Sort by count descending
  byLanguage.sort((a, b) => b.count - a.count);

  return {
    total_files: totalFiles,
    by_language: byLanguage,
    scanned_directories: directoriesScanned,
    errors,
  };

  /**
   * Recursively scan a directory for source files
   */
  async function scanDirectory(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    stats: Map<string, Set<string>>,
    errors: string[],
    frameworkDirName: string,
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    directoriesScanned++;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Skip ignored directories and framework directory
            if (IGNORE_DIRS.has(entry.name) || entry.name === frameworkDirName) {
              continue;
            }

            // Recursively scan subdirectory
            await scanDirectory(
              fullPath,
              currentDepth + 1,
              maxDepth,
              stats,
              errors,
              frameworkDirName,
            );
          } else if (entry.isFile()) {
            // Check file extension against language map
            const ext = extname(entry.name).toLowerCase();

            for (const [language, extensions] of Object.entries(
              LANGUAGE_EXTENSIONS,
            )) {
              if (extensions.includes(ext)) {
                stats.get(language)?.add(fullPath);
                break; // File matched, no need to check other languages
              }
            }
          }
        } catch (error) {
          // Permission denied or other file-level error
          const errorMsg = `Error accessing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          // Continue scanning other files
        }
      }
    } catch (error) {
      // Directory-level error (can't read directory)
      const errorMsg = `Error reading directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
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
export function detectLanguageFromExtension(
  filename: string,
): string | undefined {
  const ext = extname(filename).toLowerCase();

  for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return language;
    }
  }

  return undefined;
}
