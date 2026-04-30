/**
 * Phase 4: Context Generation Constants
 *
 * Centralized constants for Phase 4 components
 */

import type { ManifestInfo } from './types.js';
import { STANDARD_IGNORE_DIRS } from '../../../utils/shared/prompt-loader.js';

// ============================================================================
// LANGUAGE EXTENSIONS
// ============================================================================

/**
 * Map of language names to their file extensions
 */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py', '.pyw', '.pyx'],
  java: ['.java'],
  go: ['.go'],
  rust: ['.rs'],
  ruby: ['.rb', '.rake'],
  php: ['.php'],
  csharp: ['.cs'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hxx'],
  c: ['.c', '.h'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  scala: ['.scala', '.sc'],
  elixir: ['.ex', '.exs'],
  clojure: ['.clj', '.cljs', '.cljc'],
  haskell: ['.hs', '.lhs'],
} as const;

// ============================================================================
// MANIFEST FILES
// ============================================================================

/**
 * Map of manifest files to their language and package manager type
 */
export const MANIFEST_FILES: Record<string, ManifestInfo> = {
  'package.json': { language: 'javascript', type: 'npm' },
  'yarn.lock': { language: 'javascript', type: 'yarn' },
  'pnpm-lock.yaml': { language: 'javascript', type: 'pnpm' },
  'requirements.txt': { language: 'python', type: 'pip' },
  Pipfile: { language: 'python', type: 'pipenv' },
  'pyproject.toml': { language: 'python', type: 'poetry' },
  'setup.py': { language: 'python', type: 'setuptools' },
  'go.mod': { language: 'go', type: 'gomod' },
  'Cargo.toml': { language: 'rust', type: 'cargo' },
  'pom.xml': { language: 'java', type: 'maven' },
  'build.gradle': { language: 'java', type: 'gradle' },
  'build.gradle.kts': { language: 'kotlin', type: 'gradle' },
  'build.sbt': { language: 'scala', type: 'sbt' },
  'global.json': { language: 'csharp', type: 'dotnet' },
  Gemfile: { language: 'ruby', type: 'bundler' },
  'composer.json': { language: 'php', type: 'composer' },
  'Package.swift': { language: 'swift', type: 'spm' },
  'Cargo.lock': { language: 'rust', type: 'cargo' },
  'mix.exs': { language: 'elixir', type: 'mix' },
  'rebar.config': { language: 'erlang', type: 'rebar' },
  'project.clj': { language: 'clojure', type: 'leiningen' },
  'deps.edn': { language: 'clojure', type: 'tools.deps' },
} as const;

/**
 * Primary manifest files that indicate a workspace root
 * (vs. lock files which are secondary)
 */
export const PRIMARY_MANIFESTS = new Set([
  'package.json',
  'requirements.txt',
  'Pipfile',
  'pyproject.toml',
  'setup.py',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'build.sbt',
  'global.json',
  'Gemfile',
  'composer.json',
  'Package.swift',
  'mix.exs',
  'rebar.config',
  'project.clj',
  'deps.edn',
]);

// ============================================================================
// IGNORE DIRECTORIES
// ============================================================================

/**
 * Directories to ignore during workspace detection and file counting.
 * Single source of truth is `STANDARD_IGNORE_DIRS` in prompt-loader so the
 * file-counter, workspace-detector, analyzer prompts, and PreToolUse hook
 * all agree on what counts as "ignorable".
 *
 * Runtime exclusions (framework dir, `.gitignore` entries) are layered on
 * via `getExcludedDirectories(projectPath, frameworkPath)` at call sites.
 */
export const IGNORE_DIRS: Set<string> = new Set(STANDARD_IGNORE_DIRS);

// ============================================================================
// TOOLING CONFIG FILES
// ============================================================================

/**
 * Regex patterns that match JavaScript/TypeScript tooling configuration
 * filenames (linters, test runners, build tools, commit hooks, etc.). These
 * are legitimate JS/TS files but they don't describe the project's source
 * language — a TypeScript repo with ten `*.config.mjs` files should still be
 * reported as TypeScript, not as "also has JavaScript".
 *
 * Used by `file-counter.ts` to exclude tooling configs from per-language
 * counts so the language-validator doesn't tag JS purely because of
 * `eslint.config.mjs` / `commitlint.config.js` / `jest.config.mjs`.
 *
 * Two patterns cover the vast majority of cases in the wild:
 *   - `<name>.config.{js,mjs,cjs,ts,tsx}`  — eslint.config.mjs, jest.config.ts
 *   - `.<name>rc.{js,mjs,cjs,ts,tsx}`      — .eslintrc.js, .babelrc.cjs
 */
export const TOOLING_CONFIG_PATTERNS: ReadonlyArray<RegExp> = [
  /^[^.].+\.config\.(?:js|mjs|cjs|ts|tsx)$/i,
  /^\..+rc\.(?:js|mjs|cjs|ts|tsx)$/i,
];

export function isToolingConfigFile(filename: string): boolean {
  return TOOLING_CONFIG_PATTERNS.some((re) => re.test(filename));
}

// ============================================================================
// WORKSPACE NAMES
// ============================================================================

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

// ============================================================================
// FRAMEWORK KEYWORDS
// ============================================================================

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

// ============================================================================
// VALIDATION THRESHOLDS
// ============================================================================

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
