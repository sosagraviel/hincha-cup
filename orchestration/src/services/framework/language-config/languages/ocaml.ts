import type { LanguageConfig } from '../types.js';
import { firstLine } from '../extractors.js';

export const ocaml: LanguageConfig = {
  key: 'ocaml',
  displayName: 'OCaml',
  extensions: ['ml', 'mli'],
  manifests: [{ kind: 'dune-project', format: 'text' }],
  lockFiles: [{ filename: 'dune.lock', manager: 'opam' }],
  runtimeVersionFiles: [{ key: 'ocaml', filename: '.ocaml-version', extract: firstLine }],
  toolTokens: {
    formatters: ['ocamlformat'],
    testRunners: ['alcotest', 'ounit', 'ppx_inline_test'],
    commonFrameworks: ['dream', 'opium', 'cohttp'],
  },
};
