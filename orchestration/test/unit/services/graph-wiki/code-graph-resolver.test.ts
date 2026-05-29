import { accessSync, constants, existsSync, readFileSync, type PathLike } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCodeGraphCommand } from '../../../../src/services/graph-wiki/code-graph.service.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    accessSync: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const PROJECT_PATH = '/fake/project';
const FRAMEWORK_PATH = '/fake/framework';
const LAUNCHER_JSON_PATH = join(PROJECT_PATH, '.code-review-graph', 'launcher.json');
const LOCAL_LAUNCHER_PATH = join(PROJECT_PATH, '.code-review-graph', 'code-review-graph');
const WRAPPER_SCRIPT_PATH = join(FRAMEWORK_PATH, 'scripts', 'code-review-graph-mcp.sh');

function stubExistsSync(paths: Record<string, boolean>): void {
  vi.mocked(existsSync).mockImplementation((p: PathLike) => {
    const key = String(p);
    return key in paths ? (paths[key] as boolean) : false;
  });
}

function stubAccessSync(executablePaths: string[]): void {
  vi.mocked(accessSync).mockImplementation((p: PathLike, mode?: number) => {
    if (mode === constants.X_OK && executablePaths.includes(String(p))) {
      return;
    }
    throw new Error('access denied');
  });
}

function stubReadFileSyncJson(path: string, content: unknown): void {
  vi.mocked(readFileSync).mockImplementation((p: PathLike | number) => {
    if (String(p) === path) {
      return JSON.stringify(content);
    }
    return '';
  });
}

describe('resolveCodeGraphCommand', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(accessSync).mockImplementation(() => {
      throw new Error('not executable');
    });
    vi.mocked(readFileSync).mockReturnValue('');
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('priority 1 — launcher.json', () => {
    it('uses launcher.json when present and valid with system binary command', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        command: 'code-review-graph',
        args: [],
        resolved_at: '2026-01-01T00:00:00Z',
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('launcher.json');
      expect(result.command).toBe('code-review-graph');
      expect(result.args).toEqual([]);
    });

    it('uses launcher.json when present and valid with uvx command', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        command: 'uvx',
        args: ['code-review-graph'],
        resolved_at: '2026-01-01T00:00:00Z',
        tool_version: '1.2.3',
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('launcher.json');
      expect(result.command).toBe('uvx');
      expect(result.args).toEqual(['code-review-graph']);
    });

    it('ignores unknown keys in launcher.json (forward-compat)', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        command: 'uvx',
        args: ['code-review-graph'],
        resolved_at: '2026-01-01T00:00:00Z',
        future_field: 'ignored',
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('launcher.json');
    });

    it('falls through to next resolver when launcher.json is malformed JSON', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true, [WRAPPER_SCRIPT_PATH]: true });
      vi.mocked(readFileSync).mockReturnValue('not valid json{{');

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('wrapper-script');
    });

    it('falls through when launcher.json has missing command field', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true, [WRAPPER_SCRIPT_PATH]: true });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        args: ['code-review-graph'],
        resolved_at: '2026-01-01T00:00:00Z',
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('wrapper-script');
    });

    it('falls through when launcher.json args is not an array', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: true, [WRAPPER_SCRIPT_PATH]: true });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        command: 'uvx',
        args: 'code-review-graph',
        resolved_at: '2026-01-01T00:00:00Z',
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('wrapper-script');
    });
  });

  describe('priority 2 — local launcher executable', () => {
    it('uses local launcher when executable and no launcher.json', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: false });
      stubAccessSync([LOCAL_LAUNCHER_PATH]);

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('local-launcher');
      expect(result.command).toBe(LOCAL_LAUNCHER_PATH);
      expect(result.args).toEqual([]);
    });

    it('skips local launcher when not executable', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: false, [WRAPPER_SCRIPT_PATH]: true });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('wrapper-script');
    });
  });

  describe('priority 3 — wrapper script', () => {
    it('uses wrapper script when it exists and no higher priority resolves', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: false, [WRAPPER_SCRIPT_PATH]: true });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('wrapper-script');
      expect(result.command).toBe(WRAPPER_SCRIPT_PATH);
      expect(result.args).toEqual([]);
    });
  });

  describe('priority 4 — system binary', () => {
    it('uses system code-review-graph when on PATH and wrapper missing', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: false, [WRAPPER_SCRIPT_PATH]: false });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/local/bin/code-review-graph\n'));

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('system-binary');
      expect(result.command).toBe('code-review-graph');
      expect(result.args).toEqual([]);
    });
  });

  describe('priority 5 — uvx-direct fallback', () => {
    it('falls back to uvx when nothing else is available', () => {
      stubExistsSync({ [LAUNCHER_JSON_PATH]: false, [WRAPPER_SCRIPT_PATH]: false });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const result = resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH);

      expect(result.via).toBe('uvx-direct');
      expect(result.command).toBe('uvx');
      expect(result.args).toEqual(['code-review-graph']);
    });
  });

  describe('resolution order correctness', () => {
    it('launcher.json beats local-launcher beats wrapper beats system binary', () => {
      stubExistsSync({
        [LAUNCHER_JSON_PATH]: true,
        [WRAPPER_SCRIPT_PATH]: true,
      });
      stubReadFileSyncJson(LAUNCHER_JSON_PATH, {
        version: '1',
        command: 'uvx',
        args: ['code-review-graph'],
        resolved_at: '2026-01-01T00:00:00Z',
      });
      stubAccessSync([LOCAL_LAUNCHER_PATH]);
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/code-review-graph\n'));

      expect(resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH).via).toBe('launcher.json');
    });

    it('local-launcher beats wrapper when launcher.json missing', () => {
      stubExistsSync({
        [LAUNCHER_JSON_PATH]: false,
        [WRAPPER_SCRIPT_PATH]: true,
      });
      stubAccessSync([LOCAL_LAUNCHER_PATH]);
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/code-review-graph\n'));

      expect(resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH).via).toBe('local-launcher');
    });

    it('wrapper beats system-binary when local-launcher missing', () => {
      stubExistsSync({
        [LAUNCHER_JSON_PATH]: false,
        [WRAPPER_SCRIPT_PATH]: true,
      });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/code-review-graph\n'));

      expect(resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH).via).toBe('wrapper-script');
    });

    it('system-binary beats uvx-direct when wrapper missing', () => {
      stubExistsSync({
        [LAUNCHER_JSON_PATH]: false,
        [WRAPPER_SCRIPT_PATH]: false,
      });
      vi.mocked(accessSync).mockImplementation(() => {
        throw new Error('not executable');
      });
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/bin/code-review-graph\n'));

      expect(resolveCodeGraphCommand(PROJECT_PATH, FRAMEWORK_PATH).via).toBe('system-binary');
    });
  });
});
