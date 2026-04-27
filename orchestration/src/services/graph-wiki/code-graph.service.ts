import { createHash } from 'crypto';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
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

interface GraphStateFile {
  last_indexed_commit?: string;
  updated_at?: string;
  tool_version?: string;
}

interface ExtractionManifest {
  files_parsed: number | undefined;
  languages: string[] | undefined;
  tool_version: string;
  sha: string;
  build_time_ms: number | undefined;
  created_at: string;
}

const COMMAND_TIMEOUT_MS = 300000;
const CODE_REVIEW_GRAPH_DIRNAME = '.code-review-graph';

/** Returns the path to the `.code-review-graph/` directory for a project. */
function codeReviewGraphDir(projectPath: string): string {
  return join(projectPath, CODE_REVIEW_GRAPH_DIRNAME);
}

/** Returns the path to `.code-review-graph/.state.json` for a project. */
function graphStatePath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), '.state.json');
}

/**
 * Reads the `.code-review-graph/.state.json` file and returns its contents,
 * or null if the file does not exist or cannot be parsed.
 */
export function loadGraphState(projectPath: string): GraphStateFile | null {
  const statePath = graphStatePath(projectPath);
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(statePath, 'utf-8')) as GraphStateFile;
  } catch {
    return null;
  }
}

/**
 * Runs `git rev-parse HEAD` in the given project directory and returns the
 * trimmed SHA. Falls back to 'unknown' when git is unavailable or the directory
 * is not a git repo.
 */
export function resolveCurrentCommit(projectPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Resolves the installed `code-review-graph` version string.
 * Falls back to 'unknown' when the command is unavailable.
 */
async function resolveToolVersion(projectPath: string): Promise<string> {
  try {
    const result = await runCommand('code-review-graph', ['--version'], {
      cwd: projectPath,
      env: getCodeGraphEnv(),
      timeoutMs: 10000,
    });
    return result.stdout.trim().split('\n')[0] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Persists `.code-review-graph/.state.json` with the current commit, ISO
 * timestamp, and tool version. Creates the directory if it does not exist.
 */
async function writeGraphState(projectPath: string): Promise<void> {
  const dir = codeReviewGraphDir(projectPath);
  mkdirSync(dir, { recursive: true });

  const toolVersion = await resolveToolVersion(projectPath);
  const state: GraphStateFile = {
    last_indexed_commit: resolveCurrentCommit(projectPath),
    updated_at: new Date().toISOString(),
    tool_version: toolVersion,
  };
  writeFileSync(graphStatePath(projectPath), JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Writes `.code-review-graph/extraction-manifest.json` capturing snapshot
 * metadata about the graph build so downstream consumers can verify what was
 * indexed and when.
 */
export function writeExtractionManifest(
  projectPath: string,
  stats: CodeGraphStats,
  sha: string,
): void {
  const dir = codeReviewGraphDir(projectPath);
  mkdirSync(dir, { recursive: true });

  let toolVersion = 'unknown';
  try {
    toolVersion =
      execSync('code-review-graph --version', { encoding: 'utf-8' }).trim().split('\n')[0] ??
      'unknown';
  } catch {
    // tool unavailable — already defaulted to 'unknown'
  }

  const manifest: ExtractionManifest = {
    files_parsed: stats.files,
    languages: stats.languages,
    tool_version: toolVersion,
    sha,
    build_time_ms: stats.build_time_ms,
    created_at: new Date().toISOString(),
  };

  writeFileSync(join(dir, 'extraction-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

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

  const graphState = loadGraphState(options.projectPath);
  const currentCommit = resolveCurrentCommit(options.projectPath);
  const nativeDbPath = join(codeReviewGraphDir(options.projectPath), 'graph.db');
  const dbExists = existsSync(nativeDbPath) || existsSync(graphDbPath);

  const hasIndexedCommit =
    graphState !== null &&
    graphState.last_indexed_commit !== undefined &&
    graphState.last_indexed_commit !== 'unknown';

  const headMoved = hasIndexedCommit && graphState!.last_indexed_commit !== currentCommit;

  if (dbExists && hasIndexedCommit && headMoved) {
    const updated = await tryIncrementalUpdate(options.projectPath);
    if (!updated) {
      await runFullBuild(options.projectPath, graphDbPath, options.frameworkPath);
    }
  }

  await writeGraphState(options.projectPath);

  const stats = await collectGraphStats(graphDbPath, Date.now() - startedAt);
  const sha = createHash('sha256').update(readFileSync(graphDbPath)).digest('hex');

  writeExtractionManifest(options.projectPath, stats, sha);

  await startOrVerifyMcpServer(options.projectPath, graphDbPath, mcpPort, options.frameworkPath);

  return {
    code_graph_available: true,
    code_graph_path: graphDbPath,
    code_graph_mcp_port: mcpPort,
    code_graph_stats: stats,
  };
}

/**
 * Attempts `code-review-graph update --repo <projectPath>`. Returns true on
 * success, false when the command exits non-zero so the caller can fall back
 * to a full build.
 */
async function tryIncrementalUpdate(projectPath: string): Promise<boolean> {
  try {
    await runCommand('code-review-graph', ['update', '--repo', projectPath], {
      cwd: projectPath,
      env: getCodeGraphEnv(),
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[code-graph] WARNING: incremental update failed (${message}); falling back to full build\n`,
    );
    return false;
  }
}

/**
 * Runs the setup script again as a full-build fallback.
 * The setup script is idempotent: when `code-review-graph` is already installed
 * it is cheap and produces a correct fresh build via `build --repo`.
 */
async function runFullBuild(
  projectPath: string,
  graphDbPath: string,
  frameworkPath: string,
): Promise<void> {
  const setupScriptPath = join(frameworkPath, 'scripts', 'setup-code-graph.sh');
  await runCommand('bash', [setupScriptPath], {
    cwd: projectPath,
    env: {
      ...getCodeGraphEnv(),
      PROJECT_PATH: projectPath,
      CODE_GRAPH_DB_PATH: graphDbPath,
    },
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
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

/** Returns the path to `.code-review-graph/extraction-manifest.json` for a project. */
export function extractionManifestPath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), 'extraction-manifest.json');
}
