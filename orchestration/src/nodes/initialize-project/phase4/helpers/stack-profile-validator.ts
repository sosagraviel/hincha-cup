/**
 * Phase 4: Stack Profile Validator Helper
 *
 * Validates stack profile completeness by checking that detected languages
 * match file counts and vice versa.
 *
 * Plan v4 Phase A.2 (2026-05-09): every comparison flows through
 * `normalizeLanguage` so dialect tokens (`tsx` / `bash` / `kt` / …) the
 * file-counter or the analyzer might emit collapse to canonical names
 * before lookup. Without this, a profile carrying `shell` (the canonical)
 * would never match a file-counter entry of `bash` (the dialect) and
 * the validator's "no files found" warning would fire spuriously.
 *
 * The validator also differentiates "no source files" from "only
 * tooling-config files" using `FileCountResult.tooling_config_counts`.
 * This eliminates the misleading "no files found" warning for
 * legitimate JS-config-in-TS-project scenarios.
 */

import type { FileCountResult } from '../types.js';
import { MIN_ADVISORY_FILE_COUNT, MIN_REQUIRED_FILE_COUNT } from '../constants.js';
import { normalizeLanguage } from '../../../../schemas/language-normalization.js';

/**
 * Validate stack profile completeness.
 *
 * Three checks:
 * 1. WARN if file counts show 10-19 files for a language not in profile (advisory).
 * 2. ERROR if file counts show 20+ files for a language not in profile (required).
 * 3. INFO when a profile language has only tooling-config files (configuration-only);
 *    WARN when it has neither source nor tooling files (likely fabricated by analyzer).
 *
 * @param finalLanguages - Final list of detected languages
 * @param fileCountResult - File count results (optional)
 * @param logger - Logger instance for errors and warnings
 * @throws Error if validation fails (missing language despite 20+ files)
 */
export function validateStackProfile(
  finalLanguages: string[],
  fileCountResult: FileCountResult | undefined,
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
): void {
  // Pre-compute the canonical form of every profile language so the
  // file-counter loop can do O(1) membership checks.
  const profileCanonical = new Set<string>();
  for (const raw of finalLanguages) profileCanonical.add(normalizeLanguage(raw));

  // Check 1: Validate file counts against detected languages
  if (fileCountResult) {
    for (const langCount of fileCountResult.by_language) {
      const lang = normalizeLanguage(langCount.language);
      if (!lang) continue;
      const isInProfile = profileCanonical.has(lang);

      if (langCount.count >= MIN_REQUIRED_FILE_COUNT && !isInProfile) {
        logger.error(
          ` Validation failed: ${langCount.count} ${lang} files found but language not in profile`,
        );
        throw new Error(
          `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
            `This will cause incorrect agent generation.`,
        );
      }

      if (
        langCount.count >= MIN_ADVISORY_FILE_COUNT &&
        langCount.count < MIN_REQUIRED_FILE_COUNT &&
        !isInProfile
      ) {
        logger.warn(
          ` Advisory: ${langCount.count} ${lang} files found but language not in profile. ` +
            `This may be configuration files (e.g., .js config in TypeScript project).`,
        );
      }
    }
  }

  // Check 2: For each profile language, find source / tooling counts and emit
  // an info or warn line.
  for (const lang of finalLanguages) {
    const canonical = normalizeLanguage(lang);
    const fileCount = fileCountResult?.by_language.find(
      (lc) => normalizeLanguage(lc.language) === canonical,
    );
    if (fileCount && fileCount.count > 0) continue;

    const toolingCount = lookupToolingConfigCount(fileCountResult, canonical);
    if (toolingCount > 0) {
      logger.info(
        ` Language ${lang} in profile is configuration-only (${toolingCount} tooling-config ` +
          `file${toolingCount === 1 ? '' : 's'}; no source files counted).`,
      );
      continue;
    }

    logger.warn(
      ` Language ${lang} in profile but no files found - may be configuration-only ` +
        `or fabricated by the analyzer. Verify in Phase 1 outputs.`,
    );
  }
}

/**
 * Look up `tooling_config_counts[<canonical-language>]`. The file-counter
 * keys this by the same canonical names `LANGUAGE_EXTENSIONS` uses; we
 * re-normalise here for safety so a future change to the file-counter's
 * key shape doesn't silently break the lookup.
 */
function lookupToolingConfigCount(result: FileCountResult | undefined, canonical: string): number {
  if (!result?.tooling_config_counts) return 0;
  for (const [key, count] of Object.entries(result.tooling_config_counts)) {
    if (normalizeLanguage(key) === canonical && typeof count === 'number') return count;
  }
  return 0;
}
