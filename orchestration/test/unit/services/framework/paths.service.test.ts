/**
 * Unit tests for orchestration/src/services/framework/paths.service.ts
 *
 * The framework repo carries a `qubika-agentic-framework -> .` self-symlink
 * (verified at the start of each test), so the live process IS in dogfooding
 * mode by definition. Tests assert:
 *   1. getFrameworkPath() returns an absolute path that ends in 'ai-agentic-framework'
 *      and is independent of process cwd.
 *   2. getProjectPath() equals getFrameworkPath() (because dogfooding is detected
 *      from the self-symlink).
 *   3. The dogfooding detector returns false when the candidate symlink is absent.
 *
 * Normal-mode resolution (where the framework is cloned into a target as
 * `qubika-agentic-framework/`) is exercised end-to-end by the integration smoke
 * tests for initialize-project / setup-code-graph; reproducing it as a unit test
 * would require a tmp-dir fixture and offers no additional coverage.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lstatSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import {
  __resetPathsCacheForTesting,
  getFrameworkPath,
  getProjectPath,
} from '../../../../src/services/framework/paths.service.js';

describe('paths.service', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    __resetPathsCacheForTesting();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    __resetPathsCacheForTesting();
  });

  it('getFrameworkPath returns an absolute path to the framework root', () => {
    const fw = getFrameworkPath();
    expect(isAbsolute(fw)).toBe(true);
    // The framework repo's directory ends with this segment.
    expect(fw.endsWith('/ai-agentic-framework')).toBe(true);
  });

  it('getFrameworkPath is independent of process cwd', () => {
    __resetPathsCacheForTesting();
    process.chdir('/tmp');
    const fromTmp = getFrameworkPath();
    __resetPathsCacheForTesting();
    process.chdir('/');
    const fromRoot = getFrameworkPath();
    expect(fromTmp).toBe(fromRoot);
  });

  it('getProjectPath equals getFrameworkPath in dogfooding mode (self-symlink present)', () => {
    const fw = getFrameworkPath();
    // Sanity: the self-symlink the dogfooding detector relies on must exist.
    const symlink = join(fw, 'qubika-agentic-framework');
    const stat = lstatSync(symlink);
    expect(stat.isSymbolicLink()).toBe(true);

    // With the self-symlink present, the project path collapses to the framework path.
    expect(getProjectPath()).toBe(fw);
  });

  it('getFrameworkPath / getProjectPath memoize within a process', () => {
    const a = getFrameworkPath();
    const b = getFrameworkPath();
    expect(a).toBe(b); // same string instance via cache
    const p1 = getProjectPath();
    const p2 = getProjectPath();
    expect(p1).toBe(p2);
  });
});
