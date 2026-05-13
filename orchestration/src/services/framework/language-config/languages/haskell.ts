import type { LanguageConfig } from '../types.js';

export const haskell: LanguageConfig = {
  key: 'haskell',
  displayName: 'Haskell',
  extensions: ['hs', 'lhs'],
  manifests: [
    { kind: 'cabal.project', format: 'text' },
    { kind: 'stack.yaml', format: 'yaml' },
  ],
  lockFiles: [
    { filename: 'cabal.project.freeze', manager: 'cabal' },
    { filename: 'stack.yaml.lock', manager: 'stack' },
  ],
  toolTokens: {
    linters: ['hlint'],
    formatters: ['ormolu', 'fourmolu', 'stylish-haskell'],
    typeCheckers: ['ghc'],
    testRunners: ['hspec', 'tasty', 'quickcheck'],
    commonFrameworks: ['servant', 'yesod', 'scotty'],
  },
};
