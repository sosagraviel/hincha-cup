import type { LanguageConfig } from '../types.js';

export const cpp: LanguageConfig = {
  key: 'cpp',
  displayName: 'C++',
  extensions: ['cpp', 'cc', 'cxx', 'hpp', 'h', 'hxx'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
