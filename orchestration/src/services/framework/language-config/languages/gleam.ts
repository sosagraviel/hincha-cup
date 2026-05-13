import type { LanguageConfig } from '../types.js';

export const gleam: LanguageConfig = {
  key: 'gleam',
  displayName: 'Gleam',
  extensions: ['gleam'],
  manifests: [{ kind: 'gleam.toml', format: 'toml' }],
  lockFiles: [{ filename: 'gleam.lock', manager: 'gleam' }],
  toolTokens: {
    formatters: ['gleam-format'],
    testRunners: ['gleeunit'],
    commonFrameworks: ['mist', 'wisp', 'gleam_otp'],
  },
};
