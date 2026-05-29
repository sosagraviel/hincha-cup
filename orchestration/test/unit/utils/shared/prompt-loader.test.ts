import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXTRA_IGNORE_PATHS_FILENAME,
  STANDARD_IGNORE_DIRS,
  getExcludedDirectories,
  isPathExcluded,
  readExtraIgnorePaths,
} from '../../../../src/utils/shared/prompt-loader.js';

describe('prompt-loader extra-ignore-paths bridge', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'prompt-loader-test-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeBridge(tempDirName: string, paths: string[]): void {
    const dir = join(projectDir, tempDirName, 'initialize-project');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, EXTRA_IGNORE_PATHS_FILENAME), JSON.stringify({ paths }), 'utf-8');
  }

  it('returns [] when no bridge file exists', () => {
    expect(readExtraIgnorePaths(projectDir)).toEqual([]);
  });

  it('reads paths from the Claude provider temp dir', () => {
    writeBridge('.claude-temp', ['test/integration', 'website/build']);
    expect(readExtraIgnorePaths(projectDir)).toEqual(['test/integration', 'website/build']);
  });

  it('reads paths from the Codex provider temp dir when Claude temp is absent', () => {
    writeBridge('.codex-temp', ['fixtures/big-corpus']);
    expect(readExtraIgnorePaths(projectDir)).toEqual(['fixtures/big-corpus']);
  });

  it('returns [] when the bridge file is malformed JSON', () => {
    const dir = join(projectDir, '.claude-temp', 'initialize-project');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, EXTRA_IGNORE_PATHS_FILENAME), '{ not json', 'utf-8');
    expect(readExtraIgnorePaths(projectDir)).toEqual([]);
  });

  it('returns [] when paths is not an array', () => {
    writeBridge('.claude-temp', []);
    const dir = join(projectDir, '.claude-temp', 'initialize-project');
    writeFileSync(join(dir, EXTRA_IGNORE_PATHS_FILENAME), '{"paths":"oops"}', 'utf-8');
    expect(readExtraIgnorePaths(projectDir)).toEqual([]);
  });

  it('drops non-string entries, trims, and deduplicates', () => {
    const dir = join(projectDir, '.claude-temp', 'initialize-project');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, EXTRA_IGNORE_PATHS_FILENAME),
      JSON.stringify({ paths: ['/foo/', 'foo', 42, 'bar//baz/', 'bar/baz'] }),
      'utf-8',
    );
    expect(readExtraIgnorePaths(projectDir)).toEqual(['foo', 'bar//baz', 'bar/baz']);
  });

  it('getExcludedDirectories merges extras with the standard list', () => {
    writeBridge('.claude-temp', ['custom/excluded-path']);
    const result = getExcludedDirectories(projectDir);
    expect(result).toContain('custom/excluded-path');
    for (const d of STANDARD_IGNORE_DIRS) {
      expect(result).toContain(d);
    }
  });

  it('getExcludedDirectories does not duplicate when extras already appear in STANDARD_IGNORE_DIRS', () => {
    writeBridge('.claude-temp', ['node_modules', 'unique-extra']);
    const result = getExcludedDirectories(projectDir);
    expect(result.filter((d) => d === 'node_modules').length).toBe(1);
    expect(result).toContain('unique-extra');
  });
});

describe('isPathExcluded', () => {
  const excluded = [
    'node_modules',
    '.git',
    'dist',
    'orchestration/test/integration/initialize-project',
  ];

  it('matches a single-segment entry anywhere in the path', () => {
    expect(isPathExcluded('node_modules', excluded)).toBe(true);
    expect(isPathExcluded('node_modules/foo', excluded)).toBe(true);
    expect(isPathExcluded('packages/a/node_modules/lib/index.js', excluded)).toBe(true);
    expect(isPathExcluded('src/.git/objects', excluded)).toBe(true);
  });

  it('matches a multi-segment entry only when project-root-anchored', () => {
    expect(isPathExcluded('orchestration/test/integration/initialize-project', excluded)).toBe(
      true,
    );
    expect(
      isPathExcluded(
        'orchestration/test/integration/initialize-project/projects/mini-monorepo/package.json',
        excluded,
      ),
    ).toBe(true);
  });

  it('does not match a multi-segment entry at a deeper anchor point', () => {
    expect(
      isPathExcluded('foo/orchestration/test/integration/initialize-project/file.ts', excluded),
    ).toBe(false);
  });

  it('does not match an unrelated subpath that shares a leading segment', () => {
    expect(isPathExcluded('orchestration/src/cli/initialize.ts', excluded)).toBe(false);
    expect(isPathExcluded('orchestration/test/unit/foo.test.ts', excluded)).toBe(false);
  });

  it('tolerates leading "./", trailing "/", and backslashes', () => {
    expect(isPathExcluded('./orchestration/test/integration/initialize-project/', excluded)).toBe(
      true,
    );
    expect(
      isPathExcluded('orchestration\\test\\integration\\initialize-project\\file.ts', excluded),
    ).toBe(true);
  });

  it('returns false for empty / root-equivalent paths', () => {
    expect(isPathExcluded('', excluded)).toBe(false);
    expect(isPathExcluded('.', excluded)).toBe(false);
  });

  it('returns false when the excluded list is empty', () => {
    expect(isPathExcluded('node_modules/foo', [])).toBe(false);
  });
});
