/**
 * Fetches the live MCP tool catalog from the local `code-review-graph` server.
 *
 * Why this exists: the analyzer prompts used to hard-code tool names like
 * `mcp__code_graph__list_communities`. The real server (code-review-graph 2.3.2)
 * exposes `mcp__code_graph__list_communities_tool` (suffix `_tool`). Hand-written
 * names drift on every server release. The fix: open a one-shot MCP stdio
 * session at workflow Phase 0, call `tools/list`, and template the result into
 * every analyzer prompt. Drift impossible by construction.
 *
 * Transport: stdio. The framework spawns the same launcher script the rest of
 * the stack uses (`scripts/code-review-graph-mcp.sh`) and speaks JSON-RPC 2.0
 * with newline-delimited messages. The MCP SDK is not a dependency — the wire
 * surface we need (`initialize`, `notifications/initialized`, `tools/list`) is
 * small enough to inline reliably.
 *
 * Result is cached per process keyed by `(frameworkPath, projectPath)` so a
 * single run does not pay the spawn cost more than once.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { setTimeout as delay } from 'timers/promises';

import { codeReviewGraphDir, loadExtractionManifest } from '../../graph-wiki/code-graph.service.js';
import type { CodeGraphTool } from './tool-catalog.types.js';

const CODE_GRAPH_MCP_SERVER_NAME = 'code_graph';
const REQUEST_TIMEOUT_MS = 15_000;
const SHUTDOWN_GRACE_MS = 2_000;

let cached: CodeGraphTool[] | undefined;
let cacheKey: string | undefined;

export interface FetchCodeGraphToolCatalogArgs {
  projectPath: string;
  frameworkPath: string;
}

interface DiskCacheFile {
  /** Cache key — `(tool_version, graph_sha)` joined; mismatch invalidates. */
  key: string;
  fetched_at: string;
  tools: CodeGraphTool[];
}

/**
 * Returns the path to the on-disk catalog cache. Lives next to the graph DB
 * because (a) it shares the artefact's lifecycle and (b) the framework's
 * `.code-review-graph/.gitignore` allowlist already excludes everything that
 * isn't explicitly allowed — this file is per-developer, not committed.
 */
function diskCachePath(projectPath: string): string {
  return join(codeReviewGraphDir(projectPath), '.tool-catalog.json');
}

/**
 * Disk cache key derived from the on-disk graph state. Two runs that observe
 * the same `(tool_version, graph_sha)` produce the same key — and the catalog
 * cannot meaningfully differ between them, so the disk cache is sound.
 *
 * Returns null when the manifest is missing/malformed (Tier 3 case where we
 * have no graph yet anyway; the catalog must be fetched fresh).
 */
function deriveCacheKey(projectPath: string): string | null {
  const m = loadExtractionManifest(projectPath);
  if (!m) return null;
  const toolVersion = typeof m.tool_version === 'string' ? m.tool_version : 'unknown';
  const sha = typeof m.sha === 'string' ? m.sha : 'unknown';
  if (toolVersion === 'unknown' || sha === 'unknown') return null;
  return `${toolVersion}::${sha}`;
}

function readDiskCache(projectPath: string, expectedKey: string): CodeGraphTool[] | null {
  const path = diskCachePath(projectPath);
  if (!existsSync(path)) return null;
  try {
    const file = JSON.parse(readFileSync(path, 'utf-8')) as DiskCacheFile;
    if (file.key !== expectedKey) return null;
    if (!Array.isArray(file.tools)) return null;
    return file.tools.filter(
      (t): t is CodeGraphTool => typeof t?.name === 'string' && typeof t?.description === 'string',
    );
  } catch {
    return null;
  }
}

function writeDiskCache(projectPath: string, key: string, tools: CodeGraphTool[]): void {
  const dir = codeReviewGraphDir(projectPath);
  try {
    mkdirSync(dir, { recursive: true });
    const file: DiskCacheFile = {
      key,
      fetched_at: new Date().toISOString(),
      tools,
    };
    writeFileSync(diskCachePath(projectPath), JSON.stringify(file, null, 2), 'utf-8');
  } catch {
    // Best-effort. Cache miss next run is the worst outcome.
  }
}

/**
 * Returns the live MCP tool catalog.
 *
 * Cache hierarchy (cheapest first; each tier short-circuits the rest):
 *   1. Per-process in-memory cache keyed by `(frameworkPath, projectPath)`.
 *   2. On-disk cache at `<project>/.code-review-graph/.tool-catalog.json`,
 *      keyed by `(tool_version, graph_sha)` from the extraction manifest.
 *      Survives across processes and Phase 0 invocations.
 *   3. Fresh MCP `tools/list` round-trip — spawns the stdio server, sends
 *      `initialize` + `tools/list`, parses the response, populates both caches.
 *
 * Throws when the server fails to start or returns no tools.
 */
export async function fetchCodeGraphToolCatalog(
  args: FetchCodeGraphToolCatalogArgs,
): Promise<CodeGraphTool[]> {
  const memoryKey = `${args.frameworkPath}::${args.projectPath}`;
  if (cached && cacheKey === memoryKey) {
    return cached;
  }

  const diskKey = deriveCacheKey(args.projectPath);
  if (diskKey !== null) {
    const fromDisk = readDiskCache(args.projectPath, diskKey);
    if (fromDisk && fromDisk.length > 0) {
      cached = fromDisk;
      cacheKey = memoryKey;
      return fromDisk;
    }
  }

  const launcher = join(args.frameworkPath, 'scripts', 'code-review-graph-mcp.sh');
  const child = spawn('bash', [launcher, 'serve', '--repo', args.projectPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: args.projectPath,
  });

  try {
    const tools = await new McpStdioConversation(child).listTools();
    if (tools.length === 0) {
      throw new Error('tool catalog is empty — the MCP server returned zero tools');
    }
    cached = tools;
    cacheKey = memoryKey;
    if (diskKey !== null) {
      writeDiskCache(args.projectPath, diskKey, tools);
    }
    return tools;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
        }),
        delay(SHUTDOWN_GRACE_MS),
      ]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }
}

/** Test-only: clears the per-process cache between cases. */
export function __resetToolCatalogCacheForTesting(): void {
  cached = undefined;
  cacheKey = undefined;
}

/**
 * One-shot JSON-RPC 2.0 conversation over an MCP stdio child process.
 * Implements only the slice we need: initialize + tools/list.
 */
class McpStdioConversation {
  private buffer = '';
  private nextId = 1;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf-8');
  }

  async listTools(): Promise<CodeGraphTool[]> {
    await this.sendRequest<unknown>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'qaf-tool-catalog', version: '1.0.0' },
    });
    this.sendNotification('notifications/initialized');

    const result = await this.sendRequest<{
      tools?: Array<{ name?: string; description?: string }>;
    }>('tools/list');

    const raw = Array.isArray(result?.tools) ? result.tools : [];
    return raw
      .filter((t): t is { name: string; description?: string } => typeof t?.name === 'string')
      .map((t) => ({
        name: `mcp__${CODE_GRAPH_MCP_SERVER_NAME}__${t.name}`,
        description: t.description ?? '',
      }));
  }

  private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.child.stdin.write(`${payload}\n`);
    return this.readResponse<T>(id);
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.child.stdin.write(`${payload}\n`);
  }

  private readResponse<T>(expectedId: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const cleanup = () => {
        this.child.stdout.off('data', onData);
        this.child.off('exit', onExit);
        this.child.off('error', onError);
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      const onData = (chunk: string | Buffer) => {
        this.buffer += chunk.toString();
        for (;;) {
          const eol = this.buffer.indexOf('\n');
          if (eol === -1) break;
          const line = this.buffer.slice(0, eol).trim();
          this.buffer = this.buffer.slice(eol + 1);
          if (!line) continue;

          let parsed: { id?: number; result?: T; error?: { message?: string } };
          try {
            parsed = JSON.parse(line) as typeof parsed;
          } catch {
            // Non-JSON output (some servers log to stdout). Skip.
            continue;
          }
          if (parsed.id !== expectedId) continue;

          cleanup();
          if (parsed.error) {
            reject(new Error(`MCP error: ${parsed.error.message ?? 'unknown'}`));
            return;
          }
          if (parsed.result === undefined) {
            reject(new Error(`MCP response for id=${expectedId} missing 'result'`));
            return;
          }
          resolve(parsed.result);
          return;
        }
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        reject(
          new Error(
            `MCP server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}) before responding to id=${expectedId}`,
          ),
        );
      };

      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`MCP server error: ${err.message}`));
      };

      this.child.stdout.on('data', onData);
      this.child.once('exit', onExit);
      this.child.once('error', onError);

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `MCP request id=${expectedId} (${expectedId === 1 ? 'initialize' : 'tools/list'}) timed out after ${REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }, REQUEST_TIMEOUT_MS);
    });
  }
}
