/**
 * Plan §C 1.1 (gira-exhaustive followup, 2026-05-05) — stack-agnostic
 * build-tool / package-manager detection.
 *
 * The framework supports 600+ projects spanning TypeScript, JavaScript,
 * Python, Ruby, PHP, Java, Kotlin, Go, Rust, .NET, Scala, Elixir. Each
 * language has its own canonical build-tool detection signal; some
 * (TypeScript / Python / Java / Scala) have multiple tools. These tests
 * lock the detection contract and the canonical command rendering for
 * the full matrix.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectBuildTool,
  extractCommandsFromManifest,
  extractPackageCommands,
  detectPackageManager,
  getDefaultCommands,
  renderToolCommand,
  type BuildToolId,
} from '../../../../../../src/nodes/initialize-project/phase5/helpers/command-extractor.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'build-tool-detect-'));
});

afterEach(async () => {
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function touch(rel: string, body = '') {
  const full = join(projectDir, rel);
  const dir = full.replace(/\/[^/]+$/, '');
  if (dir !== full) await mkdir(dir, { recursive: true }).catch(() => undefined);
  await writeFile(full, body, 'utf-8');
}

// ============================================================================
// detectBuildTool — JS/TS family
// ============================================================================

describe('detectBuildTool — TypeScript/JavaScript family (4 managers)', () => {
  it('honours `packageManager: pnpm@x` (Corepack)', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'pnpm@10.2.1' }));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('pnpm');
    expect(detectBuildTool(projectDir, 'javascript')).toBe('pnpm');
  });

  it('honours `packageManager: yarn@4`', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'yarn@4.0.0' }));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('yarn');
  });

  it('honours `packageManager: bun@1`', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'bun@1.0.0' }));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('bun');
  });

  it('honours `packageManager: npm@10`', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'npm@10.0.0' }));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    await touch('package.json', JSON.stringify({}));
    await touch('pnpm-lock.yaml');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', async () => {
    await touch('package.json', JSON.stringify({}));
    await touch('yarn.lock');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('yarn');
  });

  it('detects bun from bun.lockb', async () => {
    await touch('package.json', JSON.stringify({}));
    await touch('bun.lockb');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('bun');
  });

  it('detects npm from package-lock.json', async () => {
    await touch('package.json', JSON.stringify({}));
    await touch('package-lock.json');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('npm');
  });

  it('precedence: bun.lockb beats pnpm-lock.yaml', async () => {
    await touch('package.json', JSON.stringify({}));
    await touch('bun.lockb');
    await touch('pnpm-lock.yaml');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('bun');
  });

  it('precedence: packageManager beats lockfile', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'yarn@4' }));
    await touch('package-lock.json');
    expect(detectBuildTool(projectDir, 'typescript')).toBe('yarn');
  });

  it('falls back to npm when no signal', async () => {
    await touch('package.json', JSON.stringify({}));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('npm');
  });

  it('engines.pnpm declares pnpm', async () => {
    await touch('package.json', JSON.stringify({ engines: { pnpm: '>=10' } }));
    expect(detectBuildTool(projectDir, 'typescript')).toBe('pnpm');
  });
});

// ============================================================================
// detectBuildTool — Python family
// ============================================================================

describe('detectBuildTool — Python family (5 managers)', () => {
  it('detects poetry from pyproject.toml [tool.poetry]', async () => {
    await touch(
      'pyproject.toml',
      `[tool.poetry]\nname = "x"\nversion = "0.1.0"\n[tool.poetry.dependencies]\npython = "^3.11"\n`,
    );
    expect(detectBuildTool(projectDir, 'python')).toBe('poetry');
  });

  it('detects uv from pyproject.toml [tool.uv]', async () => {
    await touch(
      'pyproject.toml',
      `[project]\nname = "x"\nversion = "0.1.0"\n[tool.uv]\ndev-dependencies = []\n`,
    );
    expect(detectBuildTool(projectDir, 'python')).toBe('uv');
  });

  it('detects uv from uv.lock', async () => {
    await touch('pyproject.toml', '[project]\nname = "x"\n');
    await touch('uv.lock');
    expect(detectBuildTool(projectDir, 'python')).toBe('uv');
  });

  it('detects hatch from pyproject.toml [tool.hatch]', async () => {
    await touch('pyproject.toml', `[project]\nname = "x"\n[tool.hatch]\nversion = {}\n`);
    expect(detectBuildTool(projectDir, 'python')).toBe('hatch');
  });

  it('detects pipenv from Pipfile', async () => {
    await touch('Pipfile', '[[source]]\nname = "pypi"\n');
    expect(detectBuildTool(projectDir, 'python')).toBe('pipenv');
  });

  it('detects pip from requirements.txt', async () => {
    await touch('requirements.txt', 'requests==2.0\n');
    expect(detectBuildTool(projectDir, 'python')).toBe('pip');
  });

  it('detects pip from setup.py (legacy projects)', async () => {
    await touch('setup.py', 'from setuptools import setup\nsetup(name="x")\n');
    expect(detectBuildTool(projectDir, 'python')).toBe('pip');
  });

  it('precedence: poetry > uv > hatch when multiple sections', async () => {
    await touch(
      'pyproject.toml',
      `[tool.poetry]\nname = "x"\n[tool.uv]\nfoo = 1\n[tool.hatch]\nbar = 2\n`,
    );
    expect(detectBuildTool(projectDir, 'python')).toBe('poetry');
  });

  it('returns unknown for empty Python projects', async () => {
    expect(detectBuildTool(projectDir, 'python')).toBe('unknown');
  });
});

// ============================================================================
// detectBuildTool — single-tool languages
// ============================================================================

describe('detectBuildTool — single-tool languages', () => {
  it('Ruby: detects bundler from Gemfile', async () => {
    await touch('Gemfile', 'source "https://rubygems.org"\n');
    expect(detectBuildTool(projectDir, 'ruby')).toBe('bundler');
  });

  it('Ruby: detects bundler from Gemfile.lock', async () => {
    await touch('Gemfile.lock', 'GEM\n');
    expect(detectBuildTool(projectDir, 'ruby')).toBe('bundler');
  });

  it('PHP: detects composer from composer.json', async () => {
    await touch('composer.json', '{"name": "vendor/pkg"}');
    expect(detectBuildTool(projectDir, 'php')).toBe('composer');
  });

  it('Go: detects go modules from go.mod', async () => {
    await touch('go.mod', 'module example.com/x\ngo 1.21\n');
    expect(detectBuildTool(projectDir, 'go')).toBe('go');
  });

  it('Go: detects go modules from go.work (monorepo)', async () => {
    await touch('go.work', 'go 1.21\nuse ./svc1\nuse ./svc2\n');
    expect(detectBuildTool(projectDir, 'go')).toBe('go');
  });

  it('Rust: detects cargo from Cargo.toml', async () => {
    await touch('Cargo.toml', '[package]\nname = "x"\nversion = "0.1.0"\n');
    expect(detectBuildTool(projectDir, 'rust')).toBe('cargo');
  });

  it('.NET: detects dotnet from *.csproj', async () => {
    await touch('App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    expect(detectBuildTool(projectDir, 'csharp')).toBe('dotnet');
  });

  it('.NET: detects dotnet from *.sln', async () => {
    await touch('App.sln', 'Microsoft Visual Studio Solution File\n');
    expect(detectBuildTool(projectDir, 'csharp')).toBe('dotnet');
  });

  it('Elixir: detects mix from mix.exs', async () => {
    await touch('mix.exs', 'defmodule X.MixProject do\nend\n');
    expect(detectBuildTool(projectDir, 'elixir')).toBe('mix');
  });
});

// ============================================================================
// detectBuildTool — JVM family (Java / Kotlin / Scala)
// ============================================================================

describe('detectBuildTool — JVM family', () => {
  it('Java: detects maven from pom.xml', async () => {
    await touch('pom.xml', '<project></project>');
    expect(detectBuildTool(projectDir, 'java')).toBe('maven');
  });

  it('Java: detects gradle from build.gradle', async () => {
    await touch('build.gradle', 'plugins { id "java" }\n');
    expect(detectBuildTool(projectDir, 'java')).toBe('gradle');
  });

  it('Java: detects gradle from build.gradle.kts (Kotlin DSL)', async () => {
    await touch('build.gradle.kts', 'plugins { java }\n');
    expect(detectBuildTool(projectDir, 'java')).toBe('gradle');
  });

  it('Kotlin: detects gradle from build.gradle.kts', async () => {
    await touch('build.gradle.kts', 'plugins { kotlin("jvm") }\n');
    expect(detectBuildTool(projectDir, 'kotlin')).toBe('gradle');
  });

  it('Scala: detects sbt from build.sbt', async () => {
    await touch('build.sbt', 'name := "x"\n');
    expect(detectBuildTool(projectDir, 'scala')).toBe('sbt');
  });

  it('Scala: detects gradle when build.sbt absent but build.gradle.kts present', async () => {
    await touch('build.gradle.kts', 'plugins { scala }\n');
    expect(detectBuildTool(projectDir, 'scala')).toBe('gradle');
  });

  it('Java: precedence — pom.xml beats build.gradle when both present', async () => {
    await touch('pom.xml', '<project></project>');
    await touch('build.gradle', 'plugins { id "java" }\n');
    expect(detectBuildTool(projectDir, 'java')).toBe('maven');
  });
});

// ============================================================================
// detectBuildTool — unknown / fallback
// ============================================================================

describe('detectBuildTool — unknown / fallback', () => {
  it('returns unknown for unsupported language', () => {
    expect(detectBuildTool(projectDir, 'cobol')).toBe('unknown');
  });

  it('returns unknown when language is not provided', () => {
    expect(detectBuildTool(projectDir)).toBe('unknown');
  });
});

// ============================================================================
// renderToolCommand — canonical lookup table
// ============================================================================

describe('renderToolCommand — every supported tool has lint/test/build at minimum', () => {
  const tools: BuildToolId[] = [
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'pip',
    'poetry',
    'uv',
    'pipenv',
    'hatch',
    'bundler',
    'composer',
    'go',
    'cargo',
    'dotnet',
    'maven',
    'gradle',
    'sbt',
    'mill',
    'mix',
  ];

  it.each(tools)('%s renders a non-empty test command', (tool) => {
    expect(renderToolCommand(tool, 'test').length).toBeGreaterThan(0);
  });

  it.each(tools)('%s renders a non-empty build command', (tool) => {
    expect(renderToolCommand(tool, 'build').length).toBeGreaterThan(0);
  });

  it.each(tools.filter((t) => t !== 'bundler'))(
    '%s renders a non-empty typecheck command',
    (tool) => {
      // Ruby (bundler) doesn't have a canonical typecheck — Sorbet/Steep
      // are opt-in. Empty rendering is correct; caller falls through to
      // language defaults.
      expect(renderToolCommand(tool, 'typecheck').length).toBeGreaterThan(0);
    },
  );

  it.each(tools)('%s renders a non-empty lint command', (tool) => {
    expect(renderToolCommand(tool, 'lint').length).toBeGreaterThan(0);
  });

  it('unknown tool returns empty for any action', () => {
    expect(renderToolCommand('unknown', 'test')).toBe('');
    expect(renderToolCommand('unknown', 'build')).toBe('');
  });
});

describe('renderToolCommand — canonical idioms (sample)', () => {
  it('pnpm test uses the bare alias (not `pnpm run test`)', () => {
    expect(renderToolCommand('pnpm', 'test')).toBe('pnpm test');
  });
  it('poetry wraps pytest', () => {
    expect(renderToolCommand('poetry', 'test')).toBe('poetry run pytest');
  });
  it('uv wraps pytest', () => {
    expect(renderToolCommand('uv', 'test')).toBe('uv run pytest');
  });
  it('bundler uses bundle exec rspec', () => {
    expect(renderToolCommand('bundler', 'test')).toBe('bundle exec rspec');
  });
  it('go uses go test ./...', () => {
    expect(renderToolCommand('go', 'test')).toBe('go test ./...');
  });
  it('cargo uses cargo test', () => {
    expect(renderToolCommand('cargo', 'test')).toBe('cargo test');
  });
  it('dotnet uses dotnet test', () => {
    expect(renderToolCommand('dotnet', 'test')).toBe('dotnet test');
  });
  it('maven uses mvn test', () => {
    expect(renderToolCommand('maven', 'test')).toBe('mvn test');
  });
  it('gradle uses gradle test', () => {
    expect(renderToolCommand('gradle', 'test')).toBe('gradle test');
  });
  it('sbt uses sbt test', () => {
    expect(renderToolCommand('sbt', 'test')).toBe('sbt test');
  });
  it('mix uses mix test', () => {
    expect(renderToolCommand('mix', 'test')).toBe('mix test');
  });
});

// ============================================================================
// extractCommandsFromManifest — JS/TS
// ============================================================================

describe('extractCommandsFromManifest — JS/TS scripts', () => {
  it('emits pnpm commands when packageManager is pnpm', async () => {
    await touch(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10.2.1',
        scripts: { lint: 'eslint .', test: 'vitest', build: 'tsc' },
      }),
    );
    const cmds = extractCommandsFromManifest(projectDir, 'typescript');
    expect(cmds.lint).toBe('pnpm run lint');
    expect(cmds.test).toBe('pnpm test');
    expect(cmds.build).toBe('pnpm run build');
  });

  it('emits yarn commands for a yarn project', async () => {
    await touch(
      'package.json',
      JSON.stringify({
        packageManager: 'yarn@4.0.0',
        scripts: { lint: 'eslint .' },
      }),
    );
    expect(extractCommandsFromManifest(projectDir, 'javascript').lint).toBe('yarn run lint');
  });

  it('renders type-check (hyphenated) script with the correct pm', async () => {
    await touch(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10',
        scripts: { 'type-check': 'tsc --noEmit' },
      }),
    );
    expect(extractCommandsFromManifest(projectDir, 'typescript').typecheck).toBe(
      'pnpm run type-check',
    );
  });

  it('the gira regression: pnpm@10.2.1 produces pnpm commands', async () => {
    await touch(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10.2.1',
        scripts: { lint: 'eslint .', typecheck: 'tsc', test: 'jest', build: 'tsc' },
      }),
    );
    const cmds = extractCommandsFromManifest(projectDir, 'typescript');
    expect(cmds.lint).toBe('pnpm run lint');
    expect(cmds.typecheck).toBe('pnpm run typecheck');
    expect(cmds.test).toBe('pnpm test');
    expect(cmds.build).toBe('pnpm run build');
  });
});

// ============================================================================
// extractCommandsFromManifest — Python
// ============================================================================

describe('extractCommandsFromManifest — Python scripts', () => {
  it('detects test task in [tool.poetry.scripts]', async () => {
    await touch(
      'pyproject.toml',
      [
        '[tool.poetry]',
        'name = "x"',
        '',
        '[tool.poetry.scripts]',
        'test = "pytest:main"',
        'lint = "ruff:main"',
      ].join('\n'),
    );
    const cmds = extractCommandsFromManifest(projectDir, 'python');
    expect(cmds.test).toBe('poetry run pytest');
    expect(cmds.lint).toBe('poetry run ruff check .');
  });

  it('detects test task in [project.scripts] (PEP 621) — uv tool', async () => {
    await touch(
      'pyproject.toml',
      [
        '[project]',
        'name = "x"',
        '',
        '[tool.uv]',
        'dev-dependencies = []',
        '',
        '[project.scripts]',
        'test = "x.cli:test"',
        'build = "x.cli:build"',
      ].join('\n'),
    );
    const cmds = extractCommandsFromManifest(projectDir, 'python');
    expect(cmds.test).toBe('uv run pytest');
    expect(cmds.build).toBe('uv build');
  });

  it('returns empty when pyproject.toml is missing (caller falls back to defaults)', async () => {
    expect(extractCommandsFromManifest(projectDir, 'python')).toEqual({});
  });
});

// ============================================================================
// extractCommandsFromManifest — single-tool languages
// ============================================================================

describe('extractCommandsFromManifest — non-JS/TS, non-Python languages return empty', () => {
  it.each(['ruby', 'php', 'go', 'rust', 'csharp', 'java', 'kotlin', 'scala', 'elixir'])(
    '%s: extraction is empty (caller uses language defaults)',
    (language) => {
      expect(extractCommandsFromManifest(projectDir, language)).toEqual({});
    },
  );
});

// ============================================================================
// getDefaultCommands — multi-stack
// ============================================================================

describe('getDefaultCommands — every language renders correct defaults', () => {
  it('TypeScript with pnpm uses pnpm commands', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'pnpm@10' }));
    const cmds = getDefaultCommands('typescript', projectDir);
    expect(cmds.test).toBe('pnpm test');
    expect(cmds.build).toBe('pnpm run build');
  });

  it('Python with poetry uses poetry run commands', async () => {
    await touch('pyproject.toml', `[tool.poetry]\nname = "x"\nversion = "0.1.0"\n`);
    const cmds = getDefaultCommands('python', projectDir);
    expect(cmds.test).toBe('poetry run pytest');
    expect(cmds.lint).toBe('poetry run ruff check .');
  });

  it('Python with uv uses uv run commands', async () => {
    await touch('pyproject.toml', `[project]\nname="x"\n[tool.uv]\nfoo=1\n`);
    const cmds = getDefaultCommands('python', projectDir);
    expect(cmds.test).toBe('uv run pytest');
  });

  it('Go uses go test ./...', async () => {
    await touch('go.mod', 'module x\ngo 1.21\n');
    const cmds = getDefaultCommands('go', projectDir);
    expect(cmds.test).toBe('go test ./...');
    expect(cmds.lint).toBe('golangci-lint run');
  });

  it('Rust uses cargo test', async () => {
    await touch('Cargo.toml', '[package]\nname="x"\n');
    const cmds = getDefaultCommands('rust', projectDir);
    expect(cmds.test).toBe('cargo test');
    expect(cmds.lint).toBe('cargo clippy');
  });

  it('Java with maven uses mvn test', async () => {
    await touch('pom.xml', '<project></project>');
    const cmds = getDefaultCommands('java', projectDir);
    expect(cmds.test).toBe('mvn test');
    expect(cmds.build).toBe('mvn package');
  });

  it('Java with gradle uses gradle test', async () => {
    await touch('build.gradle', 'plugins { id "java" }\n');
    const cmds = getDefaultCommands('java', projectDir);
    expect(cmds.test).toBe('gradle test');
    expect(cmds.build).toBe('gradle build');
  });

  it('Ruby uses bundle exec rspec', async () => {
    await touch('Gemfile', 'source "https://rubygems.org"\n');
    const cmds = getDefaultCommands('ruby', projectDir);
    expect(cmds.test).toBe('bundle exec rspec');
  });

  it('PHP uses composer scripts', async () => {
    await touch('composer.json', '{"name":"a/b"}');
    const cmds = getDefaultCommands('php', projectDir);
    expect(cmds.test).toBe('composer run-script test');
  });

  it('.NET uses dotnet test', async () => {
    await touch('App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    const cmds = getDefaultCommands('csharp', projectDir);
    expect(cmds.test).toBe('dotnet test');
  });

  it('Scala with sbt uses sbt test', async () => {
    await touch('build.sbt', 'name := "x"\n');
    const cmds = getDefaultCommands('scala', projectDir);
    expect(cmds.test).toBe('sbt test');
  });

  it('Elixir uses mix test', async () => {
    await touch('mix.exs', 'defmodule X.MixProject do\nend\n');
    const cmds = getDefaultCommands('elixir', projectDir);
    expect(cmds.test).toBe('mix test');
  });

  it('unknown language returns COMMAND_DEFAULTS verbatim', () => {
    const cmds = getDefaultCommands('cobol', projectDir);
    // Falls back to typescript defaults
    expect(cmds).toBeDefined();
    expect(cmds.test).toBeDefined();
  });

  it('honours an explicit tool override', () => {
    const cmds = getDefaultCommands('typescript', undefined, 'bun');
    expect(cmds.test).toBe('bun test');
  });
});

// ============================================================================
// Back-compat shims (deprecated names)
// ============================================================================

describe('back-compat shims — extractPackageCommands + detectPackageManager', () => {
  it('extractPackageCommands defaults to typescript and renders pnpm', async () => {
    await touch(
      'package.json',
      JSON.stringify({
        packageManager: 'pnpm@10',
        scripts: { lint: 'eslint .' },
      }),
    );
    expect(extractPackageCommands(projectDir).lint).toBe('pnpm run lint');
  });

  it('detectPackageManager returns one of npm/pnpm/yarn/bun (legacy callers)', async () => {
    await touch('package.json', JSON.stringify({ packageManager: 'pnpm@10' }));
    expect(detectPackageManager(projectDir)).toBe('pnpm');
  });

  it('detectPackageManager falls back to npm on missing signal (legacy)', () => {
    expect(detectPackageManager(projectDir)).toBe('npm');
  });
});
