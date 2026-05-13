import type { LanguageConfig } from '../types.js';
import { firstLine } from '../extractors.js';

export const crystal: LanguageConfig = {
  key: 'crystal',
  displayName: 'Crystal',
  extensions: ['cr'],
  manifests: [{ kind: 'shard.yml', format: 'yaml' }],
  lockFiles: [{ filename: 'shard.lock', manager: 'shards' }],
  runtimeVersionFiles: [{ key: 'crystal', filename: '.crystal-version', extract: firstLine }],
  toolTokens: {
    linters: ['ameba'],
    formatters: ['crystal-format'],
    testRunners: ['spec'],
    commonFrameworks: ['kemal', 'lucky', 'amber'],
  },
};
