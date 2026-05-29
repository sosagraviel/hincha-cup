import { describe, expect, it } from 'vitest';
import { buildCoreSpecs } from '../../../../src/services/graph-wiki/document-specs.js';
import { Provider } from '../../../../src/providers/types.js';

/**
 * ARCHITECTURE.md spec must instruct the wiki-gen agent to wrap
 * discovered service ids in `[[id]]`. The instruction is load-bearing
 * for the `low_wikilink_density` soft check downstream: an agent that
 * follows the instruction never trips the warning.
 *
 * Stack-agnostic: the spec is built from the structure analyzer's
 * services array — the test fixture uses ids from any language family.
 */

function buildOptions() {
  return {
    projectPath: '/tmp/x',
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-05-05T00:00:00.000Z',
    graph: { available: true, path: '/tmp/x/.code-review-graph/graph.db' },
    analyzers: {
      structure_architecture: {
        graph_queries_used: [],
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

describe('architecture document spec — wikilink instruction', () => {
  it('promptFocus instructs the agent to wrap discovered service ids in [[id]]', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    expect(arch).toBeDefined();
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    expect(focusJoined).toMatch(/\[\[<id>\]\]/);
    expect(focusJoined).toMatch(/services\/<id>\.md/);
    expect(focusJoined).toMatch(/structure_architecture\.findings\.services/);
  });

  it('the wikilink instruction is stack-agnostic (no language assumption)', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    // The instruction must NOT name a specific language family.
    expect(focusJoined).not.toMatch(/TypeScript|Python|Go\b|Rails\b|Spring\b|\.NET\b/);
  });

  it('the wikilink instruction tells the agent to only link DISCOVERED ids (anti-fabrication)', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    const focusJoined = (arch!.promptFocus ?? []).join('\n');
    // Anti-fabrication: agent must not invent ids by linking
    // service-shaped tokens that the structure analyzer did not surface.
    expect(focusJoined).toMatch(/not wikilink ids that were not discovered/i);
  });
});
