/**
 * Phase 4: Context Generation Constants
 *
 * All language-specific tables are derived from the centralized
 * language-config registry (`services/framework/language-config`). Adding a
 * new language is a one-file change in `languages/<key>.ts`; this file's
 * constants pick it up automatically.
 */

import type { ManifestInfo } from './types.js';
import { STANDARD_IGNORE_DIRS } from '../../../utils/shared/prompt-loader.js';
import {
  allLockFiles,
  languageExtensionsMap,
  manifestInfoMap,
  primaryManifestFilenames,
  utilityLanguageKeys,
} from '../../../services/framework/language-config/index.js';

/**
 * Map of language keys to their file extensions (with leading dots).
 * Derived from the language-config registry.
 */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = languageExtensionsMap();

/**
 * Map of manifest filenames to their language and package manager type.
 * Includes lock files whose manager is unambiguous so workspace detection
 * still keys off the lock file when the manifest is absent.
 */
export const MANIFEST_FILES: Record<string, ManifestInfo> = (() => {
  const out: Record<string, ManifestInfo> = { ...manifestInfoMap() };
  for (const lock of allLockFiles()) {
    if (lock.filename in out) continue;
    out[lock.filename] = { language: lock.languageKey, type: lock.manager };
  }
  return out;
})();

/**
 * Primary manifest filenames that mark a workspace root (lock files are
 * secondary). Derived from the language-config registry.
 */
export const PRIMARY_MANIFESTS: ReadonlySet<string> = primaryManifestFilenames();

/**
 * Directories to ignore during workspace detection and file counting.
 * Single source of truth is `STANDARD_IGNORE_DIRS` in prompt-loader.
 */
export const IGNORE_DIRS: Set<string> = new Set(STANDARD_IGNORE_DIRS);

/**
 * Regex patterns that match JavaScript/TypeScript tooling configuration
 * filenames (`<name>.config.{js,mjs,cjs,ts,tsx}` and `.<name>rc.{js,...}`).
 * Used by `file-counter.ts` to exclude these from per-language counts.
 */
export const TOOLING_CONFIG_PATTERNS: ReadonlyArray<RegExp> = [
  /^[^.].+\.config\.(?:js|mjs|cjs|ts|tsx)$/i,
  /^\..+rc\.(?:js|mjs|cjs|ts|tsx)$/i,
];

export function isToolingConfigFile(filename: string): boolean {
  return TOOLING_CONFIG_PATTERNS.some((re) => re.test(filename));
}

/**
 * Common workspace directory names
 */
export const WORKSPACE_NAMES = new Set([
  'packages',
  'apps',
  'services',
  'libs',
  'modules',
  'backend',
  'frontend',
  'api',
  'web',
  'mobile',
  'shared',
  'common',
  'core',
]);

/**
 * Frontend framework keywords for categorization
 */
export const FRONTEND_FRAMEWORK_KEYWORDS = [
  'next',
  'react',
  'vue',
  'angular',
  'svelte',
  'nuxt',
] as const;

/**
 * Backend framework keywords for categorization
 */
export const BACKEND_FRAMEWORK_KEYWORDS = [
  'express',
  'fastify',
  'nest',
  'koa',
  'django',
  'flask',
  'fastapi',
  'spring',
  'gin',
] as const;

/**
 * Languages that legitimately appear in file counts but are intentionally
 * omitted from the stack profile (shell scripts, CSS, SQL migrations,
 * JSON/YAML/TOML config files, dockerfile, markdown, …). Validators use
 * this set to suppress "language present but missing from stack profile"
 * warnings.
 *
 * Registered languages flagged `isUtility: true` are pulled from the
 * registry; the trailing list covers file-format tokens that don't have
 * full LanguageConfig entries (Dockerfile, JSON, YAML, …).
 */
export const UTILITY_LANGUAGES: ReadonlySet<string> = new Set<string>([
  ...utilityLanguageKeys(),
  'scss',
  'sass',
  'less',
  'bash',
  'dockerfile',
  'markdown',
  'yaml',
  'json',
  'toml',
  'xml',
  'csv',
  'ini',
  'env',
]);

/**
 * Minimum file count to consider a language significant
 * Used in cross-validation between agent findings and file counts
 */
export const MIN_SIGNIFICANT_FILE_COUNT = 5;

/**
 * Advisory threshold for language detection (soft warning)
 * If file counter finds 10-19 files of a language, log a warning but don't fail
 * This handles cases like JavaScript config files in TypeScript projects
 */
export const MIN_ADVISORY_FILE_COUNT = 10;

/**
 * Required threshold for language detection (hard error)
 * If file counter finds 20+ files of a language, the language MUST be in the profile
 * This ensures significant languages aren't missed in the stack profile
 */
export const MIN_REQUIRED_FILE_COUNT = 20;
