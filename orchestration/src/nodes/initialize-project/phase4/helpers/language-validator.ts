/**
 * Phase 4: Language Validator Helper
 *
 * Cross-validates detected languages with file counts and workspace detection.
 *
 * Plan v4 Phase A.2 (2026-05-09) — every language token added to
 * `detectedLanguages` flows through `normalizeLanguage` so dialect
 * tokens (`tsx` / `jsx` / `bash` / `kt` / `cs` / …) collapse to
 * canonical keys before deduping. Without this, the file counter or
 * workspace detector could re-introduce variants the analyzer-side
 * normaliser already collapsed.
 */

import { normalizeLanguage } from '../../../../schemas/language-normalization.js';
import type { FileCountResult, WorkspaceDetectionResult } from '../types.js';

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
  logger: { info: (m: string) => void; warn: (m: string) => void; error?: (m: string) => void },
): Set<string> {
  if (!workspaceResult || !workspaceResult.is_monorepo) {
    return detectedLanguages;
  }

  // Extract unique languages from workspaces, normalising dialects
  // (`tsx` → `typescript`, `bash` → `shell`, …) so the merged set
  // does not double-count variants of the same language.
  const workspaceLanguages = new Set<string>();
  for (const ws of workspaceResult.workspaces) {
    const canonical = normalizeLanguage(ws.language);
    if (canonical) workspaceLanguages.add(canonical);
  }

  // Merge with detected languages
  for (const lang of Array.from(workspaceLanguages)) {
    if (!detectedLanguages.has(lang)) {
      logger.info(` Added ${lang} from workspace detection`);
      detectedLanguages.add(lang);
    }
  }

  return detectedLanguages;
}
