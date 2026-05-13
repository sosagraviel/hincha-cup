import type { LanguageConfig } from '../types.js';

export const elixir: LanguageConfig = {
  key: 'elixir',
  displayName: 'Elixir',
  extensions: ['ex', 'exs', 'eex', 'heex'],
  manifests: [{ kind: 'mix.exs', format: 'mix-exs' }],
  lockFiles: [{ filename: 'mix.lock', manager: 'mix' }],
  toolTokens: {
    linters: ['credo'],
    formatters: ['mix-format'],
    typeCheckers: ['dialyxir', 'dialyzer'],
    testRunners: ['exunit', 'wallaby', 'hound'],
    commonFrameworks: ['phoenix', 'plug', 'ecto', 'broadway', 'absinthe'],
  },
};
