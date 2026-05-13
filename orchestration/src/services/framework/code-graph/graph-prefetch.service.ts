/**
 * Graph prefetch snapshot. End-to-end: read path + snapshot shape + write path.
 *
 * Phase 0 calls the four cheapest graph orientation queries ONCE
 * (after the graph is built) and snapshots the results to
 * `<project>/.<provider>-temp/initialize-project/graph-prefetch.json`.
 * Phase 1 analyzers read the snapshot from their cache-eligible
 * prefix and skip those four calls in their own sessions.
 *
 * What this module exports:
 *   - `GraphPrefetchSnapshot` — canonical JSON shape.
 *   - `graphPrefetchPath` — canonical on-disk path under the
 *     active-provider temp dir.
 *   - `readGraphPrefetch(projectPath, currentGraphSha)` —
 *     SHA-validated read; returns null on miss / mismatch / malformed.
 *   - `writeGraphPrefetch(projectPath, snapshot)` — idempotent
 *     overwrite; used by `runGraphPrefetch` and any future writer.
 *   - `renderPrefetchHint(snapshot | null)` — compact prose summary
 *     suitable for the Phase 1 cache-eligible prefix.
 *   - `runGraphPrefetch({ projectPath, frameworkPath, graphSha })`
 *     — spawns `code-review-graph serve` over MCP stdio, calls
 *     `tools/call` for the four orientation tools, parses both the
 *     structured and text-shape MCP responses, and persists the
 *     snapshot. Best-effort: failure does NOT fail Phase 0; the
 *     analyzers fall back to calling the tools themselves.
 *   - `hashGraphDb(graphDbPath)` — content-addressable SHA-256 of
 *     the graph DB; used to derive the snapshot's freshness key.
 *
 * Stack-agnostic: every field on the snapshot is graph-derived
 * (community names, hub/bridge `qualified_name`, file/function
 * counts) — independent of language family. The MCP tool names
 * the writer invokes are language-neutral by construction.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { setTimeout as delay } from 'timers/promises';
import { resolveTempPath } from '../../../utils/provider-paths.js';
import { logger } from '../../../utils/logger.js';

const PREFETCH_FILENAME = 'graph-prefetch.json';

/**
 * Snapshot shape. Optional fields tolerate writers that only
 * gather a subset (e.g. a future writer that only invokes
 * `get_minimal_context_tool` and skips the others).
 */
export interface GraphPrefetchSnapshot {
  /** ISO 8601 timestamp the snapshot was written. */
  generatedAt: string;
  /**
   * SHA of the graph DB the snapshot was taken against. Consumers
   * MUST verify this matches the current graph SHA before trusting
   * the snapshot — a mismatch means the snapshot is stale.
   */
  graphSha: string;
  /**
   * Output of `mcp__code_graph__get_minimal_context_tool`. ~100
   * tokens of orientation data. Optional: writers that don't
   * gather it leave the field absent.
   */
  minimalContext?: {
    topCommunities?: Array<{ name: string; size?: number; cohesion?: number }>;
    topFlows?: Array<{ id: string; name?: string; criticality?: number }>;
    riskScore?: number;
    suggestedNextTools?: string[];
  };
  /**
   * Output of `mcp__code_graph__list_communities_tool({
   *   detail_level: "minimal"
   * })`. Each entry is the minimal-shape community.
   */
  communities?: Array<{
    name: string;
    size?: number;
    cohesion?: number;
    dominant_language?: string;
  }>;
  /** Output of `mcp__code_graph__get_hub_nodes_tool({ top_n: 10 })`. */
  hubs?: Array<{ qualified_name: string; kind?: string; score?: number }>;
  /** Output of `mcp__code_graph__get_bridge_nodes_tool({ top_n: 10 })`. */
  bridges?: Array<{ qualified_name: string; kind?: string; score?: number }>;
}

/**
 * Returns the on-disk path the prefetch snapshot lives at, given
 * the project + the active provider. Same per-provider temp dir
 * shape the rest of the framework uses.
 */
export function graphPrefetchPath(projectPath: string): string {
  const dir = resolveTempPath(projectPath, 'initialize-project');
  return join(dir, PREFETCH_FILENAME);
}

/**
 * Read the snapshot and verify its `graphSha` matches the current
 * graph DB hash. Returns null when:
 *   - no snapshot file exists;
 *   - the snapshot is unreadable / malformed;
 *   - the snapshot's `graphSha` does not match the supplied current
 *     SHA (the graph was rebuilt since the snapshot was taken).
 *
 * Bounded cost: O(snapshot file size). No graph-tool invocation.
 */
export function readGraphPrefetch(
  projectPath: string,
  currentGraphSha: string,
): GraphPrefetchSnapshot | null {
  const path = graphPrefetchPath(projectPath);
  if (!existsSync(path)) return null;
  let parsed: GraphPrefetchSnapshot;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as GraphPrefetchSnapshot;
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.graphSha !== 'string' ||
    parsed.graphSha.length === 0
  ) {
    return null;
  }
  if (currentGraphSha && parsed.graphSha !== currentGraphSha) {
    return null;
  }
  return parsed;
}

/**
 * Persist a snapshot. Future writers (TS MCP client, manual
 * snapshot tool) call this. Idempotent: overwrites any prior
 * snapshot on the same path.
 */
export function writeGraphPrefetch(projectPath: string, snapshot: GraphPrefetchSnapshot): void {
  const path = graphPrefetchPath(projectPath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/**
 * Compact prose summary of the prefetch snapshot — emitted into
 * the Phase 1 cache-eligible prefix. ≤500 chars by design so the
 * cache prefix doesn't bloat. Returns the empty string when no
 * snapshot is available; callers must treat empty as "no prefetch
 * hint to inject".
 */
export function renderPrefetchHint(snapshot: GraphPrefetchSnapshot | null): string {
  if (!snapshot) return '';

  const sections: string[] = ['### Pre-fetched graph orientation (Phase 0 snapshot)'];
  const FAT_CLUSTER_PATTERNS: RegExp[] = [
    /(?:^|-)it:should(?:$|-)/i,
    /(?:^|-)tests?:/i,
    /(?:^|-)tests?(?:$|-)/i,
    /(?:^|-)describes?(?:$|-)/i,
    /(?:^|-)asserts?(?:$|-)/i,
    /(?:^|-)constructors?(?:$|-)/i,
    /(?:^|-)handles?(?:$|-)/i,
    /(?:^|-)upserts?(?:$|-)/i,
    /(?:^|-)exceptions?(?:$|-)/i,
    /(?:^|-)helpers(?:$|-)/i,
    /(?:^|-)utils(?:$|-)/i,
    /(?:^|-)shared(?:$|-)/i,
    /(?:^|-)base(?:$|-)/i,
    /(?:^|-)core(?:$|-)/i,
    /(?:^|-)main(?:$|-)/i,
    /(?:^|-)index(?:$|-)/i,
  ];
  const isFatClusterName = (name: string): boolean =>
    FAT_CLUSTER_PATTERNS.some((re) => re.test(name));

  const filterFatClusters = <T extends { name: string }>(items: T[]): T[] =>
    items.filter((c) => !isFatClusterName(c.name));

  if (snapshot.minimalContext?.topCommunities?.length) {
    const filtered = filterFatClusters(snapshot.minimalContext.topCommunities);
    const names = filtered
      .slice(0, 8)
      .map((c) => c.name)
      .join(', ');
    if (names) sections.push(`- Top communities: ${names}.`);
  }
  if (snapshot.communities?.length && !snapshot.minimalContext?.topCommunities) {
    const filtered = filterFatClusters(snapshot.communities);
    const names = filtered
      .slice(0, 8)
      .map((c) => c.name)
      .join(', ');
    if (names) sections.push(`- Communities (minimal): ${names}.`);
  }
  if (snapshot.hubs?.length) {
    const names = snapshot.hubs
      .slice(0, 5)
      .map((h) => h.qualified_name)
      .join(', ');
    sections.push(`- Top hubs: ${names}.`);
  }
  if (snapshot.bridges?.length) {
    const names = snapshot.bridges
      .slice(0, 5)
      .map((b) => b.qualified_name)
      .join(', ');
    sections.push(`- Top bridges: ${names}.`);
  }
  sections.push(
    `- These four queries are pre-run; you may skip \`get_minimal_context_tool\`, \`list_communities_tool\`, \`get_hub_nodes_tool\`, and \`get_bridge_nodes_tool\` for orientation. Drill in directly from the snapshot above when you need detail beyond it.`,
  );
  return sections.join('\n');
}

const PREFETCH_REQUEST_TIMEOUT_MS = 20_000;
const PREFETCH_SHUTDOWN_GRACE_MS = 2_000;

export interface RunGraphPrefetchArgs {
  /** Project root (the repo we're indexing). */
  projectPath: string;
  /** Framework root (where `scripts/code-review-graph-mcp.sh` lives). */
  frameworkPath: string;
  /** SHA of the current graph DB. Stored in the snapshot for staleness checks. */
  graphSha: string;
}

export interface RunGraphPrefetchResult {
  /** True when the snapshot file was written. */
  wrote: boolean;
  /**
   * One short sentence summarising the outcome — surfaced in operator-
   * facing logs. Always set regardless of `wrote`.
   */
  reason: string;
  /** Path to the snapshot file, even when wrote=false (for diagnostics). */
  path: string;
}

/**
 * Invoke the four cheapest graph-orientation queries against the local
 * `code-review-graph` MCP server and persist the results to
 * `<project>/.<provider>-temp/initialize-project/graph-prefetch.json`.
 *
 * Best-effort by design: a failure here does NOT fail Phase 0. The
 * caller logs and continues; analyzers fall back to calling the four
 * tools themselves.
 *
 * Stack-agnostic: every queried tool is graph-derived and language-
 * neutral. The snapshot bytes contain only graph topology.
 */
export async function runGraphPrefetch(
  args: RunGraphPrefetchArgs,
): Promise<RunGraphPrefetchResult> {
  const path = graphPrefetchPath(args.projectPath);

  if (args.graphSha) {
    const existing = readGraphPrefetch(args.projectPath, args.graphSha);
    if (existing) {
      return {
        wrote: false,
        reason: `prefetch already current for graphSha=${args.graphSha.slice(0, 12)}`,
        path,
      };
    }
  }

  const launcher = join(args.frameworkPath, 'scripts', 'code-review-graph-mcp.sh');
  if (!existsSync(launcher)) {
    return {
      wrote: false,
      reason: `MCP launcher not found at ${launcher}`,
      path,
    };
  }

  const child = spawn('bash', [launcher, 'serve', '--repo', args.projectPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: args.projectPath,
  });

  try {
    const client = new McpStdioClient(child);
    await client.initialize();

    const minimalContext = await safeCall(client, 'get_minimal_context_tool', {
      task: 'Phase 1 preflight',
    });
    const communities = await safeCall(client, 'list_communities_tool', {
      detail_level: 'minimal',
      min_size: 10,
      sort_by: 'size',
    });
    const hubs = await safeCall(client, 'get_hub_nodes_tool', { top_n: 10 });
    const bridges = await safeCall(client, 'get_bridge_nodes_tool', { top_n: 10 });

    const snapshot: GraphPrefetchSnapshot = {
      generatedAt: new Date().toISOString(),
      graphSha: args.graphSha,
      minimalContext: parseMinimalContext(minimalContext),
      communities: parseCommunities(communities),
      hubs: parseTopNodes(hubs),
      bridges: parseTopNodes(bridges),
    };
    writeGraphPrefetch(args.projectPath, snapshot);
    return {
      wrote: true,
      reason: `prefetched 4 graph-orientation queries (${snapshot.communities?.length ?? 0} communities, ${snapshot.hubs?.length ?? 0} hubs, ${snapshot.bridges?.length ?? 0} bridges)`,
      path,
    };
  } catch (err) {
    return {
      wrote: false,
      reason: `prefetch failed: ${err instanceof Error ? err.message : String(err)}`,
      path,
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
        }),
        delay(PREFETCH_SHUTDOWN_GRACE_MS),
      ]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }
}

/**
 * Compute the SHA of a graph DB file the same way `computeGraphVersion`
 * does. Re-implemented locally (instead of imported) to keep this
 * service free of cross-module deps; the implementation is two lines
 * and has no other hidden state. Returns `'unknown'` on read failure.
 */
export function hashGraphDb(graphDbPath: string): string {
  try {
    return createHash('sha256').update(readFileSync(graphDbPath)).digest('hex');
  } catch {
    return 'unknown';
  }
}

/**
 * Helper around `client.callTool` that converts a thrown error into
 * `null`. The prefetch is best-effort: if any single tool fails, the
 * snapshot omits that section but the others still ship.
 */
async function safeCall(
  client: McpStdioClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await client.callTool(toolName, args);
  } catch (err) {
    logger.warn(
      `[graph-prefetch] tool=${toolName} failed (${err instanceof Error ? err.message : String(err)}) — section omitted`,
    );
    return null;
  }
}

function parseMinimalContext(raw: unknown): GraphPrefetchSnapshot['minimalContext'] {
  const obj = unwrapMcpToolResult(raw);
  if (!isObject(obj)) return undefined;
  const out: NonNullable<GraphPrefetchSnapshot['minimalContext']> = {};
  if (Array.isArray(obj.top_communities) || Array.isArray(obj.topCommunities)) {
    const list = (obj.top_communities ?? obj.topCommunities) as unknown[];
    out.topCommunities = list
      .filter(isObject)
      .map((c) => ({
        name: String(c.name ?? ''),
        size: typeof c.size === 'number' ? c.size : undefined,
        cohesion: typeof c.cohesion === 'number' ? c.cohesion : undefined,
      }))
      .filter((c) => c.name.length > 0);
  }
  if (Array.isArray(obj.top_flows) || Array.isArray(obj.topFlows)) {
    const list = (obj.top_flows ?? obj.topFlows) as unknown[];
    out.topFlows = list
      .filter(isObject)
      .map((f) => ({
        id: String(f.id ?? f.flow_id ?? ''),
        name: typeof f.name === 'string' ? f.name : undefined,
        criticality: typeof f.criticality === 'number' ? f.criticality : undefined,
      }))
      .filter((f) => f.id.length > 0);
  }
  if (typeof obj.risk_score === 'number') out.riskScore = obj.risk_score;
  else if (typeof obj.riskScore === 'number') out.riskScore = obj.riskScore;
  if (Array.isArray(obj.suggested_next_tools)) {
    out.suggestedNextTools = obj.suggested_next_tools.filter(
      (s): s is string => typeof s === 'string',
    );
  } else if (Array.isArray(obj.suggestedNextTools)) {
    out.suggestedNextTools = obj.suggestedNextTools.filter(
      (s): s is string => typeof s === 'string',
    );
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseCommunities(raw: unknown): GraphPrefetchSnapshot['communities'] {
  const obj = unwrapMcpToolResult(raw);
  let list: unknown[] = [];
  if (Array.isArray(obj)) list = obj;
  else if (isObject(obj) && Array.isArray(obj.communities)) list = obj.communities;
  if (list.length === 0) return undefined;
  return list
    .filter(isObject)
    .map((c) => ({
      name: String(c.name ?? c.id ?? ''),
      size: typeof c.size === 'number' ? c.size : undefined,
      cohesion: typeof c.cohesion === 'number' ? c.cohesion : undefined,
      dominant_language: typeof c.dominant_language === 'string' ? c.dominant_language : undefined,
    }))
    .filter((c) => c.name.length > 0);
}

function parseTopNodes(
  raw: unknown,
): Array<{ qualified_name: string; kind?: string; score?: number }> | undefined {
  const obj = unwrapMcpToolResult(raw);
  let list: unknown[] = [];
  if (Array.isArray(obj)) list = obj;
  else if (isObject(obj)) {
    if (Array.isArray(obj.hubs)) list = obj.hubs;
    else if (Array.isArray(obj.bridges)) list = obj.bridges;
    else if (Array.isArray(obj.nodes)) list = obj.nodes;
  }
  if (list.length === 0) return undefined;
  return list
    .filter(isObject)
    .map((n) => ({
      qualified_name: String(n.qualified_name ?? n.name ?? ''),
      kind: typeof n.kind === 'string' ? n.kind : undefined,
      score: typeof n.score === 'number' ? n.score : undefined,
    }))
    .filter((n) => n.qualified_name.length > 0);
}

/**
 * MCP tool responses come in two shapes depending on the server:
 *   - structured: `result` is the typed object directly.
 *   - text: `result.content[0].text` is a JSON string we must parse.
 *
 * Returns the parsed object, or `null` when neither shape applies.
 */
function unwrapMcpToolResult(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) return raw;
  if (Array.isArray(raw.content)) {
    for (const part of raw.content) {
      if (
        isObject(part) &&
        (part.type === 'text' || part.type === undefined) &&
        typeof part.text === 'string'
      ) {
        try {
          return JSON.parse(part.text);
        } catch {
          return part.text;
        }
      }
    }
  }
  return raw;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class McpStdioClient {
  private buffer = '';
  private nextId = 1;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf-8');
  }

  async initialize(): Promise<void> {
    await this.sendRequest<unknown>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'qaf-graph-prefetch', version: '1.0.0' },
    });
    this.sendNotification('notifications/initialized');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.sendRequest<unknown>('tools/call', { name, arguments: args });
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
            `MCP request id=${expectedId} (method=${method(expectedId)}) timed out after ${PREFETCH_REQUEST_TIMEOUT_MS}ms`,
          ),
        );
      }, PREFETCH_REQUEST_TIMEOUT_MS);
    });
  }
}

function method(id: number): string {
  return id === 1 ? 'initialize' : 'tools/call';
}

export const __INTERNAL = {
  PREFETCH_FILENAME,
};
