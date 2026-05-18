import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphFoundationNode } from '../../../../../src/nodes/initialize-project/phase0/graph-foundation.node.js';
import { buildCodeGraph } from '../../../../../src/services/graph-wiki/code-graph.service.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';

vi.mock('../../../../../src/services/graph-wiki/code-graph.service.js', () => ({
  buildCodeGraph: vi.fn(),
}));

vi.mock('../../../../../src/services/framework/mcp-config.service.js', () => ({
  upsertCodeGraphMcpConfig: vi.fn(() => ({
    configPath: '/test/project/.mcp.json',
    changed: false,
  })),
}));

const infoMessages: string[] = [];
const successMessages: string[] = [];
const errorMessages: string[] = [];

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn((msg: string) => {
        infoMessages.push(msg);
      }),
      success: vi.fn((msg: string) => {
        successMessages.push(msg);
      }),
      error: vi.fn((msg: string) => {
        errorMessages.push(msg);
      }),
    })),
  },
}));

const baseState: InitializeProjectState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  current_phase: 'init',
  errors: [],
  warnings: [],
  phase1_retry_tracking: {},
};

describe('graphFoundationNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    infoMessages.length = 0;
    successMessages.length = 0;
    errorMessages.length = 0;
  });

  it('returns graph metadata when graph build succeeds', async () => {
    vi.mocked(buildCodeGraph).mockResolvedValue({
      code_graph_available: true,
      code_graph_path: '/test/project/.code-review-graph/graph.db',
      code_graph_stats: {
        files: 10,
        functions: 20,
        classes: 3,
        edges: 40,
        languages: ['typescript'],
        build_time_ms: 1234,
      },
    });

    const result = await graphFoundationNode(baseState);

    expect(buildCodeGraph).toHaveBeenCalledWith({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
    });
    expect(result).toMatchObject({
      code_graph_available: true,
      code_graph_path: '/test/project/.code-review-graph/graph.db',
      current_phase: 'phase0_graph',
    });
  });

  it('logs file count and build time in success message', async () => {
    vi.mocked(buildCodeGraph).mockResolvedValue({
      code_graph_available: true,
      code_graph_path: '/test/project/.code-review-graph/graph.db',
      code_graph_stats: {
        files: 247,
        functions: 1834,
        classes: 156,
        languages: ['typescript', 'javascript'],
        build_time_ms: 2400,
      },
    });

    await graphFoundationNode(baseState);

    const statsLine = infoMessages.find((m) => m.includes('Files:'));
    expect(statsLine).toBeDefined();
    expect(statsLine).toContain('Files: 247');
    expect(statsLine).toContain('Functions: 1834');
    expect(statsLine).toContain('Classes: 156');
    expect(statsLine).toContain('typescript');
    expect(statsLine).toContain('Build: 2.4s');
  });

  it('formats build time in minutes and seconds for long builds', async () => {
    vi.mocked(buildCodeGraph).mockResolvedValue({
      code_graph_available: true,
      code_graph_path: '/test/project/.code-review-graph/graph.db',
      code_graph_stats: {
        files: 100,
        functions: 500,
        languages: ['typescript'],
        build_time_ms: 72000,
      },
    });

    await graphFoundationNode(baseState);

    const statsLine = infoMessages.find((m) => m.includes('Files:'));
    expect(statsLine).toContain('Build: 1m 12s');
  });

  it('fails the workflow when graph build fails (returns only the new error; reducer merges)', async () => {
    // Phase E: nodes return only NEW errors; the annotation reducer
    // concatenates with prior state.errors.
    vi.mocked(buildCodeGraph).mockRejectedValue(new Error('build failed'));

    const result = await graphFoundationNode({
      ...baseState,
      errors: ['previous error'],
    });

    expect(result).toMatchObject({
      code_graph_available: false,
      code_graph_error: 'build failed',
      current_phase: 'failed',
    });
    expect(result.errors).toEqual(['graph_foundation: build failed']);
  });

  it('logs remediation hint on failure', async () => {
    vi.mocked(buildCodeGraph).mockRejectedValue(
      new Error(
        'code-review-graph failed verification after autofix attempt.\nLast error: command not found',
      ),
    );

    await graphFoundationNode(baseState);

    const remediationLine = errorMessages.find((m) => m.includes('setup-code-graph.sh'));
    expect(remediationLine).toBeDefined();
    expect(remediationLine).toContain('https://docs.astral.sh/uv/getting-started/installation/');
  });

  it('sets current_phase to failed and includes error in errors array on failure', async () => {
    vi.mocked(buildCodeGraph).mockRejectedValue(new Error('smoke test failed'));

    const result = await graphFoundationNode({
      ...baseState,
      errors: [],
    });

    expect(result.current_phase).toBe('failed');
    expect(result.errors).toContain('graph_foundation: smoke test failed');
  });
});
