import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  upsertCodeGraphMcpConfig,
  validateCodeGraphMcpConfig,
} from '../../../../src/services/framework/mcp-config.service.js';

describe('mcp-config.service', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function createWorkspace() {
    tempDir = mkdtempSync(join(tmpdir(), 'mcp-config-service-'));
    const projectPath = join(tempDir, 'project');
    const frameworkPath = join(tempDir, 'framework');
    mkdirSync(join(projectPath, '.claude'), { recursive: true });
    mkdirSync(join(frameworkPath, 'scripts'), { recursive: true });
    writeFileSync(join(projectPath, '.code-graph.db'), '');
    writeFileSync(join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'), '#!/bin/bash\n');
    return { projectPath, frameworkPath };
  }

  it('creates .mcp.json when absent', () => {
    const { projectPath, frameworkPath } = createWorkspace();

    const result = upsertCodeGraphMcpConfig({ projectPath, frameworkPath });

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

    upsertCodeGraphMcpConfig({ projectPath, frameworkPath });

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

    const result = upsertCodeGraphMcpConfig({ projectPath, frameworkPath });

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
    upsertCodeGraphMcpConfig({ projectPath, frameworkPath });

    const result = validateCodeGraphMcpConfig({ projectPath, frameworkPath });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails with a clear message for invalid JSON', () => {
    const { projectPath, frameworkPath } = createWorkspace();
    writeFileSync(join(projectPath, '.mcp.json'), '{invalid');

    expect(() => upsertCodeGraphMcpConfig({ projectPath, frameworkPath })).toThrow(
      /Invalid MCP config JSON/,
    );
  });
});
