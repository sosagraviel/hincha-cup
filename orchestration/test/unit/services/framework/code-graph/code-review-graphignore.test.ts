import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CODE_REVIEW_GRAPHIGNORE_FILENAME,
  extractManagedBlock,
  hashExtraIgnorePaths,
  spliceManagedBlock,
  syncCodeReviewGraphIgnore,
} from '../../../../../src/services/framework/code-graph/code-review-graphignore.service.js';

const TEMPLATE = ['.claude', 'node_modules', 'dist', 'build'].join('\n');

describe('hashExtraIgnorePaths', () => {
  it('returns a stable hash regardless of input order', () => {
    const a = hashExtraIgnorePaths(['foo', 'bar', 'baz']);
    const b = hashExtraIgnorePaths(['baz', 'foo', 'bar']);
    expect(a).toBe(b);
  });

  it('changes when an entry changes', () => {
    const a = hashExtraIgnorePaths(['foo', 'bar']);
    const b = hashExtraIgnorePaths(['foo', 'qux']);
    expect(a).not.toBe(b);
  });

  it('produces a deterministic hash for empty input', () => {
    expect(hashExtraIgnorePaths([])).toBe(hashExtraIgnorePaths([]));
  });
});

describe('spliceManagedBlock', () => {
  it('appends a managed block when sentinels are absent', () => {
    const result = spliceManagedBlock(`${TEMPLATE}\n`, ['a/b', 'c']);
    expect(result).toContain(TEMPLATE);
    expect(result).toContain('# === framework: --ignore (managed; do not edit by hand) ===');
    expect(result).toContain('a/b');
    expect(result).toContain('c');
    expect(result).toContain('# === end framework: --ignore ===');
  });

  it('replaces the existing managed block in place', () => {
    const initial = spliceManagedBlock(`${TEMPLATE}\n`, ['old-1', 'old-2']);
    const after = spliceManagedBlock(initial, ['new']);
    expect(after).toContain('new');
    expect(after).not.toContain('old-1');
    expect(after).not.toContain('old-2');
  });

  it('preserves user content outside the managed block', () => {
    const userExtra = 'my-custom-rule';
    const body = `${TEMPLATE}\n${userExtra}\n`;
    const result = spliceManagedBlock(body, ['fixture-path']);
    expect(result).toContain(userExtra);
    expect(result).toContain('fixture-path');
  });

  it('renders an empty managed block when no paths are supplied', () => {
    const result = spliceManagedBlock(`${TEMPLATE}\n`, []);
    expect(result).toContain('# === framework: --ignore (managed; do not edit by hand) ===');
    expect(result).toContain('# === end framework: --ignore ===');
    // No paths between the sentinels.
    expect(extractManagedBlock(result)).toEqual([]);
  });

  it('deduplicates and trims paths', () => {
    const result = spliceManagedBlock('', ['  a  ', 'a', 'b', '  b ']);
    expect(extractManagedBlock(result)).toEqual(['a', 'b']);
  });
});

describe('extractManagedBlock', () => {
  it('returns null when sentinels are absent', () => {
    expect(extractManagedBlock(TEMPLATE)).toBeNull();
  });

  it('returns the paths between sentinels', () => {
    const body = spliceManagedBlock(TEMPLATE, ['foo/bar', 'baz']);
    expect(extractManagedBlock(body)).toEqual(['foo/bar', 'baz']);
  });
});

describe('syncCodeReviewGraphIgnore', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'graphignore-test-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates the file from the template when absent and user passes paths', () => {
    const result = syncCodeReviewGraphIgnore(projectDir, ['orchestration/test/integration'], {
      templateBody: TEMPLATE,
    });

    expect(result.changed).toBe(true);
    const written = readFileSync(join(projectDir, CODE_REVIEW_GRAPHIGNORE_FILENAME), 'utf-8');
    expect(written).toContain('.claude');
    expect(written).toContain('orchestration/test/integration');
  });

  it('does nothing when file is absent and no paths are supplied', () => {
    const result = syncCodeReviewGraphIgnore(projectDir, [], { templateBody: TEMPLATE });
    expect(result.changed).toBe(false);
    expect(existsSync(join(projectDir, CODE_REVIEW_GRAPHIGNORE_FILENAME))).toBe(false);
  });

  it('updates an existing file in place when the managed block changes', () => {
    const target = join(projectDir, CODE_REVIEW_GRAPHIGNORE_FILENAME);
    writeFileSync(target, `${TEMPLATE}\nmy-own-rule\n`, 'utf-8');

    const r1 = syncCodeReviewGraphIgnore(projectDir, ['first']);
    expect(r1.changed).toBe(true);
    const body1 = readFileSync(target, 'utf-8');
    expect(body1).toContain('first');
    expect(body1).toContain('my-own-rule');

    const r2 = syncCodeReviewGraphIgnore(projectDir, ['first', 'second']);
    expect(r2.changed).toBe(true);
    expect(r2.hash).not.toBe(r1.hash);
    const body2 = readFileSync(target, 'utf-8');
    expect(body2).toContain('first');
    expect(body2).toContain('second');
    expect(body2).toContain('my-own-rule');
  });

  it('is idempotent when re-run with the same paths', () => {
    syncCodeReviewGraphIgnore(projectDir, ['stable'], { templateBody: TEMPLATE });
    const r2 = syncCodeReviewGraphIgnore(projectDir, ['stable']);
    expect(r2.changed).toBe(false);
  });

  it('empties the managed block when paths shrink to zero', () => {
    syncCodeReviewGraphIgnore(projectDir, ['will-be-removed'], { templateBody: TEMPLATE });
    const r = syncCodeReviewGraphIgnore(projectDir, []);
    expect(r.changed).toBe(true);
    const body = readFileSync(join(projectDir, CODE_REVIEW_GRAPHIGNORE_FILENAME), 'utf-8');
    expect(body).not.toContain('will-be-removed');
    expect(extractManagedBlock(body)).toEqual([]);
  });
});
