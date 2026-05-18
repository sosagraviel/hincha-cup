import { describe, expect, it } from 'vitest';
import {
  initializeProjectGraph,
  routeAfterGraphFoundation,
  routeAfterWikiPreparation,
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

  it('routes context_generation through the wiki subgraph into resources', () => {
    const graph = initializeProjectGraph as any;
    const edges = Array.from(graph.allEdges).map((edge) => (edge as string[]).join('->'));

    // Wiki subgraph nodes that survived H4 are registered.
    for (const name of [
      'wiki_preparation',
      'wiki_architecture_doc',
      'wiki_service_docs',
      'wiki_generation',
    ]) {
      expect(Object.keys(graph.nodes)).toContain(name);
    }

    // The wiki_dataflows_doc and wiki_patterns_doc nodes were retired
    // along with the cross-cutting DATA-FLOWS.md and PATTERNS.md pages.
    expect(Object.keys(graph.nodes)).not.toContain('wiki_dataflows_doc');
    expect(Object.keys(graph.nodes)).not.toContain('wiki_patterns_doc');

    // Phase 4 chains: context_generation → wiki_preparation →
    // [wiki_architecture_doc, wiki_service_docs] (parallel) →
    // wiki_generation → resources.
    //
    // The architecture and service-docs branches fan out from
    // wiki_preparation and converge on wiki_generation in parallel.
    expect(edges).toContain('context_generation->wiki_preparation');
    expect(edges).toContain('wiki_architecture_doc->wiki_generation');
    expect(edges).toContain('wiki_service_docs->wiki_generation');
    expect(edges).not.toContain('wiki_architecture_doc->wiki_service_docs');
    expect(edges).toContain('wiki_generation->resources');
    expect(edges).not.toContain('context_generation->resources');
    expect(edges).not.toContain('context_generation->wiki_generation');
  });

  it('routes wiki_preparation in parallel to the architecture + service-docs branches', () => {
    const route = routeAfterWikiPreparation({
      ...baseState,
      current_phase: 'phase4_context',
    });
    expect(route).toEqual(['wiki_architecture_doc', 'wiki_service_docs']);
  });

  it('stops the wiki subgraph when preparation fails', () => {
    expect(routeAfterWikiPreparation({ ...baseState, current_phase: 'failed' })).toBe('__end__');
  });

  it('fans out from graph foundation to ALL four analyzers in parallel', () => {
    // Phase 1 runs every analyzer concurrently. Cross-analyzer service-ID
    // consistency is preserved by injecting an inspection-derived seed at
    // prompt-build time and reconciling drift in Phase 2 / Phase 4 — not by
    // serializing the structure analyzer ahead of the other three.
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
