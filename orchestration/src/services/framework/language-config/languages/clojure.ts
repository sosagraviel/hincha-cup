import type { LanguageConfig } from '../types.js';

export const clojure: LanguageConfig = {
  key: 'clojure',
  displayName: 'Clojure',
  extensions: ['clj', 'cljs', 'cljc'],
  manifests: [
    { kind: 'project.clj', format: 'text', manager: 'leiningen' },
    { kind: 'deps.edn', format: 'text', manager: 'tools.deps' },
  ],
  lockFiles: [],
};
