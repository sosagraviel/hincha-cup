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
const SETUP_CODE_GRAPH_BODY = '#!/bin/bash\necho setup-code-graph-stub\n';
const MCP_LAUNCHER_BODY = '#!/bin/bash\necho mcp-launcher-stub\n';
const RESOLVE_PATHS_SHIM_BODY = '#!/usr/bin/env bash\nproject_path() { echo stub; }\n';
const BOOTSTRAP_UV_BODY = '#!/bin/bash\nbootstrap_uv_if_needed() { return 0; }\n';
const REGISTER_SUBMODULES_BODY = '#!/bin/bash\nis_multi_repo() { return 1; }\n';
const PATCH_PY_BODY = '# stub patch script\n';
const IGNORE_TEMPLATE_BODY = '.claude\nnode_modules\n';
const GITIGNORE_TEMPLATE_BODY = '*\n!.gitignore\n';

interface Workspace {
  projectPath: string;
  frameworkPath: string;
  configDir: string;
}

function seedFrameworkSources(frameworkPath: string): void {
  mkdirSync(join(frameworkPath, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(frameworkPath, 'templates'), { recursive: true });
  writeFileSync(join(frameworkPath, 'scripts', 'ensure-context.sh'), ENSURE_CONTEXT_BODY);
  writeFileSync(join(frameworkPath, 'scripts', 'setup-code-graph.sh'), SETUP_CODE_GRAPH_BODY);
  writeFileSync(join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'), MCP_LAUNCHER_BODY);
  writeFileSync(
    join(frameworkPath, 'scripts', 'lib', 'resolve-paths.shim.sh'),
    RESOLVE_PATHS_SHIM_BODY,
  );
  writeFileSync(join(frameworkPath, 'scripts', 'lib', 'bootstrap-uv.sh'), BOOTSTRAP_UV_BODY);
  writeFileSync(
    join(frameworkPath, 'scripts', 'lib', 'register-submodules.sh'),
    REGISTER_SUBMODULES_BODY,
  );
  writeFileSync(join(frameworkPath, 'scripts', 'lib', 'patch-code-review-graph.py'), PATCH_PY_BODY);
  writeFileSync(join(frameworkPath, 'templates', 'code-review-graphignore'), IGNORE_TEMPLATE_BODY);
  writeFileSync(
    join(frameworkPath, 'templates', 'code-review-graph-gitignore'),
    GITIGNORE_TEMPLATE_BODY,
  );
}

describe('preflight-scripts.service', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createWorkspace(provider: Provider = Provider.CLAUDE): Workspace {
    tempDir = mkdtempSync(join(tmpdir(), 'preflight-scripts-service-'));
    const projectPath = join(tempDir, 'project');
    const frameworkPath = join(tempDir, 'framework');
    const configDir = provider === Provider.CODEX ? '.codex' : '.claude';
    mkdirSync(join(projectPath, configDir), { recursive: true });
    seedFrameworkSources(frameworkPath);
    return { projectPath, frameworkPath, configDir };
  }

  it('copies the full preflight bundle into <configDir>/scripts/', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    expect(result.configDir).toBe(configDir);

    const scriptsDir = join(projectPath, configDir, 'scripts');
    expect(existsSync(join(scriptsDir, 'ensure-context.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'setup-code-graph.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'code-review-graph-mcp.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'lib', 'resolve-paths.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'lib', 'bootstrap-uv.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'lib', 'register-submodules.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'lib', 'patch-code-review-graph.py'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'templates', 'code-review-graphignore'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'templates', 'code-review-graph-gitignore'))).toBe(true);

    expect(readFileSync(join(scriptsDir, 'ensure-context.sh'), 'utf-8')).toBe(ENSURE_CONTEXT_BODY);
    expect(readFileSync(join(scriptsDir, 'setup-code-graph.sh'), 'utf-8')).toBe(
      SETUP_CODE_GRAPH_BODY,
    );
    expect(readFileSync(join(scriptsDir, 'code-review-graph-mcp.sh'), 'utf-8')).toBe(
      MCP_LAUNCHER_BODY,
    );
    expect(readFileSync(join(scriptsDir, 'lib', 'resolve-paths.sh'), 'utf-8')).toBe(
      RESOLVE_PATHS_SHIM_BODY,
    );
    expect(readFileSync(join(scriptsDir, 'templates', 'code-review-graphignore'), 'utf-8')).toBe(
      IGNORE_TEMPLATE_BODY,
    );
  });

  it('marks the shell entry points executable and leaves lib/templates non-executable', () => {
    const { projectPath, frameworkPath, configDir } = createWorkspace();

    copyPreflightScripts({ projectPath, frameworkPath, provider: Provider.CLAUDE });

    const scriptsDir = join(projectPath, configDir, 'scripts');
    expect(statSync(join(scriptsDir, 'ensure-context.sh')).mode & 0o111).toBe(0o111);
    expect(statSync(join(scriptsDir, 'setup-code-graph.sh')).mode & 0o111).toBe(0o111);
    expect(statSync(join(scriptsDir, 'code-review-graph-mcp.sh')).mode & 0o111).toBe(0o111);
    expect(statSync(join(scriptsDir, 'lib', 'resolve-paths.sh')).mode & 0o111).toBe(0);
    expect(statSync(join(scriptsDir, 'lib', 'bootstrap-uv.sh')).mode & 0o111).toBe(0);
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
      join(frameworkPath, 'scripts', 'setup-code-graph.sh'),
      SETUP_CODE_GRAPH_BODY + '# drift\n',
    );

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    const setupPath = join(projectPath, configDir, 'scripts', 'setup-code-graph.sh');
    expect(readFileSync(setupPath, 'utf-8')).toContain('# drift');
  });

  it('writes into .codex/scripts/ for Codex provider', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);

    const result = copyPreflightScripts({
      projectPath,
      frameworkPath,
      provider: Provider.CODEX,
    });

    expect(result.configDir).toBe('.codex');
    const scriptsDir = join(projectPath, '.codex', 'scripts');
    expect(existsSync(join(scriptsDir, 'ensure-context.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'setup-code-graph.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'code-review-graph-mcp.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'lib', 'resolve-paths.sh'))).toBe(true);
    expect(existsSync(join(scriptsDir, 'templates', 'code-review-graphignore'))).toBe(true);
  });

  it('throws when a required framework source file is missing', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    rmSync(join(frameworkPath, 'scripts', 'setup-code-graph.sh'));

    expect(() =>
      copyPreflightScripts({ projectPath, frameworkPath, provider: Provider.CLAUDE }),
    ).toThrow(/setup-code-graph\.sh/);
  });
});
