import type { LanguageConfig } from '../types.js';

export const scala: LanguageConfig = {
  key: 'scala',
  displayName: 'Scala',
  extensions: ['scala', 'sc'],
  manifests: [{ kind: 'build.sbt', format: 'text' }],
  lockFiles: [],
  toolTokens: {
    linters: ['scalafix', 'scapegoat'],
    formatters: ['scalafmt'],
    typeCheckers: ['scalac'],
    testRunners: ['scalatest', 'specs2', 'munit', 'mockito-scala'],
    commonFrameworks: ['play', 'akka-http', 'http4s', 'zio-http', 'cats-effect'],
  },
};
