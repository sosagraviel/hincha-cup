import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return { ...actual, spawn: vi.fn() };
});

import {
  fetchCodeGraphToolCatalog,
  __resetToolCatalogCacheForTesting,
} from '../../../../../src/services/framework/code-graph/tool-catalog.service.js';

/**
 * A minimal fake of `ChildProcessWithoutNullStreams` shaped exactly for the
 * surface `McpStdioConversation` consumes: `stdin.write`, `stdout.{setEncoding,
 * on, off}`, `child.{once, kill, exitCode, signalCode}`. Replies to
 * `initialize` and `tools/list` requests via setImmediate so listeners are
 * registered first.
 */
function makeFakeMcpChild() {
  const stdout = new EventEmitter();
  // EventEmitter already has off() (alias for removeListener); only setEncoding
  // is missing on the prototype, so we attach it directly.
  Object.assign(stdout, { setEncoding: () => undefined });

  const child = new EventEmitter();
  Object.assign(child, {
    stdin: {
      write(line: string) {
        if (line.includes('"method":"initialize"')) {
          setImmediate(() =>
            stdout.emit(
              'data',
              Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n'),
            ),
          );
        } else if (line.includes('"method":"tools/list"')) {
          setImmediate(() =>
            stdout.emit(
              'data',
              Buffer.from(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: 2,
                  result: {
                    tools: [
                      { name: 'list_communities_tool', description: 'List communities' },
                      { name: 'get_community_tool', description: 'Get community detail' },
                    ],
                  },
                }) + '\n',
              ),
            ),
          );
        }
      },
    },
    stdout,
    stderr: new EventEmitter(),
    kill: () => undefined,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
  });
  return { child };
}

describe('tool-catalog disk cache', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    __resetToolCatalogCacheForTesting();
    projectPath = mkdtempSync(join(tmpdir(), 'tool-catalog-cache-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'tool-catalog-fw-'));
    mkdirSync(join(frameworkPath, 'scripts'), { recursive: true });
    writeFileSync(join(frameworkPath, 'scripts', 'code-review-graph-mcp.sh'), '#!/bin/bash\n');
    vi.mocked(spawn).mockReset();
  });

  afterEach(() => {
    __resetToolCatalogCacheForTesting();
  });

  function seedManifest(toolVersion: string, sha: string): void {
    mkdirSync(join(projectPath, '.code-review-graph'), { recursive: true });
    writeFileSync(
      join(projectPath, '.code-review-graph/extraction-manifest.json'),
      JSON.stringify({
        files_parsed: 10,
        languages: ['typescript'],
        tool_version: toolVersion,
        sha,
        build_time_ms: 1000,
        created_at: '2026-04-01T00:00:00.000Z',
      }),
    );
  }

  it('cache hit (matching tool_version + sha) — does NOT spawn an MCP session', async () => {
    seedManifest('code-review-graph 2.3.2', 'a'.repeat(64));
    // Pre-write the disk cache that would be written on the FIRST fetch.
    writeFileSync(
      join(projectPath, '.code-review-graph/.tool-catalog.json'),
      JSON.stringify({
        key: `code-review-graph 2.3.2::${'a'.repeat(64)}`,
        fetched_at: '2026-04-01T00:00:00.000Z',
        tools: [
          {
            name: 'mcp__code_graph__list_communities_tool',
            description: 'List communities',
          },
        ],
      }),
    );

    const tools = await fetchCodeGraphToolCatalog({ projectPath, frameworkPath });

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('mcp__code_graph__list_communities_tool');
    expect(vi.mocked(spawn).mock.calls.length).toBe(0);
  });

  it('cache miss (no manifest) — spawns MCP session and writes the cache file', async () => {
    // No manifest seeded → no cache key → must fetch fresh.
    const { child } = makeFakeMcpChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const tools = await fetchCodeGraphToolCatalog({ projectPath, frameworkPath });

    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(spawn).mock.calls.length).toBe(1);
    // No manifest = no key = no disk cache file written.
    expect(existsSync(join(projectPath, '.code-review-graph/.tool-catalog.json'))).toBe(false);
  });

  it('cache miss (mismatched key) — spawns MCP session and overwrites the disk cache', async () => {
    seedManifest('code-review-graph 2.3.2', 'b'.repeat(64));
    // Existing cache is for a DIFFERENT (tool_version, sha) tuple.
    writeFileSync(
      join(projectPath, '.code-review-graph/.tool-catalog.json'),
      JSON.stringify({
        key: `code-review-graph 2.2.0::${'z'.repeat(64)}`,
        fetched_at: '2026-04-01T00:00:00.000Z',
        tools: [
          {
            name: 'mcp__code_graph__stale_tool',
            description: 'should not be returned',
          },
        ],
      }),
    );

    const { child } = makeFakeMcpChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    const tools = await fetchCodeGraphToolCatalog({ projectPath, frameworkPath });

    expect(vi.mocked(spawn).mock.calls.length).toBe(1);
    expect(tools.every((t) => t.name !== 'mcp__code_graph__stale_tool')).toBe(true);

    // Disk cache was overwritten with the fresh key.
    const cached = JSON.parse(
      readFileSync(join(projectPath, '.code-review-graph/.tool-catalog.json'), 'utf-8'),
    ) as { key: string };
    expect(cached.key).toBe(`code-review-graph 2.3.2::${'b'.repeat(64)}`);
  });

  it('writes disk cache on fresh fetch when manifest provides a key', async () => {
    seedManifest('code-review-graph 2.3.2', 'c'.repeat(64));
    const { child } = makeFakeMcpChild();
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    await fetchCodeGraphToolCatalog({ projectPath, frameworkPath });

    const cachePath = join(projectPath, '.code-review-graph/.tool-catalog.json');
    expect(existsSync(cachePath)).toBe(true);
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as {
      key: string;
      tools: Array<{ name: string }>;
    };
    expect(cached.key).toBe(`code-review-graph 2.3.2::${'c'.repeat(64)}`);
    expect(cached.tools.length).toBeGreaterThan(0);
  });
});
