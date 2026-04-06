/**
 * Phase 4: Stack Profile Validator Helper
 *
 * Validates stack profile completeness by checking that detected languages
 * match file counts and vice versa.
 */

import type { FileCountResult } from "../types.js";
import { MIN_REQUIRED_FILE_COUNT } from "../constants.js";

/**
 * Validate stack profile completeness
 *
 * This function performs two validation checks:
 * 1. If file counts show significant files (>= 10) for a language, it MUST be in the profile
 * 2. Warn if a language is in the profile but no files were found (may be configuration-only)
 *
 * @param finalLanguages - Final list of detected languages
 * @param fileCountResult - File count results (optional)
 * @param logger - Logger instance for errors and warnings
 * @throws Error if validation fails (missing language despite significant file count)
 */
export function validateStackProfile(
  finalLanguages: string[],
  fileCountResult: FileCountResult | undefined,
  logger: any
): void {
  // Check 1: If file counts show significant files for a language, it must be in languages array
  if (fileCountResult) {
    for (const langCount of fileCountResult.by_language) {
      if (langCount.count >= MIN_REQUIRED_FILE_COUNT) {
        const lang = langCount.language.toLowerCase();
        if (!finalLanguages.includes(lang)) {
          logger.error(
            ` Validation failed: ${langCount.count} ${lang} files found but language not in profile`,
          );
          throw new Error(
            `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
              `This will cause incorrect agent generation.`,
          );
        }
      }
    }
  }

  // Check 2: Warn if no files found for a detected language
  for (const lang of finalLanguages) {
    const fileCount = fileCountResult?.by_language.find(
      (lc) => lc.language.toLowerCase() === lang.toLowerCase(),
    );

    if (!fileCount || fileCount.count === 0) {
      logger.warn(
        ` Language ${lang} in profile but no files found - may be configuration-only`,
      );
    }
  }
}
