import type { LanguageConfig } from '../types.js';

export const powershell: LanguageConfig = {
  key: 'powershell',
  displayName: 'PowerShell',
  extensions: ['ps1', 'psm1', 'psd1'],
  manifests: [],
  lockFiles: [],
  isUtility: true,
};
