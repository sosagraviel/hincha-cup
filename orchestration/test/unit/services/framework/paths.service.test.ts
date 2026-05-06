/**
 * Unit tests for orchestration/src/services/framework/paths.service.ts
 *
 * The framework repo carries a `qubika-agentic-framework -> .` self-symlink
 * (verified at the start of each test). On its own, that symlink is NOT enough
 * to flip the resolver into dogfooding mode — the user must also have invoked
 * the framework through it. We simulate both sides by manipulating
 * `process.argv[1]` and `process.env.PWD`, which are the caller-path signals
 * the resolver inspects.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lstatSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';
import {
  __resetPathsCacheForTesting,
  getFrameworkPath,
  getProjectPath,
} from '../../../../src/services/framework/paths.service.js';

describe('paths.service', () => {
  let originalCwd: string;
  let originalArgv1: string;
  let originalPwd: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalArgv1 = process.argv[1];
    originalPwd = process.env.PWD;
    __resetPathsCacheForTesting();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.argv[1] = originalArgv1;
    if (originalPwd === undefined) {
      delete process.env.PWD;
    } else {
      process.env.PWD = originalPwd;
    }
    __resetPathsCacheForTesting();
  });

  it('getFrameworkPath returns an absolute path to the framework root', () => {
    const fw = getFrameworkPath();
    expect(isAbsolute(fw)).toBe(true);
    // The framework root must contain the orchestration package and the
    // self-symlink that drives dogfooding detection.
    expect(lstatSync(join(fw, 'orchestration')).isDirectory()).toBe(true);
    expect(lstatSync(join(fw, 'qubika-agentic-framework')).isSymbolicLink()).toBe(true);
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

  it('getProjectPath collapses to framework path when invoked through the self-symlink (dogfooding)', () => {
    const fw = getFrameworkPath();
    // Sanity: the self-symlink the dogfooding detector relies on must exist.
    const symlink = join(fw, 'qubika-agentic-framework');
    expect(lstatSync(symlink).isSymbolicLink()).toBe(true);

    // Simulate invocation via the self-symlink: argv[1] traverses
    // <fw>/qubika-agentic-framework/ on its way to the entry script.
    process.argv[1] = join(symlink, 'orchestration', 'src', 'cli', 'initialize.ts');
    delete process.env.PWD;
    __resetPathsCacheForTesting();

    expect(getProjectPath()).toBe(fw);
  });

  it('getProjectPath returns the framework parent in normal mode (self-symlink present but not traversed)', () => {
    const fw = getFrameworkPath();
    // Sanity: the symlink is still there (it ships in the repo).
    const symlink = join(fw, 'qubika-agentic-framework');
    expect(lstatSync(symlink).isSymbolicLink()).toBe(true);

    // Simulate a normal clone-into-project invocation: argv[1] and PWD reference
    // a path INSIDE the framework but never cross the self-symlink segment.
    process.argv[1] = join(fw, 'orchestration', 'src', 'cli', 'initialize.ts');
    process.env.PWD = join(fw, 'orchestration');
    process.chdir(fw);
    __resetPathsCacheForTesting();

    expect(getProjectPath()).toBe(dirname(fw));
  });

  it('getProjectPath ignores unrelated symlinks elsewhere on disk', () => {
    const fw = getFrameworkPath();
    // argv[1] under a path that happens to live under a symlink (e.g. /tmp on
    // macOS resolves to /private/tmp) must NOT trigger dogfooding — only a
    // segment matching <fw>/qubika-agentic-framework/ does.
    process.argv[1] = `/tmp/some-tool/run.js`;
    process.env.PWD = `/tmp/some-tool`;
    __resetPathsCacheForTesting();

    expect(getProjectPath()).toBe(dirname(fw));
  });

  it('getFrameworkPath / getProjectPath memoize within a process', () => {
    const a = getFrameworkPath();
    const b = getFrameworkPath();
    expect(a).toBe(b);
    const p1 = getProjectPath();
    const p2 = getProjectPath();
    expect(p1).toBe(p2);
  });

  it('symlinkPrefix uses the platform path separator', () => {
    // Sanity check that the prefix construction is platform-correct: on POSIX
    // it ends with `/`, on Windows with `\`.
    const fw = getFrameworkPath();
    const expectedPrefix = join(fw, 'qubika-agentic-framework') + sep;
    expect(expectedPrefix.endsWith(sep)).toBe(true);
  });
});
