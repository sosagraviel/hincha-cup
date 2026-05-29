/**
 * Phase 4: Stack Profile Validator Helper
 *
 * Validates stack profile completeness by checking that detected languages
 * match file counts and vice versa. Every comparison flows through
 * `normalizeLanguage` so dialect tokens collapse to canonical names.
 *
 * Differentiates "no source files" from "only tooling-config files" using
 * `FileCountResult.tooling_config_counts` to avoid spurious warnings.
 */

import type { FileCountResult } from '../types.js';
import {
  MIN_ADVISORY_FILE_COUNT,
  MIN_REQUIRED_FILE_COUNT,
  UTILITY_LANGUAGES,
} from '../constants.js';
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
 * @returns Cleaned list of languages — config-only + no-files entries removed
 * @throws Error if validation fails (missing language despite 20+ files)
 */
export function validateStackProfile(
  finalLanguages: string[],
  fileCountResult: FileCountResult | undefined,
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
): string[] {
  const profileCanonical = new Set<string>();
  for (const raw of finalLanguages) profileCanonical.add(normalizeLanguage(raw));

  if (fileCountResult) {
    for (const langCount of fileCountResult.by_language) {
      const lang = normalizeLanguage(langCount.language);
      if (!lang) continue;
      const isInProfile = profileCanonical.has(lang);
      if (isInProfile) continue;

      if (UTILITY_LANGUAGES.has(lang)) {
        if (langCount.count >= MIN_ADVISORY_FILE_COUNT) {
          logger.info(
            ` ${langCount.count} ${lang} files detected (utility language — not in stack profile by design).`,
          );
        }
        continue;
      }

      if (langCount.count >= MIN_REQUIRED_FILE_COUNT) {
        logger.error(
          ` Validation failed: ${langCount.count} ${lang} files found but language not in profile`,
        );
        throw new Error(
          `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
            `This will cause incorrect agent generation.`,
        );
      }

      if (langCount.count >= MIN_ADVISORY_FILE_COUNT && langCount.count < MIN_REQUIRED_FILE_COUNT) {
        logger.warn(
          ` Advisory: ${langCount.count} ${lang} files found but language not in profile. ` +
            `This may be configuration files (e.g., .js config in TypeScript project).`,
        );
      }
    }
  }

  const droppedConfigOnly: string[] = [];
  const droppedNoFiles: string[] = [];
  const kept: string[] = [];
  for (const lang of finalLanguages) {
    const canonical = normalizeLanguage(lang);
    const fileCount = fileCountResult?.by_language.find(
      (lc) => normalizeLanguage(lc.language) === canonical,
    );
    if (fileCount && fileCount.count > 0) {
      kept.push(lang);
      continue;
    }

    const toolingCount = lookupToolingConfigCount(fileCountResult, canonical);
    if (toolingCount > 0) {
      logger.info(
        ` Language ${lang} dropped from stack profile: configuration-only ` +
          `(${toolingCount} tooling-config file${toolingCount === 1 ? '' : 's'}; ` +
          `no source files counted).`,
      );
      droppedConfigOnly.push(lang);
      continue;
    }

    logger.warn(
      ` Language ${lang} dropped from stack profile: no files found ` +
        `(likely fabricated by the analyzer). Verify in Phase 1 outputs.`,
    );
    droppedNoFiles.push(lang);
  }

  if (droppedConfigOnly.length > 0 || droppedNoFiles.length > 0) {
    logger.info(
      `  Stack profile cleanup: dropped ${droppedConfigOnly.length + droppedNoFiles.length} ` +
        `language(s) without source files (kept: ${kept.join(', ') || '(none)'})`,
    );
  }
  return kept;
}

/**
 * Look up `tooling_config_counts[<canonical-language>]`.
 */
function lookupToolingConfigCount(result: FileCountResult | undefined, canonical: string): number {
  if (!result?.tooling_config_counts) return 0;
  for (const [key, count] of Object.entries(result.tooling_config_counts)) {
    if (normalizeLanguage(key) === canonical && typeof count === 'number') return count;
  }
  return 0;
}
