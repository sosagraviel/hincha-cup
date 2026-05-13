import type { LanguageConfig } from '../types.js';
import { firstLine } from '../extractors.js';

export const nim: LanguageConfig = {
  key: 'nim',
  displayName: 'Nim',
  extensions: ['nim', 'nims'],
  manifests: [],
  lockFiles: [],
  runtimeVersionFiles: [{ key: 'nim', filename: '.nim-version', extract: firstLine }],
  toolTokens: {
    linters: ['nimsuggest'],
    formatters: ['nimpretty'],
    testRunners: ['unittest', 'testament'],
    commonFrameworks: ['jester', 'prologue'],
  },
};
