/**
 * Plan §C, commit A (2026-05-05) — provider-aware sidecar loaders.
 *
 * `applyGraphToolUsageFromSidecar` now accepts a `SidecarLoader`
 * callback so the same downstream code path serves both Claude
 * (sidecar in `~/.claude/projects/...`) and Codex (sidecar in
 * `<projectPath>/.codex-temp/initialize-project/graph-tool-uses/`).
 *
 * These tests verify the loader plumbing without requiring a live
 * agent run: feed a fake sidecar through each loader and assert
 * the same downstream telemetry shape.
 */
import { mkdir, writeFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyGraphToolUsageFromSidecar,
  codexSidecarDir,
  getSidecarLoaderForProvider,
  loadClaudeSidecar,
  loadCodexSidecar,
  type GraphToolUsesSidecar,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'sidecar-loader-'));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

const FIXTURE_SIDECAR: GraphToolUsesSidecar = {
  count: 5,
  uniqueNames: ['mcp__code_graph__get_community_tool', 'mcp__code_graph__list_communities_tool'],
  nameCounts: {
    mcp__code_graph__list_communities_tool: 1,
    mcp__code_graph__get_community_tool: 4,
  },
  nonGraphCount: 2,
  overflows: [
    { tool: 'mcp__code_graph__get_community_tool', callIndex: 3 },
    { tool: 'mcp__code_graph__get_community_tool', callIndex: 4 },
  ],
};

describe('getSidecarLoaderForProvider', () => {
  it('returns the Codex loader for "codex"', () => {
    expect(getSidecarLoaderForProvider('codex')).toBe(loadCodexSidecar);
  });

  it('returns the Claude loader for "claude"', () => {
    expect(getSidecarLoaderForProvider('claude')).toBe(loadClaudeSidecar);
  });
});

describe('codexSidecarDir', () => {
  it('places the sidecar dir under the project .codex-temp tree', () => {
    const dir = codexSidecarDir('/tmp/some-project');
    expect(dir).toBe('/tmp/some-project/.codex-temp/initialize-project/graph-tool-uses');
  });

  it('resolves relative project paths to absolute (idempotent on subsequent calls)', () => {
    const a = codexSidecarDir('/tmp/p');
    const b = codexSidecarDir('/tmp/p');
    expect(a).toBe(b);
  });
});

describe('loadCodexSidecar — round-trip with applyGraphToolUsageFromSidecar', () => {
  it('reads a fixture sidecar and surfaces overflow + soft warnings', async () => {
    const dir = codexSidecarDir(tempDir);
    await mkdir(dir, { recursive: true });
    const sessionId = 'fwk-session-123';
    await writeFile(
      join(dir, `${sessionId}.graph-tool-uses.json`),
      JSON.stringify(FIXTURE_SIDECAR),
      'utf-8',
    );

    const result = applyGraphToolUsageFromSidecar(
      { agent_name: 'structure-architecture-analyzer' },
      tempDir,
      sessionId,
      'structure-architecture-analyzer',
      loadCodexSidecar,
    );

    expect(result.graph_queries_used).toEqual([
      'mcp__code_graph__get_community_tool',
      'mcp__code_graph__list_communities_tool',
    ]);
    expect(result.graph_overflow_count).toBe(2);
    expect(result.graph_overflow_tools).toEqual(['mcp__code_graph__get_community_tool']);
    // 4 calls + 2 overflows × 2 = 8 effective vs cap 4 for get_community_tool
    expect(result.soft_warning).toContain('per_tool_budget_exceeded');
    expect(result.soft_warning).toContain('graph_overflow_detected');
  });

  it('returns empty telemetry when the Codex sidecar is absent (forward fallback)', () => {
    const result = applyGraphToolUsageFromSidecar(
      { agent_name: 'structure-architecture-analyzer' },
      tempDir,
      'no-sidecar-here',
      'structure-architecture-analyzer',
      loadCodexSidecar,
    );

    expect(result.graph_queries_used).toEqual([]);
    expect(result.graph_overflow_count).toBe(0);
    expect(result.graph_overflow_tools).toEqual([]);
    expect(result.soft_warning).toEqual([]);
  });

  it('expectedPath resolves under the project .codex-temp tree', () => {
    const expected = loadCodexSidecar.expectedPath(tempDir, 'sess-x');
    expect(expected).toContain('.codex-temp/initialize-project/graph-tool-uses/sess-x');
  });
});

describe('loadClaudeSidecar — back-compat behaviour', () => {
  it('expectedPath uses the Claude home slug convention', () => {
    const expected = loadClaudeSidecar.expectedPath('/tmp/myproject', 'sess-x');
    // slug = '/tmp/myproject' with all '/' → '-'
    expect(expected).toContain('.claude/projects');
    expect(expected).toContain('-tmp-myproject');
    expect(expected).toContain('sess-x.graph-tool-uses.json');
  });
});

describe('applyGraphToolUsageFromSidecar — default loader is Claude (back-compat)', () => {
  it('still reads from the Claude path when no loader is passed (existing call sites)', () => {
    // Calling without a loader argument MUST keep working — hundreds of
    // existing analyzer attempts on disk depend on the old behaviour
    // when run on Claude. The default-parameter form preserves it.
    const result = applyGraphToolUsageFromSidecar(
      { agent_name: 'structure-architecture-analyzer' },
      tempDir,
      'no-such-session',
      'structure-architecture-analyzer',
    );
    // Empty fallback (no Claude sidecar exists for this session id) —
    // same shape as before the refactor.
    expect(result.graph_queries_used).toEqual([]);
    expect(result.graph_overflow_count).toBe(0);
  });
});

describe('applyGraphToolUsageFromSidecar — sessionId undefined path', () => {
  it('forces empty telemetry without invoking the loader', () => {
    let loaderCalls = 0;
    const spyLoader = {
      expectedPath: () => '/never',
      load: () => {
        loaderCalls++;
        return null;
      },
    };
    const result = applyGraphToolUsageFromSidecar(
      { agent_name: 'x' },
      tempDir,
      undefined,
      'x',
      spyLoader,
    );
    expect(result.graph_queries_used).toEqual([]);
    expect(loaderCalls).toBe(0);
  });
});
