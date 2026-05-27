import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyPreflightScripts } from '../../../../src/services/framework/preflight-scripts.service.js';
import { Provider } from '../../../../src/providers/types.js';

const ENSURE_CONTEXT_BODY = '#!/bin/bash\necho ensure-context-stub\n';
const RESOLVE_PATHS_BODY = '#!/usr/bin/env bash\nframework_path() { echo stub; }\n';

describe('preflight-scripts.service', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createWorkspace(provider: Provider = Provider.CLAUDE) {
    tempDir = mkdtempSync(join(tmpdir(), 'preflight-scripts-service-'));
    const projectPath = join(tempDir, 'project');
    const frameworkPath = join(tempDir, 'framework');
    const configDir = provider === Provider.CODEX ? '.codex' : '.claude';
    mkdirSync(join(projectPath, configDir), { recursive: true });
    mkdirSync(join(frameworkPath, 'scripts', 'lib'), { recursive: true });
    writeFileSync(join(frameworkPath, 'scripts', 'ensure-context.sh'), ENSURE_CONTEXT_BODY);
    writeFileSync(join(frameworkPath, 'scripts', 'lib', 'resolve-paths.sh'), RESOLVE_PATHS_BODY);
    return { projectPath, frameworkPath, configDir };
  }

  it('copies ensure-context.sh and resolve-paths.sh into <configDir>/scripts/', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    expect(result.configDir).toBe(configDir);

    const ensurePath = join(projectPath, configDir, 'scripts', 'ensure-context.sh');
    const resolvePath = join(projectPath, configDir, 'scripts', 'lib', 'resolve-paths.sh');

    expect(existsSync(ensurePath)).toBe(true);
    expect(existsSync(resolvePath)).toBe(true);
    expect(readFileSync(ensurePath, 'utf-8')).toBe(ENSURE_CONTEXT_BODY);
    expect(readFileSync(resolvePath, 'utf-8')).toBe(RESOLVE_PATHS_BODY);
  });

  it('marks ensure-context.sh executable', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    copyPreflightScripts({ projectPath, frameworkPath, provider: Provider.CLAUDE });

    const mode = statSync(join(projectPath, configDir, 'scripts', 'ensure-context.sh')).mode;
    expect(mode & 0o111).toBe(0o111);
  });

  it('is idempotent — second run reports changed=false and rewrites nothing', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    const first = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });
    expect(first.changed).toBe(true);

    const ensurePath = join(projectPath, configDir, 'scripts', 'ensure-context.sh');
    const firstMtime = statSync(ensurePath).mtimeMs;

    const second = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });
    expect(second.changed).toBe(false);
    expect(statSync(ensurePath).mtimeMs).toBe(firstMtime);
  });

  it('detects source drift on a subsequent run and re-copies', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    copyPreflightScripts({ projectPath, frameworkPath, provider: Provider.CLAUDE });

    writeFileSync(
      join(frameworkPath, 'scripts', 'ensure-context.sh'),
      ENSURE_CONTEXT_BODY + '# drift\n',
    );

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    const ensurePath = join(projectPath, configDir, 'scripts', 'ensure-context.sh');
    expect(readFileSync(ensurePath, 'utf-8')).toContain('# drift');
  });

  it('writes into .codex/scripts/ for Codex provider', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CODEX,
    });

    expect(result.configDir).toBe('.codex');
    expect(existsSync(join(projectPath, '.codex', 'scripts', 'ensure-context.sh'))).toBe(true);
    expect(existsSync(join(projectPath, '.codex', 'scripts', 'lib', 'resolve-paths.sh'))).toBe(
      true,
    );
  });

  it('throws when the framework source script is missing', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    rmSync(join(frameworkPath, 'scripts', 'ensure-context.sh'));

    expect(() =>
      copyPreflightScripts({ projectPath, frameworkPath, provider: Provider.CLAUDE }),
    ).toThrow(/ensure-context\.sh/);
  });
});
