/**
 * Phase 4: Language Validator Helper
 *
 * Cross-validates detected languages with file counts and workspace detection.
 * Every language token flows through `normalizeLanguage` so dialect tokens
 * (`tsx`, `jsx`, `bash`, `kt`, etc.) collapse to canonical keys before deduping.
 */

import { normalizeLanguage } from '../../../../schemas/language-normalization.js';
import type { FileCountResult, WorkspaceDetectionResult } from '../types.js';
import { UTILITY_LANGUAGES } from '../constants.js';

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
  logger: { info: (m: string) => void; warn: (m: string) => void; error?: (m: string) => void },
): Set<string> {
  if (!fileCountResult) {
    return detectedLanguages;
  }

  for (const langCount of fileCountResult.by_language) {
    const lang = normalizeLanguage(langCount.language);
    if (!lang) continue;

    if (langCount.count >= 5 && !detectedLanguages.has(lang)) {
      if (UTILITY_LANGUAGES.has(lang)) {
        logger.info(` Agent skipped ${lang} (${langCount.count} files) - utility language`);
        continue;
      }
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
  logger: { info: (m: string) => void; warn: (m: string) => void; error?: (m: string) => void },
  fileCountResult?: FileCountResult,
): Set<string> {
  if (!workspaceResult || !workspaceResult.is_monorepo) {
    return detectedLanguages;
  }

  const workspaceLanguages = new Set<string>();
  for (const ws of workspaceResult.workspaces) {
    const canonical = normalizeLanguage(ws.language);
    if (canonical) workspaceLanguages.add(canonical);
  }

  const hasSourceFiles = (lang: string): boolean => {
    if (!fileCountResult) return true;
    const entry = fileCountResult.by_language.find((lc) => normalizeLanguage(lc.language) === lang);
    return !!(entry && entry.count > 0);
  };

  for (const lang of Array.from(workspaceLanguages)) {
    if (detectedLanguages.has(lang)) continue;
    if (!hasSourceFiles(lang)) {
      logger.info(
        ` Skipped ${lang} from workspace detection (no source files — likely config-only manifest)`,
      );
      continue;
    }
    logger.info(` Added ${lang} from workspace detection`);
    detectedLanguages.add(lang);
  }

  return detectedLanguages;
}
