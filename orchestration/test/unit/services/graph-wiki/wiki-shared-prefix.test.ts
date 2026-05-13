import { describe, expect, it } from 'vitest';
import {
  buildCoreSpecs,
  buildPrompt,
  buildServiceSpec,
  buildWikiSharedPrefix,
} from '../../../../src/services/graph-wiki/document-specs.js';
import { Provider } from '../../../../src/providers/types.js';

/**
 * Every wiki-gen prompt in a run starts with the
 * SAME byte-identical prefix so Anthropic/OpenAI prefix cache hits
 * on calls 2..N.
 *
 * The prefix carries the closed-book framing + project path. The
 * spec-specific tail (title / focus / sourceContext) starts after
 * the prefix.
 *
 * Stack-agnostic: the prefix carries no project-shape assumption;
 * the only interpolation is the projectPath, which is constant per
 * run (any wiki-gen prompt for a given init invocation hits it).
 */

function buildOptions() {
  return {
    projectPath: '/test/project-X',
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-05-05T00:00:00.000Z',
    graph: { available: true, path: '/test/project-X/.code-review-graph/graph.db' },
    analyzers: {
      structure_architecture: {
        graph_queries_used: [],
        findings: {
          services: [
            { id: 'a', path: 'a', type: 'backend', language: 'typescript', frameworks: {} },
            { id: 'b', path: 'b', type: 'backend', language: 'typescript', frameworks: {} },
          ],
        },
      },
      tech_stack_dependencies: { graph_queries_used: [], findings: {} },
      code_patterns_testing: { graph_queries_used: [], findings: {} },
      data_flows_integrations: { graph_queries_used: [], findings: {} },
    },
    stackProfile: {
      services: [
        { id: 'a', path: 'a', type: 'backend', language: 'typescript' },
        { id: 'b', path: 'b', type: 'backend', language: 'typescript' },
      ],
    },
    agentInvoker: async () => '',
  };
}

describe('Wiki-gen shared prefix', () => {
  it('every wiki-gen prompt starts with the byte-identical shared prefix', () => {
    const options = buildOptions() as never;
    const prefix = buildWikiSharedPrefix('/test/project-X');

    const archSpec = buildCoreSpecs(options).find((s) => s.documentType === 'architecture')!;
    const archPrompt = buildPrompt(archSpec, '/test/project-X');
    expect(archPrompt.startsWith(prefix)).toBe(true);

    const aSpec = buildServiceSpec(
      { id: 'a', path: 'a', type: 'backend' },
      (options as { analyzers: never }).analyzers,
    );
    const aPrompt = buildPrompt(aSpec, '/test/project-X');
    expect(aPrompt.startsWith(prefix)).toBe(true);

    const bSpec = buildServiceSpec(
      { id: 'b', path: 'b', type: 'backend' },
      (options as { analyzers: never }).analyzers,
    );
    const bPrompt = buildPrompt(bSpec, '/test/project-X');
    expect(bPrompt.startsWith(prefix)).toBe(true);
  });

  it('the shared prefix has non-trivial size (cacheable signal worth the cache miss)', () => {
    // The Anthropic / OpenAI prefix cache benefits scale with prefix
    // length. ~500 bytes is the realistic floor for the wiki-gen
    // closed-book framing.
    const prefix = buildWikiSharedPrefix('/test/project-X');
    expect(prefix.length).toBeGreaterThan(500);
  });

  it('the shared prefix is identical for every prompt with the same projectPath', () => {
    const a = buildWikiSharedPrefix('/p');
    const b = buildWikiSharedPrefix('/p');
    expect(a).toBe(b);
  });

  it('the shared prefix differs across projects (cache key advances correctly)', () => {
    expect(buildWikiSharedPrefix('/project-A')).not.toBe(buildWikiSharedPrefix('/project-B'));
  });

  it('per-service prompts diverge AFTER the shared prefix (not before)', () => {
    const options = buildOptions() as never;
    const aSpec = buildServiceSpec(
      { id: 'a', path: 'a', type: 'backend' },
      (options as { analyzers: never }).analyzers,
    );
    const bSpec = buildServiceSpec(
      { id: 'b', path: 'b', type: 'backend' },
      (options as { analyzers: never }).analyzers,
    );
    const aPrompt = buildPrompt(aSpec, '/test/project-X');
    const bPrompt = buildPrompt(bSpec, '/test/project-X');
    const prefix = buildWikiSharedPrefix('/test/project-X');

    // Walk byte-by-byte: the divergence point must be AT OR AFTER the
    // end of the shared prefix.
    let i = 0;
    while (i < aPrompt.length && i < bPrompt.length && aPrompt[i] === bPrompt[i]) i++;
    expect(i).toBeGreaterThanOrEqual(prefix.length);
  });
});
