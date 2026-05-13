import type { LanguageConfig } from '../types.js';

export const css: LanguageConfig = {
  key: 'css',
  displayName: 'CSS',
  extensions: ['css', 'scss', 'sass', 'less', 'styl'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
