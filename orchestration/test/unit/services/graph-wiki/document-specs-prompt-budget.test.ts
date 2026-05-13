import { describe, expect, it } from 'vitest';
import {
  buildCoreSpecs,
  buildPrompt,
  buildServiceSpec,
} from '../../../../src/services/graph-wiki/document-specs.js';
import { Provider } from '../../../../src/providers/types.js';

/**
 * Wiki-generator prompts ≤ 30 KB per doc on every
 * fixture (closed-book hygiene + per-doc digest scoping). Two
 * regression categories the budget catches:
 *
 *   - convention-skill sections leaking into the architecture page's
 *     digestedUpstream (prescriptive rules that don't belong on a
 *     descriptive architecture page);
 *   - per-service prompts carrying unrelated services' findings.
 *
 * Stack-agnostic: every fixture uses ids ("svc-a", "svc-b") and
 * languages ("typescript", "python", "go") that test the budget across
 * stacks; no language-specific assertion.
 */

const PROMPT_BUDGET_BYTES = 30 * 1024; // 30 KB

function makeBigSynthesis() {
  // Simulate a Phase 3 synthesis output with the four canonical
  // sections (architectural narrative + 3 convention skills). Each
  // section is padded so the unfiltered total is well above the 30 KB
  // budget — the test verifies the trim brings it under.
  const padding = (heading: string, n: number) =>
    [heading, '', ...Array(n).fill('Lorem ipsum dolor sit amet, padding line.')].join('\n');
  return [
    padding('## Architecture overview', 80),
    '',
    padding('## Code conventions', 200),
    '',
    padding('## Multi-file workflows', 200),
    '',
    padding('## Testing conventions', 200),
    '',
    padding('## Services', 80),
  ].join('\n');
}

function buildOptions(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectPath: '/tmp/x',
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-05-05T00:00:00.000Z',
    graph: {
      available: true,
      path: '/tmp/x/.code-review-graph/graph.db',
      stats: {
        files: 100,
        functions: 200,
        classes: 50,
        edges: 400,
        languages: ['typescript'],
        build_time_ms: 2000,
      },
    },
    analyzers: {
      structure_architecture: {
        graph_queries_used: ['mcp__code_graph__get_minimal_context_tool'],
        findings: {
          services: [
            {
              id: 'svc-a',
              path: 'svc-a',
              type: 'backend',
              language: 'typescript',
              frameworks: {},
            },
            {
              id: 'svc-b',
              path: 'svc-b',
              type: 'backend',
              language: 'python',
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
      services: [
        { id: 'svc-a', path: 'svc-a', type: 'backend', language: 'typescript' },
        { id: 'svc-b', path: 'svc-b', type: 'backend', language: 'python' },
      ],
    },
    digestedUpstream: {
      synthesis: makeBigSynthesis(),
      claudeMd: makeBigSynthesis(),
      architecturalNarrative: 'Architectural narrative body.',
    },
    agentInvoker: async () => '',
    ...overrides,
  };
}

describe('wiki-generator prompt budgets', () => {
  it('architecture prompt is under 30 KB even when synthesis carries oversized convention-skill sections', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    expect(arch).toBeDefined();
    const prompt = buildPrompt(arch!, '/tmp/x');
    expect(prompt.length).toBeLessThan(PROMPT_BUDGET_BYTES);
  });

  it('architecture prompt does NOT contain convention-skill sections from synthesis', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    const prompt = buildPrompt(arch!, '/tmp/x');
    // The convention-skill headings are prescriptive content for skills
    // (not the wiki). They must be stripped from the architecture prompt.
    expect(prompt).not.toMatch(/##\s+Code conventions/);
    expect(prompt).not.toMatch(/##\s+Multi-file workflows/);
    expect(prompt).not.toMatch(/##\s+Testing conventions/);
  });

  it('architecture prompt KEEPS architecture-relevant synthesis sections', () => {
    const specs = buildCoreSpecs(buildOptions() as never);
    const arch = specs.find((s) => s.documentType === 'architecture');
    const prompt = buildPrompt(arch!, '/tmp/x');
    // The architecture page still needs the narrative + services
    // sections from synthesis.
    expect(prompt).toMatch(/##\s+Architecture overview/);
    expect(prompt).toMatch(/##\s+Services/);
  });

  it('per-service prompt is under 30 KB on the multi-service fixture', () => {
    const opts = buildOptions() as never as Record<string, unknown>;
    const spec = buildServiceSpec(
      { id: 'svc-a', path: 'svc-a', type: 'backend' },
      (opts as { analyzers: never }).analyzers,
      (opts as { digestedUpstream: never }).digestedUpstream,
    );
    const prompt = buildPrompt(spec, '/tmp/x');
    expect(prompt.length).toBeLessThan(PROMPT_BUDGET_BYTES);
  });
});
