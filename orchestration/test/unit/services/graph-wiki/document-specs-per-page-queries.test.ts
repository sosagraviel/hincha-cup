import { describe, expect, it } from 'vitest';
import {
  buildCoreSpecs,
  buildServiceSpec,
} from '../../../../src/services/graph-wiki/document-specs.js';
import { Provider } from '../../../../src/providers/types.js';

/**
 * Per-page graph_queries_used.
 *
 * Pre-fix every per-service doc unioned graph_queries_used across all
 * four Phase 1 analyzers, leaking the structure-arch overview tools
 * into pages that never touched them. Now: structure-arch always
 * contributes (it's the discovery source); the other three contribute
 * only when their findings carry an entry keyed by the service id.
 *
 * The architecture spec already only carried structure-arch queries;
 * the matching test here is anti-regression. The index spec previously
 * carried the union; now it must be empty (deterministic catalog).
 *
 * Stack-agnostic: every fixture uses a generic id that could come
 * from any language family — no language token leaks into assertions.
 */

describe('per-page graph_queries_used scoping', () => {
  describe('architecture spec', () => {
    it('only carries structure-arch queries (anti-regression)', () => {
      const specs = buildCoreSpecs({
        projectPath: '/tmp/x',
        frameworkPath: '/framework',
        provider: Provider.CLAUDE,
        generatedAt: '2026-05-05T00:00:00.000Z',
        graph: { available: true, path: '/tmp/x/.code-review-graph/graph.db' },
        analyzers: {
          structure_architecture: {
            graph_queries_used: [
              'mcp__code_graph__get_minimal_context_tool',
              'mcp__code_graph__list_communities_tool',
              'mcp__code_graph__get_hub_nodes_tool',
            ],
            findings: {
              services: [
                {
                  id: 'svc-a',
                  path: 'svc-a',
                  type: 'backend',
                  language: 'typescript',
                  frameworks: {},
                },
              ],
            },
          },
          tech_stack_dependencies: {
            graph_queries_used: ['mcp__code_graph__semantic_search_nodes_tool'],
            findings: {},
          },
          code_patterns_testing: {
            graph_queries_used: ['mcp__code_graph__find_large_functions_tool'],
            findings: {},
          },
          data_flows_integrations: {
            graph_queries_used: ['mcp__code_graph__list_flows_tool'],
            findings: {},
          },
        },
        stackProfile: {
          services: [{ id: 'svc-a', path: 'svc-a', type: 'backend', language: 'typescript' }],
        },
        agentInvoker: async () => '',
      } as never);

      const arch = specs.find((s) => s.documentType === 'architecture');
      expect(arch).toBeDefined();
      expect(arch!.graphQueriesUsed).toEqual([
        'mcp__code_graph__get_hub_nodes_tool',
        'mcp__code_graph__get_minimal_context_tool',
        'mcp__code_graph__list_communities_tool',
      ]);
    });
  });

  describe('per-service spec', () => {
    const baseAnalyzers = {
      structure_architecture: {
        graph_queries_used: ['mcp__code_graph__get_minimal_context_tool'],
        findings: {
          services: [{ id: 'svc-a', path: 'svc-a', type: 'backend' }],
        },
      },
      tech_stack_dependencies: {
        graph_queries_used: ['mcp__code_graph__semantic_search_nodes_tool'],
        findings: {
          dependencies: {
            by_service: {
              'svc-a': { production: ['lib-a'], development: [], notable: [] },
              'other-svc': { production: ['lib-b'], development: [], notable: [] },
            },
          },
        },
      },
      code_patterns_testing: {
        graph_queries_used: ['mcp__code_graph__find_large_functions_tool'],
        findings: {
          testing: {
            'other-svc': { unit: { framework: 'pytest' } },
          },
        },
      },
      data_flows_integrations: {
        graph_queries_used: ['mcp__code_graph__list_flows_tool'],
        findings: {},
      },
    };

    it('includes only analyzers whose findings touch this service id', () => {
      const spec = buildServiceSpec(
        { id: 'svc-a', path: 'svc-a', type: 'backend' },
        baseAnalyzers as never,
      );
      // structure-arch always: yes.
      // tech-stack: by_service has `svc-a` — yes.
      // code-patterns: testing only has `other-svc` — NO.
      // data-flows: no findings at all — NO.
      expect(spec.graphQueriesUsed).toContain('mcp__code_graph__get_minimal_context_tool');
      expect(spec.graphQueriesUsed).toContain('mcp__code_graph__semantic_search_nodes_tool');
      expect(spec.graphQueriesUsed).not.toContain('mcp__code_graph__find_large_functions_tool');
      expect(spec.graphQueriesUsed).not.toContain('mcp__code_graph__list_flows_tool');
    });

    it('always includes structure-arch (the discovery source)', () => {
      // Even when other analyzers reference the service, structure-arch
      // must appear — the contract is "structure-arch always" because it
      // is the source of the service id itself.
      const spec = buildServiceSpec({ id: 'svc-a', path: 'svc-a', type: 'backend' }, {
        structure_architecture: {
          graph_queries_used: ['mcp__code_graph__get_minimal_context_tool'],
          findings: { services: [{ id: 'svc-a', path: 'svc-a', type: 'backend' }] },
        },
        tech_stack_dependencies: { graph_queries_used: [], findings: {} },
        code_patterns_testing: { graph_queries_used: [], findings: {} },
        data_flows_integrations: { graph_queries_used: [], findings: {} },
      } as never);
      expect(spec.graphQueriesUsed).toContain('mcp__code_graph__get_minimal_context_tool');
    });

    it('returns sorted unique queries (deterministic ordering)', () => {
      const spec = buildServiceSpec(
        { id: 'svc-a', path: 'svc-a', type: 'backend' },
        baseAnalyzers as never,
      );
      const sorted = [...spec.graphQueriesUsed].sort();
      expect(spec.graphQueriesUsed).toEqual(sorted);
      expect(spec.graphQueriesUsed).toEqual([...new Set(spec.graphQueriesUsed)]);
    });

    it('detects nested by_service maps under any topic name (forward-compat)', () => {
      // A future analyzer might emit `caching.by_service` or
      // `auth_strategies.<id>` — the key-walking detector picks them up
      // without listing them explicitly.
      const spec = buildServiceSpec({ id: 'svc-a', path: 'svc-a', type: 'backend' }, {
        structure_architecture: {
          graph_queries_used: ['mcp__code_graph__get_minimal_context_tool'],
          findings: { services: [{ id: 'svc-a', path: 'svc-a', type: 'backend' }] },
        },
        tech_stack_dependencies: {
          graph_queries_used: ['mcp__code_graph__semantic_search_nodes_tool'],
          findings: {
            caching_by_service: { 'svc-a': { type: 'redis' } },
          },
        },
        code_patterns_testing: { graph_queries_used: [], findings: {} },
        data_flows_integrations: { graph_queries_used: [], findings: {} },
      } as never);
      expect(spec.graphQueriesUsed).toContain('mcp__code_graph__semantic_search_nodes_tool');
    });
  });
});
