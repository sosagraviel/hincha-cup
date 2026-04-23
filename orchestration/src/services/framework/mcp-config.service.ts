import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Provider } from '../../providers/types.js';
import { getActiveProvider, getProviderPaths } from '../../utils/provider-paths.js';
import {
  codexMcpServerMatches,
  extractCodeGraphMcpTomlServer,
  upsertCodeGraphMcpTomlBlock,
} from './codex-mcp-toml.js';

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
const CODEX_CONFIG_FILE = 'config.toml';

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
  provider?: Provider;
}): CodeGraphMcpConfigResult {
  const { projectPath, frameworkPath, provider = getActiveProvider() } = params;
  if (provider === Provider.CODEX) {
    return upsertCodexCodeGraphMcpConfig({ projectPath, frameworkPath });
  }

  return upsertClaudeCodeGraphMcpConfig({ projectPath, frameworkPath });
}

function upsertClaudeCodeGraphMcpConfig(params: {
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
  provider?: Provider;
}): CodeGraphMcpValidationResult {
  const { projectPath, frameworkPath, provider = getActiveProvider() } = params;
  if (provider === Provider.CODEX) {
    return validateCodexCodeGraphMcpConfig({ projectPath, frameworkPath });
  }

  return validateClaudeCodeGraphMcpConfig({ projectPath, frameworkPath });
}

function validateClaudeCodeGraphMcpConfig(params: {
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

function upsertCodexCodeGraphMcpConfig(params: {
  projectPath: string;
  frameworkPath: string;
}): CodeGraphMcpConfigResult {
  const { projectPath, frameworkPath } = params;
  const configDir = join(projectPath, getProviderPaths(Provider.CODEX).configDir);
  const configPath = join(configDir, CODEX_CONFIG_FILE);
  const expectedServer = getCodeGraphMcpServer(projectPath, frameworkPath);
  const existingContent = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const existingServer = extractCodeGraphMcpTomlServer(existingContent);
  const changed = !codexMcpServerMatches(existingServer, expectedServer);

  if (!changed) {
    return {
      configPath,
      changed: false,
      backedUp: false,
    };
  }

  let backedUp = false;
  let backupPath: string | undefined;
  if (existingServer !== undefined && existsSync(configPath)) {
    backupPath = backupMcpConfig(projectPath, configPath, Provider.CODEX);
    backedUp = true;
  }

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, upsertCodeGraphMcpTomlBlock(existingContent, expectedServer));

  return {
    configPath,
    changed: true,
    backedUp,
    backupPath,
  };
}

function validateCodexCodeGraphMcpConfig(params: {
  projectPath: string;
  frameworkPath: string;
}): CodeGraphMcpValidationResult {
  const { projectPath, frameworkPath } = params;
  const configPath = join(
    projectPath,
    getProviderPaths(Provider.CODEX).configDir,
    CODEX_CONFIG_FILE,
  );
  const expectedServer = getCodeGraphMcpServer(projectPath, frameworkPath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(join(projectPath, '.code-graph.db'))) {
    errors.push('Code graph database not found: .code-graph.db');
  }

  if (!existsSync(configPath)) {
    errors.push('Codex MCP config not found: .codex/config.toml');
    return { valid: errors.length === 0, errors, warnings };
  }

  const configContent = readFileSync(configPath, 'utf-8');
  const codeGraphServer = extractCodeGraphMcpTomlServer(configContent);
  if (!codeGraphServer) {
    errors.push('Codex MCP config .codex/config.toml is missing [mcp_servers.code_graph]');
    return { valid: false, errors, warnings };
  }

  if (codeGraphServer.command !== expectedServer.command) {
    errors.push('mcp_servers.code_graph.command must be "bash"');
  }

  const args = codeGraphServer.args;
  if (!Array.isArray(args)) {
    errors.push('mcp_servers.code_graph.args must be an array');
  } else {
    const expectedArgs = expectedServer.args;
    for (const expectedArg of expectedArgs) {
      if (!args.includes(expectedArg)) {
        errors.push(`mcp_servers.code_graph.args missing required value: ${expectedArg}`);
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

function backupMcpConfig(
  projectPath: string,
  configPath: string,
  provider: Provider = Provider.CLAUDE,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(
    projectPath,
    getProviderPaths(provider).backupDir,
    'mcp-config',
    timestamp,
  );
  mkdirSync(backupDir, { recursive: true });

  const backupPath = join(backupDir, provider === Provider.CODEX ? CODEX_CONFIG_FILE : '.mcp.json');
  copyFileSync(configPath, backupPath);
  return backupPath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
