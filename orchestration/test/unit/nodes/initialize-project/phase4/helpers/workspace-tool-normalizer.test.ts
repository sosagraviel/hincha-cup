/**
 * Plan §C 1.2 (gira-exhaustive followup, 2026-05-05) — normaliser
 * tests for the stack-agnostic `workspace_tool` and `package_manager`
 * fields. Every supported language family is covered.
 */
import { describe, expect, it } from 'vitest';
import {
  normalisePackageManager,
  normaliseWorkspaceTool,
} from '../../../../../../src/nodes/initialize-project/phase4/helpers/workspace-tool-normalizer.js';

describe('normaliseWorkspaceTool — JS/TS package-manager workspaces', () => {
  it('Corepack version pins — pnpm@10.2.1 → "pnpm workspaces"', () => {
    expect(normaliseWorkspaceTool('pnpm@10.2.1')).toBe('pnpm workspaces');
  });

  it('Corepack version pins — yarn@4.0.0 → "yarn workspaces"', () => {
    expect(normaliseWorkspaceTool('yarn@4.0.0')).toBe('yarn workspaces');
  });

  it('Corepack version pins — bun@1.0.0 → "bun workspaces"', () => {
    expect(normaliseWorkspaceTool('bun@1.0.0')).toBe('bun workspaces');
  });

  it('bare manager names map to <name> workspaces', () => {
    expect(normaliseWorkspaceTool('pnpm')).toBe('pnpm workspaces');
    expect(normaliseWorkspaceTool('yarn')).toBe('yarn workspaces');
    expect(normaliseWorkspaceTool('npm')).toBe('npm workspaces');
    expect(normaliseWorkspaceTool('bun')).toBe('bun workspaces');
  });

  it('idempotent on canonical inputs', () => {
    expect(normaliseWorkspaceTool('pnpm workspaces')).toBe('pnpm workspaces');
    expect(normaliseWorkspaceTool('yarn workspaces')).toBe('yarn workspaces');
  });
});

describe('normaliseWorkspaceTool — JS/TS workspace orchestrators', () => {
  it.each([
    ['nx', 'Nx'],
    ['Nx', 'Nx'],
    ['nx workspace', 'Nx'],
    ['turbo', 'Turborepo'],
    ['turborepo', 'Turborepo'],
    ['Turborepo', 'Turborepo'],
    ['lerna', 'Lerna'],
    ['Lerna', 'Lerna'],
    ['rush', 'Rush'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseWorkspaceTool(input)).toBe(expected);
  });
});

describe('normaliseWorkspaceTool — Python', () => {
  it('uv workspaces — multiple shapes', () => {
    expect(normaliseWorkspaceTool('uv workspaces')).toBe('uv workspaces');
    expect(normaliseWorkspaceTool('[tool.uv.workspace]')).toBe('uv workspaces');
  });

  it('Poetry monorepo — multiple shapes', () => {
    expect(normaliseWorkspaceTool('poetry monorepo')).toBe('Poetry monorepo');
    expect(normaliseWorkspaceTool('Poetry monorepo')).toBe('Poetry monorepo');
    expect(normaliseWorkspaceTool('poetry workspaces')).toBe('Poetry monorepo');
  });

  it('PDM workspaces', () => {
    expect(normaliseWorkspaceTool('pdm')).toBe('PDM workspaces');
    expect(normaliseWorkspaceTool('pdm workspaces')).toBe('PDM workspaces');
  });

  it('Hatch workspaces', () => {
    expect(normaliseWorkspaceTool('hatch workspaces')).toBe('Hatch workspaces');
  });
});

describe('normaliseWorkspaceTool — Ruby / PHP', () => {
  it('Bundler engines (Ruby)', () => {
    expect(normaliseWorkspaceTool('bundler engines')).toBe('Bundler engines');
    expect(normaliseWorkspaceTool('Bundler engines')).toBe('Bundler engines');
    expect(normaliseWorkspaceTool('bundler')).toBe('Bundler engines');
  });

  it('composer path repos (PHP)', () => {
    expect(normaliseWorkspaceTool('composer path repos')).toBe('composer path repos');
    expect(normaliseWorkspaceTool('composer monorepo')).toBe('composer path repos');
    expect(normaliseWorkspaceTool('composer workspaces')).toBe('composer path repos');
  });
});

describe('normaliseWorkspaceTool — Java / Kotlin', () => {
  it('Maven multi-module — multiple shapes', () => {
    expect(normaliseWorkspaceTool('maven')).toBe('Maven multi-module');
    expect(normaliseWorkspaceTool('maven multi-module')).toBe('Maven multi-module');
    expect(normaliseWorkspaceTool('maven multimodule')).toBe('Maven multi-module');
    expect(normaliseWorkspaceTool('Maven multi-module')).toBe('Maven multi-module');
    expect(normaliseWorkspaceTool('<modules>')).toBe('Maven multi-module');
  });

  it('Gradle composite — multiple shapes', () => {
    expect(normaliseWorkspaceTool('gradle')).toBe('Gradle composite');
    expect(normaliseWorkspaceTool('gradle composite')).toBe('Gradle composite');
    expect(normaliseWorkspaceTool('Gradle composite')).toBe('Gradle composite');
    expect(normaliseWorkspaceTool('settings.gradle')).toBe('Gradle composite');
  });
});

describe('normaliseWorkspaceTool — Go / Rust / .NET', () => {
  it('go workspaces — multiple shapes', () => {
    expect(normaliseWorkspaceTool('go')).toBe('go workspaces');
    expect(normaliseWorkspaceTool('go work')).toBe('go workspaces');
    expect(normaliseWorkspaceTool('go workspaces')).toBe('go workspaces');
    expect(normaliseWorkspaceTool('go.work')).toBe('go workspaces');
  });

  it('Cargo workspaces — multiple shapes', () => {
    expect(normaliseWorkspaceTool('cargo')).toBe('Cargo workspaces');
    expect(normaliseWorkspaceTool('cargo workspaces')).toBe('Cargo workspaces');
    expect(normaliseWorkspaceTool('Cargo workspaces')).toBe('Cargo workspaces');
    expect(normaliseWorkspaceTool('[workspace]')).toBe('Cargo workspaces');
  });

  it('dotnet sln — multiple shapes', () => {
    expect(normaliseWorkspaceTool('dotnet')).toBe('dotnet sln');
    expect(normaliseWorkspaceTool('dotnet sln')).toBe('dotnet sln');
    expect(normaliseWorkspaceTool('solution')).toBe('dotnet sln');
    expect(normaliseWorkspaceTool('*.sln')).toBe('dotnet sln');
  });
});

describe('normaliseWorkspaceTool — Scala / Mill / Elixir', () => {
  it('sbt multi-project — multiple shapes', () => {
    expect(normaliseWorkspaceTool('sbt')).toBe('sbt multi-project');
    expect(normaliseWorkspaceTool('sbt multi-project')).toBe('sbt multi-project');
    expect(normaliseWorkspaceTool('sbt subprojects')).toBe('sbt multi-project');
  });

  it('Mill', () => {
    expect(normaliseWorkspaceTool('mill')).toBe('Mill');
  });

  it('Elixir umbrella', () => {
    expect(normaliseWorkspaceTool('mix')).toBe('Elixir umbrella');
    expect(normaliseWorkspaceTool('umbrella')).toBe('Elixir umbrella');
    expect(normaliseWorkspaceTool('umbrella project')).toBe('Elixir umbrella');
  });
});

describe('normaliseWorkspaceTool — polyglot orchestrators', () => {
  it.each([
    ['bazel', 'Bazel'],
    ['Bazel', 'Bazel'],
    ['pants', 'Pants'],
    ['pants.build', 'Pants'],
    ['please', 'Please'],
    ['please.build', 'Please'],
    ['buck', 'Buck'],
    ['buck2', 'Buck'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseWorkspaceTool(input)).toBe(expected);
  });
});

describe('normaliseWorkspaceTool — robustness', () => {
  it('returns undefined for empty / null / whitespace', () => {
    expect(normaliseWorkspaceTool(undefined)).toBeUndefined();
    expect(normaliseWorkspaceTool('')).toBeUndefined();
    expect(normaliseWorkspaceTool('  ')).toBeUndefined();
  });

  it('returns undefined for unrecognised inputs (never propagate junk)', () => {
    expect(normaliseWorkspaceTool('mystery-tool@1.0')).toBeUndefined();
    expect(normaliseWorkspaceTool('totally-made-up')).toBeUndefined();
  });

  it('case-insensitive matching across the matrix', () => {
    expect(normaliseWorkspaceTool('PNPM')).toBe('pnpm workspaces');
    expect(normaliseWorkspaceTool('GRADLE')).toBe('Gradle composite');
    expect(normaliseWorkspaceTool('CARGO')).toBe('Cargo workspaces');
  });

  it('the gira regression: pnpm@10.2.1 produces canonical "pnpm workspaces"', () => {
    expect(normaliseWorkspaceTool('pnpm@10.2.1')).toBe('pnpm workspaces');
  });
});

describe('normalisePackageManager — strip Corepack-style version', () => {
  it.each([
    ['pnpm@10.2.1', 'pnpm'],
    ['yarn@4.0.0', 'yarn'],
    ['bun@1.0.0', 'bun'],
    ['npm@10.0.0', 'npm'],
  ])('%s → %s', (input, expected) => {
    expect(normalisePackageManager(input)).toBe(expected);
  });

  it('Python managers', () => {
    expect(normalisePackageManager('poetry')).toBe('poetry');
    expect(normalisePackageManager('uv')).toBe('uv');
    expect(normalisePackageManager('pipenv')).toBe('pipenv');
    expect(normalisePackageManager('hatch')).toBe('hatch');
    expect(normalisePackageManager('pip')).toBe('pip');
    expect(normalisePackageManager('pdm')).toBe('pdm');
  });

  it('Ruby / PHP / Java', () => {
    expect(normalisePackageManager('bundler')).toBe('bundler');
    expect(normalisePackageManager('bundle')).toBe('bundler');
    expect(normalisePackageManager('composer')).toBe('composer');
    expect(normalisePackageManager('maven')).toBe('maven');
    expect(normalisePackageManager('mvn')).toBe('maven');
    expect(normalisePackageManager('gradle')).toBe('gradle');
  });

  it('Go / Rust / .NET / Scala / Elixir', () => {
    expect(normalisePackageManager('go')).toBe('go modules');
    expect(normalisePackageManager('cargo')).toBe('cargo');
    expect(normalisePackageManager('dotnet')).toBe('dotnet');
    expect(normalisePackageManager('sbt')).toBe('sbt');
    expect(normalisePackageManager('mill')).toBe('mill');
    expect(normalisePackageManager('mix')).toBe('mix');
    expect(normalisePackageManager('rebar3')).toBe('rebar3');
  });

  it('returns undefined for empty / null / whitespace', () => {
    expect(normalisePackageManager(undefined)).toBeUndefined();
    expect(normalisePackageManager('')).toBeUndefined();
  });

  it('returns undefined for workspace-tool strings (caller passed wrong field)', () => {
    expect(normalisePackageManager('pnpm workspaces')).toBeUndefined();
    expect(normalisePackageManager('Maven multi-module')).toBeUndefined();
    expect(normalisePackageManager('Cargo workspaces')).toBeUndefined();
    expect(normalisePackageManager('Elixir umbrella')).toBeUndefined();
  });

  it('returns undefined for unrecognised inputs', () => {
    expect(normalisePackageManager('mystery-tool')).toBeUndefined();
  });

  it('the gira regression: pnpm@10.2.1 → "pnpm" (no @ in output)', () => {
    const result = normalisePackageManager('pnpm@10.2.1');
    expect(result).toBe('pnpm');
    expect(result).not.toContain('@');
  });

  it('case-insensitive', () => {
    expect(normalisePackageManager('PNPM')).toBe('pnpm');
    expect(normalisePackageManager('Maven')).toBe('maven');
  });
});

describe('integration — typical analyzer outputs across stacks', () => {
  // Each row: (analyzer-emitted raw, expected workspace_tool, expected package_manager)
  const cases: Array<[string, string, string | undefined]> = [
    ['pnpm@10.2.1', 'pnpm workspaces', 'pnpm'],
    ['yarn@4.0.0', 'yarn workspaces', 'yarn'],
    ['npm', 'npm workspaces', 'npm'],
    ['Nx', 'Nx', undefined], // Nx is a tool, not a package manager
    ['Turborepo', 'Turborepo', undefined],
    ['Lerna', 'Lerna', undefined],
    ['Maven multi-module', 'Maven multi-module', undefined],
    ['Gradle composite', 'Gradle composite', undefined],
    ['go workspaces', 'go workspaces', undefined],
    ['Cargo workspaces', 'Cargo workspaces', undefined],
    ['Poetry monorepo', 'Poetry monorepo', undefined],
    ['Bazel', 'Bazel', undefined],
  ];

  it.each(cases)('input "%s" → workspace_tool=%s, package_manager=%s', (raw, ws, pm) => {
    expect(normaliseWorkspaceTool(raw)).toBe(ws);
    expect(normalisePackageManager(raw)).toBe(pm);
  });
});
