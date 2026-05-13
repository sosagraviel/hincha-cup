import { describe, expect, it } from 'vitest';
import { buildCoreSpecs } from '../../../../src/services/graph-wiki/document-specs.js';
import { Provider } from '../../../../src/providers/types.js';

/**
 * When the structure-architecture analyzer surfaces
 * `findings.architecture.coupling` (hubs/bridges from the graph's top
 * topology results), the Phase 4 ARCHITECTURE.md spec must include a
 * "Coupling hotspots" instruction in its promptFocus so the wiki-gen
 * agent renders the section.
 *
 * Stack-agnostic: the test fixtures use deliberately language-neutral
 * qualified_name shapes ("svc/foo", "pkg/bar") — never tied to a
 * single language family. The instruction itself names graph fields
 * (qualified_name, kind, score) that exist regardless of stack.
 */

function buildOptions(structureFindings: unknown) {
  return {
    projectPath: '/tmp/x',
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-05-05T00:00:00.000Z',
    graph: { available: true, path: '/tmp/x/.code-review-graph/graph.db' },
    analyzers: {
      structure_architecture: {
        graph_queries_used: [],
        findings: structureFindings,
      },
      tech_stack_dependencies: { graph_queries_used: [], findings: {} },
      code_patterns_testing: { graph_queries_used: [], findings: {} },
      data_flows_integrations: { graph_queries_used: [], findings: {} },
    },
    stackProfile: {
      services: [{ id: 'svc-a', path: 'svc-a', type: 'backend', language: 'typescript' }],
    },
    agentInvoker: async () => '',
  };
}

describe('architecture document spec — Coupling hotspots prompt focus', () => {
  it('includes a Coupling hotspots focus when hubs are present', () => {
    const specs = buildCoreSpecs(
      buildOptions({
        services: [
          {
            id: 'svc-a',
            path: 'svc-a',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
        architecture: {
          coupling: {
            hubs: [
              { qualified_name: 'svc-a/Foo', kind: 'Class', score: 12 },
              { qualified_name: 'svc-a/Bar', kind: 'File', score: 9 },
              { qualified_name: 'svc-a/Baz', kind: 'Function', score: 7 },
            ],
            bridges: [],
          },
        },
      }) as never,
    );

    const arch = specs.find((s) => s.documentType === 'architecture');
    expect(arch).toBeDefined();
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    expect(focusJoined).toMatch(/Coupling hotspots/);
    expect(focusJoined).toMatch(/qualified_name verbatim/);
    expect(focusJoined).toContain('`structure_architecture.findings.architecture.coupling`');
  });

  it('includes a Coupling hotspots focus when only bridges are present', () => {
    const specs = buildCoreSpecs(
      buildOptions({
        services: [
          {
            id: 'svc-a',
            path: 'svc-a',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
        architecture: {
          coupling: {
            hubs: [],
            bridges: [{ qualified_name: 'pkg/y', kind: 'Function', score: 5 }],
          },
        },
      }) as never,
    );

    const arch = specs.find((s) => s.documentType === 'architecture');
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    expect(focusJoined).toMatch(/Coupling hotspots/);
  });

  it('does NOT include the Coupling hotspots focus when coupling is missing', () => {
    const specs = buildCoreSpecs(
      buildOptions({
        services: [
          {
            id: 'svc-a',
            path: 'svc-a',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
      }) as never,
    );

    const arch = specs.find((s) => s.documentType === 'architecture');
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    expect(focusJoined).not.toMatch(/Coupling hotspots/);
  });

  it('does NOT include the focus when hubs and bridges are both empty arrays', () => {
    const specs = buildCoreSpecs(
      buildOptions({
        services: [
          {
            id: 'svc-a',
            path: 'svc-a',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
        architecture: { coupling: { hubs: [], bridges: [] } },
      }) as never,
    );

    const arch = specs.find((s) => s.documentType === 'architecture');
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    expect(focusJoined).not.toMatch(/Coupling hotspots/);
  });
});
