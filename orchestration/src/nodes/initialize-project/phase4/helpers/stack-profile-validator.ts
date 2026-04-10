/**
 * Phase 4: Stack Profile Validator Helper
 *
 * Validates stack profile completeness by checking that detected languages
 * match file counts and vice versa.
 */

import type { FileCountResult } from '../types.js';
import { MIN_ADVISORY_FILE_COUNT, MIN_REQUIRED_FILE_COUNT } from '../constants.js';

/**
 * Validate stack profile completeness
 *
 * This function performs three validation checks:
 * 1. WARN if file counts show 10-19 files for a language not in profile (advisory)
 * 2. ERROR if file counts show 20+ files for a language not in profile (required)
 * 3. WARN if a language is in the profile but no files were found (may be configuration-only)
 *
 * @param finalLanguages - Final list of detected languages
 * @param fileCountResult - File count results (optional)
 * @param logger - Logger instance for errors and warnings
 * @throws Error if validation fails (missing language despite 20+ files)
 */
export function validateStackProfile(
  finalLanguages: string[],
  fileCountResult: FileCountResult | undefined,
  logger: any,
): void {
  // Check 1: Validate file counts against detected languages
  if (fileCountResult) {
    for (const langCount of fileCountResult.by_language) {
      const lang = langCount.language.toLowerCase();
      const isInProfile = finalLanguages.includes(lang);

      // Hard error: 20+ files but language not in profile
      // This validation is performed in Phase 4 (early), Phase 5 has more sophisticated validation
      if (langCount.count >= MIN_REQUIRED_FILE_COUNT && !isInProfile) {
        logger.error(
          ` Validation failed: ${langCount.count} ${lang} files found but language not in profile`,
        );
        throw new Error(
          `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
            `This will cause incorrect agent generation.`,
        );
      }

      // Soft warning: 10-19 files but language not in profile
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

  // Check 2: Warn if no files found for a detected language
  for (const lang of finalLanguages) {
    const fileCount = fileCountResult?.by_language.find(
      (lc) => lc.language.toLowerCase() === lang.toLowerCase(),
    );

    if (!fileCount || fileCount.count === 0) {
      logger.warn(` Language ${lang} in profile but no files found - may be configuration-only`);
    }
  }
}
