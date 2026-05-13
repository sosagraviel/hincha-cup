/**
 * Stack-agnostic build-tool / package-manager detection and command rendering.
 *
 * Detects the project's build tool per language (npm/pnpm/yarn/bun for JS/TS,
 * pip/poetry/uv/pipenv/hatch for Python, bundler, composer, go, cargo, dotnet,
 * maven, gradle, sbt, mill, mix) and renders canonical commands through a
 * per-tool lookup table rather than hardcoded prefixes.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { COMMAND_DEFAULTS } from '../constants.js';
import type { CommandSet } from '../types.js';

/**
 * Recognised build tools across the languages the framework supports.
 * `unknown` means "couldn't detect" — callers fall back to language
 * defaults.
 */
export type BuildToolId =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'pip'
  | 'poetry'
  | 'uv'
  | 'pipenv'
  | 'hatch'
  | 'bundler'
  | 'composer'
  | 'go'
  | 'cargo'
  | 'dotnet'
  | 'mix'
  | 'maven'
  | 'gradle'
  | 'sbt'
  | 'mill'
  | 'unknown';

/**
 * @deprecated Use `BuildToolId` instead. Kept for back-compat with callers
 * outside this module.
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Detect the build tool / package manager for a project, given its root
 * path and its primary language.
 *
 * Stack-agnostic by design: the detection logic dispatches on language
 * to language-specific signals. Every language family has its own
 * precedence chain; unrecognised inputs fall through to the language's
 * canonical default tool (npm for JS, pip for Python, etc.).
 *
 * The fallback for unknown languages is `'unknown'` — callers should
 * treat it as "use the COMMAND_DEFAULTS verbatim" rather than guessing.
 */
export function detectBuildTool(projectPath: string, language?: string): BuildToolId {
  const lang = (language ?? '').toLowerCase();

  switch (lang) {
    case 'typescript':
    case 'javascript':
      return detectJsBuildTool(projectPath);
    case 'python':
      return detectPythonBuildTool(projectPath);
    case 'ruby':
      return existsSync(join(projectPath, 'Gemfile')) ||
        existsSync(join(projectPath, 'Gemfile.lock'))
        ? 'bundler'
        : 'unknown';
    case 'php':
      return existsSync(join(projectPath, 'composer.json')) ||
        existsSync(join(projectPath, 'composer.lock'))
        ? 'composer'
        : 'unknown';
    case 'java':
    case 'kotlin':
      return detectJvmBuildTool(projectPath);
    case 'go':
      return existsSync(join(projectPath, 'go.mod')) || existsSync(join(projectPath, 'go.work'))
        ? 'go'
        : 'unknown';
    case 'rust':
      return existsSync(join(projectPath, 'Cargo.toml')) ? 'cargo' : 'unknown';
    case 'csharp':
    case 'c#':
    case 'fsharp':
    case 'f#':
      return hasExtensionAnywhere(projectPath, ['.csproj', '.fsproj', '.sln'])
        ? 'dotnet'
        : 'unknown';
    case 'scala':
      return detectScalaBuildTool(projectPath);
    case 'elixir':
      return existsSync(join(projectPath, 'mix.exs')) ? 'mix' : 'unknown';
    default:
      return 'unknown';
  }
}

function detectJsBuildTool(projectPath: string): BuildToolId {
  const pkgJsonPath = join(projectPath, 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        packageManager?: string;
        engines?: Record<string, string>;
      };
      if (typeof pkg.packageManager === 'string' && pkg.packageManager.length > 0) {
        const prefix = pkg.packageManager.split('@')[0]?.toLowerCase();
        if (prefix === 'pnpm' || prefix === 'yarn' || prefix === 'bun' || prefix === 'npm') {
          return prefix;
        }
      }
    } catch {}
  }
  if (existsSync(join(projectPath, 'bun.lockb'))) return 'bun';
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectPath, 'package-lock.json'))) return 'npm';
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        engines?: Record<string, string>;
      };
      const engines = pkg.engines ?? {};
      if (engines.pnpm) return 'pnpm';
      if (engines.yarn) return 'yarn';
      if (engines.bun) return 'bun';
    } catch {}
  }
  return 'npm';
}

function detectPythonBuildTool(projectPath: string): BuildToolId {
  const pyprojectPath = join(projectPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const body = readFileSync(pyprojectPath, 'utf-8');
      if (/^\s*\[tool\.poetry\]/m.test(body)) return 'poetry';
      if (/^\s*\[tool\.uv\]/m.test(body) || existsSync(join(projectPath, 'uv.lock'))) {
        return 'uv';
      }
      if (/^\s*\[tool\.hatch\]/m.test(body)) return 'hatch';
    } catch {}
  }
  if (existsSync(join(projectPath, 'Pipfile')) || existsSync(join(projectPath, 'Pipfile.lock'))) {
    return 'pipenv';
  }
  if (existsSync(join(projectPath, 'poetry.lock'))) return 'poetry';
  if (existsSync(join(projectPath, 'uv.lock'))) return 'uv';
  if (
    existsSync(join(projectPath, 'requirements.txt')) ||
    existsSync(join(projectPath, 'setup.py')) ||
    existsSync(pyprojectPath)
  ) {
    return 'pip';
  }
  return 'unknown';
}

function detectJvmBuildTool(projectPath: string): BuildToolId {
  if (existsSync(join(projectPath, 'pom.xml'))) return 'maven';
  if (
    existsSync(join(projectPath, 'build.gradle')) ||
    existsSync(join(projectPath, 'build.gradle.kts')) ||
    existsSync(join(projectPath, 'settings.gradle')) ||
    existsSync(join(projectPath, 'settings.gradle.kts'))
  ) {
    return 'gradle';
  }
  return 'unknown';
}

function detectScalaBuildTool(projectPath: string): BuildToolId {
  if (existsSync(join(projectPath, 'build.sbt'))) return 'sbt';
  if (
    existsSync(join(projectPath, 'build.gradle.kts')) ||
    existsSync(join(projectPath, 'build.gradle'))
  ) {
    return 'gradle';
  }
  if (existsSync(join(projectPath, 'build.mill'))) return 'mill';
  return 'sbt';
}

function hasExtensionAnywhere(projectPath: string, exts: string[]): boolean {
  try {
    const fs = require('fs') as typeof import('fs');
    const entries = fs.readdirSync(projectPath);
    return entries.some((name) => exts.some((ext) => name.endsWith(ext)));
  } catch {
    return false;
  }
}

/**
 * Render a build-tool command for a given action. The action is
 * normalised across stacks: every supported tool has a canonical
 * invocation for `lint` / `format` / `typecheck` / `test` / `build`.
 *
 * Returns an empty string if the tool/action pair has no canonical
 * mapping (caller should fall back to the language default).
 */
export type CommandAction = 'lint' | 'format' | 'typecheck' | 'test' | 'build';

const COMMAND_TABLE: Record<BuildToolId, Partial<Record<CommandAction, string>>> = {
  npm: {
    lint: 'npm run lint',
    format: 'npm run format',
    typecheck: 'npm run typecheck',
    test: 'npm test',
    build: 'npm run build',
  },
  pnpm: {
    lint: 'pnpm run lint',
    format: 'pnpm run format',
    typecheck: 'pnpm run typecheck',
    test: 'pnpm test',
    build: 'pnpm run build',
  },
  yarn: {
    lint: 'yarn run lint',
    format: 'yarn run format',
    typecheck: 'yarn run typecheck',
    test: 'yarn test',
    build: 'yarn run build',
  },
  bun: {
    lint: 'bun run lint',
    format: 'bun run format',
    typecheck: 'bun run typecheck',
    test: 'bun test',
    build: 'bun run build',
  },
  pip: {
    lint: 'ruff check .',
    format: 'black .',
    typecheck: 'mypy .',
    test: 'pytest',
    build: 'python -m build',
  },
  poetry: {
    lint: 'poetry run ruff check .',
    format: 'poetry run black .',
    typecheck: 'poetry run mypy .',
    test: 'poetry run pytest',
    build: 'poetry build',
  },
  uv: {
    lint: 'uv run ruff check .',
    format: 'uv run black .',
    typecheck: 'uv run mypy .',
    test: 'uv run pytest',
    build: 'uv build',
  },
  pipenv: {
    lint: 'pipenv run ruff check .',
    format: 'pipenv run black .',
    typecheck: 'pipenv run mypy .',
    test: 'pipenv run pytest',
    build: 'pipenv run python -m build',
  },
  hatch: {
    lint: 'hatch run ruff check .',
    format: 'hatch run black .',
    typecheck: 'hatch run mypy .',
    test: 'hatch run pytest',
    build: 'hatch build',
  },
  bundler: {
    lint: 'bundle exec rubocop',
    format: 'bundle exec rubocop -a',
    test: 'bundle exec rspec',
    build: 'bundle install',
  },
  composer: {
    lint: 'composer run-script phpcs',
    format: 'composer run-script phpcbf',
    typecheck: 'composer run-script phpstan',
    test: 'composer run-script test',
    build: 'composer install',
  },
  go: {
    lint: 'golangci-lint run',
    format: 'go fmt ./...',
    typecheck: 'go vet ./...',
    test: 'go test ./...',
    build: 'go build ./...',
  },
  cargo: {
    lint: 'cargo clippy',
    format: 'cargo fmt',
    typecheck: 'cargo check',
    test: 'cargo test',
    build: 'cargo build',
  },
  dotnet: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-incremental',
    test: 'dotnet test',
    build: 'dotnet build',
  },
  maven: {
    lint: 'mvn checkstyle:check',
    format: 'mvn spotless:apply',
    typecheck: 'mvn compile',
    test: 'mvn test',
    build: 'mvn package',
  },
  gradle: {
    lint: 'gradle check',
    format: 'gradle spotlessApply',
    typecheck: 'gradle compileJava',
    test: 'gradle test',
    build: 'gradle build',
  },
  sbt: {
    lint: 'sbt scalafmtCheckAll',
    format: 'sbt scalafmtAll',
    typecheck: 'sbt compile',
    test: 'sbt test',
    build: 'sbt package',
  },
  mill: {
    lint: 'mill __.checkFormat',
    format: 'mill __.reformat',
    typecheck: 'mill __.compile',
    test: 'mill __.test',
    build: 'mill __.assembly',
  },
  mix: {
    lint: 'mix credo',
    format: 'mix format --check-formatted',
    typecheck: 'mix dialyzer',
    test: 'mix test',
    build: 'mix compile',
  },
  unknown: {},
};

/**
 * Render a single command for the resolved build tool + action. Returns
 * empty string when no mapping exists (caller falls back to language
 * defaults).
 */
export function renderToolCommand(tool: BuildToolId, action: CommandAction): string {
  return COMMAND_TABLE[tool]?.[action] ?? '';
}

/**
 * Read declared scripts/targets from the project's primary manifest and
 * render commands using the resolved build tool. Returns empty entries
 * for stages that don't have a script/target — caller falls through to
 * the language defaults via `getDefaultCommands`.
 *
 * For JS/TS: reads `package.json` scripts.
 * For Python: reads `pyproject.toml` scripts (via `[tool.poetry.scripts]` /
 *   `[project.scripts]` / `[tool.hatch.envs.default.scripts]`).
 * For other languages: returns an empty Partial — the language's
 *   default tool commands are canonical and don't need extraction.
 */
export function extractCommandsFromManifest(
  projectPath: string,
  language?: string,
  tool?: BuildToolId,
): Partial<CommandSet> {
  const lang = (language ?? 'typescript').toLowerCase();
  const detectedTool = tool ?? detectBuildTool(projectPath, lang);

  if (lang === 'typescript' || lang === 'javascript') {
    return extractJsCommands(projectPath, detectedTool);
  }
  if (lang === 'python') {
    return extractPythonCommands(projectPath, detectedTool);
  }
  return {};
}

/**
 * Back-compat shim. Old callers (and tests) used this name when only
 * JS/TS was supported. Now an alias for `extractCommandsFromManifest`
 * with an inferred language. Kept for minimum-touch refactoring.
 *
 * @deprecated Use `extractCommandsFromManifest(projectPath, language)`.
 */
export function extractPackageCommands(
  projectPath: string,
  packageManager?: PackageManager | BuildToolId,
): Partial<CommandSet> {
  return extractCommandsFromManifest(projectPath, 'typescript', packageManager as BuildToolId);
}

function extractJsCommands(projectPath: string, tool: BuildToolId): Partial<CommandSet> {
  const packageJsonPath = join(projectPath, 'package.json');
  if (!existsSync(packageJsonPath)) return {};
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const scripts: Record<string, string> = packageJson.scripts || {};
    const has = (k: string) => typeof scripts[k] === 'string' && scripts[k].length > 0;

    return {
      lint: has('lint') ? renderToolCommand(tool, 'lint') : '',
      format: has('format') ? renderToolCommand(tool, 'format') : '',
      typecheck: has('typecheck')
        ? renderToolCommand(tool, 'typecheck')
        : has('type-check')
          ? renderHyphenatedTypecheck(tool)
          : '',
      test: has('test') ? renderToolCommand(tool, 'test') : '',
      build: has('build') ? renderToolCommand(tool, 'build') : '',
    };
  } catch {
    return {};
  }
}

function renderHyphenatedTypecheck(tool: BuildToolId): string {
  if (tool === 'npm') return 'npm run type-check';
  if (tool === 'pnpm') return 'pnpm run type-check';
  if (tool === 'yarn') return 'yarn run type-check';
  if (tool === 'bun') return 'bun run type-check';
  return renderToolCommand(tool, 'typecheck');
}

function extractPythonCommands(projectPath: string, tool: BuildToolId): Partial<CommandSet> {
  const pyprojectPath = join(projectPath, 'pyproject.toml');
  if (!existsSync(pyprojectPath)) return {};
  try {
    const body = readFileSync(pyprojectPath, 'utf-8');
    const hasTask = (taskName: string): boolean => {
      const sectionMatchers = [
        /\[tool\.poetry\.scripts\]\s*\n([\s\S]*?)(?=\n\[|$(?![\s\S]))/m,
        /\[project\.scripts\]\s*\n([\s\S]*?)(?=\n\[|$(?![\s\S]))/m,
        /\[tool\.hatch\.envs\.default\.scripts\]\s*\n([\s\S]*?)(?=\n\[|$(?![\s\S]))/m,
      ];
      const taskPattern = new RegExp(`^\\s*${taskName}\\s*=`, 'm');
      return sectionMatchers.some((s) => {
        const m = body.match(s);
        return m !== null && taskPattern.test(m[1] ?? m[0]);
      });
    };

    const fromTask = (action: CommandAction, taskName: string): string =>
      hasTask(taskName) ? renderToolCommand(tool, action) : '';

    return {
      lint: fromTask('lint', 'lint'),
      format: fromTask('format', 'format'),
      typecheck: fromTask('typecheck', 'typecheck'),
      test: fromTask('test', 'test'),
      build: fromTask('build', 'build'),
    };
  } catch {
    return {};
  }
}

/**
 * Get default commands for a language. The defaults are templated against
 * the resolved build tool when one applies; single-tool languages return
 * their canonical commands unchanged.
 *
 * Stack-agnostic: every supported language has a default-tool fallback
 * so this function is safe to call from any analyzer / wizard / agent
 * generator.
 */
export function getDefaultCommands(
  language: string,
  projectPath?: string,
  tool?: BuildToolId,
): CommandSet {
  const langLower = language.toLowerCase();
  const baseCmd = COMMAND_DEFAULTS[langLower] || COMMAND_DEFAULTS.typescript;

  const resolvedTool = tool ?? (projectPath ? detectBuildTool(projectPath, langLower) : 'unknown');

  if (resolvedTool === 'unknown') return baseCmd;

  const table = COMMAND_TABLE[resolvedTool];
  if (!table) return baseCmd;

  return {
    lint: table.lint ?? baseCmd.lint,
    format: table.format ?? baseCmd.format,
    typecheck: table.typecheck ?? baseCmd.typecheck,
    test: table.test ?? baseCmd.test,
    build: table.build ?? baseCmd.build,
  };
}

/**
 * @deprecated Use `detectBuildTool(projectPath, 'typescript' | 'javascript')`.
 * Kept for backwards-compatibility with callers (mainly tests) that only
 * needed the JS/TS detection.
 */
export function detectPackageManager(projectPath: string): PackageManager {
  const tool = detectJsBuildTool(projectPath);
  return (tool === 'pnpm' || tool === 'yarn' || tool === 'bun' ? tool : 'npm') as PackageManager;
}
