import type { LanguageConfig } from '../types.js';

export const sql: LanguageConfig = {
  key: 'sql',
  displayName: 'SQL',
  extensions: ['sql'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
