import type { LanguageConfig } from '../types.js';

export const dart: LanguageConfig = {
  key: 'dart',
  displayName: 'Dart',
  extensions: ['dart'],
  manifests: [{ kind: 'pubspec.yaml', format: 'yaml' }],
  lockFiles: [{ filename: 'pubspec.lock', manager: 'pub' }],
  toolTokens: {
    linters: ['dart-analyze', 'lints'],
    formatters: ['dart-format'],
    typeCheckers: ['dart'],
    testRunners: ['test', 'flutter_test', 'mockito'],
    commonFrameworks: ['flutter', 'angel', 'shelf', 'aqueduct'],
  },
};
