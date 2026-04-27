import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  upsertCodeGraphMcpConfig,
  validateCodeGraphMcpConfig,
} from '../../../../src/services/framework/mcp-config.service.js';
import { Provider } from '../../../../src/providers/types.js';

describe('mcp-config.service', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createWorkspace(provider: Provider = Provider.CLAUDE) {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-config-service-'));
    const projectPath = join(tempDir, 'project');
    const frameworkPath = join(tempDir, 'framework');
    mkdirSync(join(projectPath, provider === Provider.CODEX ? '.codex' : '.claude'), {
      recursive: true,
    });
    mkdirSync(join(frameworkPath, 'scripts'), { recursive: true });
    mkdirSync(join(projectPath, '.code-review-graph'), { recursive: true });
    writeFileSync(join(projectPath, '.code-review-graph/graph.db'), '');
    writeFileSync(join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'), '#!/bin/bash\n');
    return { projectPath, frameworkPath };
  }

  it('creates .mcp.json when absent', () => {
    const { projectPath, frameworkPath } = createWorkspace();

    const result = upsertCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    const config = JSON.parse(readFileSync(join(projectPath, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers.code_graph).toEqual({
      command: 'bash',
      args: [
        join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'),
        'serve',
        '--repo',
        projectPath,
      ],
    });
  });

  it('preserves unrelated MCP servers', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    writeFileSync(
      join(projectPath, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          figma: { command: 'npx', args: ['figma-mcp'] },
        },
      }),
    );

    upsertCodeGraphMcpConfig({ projectPath, frameworkPath, provider: Provider.CLAUDE });

    const config = JSON.parse(readFileSync(join(projectPath, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers.figma).toEqual({ command: 'npx', args: ['figma-mcp'] });
    expect(config.mcpServers.code_graph).toBeDefined();
  });

  it('replaces only code_graph and backs up existing config', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    writeFileSync(
      join(projectPath, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          figma: { command: 'npx', args: ['figma-mcp'] },
          code_graph: { command: 'old', args: [] },
        },
      }),
    );

    const result = upsertCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.changed).toBe(true);
    expect(result.backedUp).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(existsSync(result.backupPath!)).toBe(true);

    const config = JSON.parse(readFileSync(join(projectPath, '.mcp.json'), 'utf-8'));
    expect(config.mcpServers.figma).toEqual({ command: 'npx', args: ['figma-mcp'] });
    expect(config.mcpServers.code_graph.command).toBe('bash');
  });

  it('validates generated graph MCP config', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    upsertCodeGraphMcpConfig({ projectPath, frameworkPath, provider: Provider.CLAUDE });

    const result = validateCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CLAUDE,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails with a clear message for invalid JSON', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    writeFileSync(join(projectPath, '.mcp.json'), '{invalid');

    expect(() =>
      upsertCodeGraphMcpConfig({ projectPath, frameworkPath, provider: Provider.CLAUDE }),
    ).toThrow(/Invalid MCP config JSON/);
  });

  it('creates .codex/config.toml when absent for Codex', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);

    const result = upsertCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CODEX,
    });

    expect(result.changed).toBe(true);
    const config = readFileSync(join(projectPath, '.codex', 'config.toml'), 'utf-8');
    expect(config).toContain('[mcp_servers.code_graph]');
    expect(config).toContain('command = "bash"');
    expect(config).toContain(
      `args = ["${join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh')}", "serve", "--repo", "${projectPath}"]`,
    );
  });

  it('preserves unrelated Codex TOML settings and MCP servers', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);
    writeFileSync(
      join(projectPath, '.codex', 'config.toml'),
      [
        'model = "gpt-5.3-codex"',
        '',
        '[mcp_servers.figma]',
        'command = "npx"',
        'args = ["figma-mcp"]',
        '',
      ].join('\n'),
    );

    upsertCodeGraphMcpConfig({ projectPath, frameworkPath, provider: Provider.CODEX });

    const config = readFileSync(join(projectPath, '.codex', 'config.toml'), 'utf-8');
    expect(config).toContain('model = "gpt-5.3-codex"');
    expect(config).toContain('[mcp_servers.figma]');
    expect(config).toContain('args = ["figma-mcp"]');
    expect(config).toContain('[mcp_servers.code_graph]');
  });

  it('replaces only Codex code_graph MCP config and backs up existing config', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);
    writeFileSync(
      join(projectPath, '.codex', 'config.toml'),
      [
        '[mcp_servers.figma]',
        'command = "npx"',
        'args = ["figma-mcp"]',
        '',
        '[mcp_servers.code_graph]',
        'command = "old"',
        'args = []',
        '',
      ].join('\n'),
    );

    const result = upsertCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CODEX,
    });

    expect(result.changed).toBe(true);
    expect(result.backedUp).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toContain(join(projectPath, '.codex-backups', 'mcp-config'));
    expect(existsSync(result.backupPath!)).toBe(true);

    const config = readFileSync(join(projectPath, '.codex', 'config.toml'), 'utf-8');
    expect(config).toContain('[mcp_servers.figma]');
    expect(config).not.toContain('command = "old"');
    expect(config).toContain('[mcp_servers.code_graph]');
    expect(config).toContain('command = "bash"');
  });

  it('validates generated Codex graph MCP config', () => {
    const { projectPath, frameworkPath } = createWorkspace(Provider.CODEX);
    upsertCodeGraphMcpConfig({ projectPath, frameworkPath, provider: Provider.CODEX });

    const result = validateCodeGraphMcpConfig({
      projectPath,
      frameworkPath,
      provider: Provider.CODEX,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
