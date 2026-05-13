import type { LanguageConfig } from '../types.js';

export const perl: LanguageConfig = {
  key: 'perl',
  displayName: 'Perl',
  extensions: ['pl', 'pm', 't'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
