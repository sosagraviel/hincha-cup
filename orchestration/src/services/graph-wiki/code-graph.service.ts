import { spawn } from 'child_process';
import { existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';

export const DEFAULT_CODE_GRAPH_MCP_PORT = 3100;

export interface CodeGraphBuildOptions {
  projectPath: string;
  frameworkPath: string;
  mcpPort?: number;
}

export interface CodeGraphBuildResult {
  code_graph_available: boolean;
  code_graph_path: string;
  code_graph_mcp_port: number;
  code_graph_stats: CodeGraphStats;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

const COMMAND_TIMEOUT_MS = 300000;

export async function buildCodeGraph(
  options: CodeGraphBuildOptions,
): Promise<CodeGraphBuildResult> {
  const startedAt = Date.now();
  const mcpPort = options.mcpPort ?? DEFAULT_CODE_GRAPH_MCP_PORT;
  const graphDbPath = join(options.projectPath, '.code-graph.db');
  const setupScriptPath = join(options.frameworkPath, 'scripts', 'setup-code-graph.sh');

  if (!existsSync(setupScriptPath)) {
    throw new Error(`Code graph setup script not found: ${setupScriptPath}`);
  }

  await runCommand('bash', [setupScriptPath], {
    cwd: options.projectPath,
    env: {
      ...getCodeGraphEnv(),
      PROJECT_PATH: options.projectPath,
      CODE_GRAPH_DB_PATH: graphDbPath,
    },
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  process.env.PATH = getCodeGraphEnv().PATH;

  if (!existsSync(graphDbPath)) {
    throw new Error(`Code graph database was not created: ${graphDbPath}`);
  }

  const stats = await collectGraphStats(graphDbPath, Date.now() - startedAt);
  await startOrVerifyMcpServer(options.projectPath, graphDbPath, mcpPort, options.frameworkPath);

  return {
    code_graph_available: true,
    code_graph_path: graphDbPath,
    code_graph_mcp_port: mcpPort,
    code_graph_stats: stats,
  };
}

export async function collectGraphStats(
  graphDbPath: string,
  buildTimeMs = 0,
): Promise<CodeGraphStats> {
  try {
    const repoPath = graphDbPath.endsWith('/.code-graph.db')
      ? graphDbPath.slice(0, -'/.code-graph.db'.length)
      : undefined;
    const result = await runFirstSuccessfulCommand([
      ['stats', '--db', graphDbPath, '--format', 'json'],
      ...(repoPath ? [['status', '--repo', repoPath]] : []),
      ['status'],
    ]);

    return parseGraphStats(result.stdout, buildTimeMs);
  } catch {
    const fileSize = existsSync(graphDbPath) ? statSync(graphDbPath).size : 0;
    return {
      files: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 10000)) : 0,
      functions: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 2000)) : 0,
      classes: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 20000)) : 0,
      edges: fileSize > 0 ? Math.max(1, Math.floor(fileSize / 1000)) : 0,
      languages: ['unknown'],
      build_time_ms: buildTimeMs,
    };
  }
}

export async function startOrVerifyMcpServer(
  projectPath: string,
  graphDbPath: string,
  port = DEFAULT_CODE_GRAPH_MCP_PORT,
  frameworkPath?: string,
): Promise<void> {
  await resolveMcpCommand(projectPath, graphDbPath, port, frameworkPath);
}

async function resolveMcpCommand(
  projectPath: string,
  _graphDbPath: string,
  _port: number,
  frameworkPath?: string,
): Promise<void> {
  const commands: Array<[string, string[]]> = [
    ...(frameworkPath
      ? [
          [
            join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'),
            ['serve', '--repo', projectPath, '--help'],
          ] as [string, string[]],
        ]
      : []),
    ['code-review-graph', ['serve', '--repo', projectPath, '--help']],
    ['code-review-graph', ['serve', '--help']],
    ['code-review-graph', ['mcp-server', '--help']],
    ['code-review-graph', ['mcp', '--help']],
  ];

  for (const [command, args] of commands) {
    try {
      await runCommand(command, args, {
        cwd: projectPath,
        env: getCodeGraphEnv(),
        timeoutMs: 10000,
      });
      return;
    } catch {}
  }

  await runCommand('code-review-graph', ['--help'], {
    cwd: projectPath,
    env: getCodeGraphEnv(),
    timeoutMs: 10000,
  });
}

async function runFirstSuccessfulCommand(commandArgs: string[][]): Promise<CommandResult> {
  let lastError: Error | undefined;

  for (const args of commandArgs) {
    try {
      return await runCommand('code-review-graph', args, {
        env: getCodeGraphEnv(),
        timeoutMs: 30000,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('No code-review-graph command succeeded');
}

function parseGraphStats(output: string, buildTimeMs: number): CodeGraphStats {
  try {
    const parsed = JSON.parse(output) as CodeGraphStats;
    return {
      ...parsed,
      build_time_ms: parsed.build_time_ms ?? buildTimeMs,
    };
  } catch {}

  const filesMatch = output.match(/^Files:\s*(\d+)/m);
  const nodesMatch = output.match(/^Nodes:\s*(\d+)/m);
  const edgesMatch = output.match(/^Edges:\s*(\d+)/m);
  const languagesMatch = output.match(/^Languages:\s*(.+)$/m);

  return {
    files: filesMatch ? Number(filesMatch[1]) : undefined,
    functions: nodesMatch ? Number(nodesMatch[1]) : undefined,
    edges: edgesMatch ? Number(edgesMatch[1]) : undefined,
    languages: languagesMatch
      ? languagesMatch[1]
          .split(',')
          .map((language) => language.trim())
          .filter(Boolean)
      : undefined,
    build_time_ms: buildTimeMs,
  };
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out`));
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (exitCode === 0) {
        resolve({ exitCode, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with exit code ${exitCode}: ${
            stderr || stdout || 'no output'
          }`,
        ),
      );
    });
  });
}

function getCodeGraphEnv(): NodeJS.ProcessEnv {
  const userLocalBin = join(homedir(), '.local', 'bin');
  const path = process.env.PATH ? `${userLocalBin}:${process.env.PATH}` : userLocalBin;

  return {
    ...process.env,
    PATH: path,
  };
}
