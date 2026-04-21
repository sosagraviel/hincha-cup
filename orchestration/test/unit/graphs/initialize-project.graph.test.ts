import { describe, expect, it } from 'vitest';
import {
  initializeProjectGraph,
  routeAfterGraphFoundation,
  routeToPhase,
} from '../../../src/graphs/initialize-project.graph.js';
import type { InitializeProjectState } from '../../../src/state/schemas/initialize-project.schema.js';

const baseState: InitializeProjectState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  current_phase: 'init',
  errors: [],
  warnings: [],
  phase1_retry_tracking: {},
};

describe('initializeProjectGraph routing', () => {
  it('routes start_phase 1 through graph foundation', () => {
    expect(routeToPhase({ ...baseState, start_phase: 1 })).toBe('graph_foundation');
  });

  it('preserves start_phase 2 routing to consolidation', () => {
    expect(routeToPhase({ ...baseState, start_phase: 2 })).toBe('consolidation');
  });

  it('preserves start_phase 4 routing to context generation', () => {
    expect(routeToPhase({ ...baseState, start_phase: 4 })).toBe('context_generation');
  });

  it('places wiki_generation between context_generation and resources', () => {
    const graph = initializeProjectGraph as any;
    const edges = Array.from(graph.allEdges).map((edge) => (edge as string[]).join('->'));

    expect(Object.keys(graph.nodes)).toContain('wiki_generation');
    expect(edges).toContain('context_generation->wiki_generation');
    expect(edges).toContain('wiki_generation->resources');
    expect(edges).not.toContain('context_generation->resources');
  });

  it('routes successful graph foundation to all phase 1 analyzers', () => {
    expect(routeAfterGraphFoundation({ ...baseState, current_phase: 'phase0_graph' })).toEqual([
      'structure_architecture_analyzer',
      'tech_stack_dependencies_analyzer',
      'code_patterns_testing_analyzer',
      'data_flows_integrations_analyzer',
    ]);
  });

  it('stops when graph foundation fails', () => {
    expect(routeAfterGraphFoundation({ ...baseState, current_phase: 'failed' })).toBe('__end__');
  });
});
