import type { LanguageConfig } from '../types.js';

/**
 * TypeScript extends JavaScript — same manifests + lock files +
 * runtime-version files. Only the extensions and `typescript` token
 * differ.
 */
export const typescript: LanguageConfig = {
  key: 'typescript',
  displayName: 'TypeScript',
  extensions: ['ts', 'tsx', 'd.ts', 'mts', 'cts'],
  manifests: [],
  lockFiles: [],
  extends: ['javascript'],
  toolTokens: {
    typeCheckers: ['typescript', 'tsc'],
  },
};
