import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub out the logger to keep test output tidy.
vi.mock('../../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Spy on os.homedir so the helper resolves the sidecar inside the temp dir.
const tempHome = mkdtempSync(path.join(os.tmpdir(), 'graph-tool-usage-test-'));
const projectPath = '/Users/example/project-foo';

vi.spyOn(os, 'homedir').mockReturnValue(tempHome);

// Import lazily so the homedir spy is in place when claudeProjectSlug runs.
let applyGraphToolUsageFromSidecar: (typeof import('../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js'))['applyGraphToolUsageFromSidecar'];

beforeAll(async () => {
  ({ applyGraphToolUsageFromSidecar } =
    await import('../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js'));
});

const slug = '-Users-example-project-foo';
const sidecarDir = path.join(tempHome, '.claude', 'projects', slug);

beforeEach(() => {
  mkdirSync(sidecarDir, { recursive: true });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('applyGraphToolUsageFromSidecar', () => {
  it('replaces graph_queries_used with the canonical sorted list from the sidecar', () => {
    const sessionId = '00000000-0000-0000-0000-000000000001';
    writeFileSync(
      path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`),
      JSON.stringify({
        count: 5,
        // Intentionally unsorted to verify the helper sorts.
        uniqueNames: [
          'mcp__code_graph__list_communities_tool',
          'mcp__code_graph__get_community_tool',
          'mcp__code_graph__get_architecture_overview_tool',
        ],
      }),
    );

    const input = {
      agent_name: 'structure-architecture-analyzer',
      // Agent's free-form value — the helper must discard this.
      graph_queries_used: ["list_communities({ detail_level: 'standard' }) — exceeded token limit"],
      findings: { services: [] },
    };

    const out = applyGraphToolUsageFromSidecar(input, projectPath, sessionId);
    expect(out.graph_queries_used).toEqual([
      'mcp__code_graph__get_architecture_overview_tool',
      'mcp__code_graph__get_community_tool',
      'mcp__code_graph__list_communities_tool',
    ]);
    // Other fields preserved verbatim.
    expect(out.agent_name).toBe('structure-architecture-analyzer');
    expect(out.findings).toEqual({ services: [] });
  });

  it('forces graph_queries_used=[] when the sidecar is missing', () => {
    const sessionId = '00000000-0000-0000-0000-0000000000aa';
    const input = {
      agent_name: 'tech-stack-dependencies-analyzer',
      graph_queries_used: ['agent-supplied'],
    };

    const out = applyGraphToolUsageFromSidecar(input, projectPath, sessionId);
    expect(out.graph_queries_used).toEqual([]);
    expect(out.agent_name).toBe('tech-stack-dependencies-analyzer');
  });

  it('forces graph_queries_used=[] when the sidecar is malformed', () => {
    const sessionId = '00000000-0000-0000-0000-0000000000bb';
    writeFileSync(path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`), '{not valid json');

    const out = applyGraphToolUsageFromSidecar(
      { graph_queries_used: ['agent-supplied'] },
      projectPath,
      sessionId,
    );
    expect(out.graph_queries_used).toEqual([]);
  });

  it('forces graph_queries_used=[] when sessionId is undefined (e.g. DeepAgents)', () => {
    const out = applyGraphToolUsageFromSidecar(
      { graph_queries_used: ['agent-supplied'] },
      projectPath,
      undefined,
    );
    expect(out.graph_queries_used).toEqual([]);
  });

  it('returns a populated graph_queries_used field even if input lacks the key', () => {
    const sessionId = '00000000-0000-0000-0000-0000000000cc';
    writeFileSync(
      path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`),
      JSON.stringify({ count: 1, uniqueNames: ['mcp__code_graph__list_flows_tool'] }),
    );

    const out = applyGraphToolUsageFromSidecar({ findings: {} }, projectPath, sessionId);
    expect(out.graph_queries_used).toEqual(['mcp__code_graph__list_flows_tool']);
    expect(out.findings).toEqual({});
  });

  it('drops non-string entries from the sidecar uniqueNames array', () => {
    const sessionId = '00000000-0000-0000-0000-0000000000dd';
    writeFileSync(
      path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`),
      JSON.stringify({
        count: 3,
        uniqueNames: ['mcp__code_graph__list_flows_tool', null, 42, ''],
      }),
    );

    const out = applyGraphToolUsageFromSidecar({}, projectPath, sessionId);
    expect(out.graph_queries_used).toEqual(['mcp__code_graph__list_flows_tool']);
  });

  describe('graph-tool overflow telemetry', () => {
    it('reports zero overflows when sidecar has no overflows[] field', () => {
      const sessionId = '00000000-0000-0000-0000-0000000000ee';
      writeFileSync(
        path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`),
        JSON.stringify({ count: 1, uniqueNames: ['mcp__code_graph__list_flows_tool'] }),
      );

      const out = applyGraphToolUsageFromSidecar({}, projectPath, sessionId);
      expect(out.graph_overflow_count).toBe(0);
      expect(out.graph_overflow_tools).toEqual([]);
    });

    it('counts overflows and dedupes the tool list', () => {
      const sessionId = '00000000-0000-0000-0000-0000000000ff';
      writeFileSync(
        path.join(sidecarDir, `${sessionId}.graph-tool-uses.json`),
        JSON.stringify({
          count: 4,
          uniqueNames: [
            'mcp__code_graph__get_architecture_overview_tool',
            'mcp__code_graph__list_communities_tool',
          ],
          overflows: [
            { tool: 'mcp__code_graph__get_architecture_overview_tool', callIndex: 1 },
            { tool: 'mcp__code_graph__list_communities_tool', callIndex: 2 },
            { tool: 'mcp__code_graph__get_architecture_overview_tool', callIndex: 4 },
          ],
        }),
      );

      const out = applyGraphToolUsageFromSidecar({}, projectPath, sessionId);
      expect(out.graph_overflow_count).toBe(3);
      expect(out.graph_overflow_tools).toEqual([
        'mcp__code_graph__get_architecture_overview_tool',
        'mcp__code_graph__list_communities_tool',
      ]);
    });

    it('forces overflow telemetry to zero when sessionId is undefined', () => {
      const out = applyGraphToolUsageFromSidecar({}, projectPath, undefined);
      expect(out.graph_overflow_count).toBe(0);
      expect(out.graph_overflow_tools).toEqual([]);
    });

    it('forces overflow telemetry to zero when sidecar is missing', () => {
      const out = applyGraphToolUsageFromSidecar(
        {},
        projectPath,
        '00000000-0000-0000-0000-00000000abcd',
      );
      expect(out.graph_overflow_count).toBe(0);
      expect(out.graph_overflow_tools).toEqual([]);
    });
  });
});
