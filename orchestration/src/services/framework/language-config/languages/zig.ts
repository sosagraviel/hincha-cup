import type { LanguageConfig } from '../types.js';

export const zig: LanguageConfig = {
  key: 'zig',
  displayName: 'Zig',
  extensions: ['zig', 'zon'],
  manifests: [{ kind: 'build.zig.zon', format: 'text' }],
  lockFiles: [],
  toolTokens: {
    formatters: ['zig-fmt'],
    typeCheckers: ['zig'],
    testRunners: ['zig-test'],
  },
};
