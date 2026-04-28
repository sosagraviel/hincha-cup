/**
 * Phase 5: Resources Constants
 *
 * Centralized constants for Phase 5 components
 */

import type { CommandSet } from './types.js';

// ============================================================================
// COMMAND DEFAULTS
// ============================================================================

/**
 * Command defaults for different languages
 * Used to generate agent configuration when project doesn't have explicit commands
 */
export const COMMAND_DEFAULTS: Record<string, CommandSet> = {
  typescript: {
    lint: 'npm run lint',
    format: 'npm run format',
    typecheck: 'npm run typecheck',
    test: 'npm test',
    build: 'npm run build',
  },
  javascript: {
    lint: 'npm run lint',
    format: 'npm run format',
    typecheck: '',
    test: 'npm test',
    build: 'npm run build',
  },
  python: {
    lint: 'ruff check .',
    format: 'black .',
    typecheck: 'mypy .',
    test: 'pytest',
    build: 'python -m build',
  },
  go: {
    lint: 'golangci-lint run',
    format: 'go fmt ./...',
    typecheck: 'go vet ./...',
    test: 'go test ./...',
    build: 'go build ./...',
  },
  csharp: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-incremental',
    test: 'dotnet test',
    build: 'dotnet build',
  },
  rust: {
    lint: 'cargo clippy',
    format: 'cargo fmt',
    typecheck: 'cargo check',
    test: 'cargo test',
    build: 'cargo build',
  },
  java: {
    lint: 'mvn checkstyle:check',
    format: 'mvn spotless:apply',
    typecheck: 'mvn compile',
    test: 'mvn test',
    build: 'mvn package',
  },
  scala: {
    lint: 'sbt scalafmtCheckAll',
    format: 'sbt scalafmtAll',
    typecheck: 'sbt compile',
    test: 'sbt test',
    build: 'sbt package',
  },
  php: {
    lint: 'composer run-script phpcs',
    format: 'composer run-script phpcbf',
    typecheck: 'composer run-script phpstan',
    test: 'composer run-script test',
    build: 'composer install',
  },
  ruby: {
    // Always go through bundler so the version pinned in the project's Gemfile
    // wins over a system-wide gem (mirrors what code-quality-check and
    // security-review do). RuboCop covers both lint and format via -a.
    lint: 'bundle exec rubocop',
    format: 'bundle exec rubocop -a',
    // Ruby has no default static type checker. Steep / Sorbet are opt-in and
    // very rare in real-world projects; assuming Steep would render a failing
    // command on every Rails app. Leave empty so the agent skips this step.
    typecheck: '',
    test: 'bundle exec rspec',
    // Ruby is interpreted — no build step. `bundle install` is install, not
    // build; `rails assets:precompile` is a deploy task; `gem build *.gemspec`
    // is for gem authors only. Keep this empty to match `command-resolver`'s
    // `getBuildCommand()`, which returns [] for Ruby for the same reason.
    build: '',
  },
};

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

/**
 * Languages supported by the framework for dedicated implementer agents
 * Languages not in this list will be handled by implementer-generic
 */
export const SUPPORTED_IMPLEMENTER_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'scala',
  'csharp',
  'php',
  'ruby',
];
