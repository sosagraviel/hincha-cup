import type { LanguageConfig } from '../types.js';

export const shell: LanguageConfig = {
  key: 'shell',
  displayName: 'Shell',
  extensions: ['sh', 'bash', 'zsh', 'fish'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
