import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
  closeSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execSync, spawn } from 'child_process';

import {
  buildCodeGraph,
  extractionManifestPath,
  loadGraphState,
  resolveCodeGraphCommand,
  resolveCurrentCommit,
  smokeTestCodeGraph,
  validateGraphDb,
  writeExtractionManifest,
} from '../../../../src/services/graph-wiki/code-graph.service.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
  };
});

const CODE_REVIEW_GRAPH_DIRNAME = '.code-review-graph';

function graphStateFilePath(projectPath: string): string {
  return join(projectPath, CODE_REVIEW_GRAPH_DIRNAME, '.state.json');
}

function buildFakeChildProcess(exitCode = 0, stdoutData = '', stderrData = '') {
  const stdoutListeners: Array<(data: Buffer) => void> = [];
  const stderrListeners: Array<(data: Buffer) => void> = [];
  const closeListeners: Array<(code: number) => void> = [];

  const child = {
    stdout: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stdoutListeners.push(cb);
      },
    },
    stderr: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stderrListeners.push(cb);
      },
    },
    on: (event: string, cb: (arg: number) => void) => {
      if (event === 'close') closeListeners.push(cb);
      return child;
    },
    kill: vi.fn(),
  };

  setTimeout(() => {
    if (stdoutData) {
      for (const cb of stdoutListeners) cb(Buffer.from(stdoutData));
    }
    if (stderrData) {
      for (const cb of stderrListeners) cb(Buffer.from(stderrData));
    }
    for (const cb of closeListeners) cb(exitCode);
  }, 0);

  // Use unknown cast since we're providing a minimal subset for testing
  return child as unknown as ReturnType<typeof spawn>;
}

function writeGraphState(
  projectPath: string,
  state: { last_indexed_commit?: string; updated_at?: string; tool_version?: string },
) {
  const dir = join(projectPath, CODE_REVIEW_GRAPH_DIRNAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.state.json'), JSON.stringify(state), 'utf-8');
}

/** Writes a minimal SQLite header (16 magic bytes + padding) to a file path. */
function writeSqliteFile(filePath: string): void {
  const header = Buffer.alloc(100, 0);
  header.write('SQLite format 3\0', 0, 'utf8');
  const fd = openSync(filePath, 'w');
  writeSync(fd, header);
  closeSync(fd);
}

describe('loadGraphState', () => {
  it('returns null when .state.json does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'code-graph-test-'));
    expect(loadGraphState(dir)).toBeNull();
  });

  it('returns parsed state when .state.json exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'code-graph-test-'));
    const state = { last_indexed_commit: 'abc123', updated_at: '2026-01-01T00:00:00Z' };
    writeGraphState(dir, state);
    expect(loadGraphState(dir)).toEqual(state);
  });

  it('returns null when .state.json contains invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'code-graph-test-'));
    const stateDir = join(dir, CODE_REVIEW_GRAPH_DIRNAME);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, '.state.json'), 'not-valid-json', 'utf-8');
    expect(loadGraphState(dir)).toBeNull();
  });
});

describe('resolveCurrentCommit', () => {
  afterEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('returns trimmed SHA when git succeeds', () => {
    vi.mocked(execSync).mockReturnValue('deadbeefdeadbeefdeadbeef\n');
    expect(resolveCurrentCommit('/some/path')).toBe('deadbeefdeadbeefdeadbeef');
  });

  it('returns "unknown" when git fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(resolveCurrentCommit('/some/path')).toBe('unknown');
  });
});

describe('writeExtractionManifest', () => {
  afterEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('writes a valid JSON manifest with required keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
    vi.mocked(execSync).mockReturnValue('code-review-graph 1.2.3\n');

    const stats = { files: 42, languages: ['typescript', 'python'], build_time_ms: 5000 };
    writeExtractionManifest(dir, stats, 'sha256abc');

    const manifestFile = extractionManifestPath(dir);
    expect(existsSync(manifestFile)).toBe(true);

    const parsed = JSON.parse(readFileSync(manifestFile, 'utf-8')) as Record<string, unknown>;
    expect(parsed).toHaveProperty('files_parsed', 42);
    expect(parsed).toHaveProperty('languages');
    expect(parsed).toHaveProperty('tool_version');
    expect(parsed).toHaveProperty('sha', 'sha256abc');
    expect(parsed).toHaveProperty('build_time_ms', 5000);
    expect(parsed).toHaveProperty('created_at');
    expect(typeof parsed.created_at).toBe('string');
  });

  it('uses "unknown" tool_version when code-review-graph --version fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('command not found');
    });

    writeExtractionManifest(dir, { files: 1, languages: ['go'], build_time_ms: 100 }, 'sha');
    const parsed = JSON.parse(readFileSync(extractionManifestPath(dir), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(parsed.tool_version).toBe('unknown');
  });
});

describe('resolveCodeGraphCommand — integration with code-graph.service', () => {
  it('returns wrapper-script via when the mcp wrapper script exists in frameworkPath', () => {
    const frameworkPath = mkdtempSync(join(tmpdir(), 'fw-resolve-test-'));
    const projectPath = mkdtempSync(join(tmpdir(), 'proj-resolve-test-'));
    const scriptsDir = join(frameworkPath, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, 'code-review-graph-mcp.sh'), '#!/bin/bash\n', 'utf-8');

    const result = resolveCodeGraphCommand(projectPath, frameworkPath);
    expect(result.via).toBe('wrapper-script');
    expect(result.command).toContain('code-review-graph-mcp.sh');
  });

  it('returns launcher.json via when launcher.json exists and is valid', () => {
    const frameworkPath = mkdtempSync(join(tmpdir(), 'fw-resolve-test-'));
    const projectPath = mkdtempSync(join(tmpdir(), 'proj-resolve-test-'));
    const codeReviewDir = join(projectPath, '.code-review-graph');
    mkdirSync(codeReviewDir, { recursive: true });
    writeFileSync(
      join(codeReviewDir, 'launcher.json'),
      JSON.stringify({
        version: '1',
        command: 'uvx',
        args: ['code-review-graph'],
        resolved_at: '2026-01-01T00:00:00Z',
      }),
      'utf-8',
    );

    const result = resolveCodeGraphCommand(projectPath, frameworkPath);
    expect(result.via).toBe('launcher.json');
    expect(result.command).toBe('uvx');
  });
});

describe('buildCodeGraph', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'build-cg-test-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'framework-test-'));
    const scriptsDir = join(frameworkPath, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(join(scriptsDir, 'setup-code-graph.sh'), '#!/bin/bash\n', 'utf-8');

    vi.mocked(execSync).mockReturnValue('unknown\n');
    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      if (callStr.includes('--version')) {
        return buildFakeChildProcess(0, '2.2.3.1', '');
      }
      return buildFakeChildProcess(0, '', '');
    });
  });

  afterEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(execSync).mockReset();
  });

  it('runs full build path when no .state.json exists (first run)', async () => {
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    const result = await buildCodeGraph({ projectPath, frameworkPath });

    expect(result.code_graph_available).toBe(true);
    expect(result.code_graph_path).toContain('.code-graph.db');

    const stateFile = graphStateFilePath(projectPath);
    expect(existsSync(stateFile)).toBe(true);
    const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    expect(state).toHaveProperty('last_indexed_commit');
    expect(state).toHaveProperty('updated_at');

    expect(existsSync(extractionManifestPath(projectPath))).toBe(true);
  });

  it('does not run update when HEAD has not changed since last index', async () => {
    const commit = 'a'.repeat(40);
    vi.mocked(execSync).mockReturnValue(`${commit}\n`);

    writeGraphState(projectPath, { last_indexed_commit: commit });
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    const spawnCalls: string[] = [];
    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      spawnCalls.push(callStr);
      if (callStr.includes('--version')) {
        return buildFakeChildProcess(0, '2.2.3.1', '');
      }
      return buildFakeChildProcess(0, '', '');
    });

    await buildCodeGraph({ projectPath, frameworkPath });

    const updateCalled = spawnCalls.some((call) => call.includes('update'));
    expect(updateCalled).toBe(false);
  });

  it('runs update when HEAD has moved since last index', async () => {
    const oldCommit = 'a'.repeat(40);
    const newCommit = 'b'.repeat(40);
    vi.mocked(execSync).mockReturnValue(`${newCommit}\n`);

    writeGraphState(projectPath, { last_indexed_commit: oldCommit });
    writeSqliteFile(join(projectPath, '.code-graph.db'));
    mkdirSync(join(projectPath, CODE_REVIEW_GRAPH_DIRNAME), { recursive: true });
    writeSqliteFile(join(projectPath, CODE_REVIEW_GRAPH_DIRNAME, 'graph.db'));

    const spawnCalls: string[] = [];
    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      spawnCalls.push(callStr);
      if (callStr.includes('--version')) {
        return buildFakeChildProcess(0, '2.2.3.1', '');
      }
      return buildFakeChildProcess(0, '', '');
    });

    await buildCodeGraph({ projectPath, frameworkPath });

    const updateCalled = spawnCalls.some((call) => call.includes('update'));
    expect(updateCalled).toBe(true);
  });

  it('falls back to full build with a warning when update exits non-zero', async () => {
    const oldCommit = 'a'.repeat(40);
    const newCommit = 'b'.repeat(40);
    vi.mocked(execSync).mockReturnValue(`${newCommit}\n`);

    writeGraphState(projectPath, { last_indexed_commit: oldCommit });
    writeSqliteFile(join(projectPath, '.code-graph.db'));
    mkdirSync(join(projectPath, CODE_REVIEW_GRAPH_DIRNAME), { recursive: true });
    writeSqliteFile(join(projectPath, CODE_REVIEW_GRAPH_DIRNAME, 'graph.db'));

    const stderrLines: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((msg: string | Uint8Array) => {
        stderrLines.push(typeof msg === 'string' ? msg : Buffer.from(msg).toString());
        return true;
      });

    const spawnCalls: string[] = [];
    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      spawnCalls.push(callStr);
      if (callStr.includes('update')) {
        return buildFakeChildProcess(1, '', 'update error');
      }
      if (callStr.includes('--version')) {
        return buildFakeChildProcess(0, '2.2.3.1', '');
      }
      return buildFakeChildProcess(0, '', '');
    });

    await buildCodeGraph({ projectPath, frameworkPath });

    stderrSpy.mockRestore();
    process.stderr.write = originalWrite;

    const updateCalled = spawnCalls.some((call) => call.includes('update'));
    expect(updateCalled).toBe(true);

    const fallbackCalled =
      spawnCalls.filter((call) => call.includes('setup-code-graph.sh')).length >= 2;
    expect(fallbackCalled).toBe(true);

    const warnEmitted = stderrLines.some((line) => line.includes('WARNING'));
    expect(warnEmitted).toBe(true);
  });

  it('writes .state.json after successful build', async () => {
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    await buildCodeGraph({ projectPath, frameworkPath });

    const stateFile = graphStateFilePath(projectPath);
    expect(existsSync(stateFile)).toBe(true);

    const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>;
    expect(state).toHaveProperty('last_indexed_commit');
    expect(state).toHaveProperty('updated_at');
    expect(state).toHaveProperty('tool_version');
    expect(/^\d{4}-\d{2}-\d{2}T/.test(String(state.updated_at))).toBe(true);
  });

  it('writes extraction-manifest.json after successful build', async () => {
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    await buildCodeGraph({ projectPath, frameworkPath });

    const manifestFile = extractionManifestPath(projectPath);
    expect(existsSync(manifestFile)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8')) as Record<string, unknown>;
    expect(manifest).toHaveProperty('sha');
    expect(manifest).toHaveProperty('created_at');
    expect(manifest).toHaveProperty('tool_version');
    expect(manifest).toHaveProperty('build_time_ms');
  });

  it('throws when DB fails SQLite validation after setup', async () => {
    writeFileSync(join(projectPath, '.code-graph.db'), 'not-sqlite', 'utf-8');

    await expect(buildCodeGraph({ projectPath, frameworkPath })).rejects.toThrow(
      'Graph DB invalid',
    );
  });

  it('autofixes on first smoke test failure and succeeds on second attempt', async () => {
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    const setupScriptCalls: string[] = [];
    let firstVersionCall = true;
    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      if (callStr.includes('setup-code-graph.sh')) {
        setupScriptCalls.push(callStr);
        return buildFakeChildProcess(0, '', '');
      }
      if (callStr.includes('--version') && firstVersionCall) {
        firstVersionCall = false;
        return buildFakeChildProcess(1, '', 'command not found');
      }
      return buildFakeChildProcess(0, '2.2.3.1', '');
    });

    const result = await buildCodeGraph({ projectPath, frameworkPath });
    expect(result.code_graph_available).toBe(true);
    expect(setupScriptCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('hard-fails with remediation hint when both smoke tests fail', async () => {
    writeSqliteFile(join(projectPath, '.code-graph.db'));

    vi.mocked(spawn).mockImplementation((cmd: string, args: readonly string[]) => {
      const callStr = [cmd, ...args].join(' ');
      if (callStr.includes('--version')) {
        return buildFakeChildProcess(1, '', 'command not found: code-review-graph');
      }
      return buildFakeChildProcess(0, '', '');
    });

    let thrownError: Error | undefined;
    try {
      await buildCodeGraph({ projectPath, frameworkPath });
    } catch (e) {
      thrownError = e instanceof Error ? e : new Error(String(e));
    }

    expect(thrownError).toBeDefined();
    expect(thrownError?.message).toContain(
      'code-review-graph failed verification after autofix attempt',
    );
    expect(thrownError?.message).toContain(
      'https://docs.astral.sh/uv/getting-started/installation/',
    );
  });
});

describe('smokeTestCodeGraph', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'smoke-test-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'smoke-fw-'));
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not on path');
    });
  });

  afterEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(execSync).mockReset();
  });

  it('returns ok=true with version when command outputs a version string', async () => {
    vi.mocked(spawn).mockImplementation(() => buildFakeChildProcess(0, '2.2.3.1', ''));

    const result = await smokeTestCodeGraph(projectPath, frameworkPath);

    expect(result.ok).toBe(true);
    expect(result.version).toBe('2.2.3.1');
  });

  it('returns ok=false with captured stderr on non-zero exit', async () => {
    vi.mocked(spawn).mockImplementation(() =>
      buildFakeChildProcess(1, '', 'command not found: code-review-graph'),
    );

    const result = await smokeTestCodeGraph(projectPath, frameworkPath);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('exit code 1');
  });

  it('returns ok=false when stdout lacks a digit-dot pattern', async () => {
    vi.mocked(spawn).mockImplementation(() => buildFakeChildProcess(0, 'no-version-here', ''));

    const result = await smokeTestCodeGraph(projectPath, frameworkPath);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('version string does not match');
  });
});

describe('validateGraphDb', () => {
  it('returns ok=true for a valid SQLite file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'validate-db-'));
    const dbPath = join(dir, 'test.db');
    writeSqliteFile(dbPath);

    const result = validateGraphDb(dbPath);

    expect(result.ok).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('returns ok=false with reason when file does not exist', () => {
    const result = validateGraphDb('/nonexistent/path/to/graph.db');

    expect(result.ok).toBe(false);
    expect(result.sizeBytes).toBe(0);
    expect(result.reason).toContain('does not exist');
  });

  it('returns ok=false with reason for empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'validate-db-'));
    const dbPath = join(dir, 'empty.db');
    writeFileSync(dbPath, '', 'utf-8');

    const result = validateGraphDb(dbPath);

    expect(result.ok).toBe(false);
    expect(result.sizeBytes).toBe(0);
    expect(result.reason).toContain('empty');
  });

  it('returns ok=false with reason when magic bytes are wrong', () => {
    const dir = mkdtempSync(join(tmpdir(), 'validate-db-'));
    const dbPath = join(dir, 'wrong.db');
    writeFileSync(dbPath, 'not a sqlite file at all', 'utf-8');

    const result = validateGraphDb(dbPath);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('magic bytes mismatch');
  });
});
