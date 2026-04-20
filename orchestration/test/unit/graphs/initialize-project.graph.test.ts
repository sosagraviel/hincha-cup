import { describe, expect, it } from 'vitest';
import {
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
