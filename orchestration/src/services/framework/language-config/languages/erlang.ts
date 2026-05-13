import type { LanguageConfig } from '../types.js';

export const erlang: LanguageConfig = {
  key: 'erlang',
  displayName: 'Erlang',
  extensions: ['erl', 'hrl'],
  manifests: [{ kind: 'rebar.config', format: 'text' }],
  lockFiles: [],
  toolTokens: {
    formatters: ['erlfmt'],
    testRunners: ['eunit', 'common_test', 'proper'],
    commonFrameworks: ['cowboy', 'mochiweb', 'yaws'],
  },
};
