import type { LanguageConfig } from '../types.js';

export const kotlin: LanguageConfig = {
  key: 'kotlin',
  displayName: 'Kotlin',
  extensions: ['kt', 'kts'],
  manifests: [
    { kind: 'build.gradle.kts', format: 'text', manager: 'gradle' },
    { kind: 'build.gradle', format: 'text', manager: 'gradle' },
    { kind: 'pom.xml', format: 'xml', manager: 'maven' },
    { kind: 'AndroidManifest.xml', format: 'xml', manager: 'gradle' },
  ],
  lockFiles: [],
  extends: ['java'],
  toolTokens: {
    linters: ['detekt', 'ktlint'],
    formatters: ['ktlint', 'spotless'],
    typeCheckers: ['kotlinc'],
    commonFrameworks: ['ktor', 'spring-boot', 'micronaut', 'http4k', 'javalin'],
  },
};
