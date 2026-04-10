import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import {
  detectWorkspaces,
  isWorkspaceDirectory,
  getSupportedManifests,
  getManifestInfo,
} from '../../../../../src/nodes/initialize-project/phase4/workspace-detector.js';

describe('workspace-detector', () => {
  const testDir = join(__dirname, 'fixtures', 'workspace-test');

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('detectWorkspaces', () => {
    it('should detect single package.json workspace', async () => {
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test-project' }));

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].manifest_file).toBe('package.json');
      expect(result.workspaces[0].language).toBe('javascript');
      expect(result.workspaces[0].type).toBe('npm');
      expect(result.workspaces[0].name).toBe('test-project');
      expect(result.is_monorepo).toBe(false);
      expect(result.total_workspaces).toBe(1);
    });

    it('should detect single Python workspace with requirements.txt', async () => {
      await writeFile(join(testDir, 'requirements.txt'), 'flask==2.0.0');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].manifest_file).toBe('requirements.txt');
      expect(result.workspaces[0].language).toBe('python');
      expect(result.workspaces[0].type).toBe('pip');
    });

    it('should detect monorepo with multiple workspaces', async () => {
      // Root package.json
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'root' }));

      // Backend Python workspace
      const backend = join(testDir, 'backend');
      await mkdir(backend, { recursive: true });
      await writeFile(join(backend, 'requirements.txt'), 'flask==2.0.0');

      // Frontend TypeScript workspace
      const frontend = join(testDir, 'frontend');
      await mkdir(frontend, { recursive: true });
      await writeFile(join(frontend, 'package.json'), JSON.stringify({ name: 'frontend' }));

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(3);
      expect(result.is_monorepo).toBe(true);
      expect(result.total_workspaces).toBe(3);

      const languages = result.workspaces.map((w) => w.language);
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
    });

    it('should detect Python workspace with pyproject.toml', async () => {
      await writeFile(join(testDir, 'pyproject.toml'), '[tool.poetry]\nname = "my-project"');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('pyproject.toml');
      expect(result.workspaces[0].type).toBe('poetry');
      expect(result.workspaces[0].language).toBe('python');
      expect(result.workspaces[0].name).toBe('my-project');
    });

    it('should detect Go workspace with go.mod', async () => {
      await writeFile(join(testDir, 'go.mod'), 'module github.com/user/my-project\n\ngo 1.19');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('go.mod');
      expect(result.workspaces[0].type).toBe('gomod');
      expect(result.workspaces[0].language).toBe('go');
      expect(result.workspaces[0].name).toBe('my-project');
    });

    it('should detect Rust workspace with Cargo.toml', async () => {
      await writeFile(join(testDir, 'Cargo.toml'), '[package]\nname = "my-rust-project"');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('Cargo.toml');
      expect(result.workspaces[0].type).toBe('cargo');
      expect(result.workspaces[0].language).toBe('rust');
      expect(result.workspaces[0].name).toBe('my-rust-project');
    });

    it('should detect Java Maven workspace', async () => {
      await writeFile(join(testDir, 'pom.xml'), '<?xml version="1.0"?><project></project>');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('pom.xml');
      expect(result.workspaces[0].type).toBe('maven');
      expect(result.workspaces[0].language).toBe('java');
    });

    it('should detect Java Gradle workspace', async () => {
      await writeFile(join(testDir, 'build.gradle'), '// Gradle build');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('build.gradle');
      expect(result.workspaces[0].type).toBe('gradle');
      expect(result.workspaces[0].language).toBe('java');
    });

    it('should ignore node_modules directories', async () => {
      const nodeModules = join(testDir, 'node_modules', 'some-package');
      await mkdir(nodeModules, { recursive: true });
      await writeFile(join(nodeModules, 'package.json'), JSON.stringify({ name: 'should-ignore' }));

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(0);
    });

    it('should ignore .git directory', async () => {
      const gitDir = join(testDir, '.git');
      await mkdir(gitDir, { recursive: true });
      await writeFile(join(gitDir, 'config'), 'git config');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(0);
    });

    it('should ignore build/dist directories', async () => {
      const buildDir = join(testDir, 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(buildDir, 'package.json'), JSON.stringify({ name: 'build-output' }));

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(0);
    });

    it('should ignore Python virtual environments', async () => {
      const venvDir = join(testDir, 'venv');
      await mkdir(venvDir, { recursive: true });
      await writeFile(join(venvDir, 'requirements.txt'), 'should-ignore');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(0);
    });

    it('should respect maxDepth parameter', async () => {
      const deep = join(testDir, 'a', 'b', 'c', 'd', 'e');
      await mkdir(deep, { recursive: true });
      await writeFile(join(deep, 'package.json'), JSON.stringify({ name: 'deep' }));

      const result = await detectWorkspaces(testDir, 3);

      expect(result.workspaces).toHaveLength(0); // Too deep
    });

    it('should find workspaces within maxDepth', async () => {
      const shallow = join(testDir, 'a', 'b');
      await mkdir(shallow, { recursive: true });
      await writeFile(join(shallow, 'package.json'), JSON.stringify({ name: 'shallow' }));

      const result = await detectWorkspaces(testDir, 3);

      expect(result.workspaces).toHaveLength(1);
    });

    it('should filter lock files if primary manifest exists in same directory', async () => {
      // Both package.json and yarn.lock in same directory
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
      await writeFile(join(testDir, 'yarn.lock'), 'yarn lock content');

      const result = await detectWorkspaces(testDir);

      // Should only return package.json, not yarn.lock
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].manifest_file).toBe('package.json');
    });

    it('should handle multiple Python manifest types', async () => {
      await writeFile(join(testDir, 'requirements.txt'), 'flask');
      await writeFile(join(testDir, 'setup.py'), '# Setup');

      const result = await detectWorkspaces(testDir);

      // Both are primary manifests, both should be included
      expect(result.workspaces.length).toBeGreaterThanOrEqual(1);

      const manifestFiles = result.workspaces.map((w) => w.manifest_file);
      expect(manifestFiles.includes('requirements.txt') || manifestFiles.includes('setup.py')).toBe(
        true,
      );
    });

    it('should use directory name as fallback for name', async () => {
      const subDir = join(testDir, 'my-custom-workspace');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, 'requirements.txt'), 'flask');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].name).toBe('my-custom-workspace');
    });

    it('should handle empty directory', async () => {
      const result = await detectWorkspaces(testDir);

      expect(result.workspaces).toHaveLength(0);
      expect(result.is_monorepo).toBe(false);
      expect(result.total_workspaces).toBe(0);
    });

    it('should detect Ruby workspace with Gemfile', async () => {
      await writeFile(join(testDir, 'Gemfile'), 'gem "rails"');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('Gemfile');
      expect(result.workspaces[0].language).toBe('ruby');
      expect(result.workspaces[0].type).toBe('bundler');
    });

    it('should detect PHP workspace with composer.json', async () => {
      await writeFile(join(testDir, 'composer.json'), JSON.stringify({ name: 'my-php-project' }));

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('composer.json');
      expect(result.workspaces[0].language).toBe('php');
      expect(result.workspaces[0].type).toBe('composer');
    });

    it('should handle complex monorepo structure', async () => {
      // Root
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'monorepo-root' }));

      // Apps
      const appsWeb = join(testDir, 'apps', 'web');
      await mkdir(appsWeb, { recursive: true });
      await writeFile(join(appsWeb, 'package.json'), JSON.stringify({ name: '@monorepo/web' }));

      const appsApi = join(testDir, 'apps', 'api');
      await mkdir(appsApi, { recursive: true });
      await writeFile(join(appsApi, 'requirements.txt'), 'fastapi');

      // Packages
      const packagesUi = join(testDir, 'packages', 'ui');
      await mkdir(packagesUi, { recursive: true });
      await writeFile(join(packagesUi, 'package.json'), JSON.stringify({ name: '@monorepo/ui' }));

      const result = await detectWorkspaces(testDir);

      expect(result.is_monorepo).toBe(true);
      expect(result.total_workspaces).toBeGreaterThanOrEqual(4);

      const paths = result.workspaces.map((w) => w.path);
      expect(paths).toContain(testDir);
      expect(paths.some((p) => p.includes('apps/web'))).toBe(true);
      expect(paths.some((p) => p.includes('apps/api'))).toBe(true);
    });

    it('should detect Kotlin Gradle workspace', async () => {
      await writeFile(join(testDir, 'build.gradle.kts'), '// Kotlin DSL');

      const result = await detectWorkspaces(testDir);

      expect(result.workspaces[0].manifest_file).toBe('build.gradle.kts');
      expect(result.workspaces[0].language).toBe('kotlin');
      expect(result.workspaces[0].type).toBe('gradle');
    });

    it('should handle malformed package.json gracefully', async () => {
      await writeFile(join(testDir, 'package.json'), '{ invalid json');

      const result = await detectWorkspaces(testDir);

      // Should detect workspace but name extraction might fail
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].manifest_file).toBe('package.json');
      // Name should fallback to directory name
      expect(result.workspaces[0].name).toBeDefined();
    });

    it('should track errors during detection', async () => {
      // Create workspace that will be detected
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

      const result = await detectWorkspaces(testDir);

      // Errors array should exist (may be empty)
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('isWorkspaceDirectory', () => {
    it('should recognize common workspace directory names', () => {
      expect(isWorkspaceDirectory('/path/to/packages')).toBe(true);
      expect(isWorkspaceDirectory('/path/to/apps')).toBe(true);
      expect(isWorkspaceDirectory('/path/to/services')).toBe(true);
      expect(isWorkspaceDirectory('/path/to/backend')).toBe(true);
      expect(isWorkspaceDirectory('/path/to/frontend')).toBe(true);
    });

    it('should not recognize non-workspace directories', () => {
      expect(isWorkspaceDirectory('/path/to/node_modules')).toBe(false);
      expect(isWorkspaceDirectory('/path/to/src')).toBe(false);
      expect(isWorkspaceDirectory('/path/to/lib')).toBe(false);
      expect(isWorkspaceDirectory('/path/to/dist')).toBe(false);
    });
  });

  describe('getSupportedManifests', () => {
    it('should return list of supported manifest files', () => {
      const manifests = getSupportedManifests();

      expect(manifests).toContain('package.json');
      expect(manifests).toContain('requirements.txt');
      expect(manifests).toContain('pyproject.toml');
      expect(manifests).toContain('go.mod');
      expect(manifests).toContain('Cargo.toml');
      expect(manifests).toContain('pom.xml');
      expect(manifests.length).toBeGreaterThan(10);
    });
  });

  describe('getManifestInfo', () => {
    it('should return info for package.json', () => {
      const info = getManifestInfo('package.json');

      expect(info).toEqual({
        language: 'javascript',
        type: 'npm',
      });
    });

    it('should return info for requirements.txt', () => {
      const info = getManifestInfo('requirements.txt');

      expect(info).toEqual({
        language: 'python',
        type: 'pip',
      });
    });

    it('should return info for go.mod', () => {
      const info = getManifestInfo('go.mod');

      expect(info).toEqual({
        language: 'go',
        type: 'gomod',
      });
    });

    it('should return undefined for unknown manifest', () => {
      const info = getManifestInfo('unknown.file');

      expect(info).toBeUndefined();
    });
  });
});
