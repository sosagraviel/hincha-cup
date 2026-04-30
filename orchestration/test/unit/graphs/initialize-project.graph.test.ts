import { describe, expect, it } from 'vitest';
import {
  initializeProjectGraph,
  routeAfterGraphFoundation,
  routeAfterStructureAnalyzer,
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

    // The wiki_dataflows_doc and wiki_patterns_doc nodes were retired in H4
    // along with the cross-cutting DATA-FLOWS.md and PATTERNS.md pages.
    expect(Object.keys(graph.nodes)).not.toContain('wiki_dataflows_doc');
    expect(Object.keys(graph.nodes)).not.toContain('wiki_patterns_doc');

    // Phase 4 chains: context_generation → wiki_preparation → wiki_architecture_doc
    // → wiki_service_docs → wiki_generation → resources.
    expect(edges).toContain('context_generation->wiki_preparation');
    expect(edges).toContain('wiki_architecture_doc->wiki_service_docs');
    expect(edges).toContain('wiki_service_docs->wiki_generation');
    expect(edges).toContain('wiki_generation->resources');
    expect(edges).not.toContain('context_generation->resources');
    expect(edges).not.toContain('context_generation->wiki_generation');
  });

  it('routes wiki_preparation directly to the architecture core-doc node (single-doc subgraph after H4)', () => {
    expect(routeAfterWikiPreparation({ ...baseState, current_phase: 'phase4_context' })).toBe(
      'wiki_architecture_doc',
    );
  });

  it('stops the wiki subgraph when preparation fails', () => {
    expect(routeAfterWikiPreparation({ ...baseState, current_phase: 'failed' })).toBe('__end__');
  });

  it('routes successful graph foundation to ONLY the structure-analyzer (sequential head)', () => {
    // The Phase 1 topology is sequential at the head: structure-analyzer
    // runs first, alone, and persists the authoritative services[]. The
    // three downstream analyzers (02/03/04) consume that file before
    // building their own prompts. See plans/2026-04-29-gira-init-run-audit-refactor
    // findings F7/F22.
    expect(routeAfterGraphFoundation({ ...baseState, current_phase: 'phase0_graph' })).toBe(
      'structure_architecture_analyzer',
    );
  });

  it('stops when graph foundation fails', () => {
    expect(routeAfterGraphFoundation({ ...baseState, current_phase: 'failed' })).toBe('__end__');
  });

  it('fans out from the structure-analyzer to the three downstream analyzers in parallel', () => {
    expect(routeAfterStructureAnalyzer({ ...baseState, current_phase: 'phase1_analysis' })).toEqual(
      [
        'tech_stack_dependencies_analyzer',
        'code_patterns_testing_analyzer',
        'data_flows_integrations_analyzer',
      ],
    );
  });

  it('stops when the structure-analyzer fails (Phase 1 cannot proceed without authoritative services)', () => {
    expect(routeAfterStructureAnalyzer({ ...baseState, current_phase: 'failed' })).toBe('__end__');
  });
});
