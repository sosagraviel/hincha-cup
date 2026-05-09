/**
 * Plan v3 §A — project-inspection unit tests.
 *
 * Exercises the inspector against a set of synthetic projects that
 * cover the major language families and project shapes:
 *   - TS pnpm monorepo (package.json + pnpm-workspace.yaml + lock file)
 *   - Python single service (pyproject.toml + .python-version)
 *   - Go single service (go.mod + go.sum)
 *   - PHP single service (composer.json + composer.lock)
 *   - Mixed-stack legacy (PHP + Bash + Python script tools)
 *   - CLI-only (no manifest at root, just a script + .env.example)
 *   - Library-only (rust workspace)
 *   - Empty repo (no manifests, no anything)
 *
 * Each shape is built in a tmpdir and the inspector's output is
 * asserted shape-only (no language-specific signal in the assertions
 * beyond the inspector's own outputs).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectProject } from '../../../../../src/services/framework/project-inspection/index.js';
import { ProjectInspectionSchema } from '../../../../../src/schemas/project-inspection.schema.js';

const STANDARD_EXCLUDES = ['node_modules', 'dist', 'build', '.git', '__pycache__', 'target'];

let projectPath: string;

function write(relativePath: string, contents: string): void {
  const abs = join(projectPath, relativePath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, contents);
}

beforeEach(() => {
  projectPath = mkdtempSync(join(tmpdir(), 'project-inspection-'));
});

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true });
});

describe('inspectProject — TS pnpm monorepo', () => {
  it('detects monorepo + package_manager + workspace_tool', async () => {
    write('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }, null, 2));
    write('pnpm-workspace.yaml', `packages:\n  - 'packages/*'\n`);
    write('pnpm-lock.yaml', '# lockfile contents');
    write('packages/a/package.json', JSON.stringify({ name: 'a' }, null, 2));
    write('packages/b/package.json', JSON.stringify({ name: 'b' }, null, 2));

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.repository_type).toBe('monorepo');
    expect(inspection.monorepo?.package_manager).toBe('pnpm');
    expect(inspection.monorepo?.workspace_tool).toBe('pnpm workspaces');
    expect(inspection.monorepo?.workspace_config).toBe('pnpm-workspace.yaml');
    expect(inspection.lock_files).toHaveLength(1);
    expect(inspection.lock_files[0].manager).toBe('pnpm');
    expect(inspection.manifests).toHaveLength(3); // root + 2 packages
    expect(inspection.manifests.every((m) => m.kind === 'package.json')).toBe(true);
    // Schema validates.
    expect(() => ProjectInspectionSchema.parse(inspection)).not.toThrow();
  });
});

describe('inspectProject — Python single service', () => {
  it('detects pyproject + python version', async () => {
    write('pyproject.toml', `[project]\nname = "myapp"\nrequires-python = ">=3.11"\n`);
    write('.python-version', '3.11.5\n');
    write('poetry.lock', '');

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.repository_type).toBe('single-service');
    expect(inspection.runtime_versions.python).toBe('3.11.5');
    expect(inspection.lock_files[0]?.manager).toBe('poetry');
    expect(inspection.manifests[0]?.kind).toBe('pyproject.toml');
  });
});

describe('inspectProject — Go single service', () => {
  it('extracts go runtime version from go.mod', async () => {
    write('go.mod', `module example.com/app\n\ngo 1.21\n`);
    write('go.sum', '');
    write('main.go', 'package main\n\nfunc main() {}\n');

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.repository_type).toBe('single-service');
    expect(inspection.runtime_versions.go).toBe('1.21');
    expect(inspection.lock_files[0]?.manager).toBe('go-modules');
  });
});

describe('inspectProject — PHP / composer', () => {
  it('detects composer manager and php version', async () => {
    write(
      'composer.json',
      JSON.stringify({ name: 'vendor/pkg', require: { php: '^8.2' } }, null, 2),
    );
    write('composer.lock', '{}');

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.runtime_versions.php).toBe('^8.2');
    expect(inspection.lock_files[0]?.manager).toBe('composer');
  });
});

describe('inspectProject — Rust workspace', () => {
  it('detects cargo workspace', async () => {
    write('Cargo.toml', `[workspace]\nmembers = ["crates/a", "crates/b"]\n`);
    write('Cargo.lock', '');
    write('crates/a/Cargo.toml', `[package]\nname = "a"\n`);
    write('crates/b/Cargo.toml', `[package]\nname = "b"\n`);

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.repository_type).toBe('monorepo');
    expect(inspection.monorepo?.package_manager).toBe('cargo');
    expect(inspection.monorepo?.workspace_tool).toBe('cargo workspaces');
  });
});

describe('inspectProject — empty repo', () => {
  it('produces a valid inspection with all-optional fields absent', async () => {
    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.repository_type).toBe('unknown');
    expect(inspection.manifests).toHaveLength(0);
    expect(inspection.lock_files).toHaveLength(0);
    expect(Object.keys(inspection.runtime_versions)).toHaveLength(0);
    expect(inspection.infrastructure).toHaveLength(0);
    expect(inspection.ci_cd).toBeUndefined();
    expect(inspection.environment).toBeUndefined();
    expect(inspection.documentation).toBeUndefined();
    expect(inspection.monorepo).toBeUndefined();
    // Empty inspection STILL passes schema validation.
    expect(() => ProjectInspectionSchema.parse(inspection)).not.toThrow();
  });
});

describe('inspectProject — CI/CD detection', () => {
  it('detects GitHub Actions', async () => {
    write('.github/workflows/ci.yml', 'name: CI\non: push\n');
    write('package.json', JSON.stringify({ name: 'app' }, null, 2));

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.ci_cd?.provider).toBe('GitHub Actions');
    expect(inspection.ci_cd?.config_files).toContain('.github/workflows/ci.yml');
  });

  it('detects GitLab CI', async () => {
    write('.gitlab-ci.yml', 'stages:\n  - test\n');
    write('package.json', JSON.stringify({ name: 'app' }, null, 2));

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.ci_cd?.provider).toBe('GitLab CI');
  });
});

describe('inspectProject — infrastructure detection', () => {
  it('finds docker + docker-compose + terraform when present', async () => {
    write('Dockerfile', 'FROM node:22\n');
    write('docker-compose.yml', 'services:\n  app:\n    image: x\n');
    write('infra/main.tf', 'provider "aws" {}\n');

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.infrastructure).toContain('docker');
    expect(inspection.infrastructure).toContain('docker-compose');
    expect(inspection.infrastructure).toContain('terraform');
  });
});

describe('inspectProject — env templates', () => {
  it('extracts variable names without values', async () => {
    write(
      '.env.example',
      `# comment\nDATABASE_URL=postgres://localhost:5432/db\nAPI_KEY=changeme\nPORT=3000\n`,
    );

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.environment?.required_vars).toEqual(['API_KEY', 'DATABASE_URL', 'PORT']);
    expect(inspection.environment?.template_files).toContain('.env.example');
    // PORT extracted into port_candidates as well.
    expect(inspection.port_candidates['.']).toContain(3000);
  });
});

describe('inspectProject — exotic stacks (Crystal / Gleam / Haskell)', () => {
  it('handles unknown-language fallthrough', async () => {
    write('shard.yml', `name: app\nversion: 0.1.0\n`);
    write('shard.lock', '');
    write('gleam.toml', `name = "myapp"\n`);
    write('gleam.lock', '');

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    // Both shard.yml and gleam.toml are recognised as manifests.
    const manifestKinds = inspection.manifests.map((m) => m.kind).sort();
    expect(manifestKinds).toContain('shard.yml');
    expect(manifestKinds).toContain('gleam.toml');
    // Both lock files are recognised.
    const lockManagers = inspection.lock_files.map((l) => l.manager).sort();
    expect(lockManagers).toContain('shards');
    expect(lockManagers).toContain('gleam');
  });
});

describe('inspectProject — JSON manifest content surfaced verbatim', () => {
  it('preserves the project-defined keys without normalization', async () => {
    const exotic = {
      name: 'app',
      // intentionally exotic, project-specific keys
      myCustomConfig: { someKey: ['a', 'b'] },
      snake_case_field: 42,
    };
    write('package.json', JSON.stringify(exotic, null, 2));

    const { inspection } = await inspectProject({
      projectPath,
      excludedDirs: STANDARD_EXCLUDES,
    });

    expect(inspection.manifests[0]?.kind).toBe('package.json');
    expect(inspection.manifests[0]?.raw).toEqual(exotic);
  });
});

describe('inspectProject — never throws', () => {
  it('returns a valid (mostly empty) inspection on a non-existent project path', async () => {
    const { inspection } = await inspectProject({
      projectPath: join(tmpdir(), 'definitely-does-not-exist-' + Date.now()),
      excludedDirs: STANDARD_EXCLUDES,
    });
    // Even on a missing path, schema validates and shape is sane.
    expect(() => ProjectInspectionSchema.parse(inspection)).not.toThrow();
    expect(inspection.repository_type).toBe('unknown');
  });
});
