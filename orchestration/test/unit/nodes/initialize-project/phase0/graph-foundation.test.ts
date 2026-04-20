import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphFoundationNode } from '../../../../../src/nodes/initialize-project/phase0/graph-foundation.node.js';
import { buildCodeGraph } from '../../../../../src/services/graph-wiki/code-graph.service.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';

vi.mock('../../../../../src/services/graph-wiki/code-graph.service.js', () => ({
  buildCodeGraph: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
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
  });

  it('returns graph metadata when graph build succeeds', async () => {
    vi.mocked(buildCodeGraph).mockResolvedValue({
      code_graph_available: true,
      code_graph_path: '/test/project/.code-graph.db',
      code_graph_mcp_port: 3100,
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
      code_graph_path: '/test/project/.code-graph.db',
      code_graph_mcp_port: 3100,
      current_phase: 'phase0_graph',
    });
  });

  it('fails the workflow when graph build fails', async () => {
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
    expect(result.errors).toEqual(['previous error', 'graph_foundation: build failed']);
  });
});
