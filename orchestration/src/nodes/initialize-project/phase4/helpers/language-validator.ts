/**
 * Phase 4: Language Validator Helper
 *
 * Cross-validates detected languages with file counts and workspace detection.
 * Ensures comprehensive language detection by merging multiple data sources.
 */

import type { FileCountResult } from '../types.js';
import type { WorkspaceDetectionResult } from '../types.js';

/**
 * Cross-validate agent-detected languages with file count results
 *
 * If file counter found significant files (>= 5) for a language that the agent missed,
 * add it to the detected languages set.
 *
 * @param detectedLanguages - Set of languages detected by Phase 1 agents
 * @param fileCountResult - File count results (optional)
 * @param logger - Logger instance for warnings
 * @returns Updated set of detected languages
 */
export function crossValidateWithFileCount(
  detectedLanguages: Set<string>,
  fileCountResult: FileCountResult | undefined,
  logger: any,
): Set<string> {
  if (!fileCountResult) {
    return detectedLanguages;
  }

  for (const langCount of fileCountResult.by_language) {
    const lang = langCount.language.toLowerCase();

    // If file counter found significant files but agent missed it
    if (langCount.count >= 5 && !detectedLanguages.has(lang)) {
      logger.warn(` Agent missed ${lang} (${langCount.count} files) - adding to stack profile`);
      detectedLanguages.add(lang);
    }
  }

  return detectedLanguages;
}

/**
 * Merge workspace detection results with agent-detected languages
 *
 * For monorepo projects, extract unique languages from workspaces and merge
 * with detected languages set.
 *
 * @param detectedLanguages - Set of languages detected so far
 * @param workspaceResult - Workspace detection results (optional)
 * @param logger - Logger instance for info messages
 * @returns Updated set of detected languages
 */
export function mergeWorkspaceLanguages(
  detectedLanguages: Set<string>,
  workspaceResult: WorkspaceDetectionResult | undefined,
  logger: any,
): Set<string> {
  if (!workspaceResult || !workspaceResult.is_monorepo) {
    return detectedLanguages;
  }

  // Extract unique languages from workspaces
  const workspaceLanguages = new Set(
    workspaceResult.workspaces.map((ws) => ws.language.toLowerCase()),
  );

  // Merge with detected languages
  for (const lang of Array.from(workspaceLanguages)) {
    if (!detectedLanguages.has(lang)) {
      logger.info(` Added ${lang} from workspace detection`);
      detectedLanguages.add(lang);
    }
  }

  return detectedLanguages;
}
