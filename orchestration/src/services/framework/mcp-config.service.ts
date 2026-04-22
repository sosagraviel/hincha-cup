import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CodeGraphMcpConfigResult {
  configPath: string;
  changed: boolean;
  backedUp: boolean;
  backupPath?: string;
}

export interface CodeGraphMcpValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const CODE_GRAPH_SERVER_NAME = 'code_graph';

export function getCodeGraphMcpServer(projectPath: string, frameworkPath: string) {
  return {
    command: 'bash',
    args: [
      join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'),
      'serve',
      '--repo',
      projectPath,
    ],
  };
}

export function upsertCodeGraphMcpConfig(params: {
  projectPath: string;
  frameworkPath: string;
}): CodeGraphMcpConfigResult {
  const { projectPath, frameworkPath } = params;
  const configPath = join(projectPath, '.mcp.json');
  const expectedServer = getCodeGraphMcpServer(projectPath, frameworkPath);

  let config: McpConfig = {};
  let backedUp = false;
  let backupPath: string | undefined;

  if (existsSync(configPath)) {
    config = readMcpConfig(configPath);
  }

  if (!isPlainObject(config.mcpServers)) {
    if (config.mcpServers !== undefined) {
      throw new Error(`Invalid MCP config at ${configPath}: mcpServers must be an object.`);
    }
    config.mcpServers = {};
  }

  const existingCodeGraph = config.mcpServers[CODE_GRAPH_SERVER_NAME];
  const changed = JSON.stringify(existingCodeGraph) !== JSON.stringify(expectedServer);

  if (!changed) {
    return {
      configPath,
      changed: false,
      backedUp: false,
    };
  }

  if (existingCodeGraph !== undefined && existsSync(configPath)) {
    backupPath = backupMcpConfig(projectPath, configPath);
    backedUp = true;
  }

  config.mcpServers[CODE_GRAPH_SERVER_NAME] = expectedServer;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    configPath,
    changed: true,
    backedUp,
    backupPath,
  };
}

export function validateCodeGraphMcpConfig(params: {
  projectPath: string;
  frameworkPath: string;
}): CodeGraphMcpValidationResult {
  const { projectPath, frameworkPath } = params;
  const configPath = join(projectPath, '.mcp.json');
  const expectedServer = getCodeGraphMcpServer(projectPath, frameworkPath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(join(projectPath, '.code-graph.db'))) {
    errors.push('Code graph database not found: .code-graph.db');
  }

  if (!existsSync(configPath)) {
    errors.push('Project MCP config not found: .mcp.json');
    return { valid: errors.length === 0, errors, warnings };
  }

  let config: McpConfig;
  try {
    config = readMcpConfig(configPath);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { valid: false, errors, warnings };
  }

  if (!isPlainObject(config.mcpServers)) {
    errors.push('Project MCP config .mcp.json is missing object field: mcpServers');
    return { valid: false, errors, warnings };
  }

  const codeGraphServer = config.mcpServers[CODE_GRAPH_SERVER_NAME];
  if (!isPlainObject(codeGraphServer)) {
    errors.push('Project MCP config .mcp.json is missing mcpServers.code_graph');
    return { valid: false, errors, warnings };
  }

  if (codeGraphServer.command !== expectedServer.command) {
    errors.push('mcpServers.code_graph.command must be "bash"');
  }

  const args = codeGraphServer.args;
  if (!Array.isArray(args)) {
    errors.push('mcpServers.code_graph.args must be an array');
  } else {
    const expectedArgs = expectedServer.args;
    for (const expectedArg of expectedArgs) {
      if (!args.includes(expectedArg)) {
        errors.push(`mcpServers.code_graph.args missing required value: ${expectedArg}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function readMcpConfig(configPath: string): McpConfig {
  const raw = readFileSync(configPath, 'utf-8');

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) {
      throw new Error('root value must be an object');
    }
    return parsed as McpConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid MCP config JSON at ${configPath}: ${message}`);
  }
}

function backupMcpConfig(projectPath: string, configPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(projectPath, '.claude-backups', 'mcp-config', timestamp);
  mkdirSync(backupDir, { recursive: true });

  const backupPath = join(backupDir, '.mcp.json');
  copyFileSync(configPath, backupPath);
  return backupPath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
