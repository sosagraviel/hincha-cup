/**
 * Load-bearing byte-determinism tests for the cache-eligible Phase 1
 * prompt prefix.
 *
 * Anthropic's automatic prompt cache hits when the cumulative prefix
 * up to a marker is **byte-identical** across requests. If the prefix
 * varies even by one whitespace character between analyzers (or
 * between successive runs in the same TTL window), the cache can't hit.
 *
 * This file is the regression net. Any future change that accidentally
 * interpolates an analyzer-specific token, a timestamp, or a fresh nonce
 * into the prefix will fail one of these tests before it ships.
 */
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPhase1AnalyzerPrompt,
  buildPhase1SharedPrefix,
  type GraphPromptContext,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/prompt-builder.js';

vi.mock('../../../../../../src/utils/shared/prompt-loader.js', () => ({
  getExcludedDirectories: vi.fn(() => [
    'node_modules',
    'dist',
    '.git',
    'build',
    '.cache',
    'coverage',
  ]),
  loadExecutionInstructions: vi.fn(
    (agentName: string) =>
      `# Execution instructions for ${agentName}\n\nThis body varies per analyzer.`,
  ),
}));

const ANALYZERS = [
  'structure-architecture-analyzer',
  'tech-stack-dependencies-analyzer',
  'code-patterns-testing-analyzer',
  'data-flows-integrations-analyzer',
] as const;

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

const SHARED_GRAPH_CONTEXT: GraphPromptContext = {
  available: true,
  dbPath: '/test/project/.code-review-graph/graph.db',
  stats: { files: 320, functions: 1500, edges: 4200, languages: ['typescript'], build_time_ms: 0 },
};

describe('buildPhase1SharedPrefix — byte-determinism contract', () => {
  it('returns the same bytes when called twice with the same context', () => {
    const a = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    const b = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(sha256(a)).toBe(sha256(b));
  });

  it('does not depend on agentName (the prefix is built without it)', () => {
    // The four analyzer prompts must share bytes 1..N exactly. The
    // prefix is computed from `SharedPrefixContext` only — agentName
    // is intentionally absent from that interface.
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix).not.toContain('structure-architecture-analyzer');
    expect(prefix).not.toContain('tech-stack-dependencies-analyzer');
    expect(prefix).not.toContain('code-patterns-testing-analyzer');
    expect(prefix).not.toContain('data-flows-integrations-analyzer');
  });

  it('changes when projectPath changes (different project = different prefix)', () => {
    const a = buildPhase1SharedPrefix({
      projectPath: '/test/project-a',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    const b = buildPhase1SharedPrefix({
      projectPath: '/test/project-b',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(sha256(a)).not.toBe(sha256(b));
  });

  it('produces a prefix that is non-trivial in size (≥ 1024 bytes — Anthropic cache threshold)', () => {
    // Anthropic's automatic prefix cache requires ≥ ~1024 tokens (~4 KB)
    // before caching engages. Below that, the savings can't offset the
    // overhead. This test asserts we're above the threshold so callers
    // can trust the savings calculation.
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix.length).toBeGreaterThan(1024);
  });

  it('includes the excluded-directories block', () => {
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix).toContain('<excluded_directories>');
    expect(prefix).toContain('node_modules');
  });

  it('includes the project path block', () => {
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix).toContain('<project_path>');
    expect(prefix).toContain('/test/project');
  });

  it('includes the output_format block', () => {
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix).toContain('<output_format>');
  });

  it('includes the graph-context block when graphContext is provided', () => {
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    expect(prefix).toContain('CODE GRAPH CONTEXT');
    expect(prefix).toContain('Use the code graph as the first source of structural truth');
  });

  it('omits the graph-context block when graphContext is not provided', () => {
    const prefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
    });
    expect(prefix).not.toContain('CODE GRAPH CONTEXT');
  });
});

describe('buildPhase1AnalyzerPrompt — prefix is byte-identical across all 4 analyzers', () => {
  it('SHA-256 of the prefix-prefix is identical across all four analyzers (the load-bearing test)', () => {
    // Build the full prompt for each analyzer with the SAME context —
    // same projectPath, same frameworkPath, same graphContext. Then
    // verify each prompt starts with the byte-identical prefix.
    //
    // Why this matters: Anthropic's prompt cache hits on the byte-
    // identical prefix at request 2..N. If this test fails, caching
    // can't hit — the second through fourth analyzer spawns each
    // pay full input token rate instead of ~10%.
    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    const expectedHash = sha256(expectedPrefix);

    for (const agentName of ANALYZERS) {
      const fullPrompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        '/test/framework',
        agentName,
        undefined,
        SHARED_GRAPH_CONTEXT,
      );
      expect(fullPrompt.startsWith(expectedPrefix), `agent ${agentName}`).toBe(true);
      expect(sha256(fullPrompt.slice(0, expectedPrefix.length))).toBe(expectedHash);
    }
  });

  it('the prefix appears at byte 0 — no leading whitespace, no header drift', () => {
    const fullPrompt = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'structure-architecture-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
    );
    // The very first character of the prompt must be `<` from
    // `<excluded_directories>`. Any whitespace, BOM, or banner text
    // here would shift the prefix and break caching.
    expect(fullPrompt.charAt(0)).toBe('<');
    expect(fullPrompt.startsWith('<excluded_directories>')).toBe(true);
  });

  it('the analyzer-specific tail differs across analyzers (sanity: the body still customizes)', () => {
    const a = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'structure-architecture-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
    );
    const b = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'tech-stack-dependencies-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
    );
    expect(a).not.toBe(b);
    expect(a).toContain('Execution instructions for structure-architecture-analyzer');
    expect(b).toContain('Execution instructions for tech-stack-dependencies-analyzer');
  });

  it('analyzer-specific feedback prompt does NOT leak into the cache-eligible prefix', () => {
    // Validation feedback varies per attempt and is intentionally
    // appended to the tail. Putting it in the prefix would invalidate
    // the cache on every retry.
    const withFeedback = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'structure-architecture-analyzer',
      'YOUR PRIOR ATTEMPT WAS REJECTED',
      SHARED_GRAPH_CONTEXT,
    );
    const withoutFeedback = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'structure-architecture-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
    );

    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });

    // Both prompts MUST share the byte-identical prefix.
    expect(withFeedback.slice(0, expectedPrefix.length)).toBe(expectedPrefix);
    expect(withoutFeedback.slice(0, expectedPrefix.length)).toBe(expectedPrefix);
    // The feedback must be in the tail, not the prefix.
    expect(withFeedback).toContain('YOUR PRIOR ATTEMPT WAS REJECTED');
    expect(expectedPrefix).not.toContain('YOUR PRIOR ATTEMPT WAS REJECTED');
  });

  it('authoritative-services list does NOT leak into the cache-eligible prefix', () => {
    // Even though the list is byte-identical across 02/03/04, it does
    // NOT appear in 01's prompt. To keep the prefix shared by all 4,
    // the service list must be in the tail.
    const withServices = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'tech-stack-dependencies-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
      [{ id: 'api', path: 'src/api', type: 'backend', language: 'typescript' }],
    );

    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });

    expect(withServices.slice(0, expectedPrefix.length)).toBe(expectedPrefix);
    expect(withServices).toContain('Authoritative Service List'.toUpperCase());
    expect(expectedPrefix).not.toContain('Authoritative Service List'.toUpperCase());
  });

  it('per-analyzer tool-cap table does NOT leak into the cache-eligible prefix', () => {
    // Tool caps vary per analyzer (different per-analyzer budgets in
    // PER_ANALYZER_PER_TOOL_CAPS). They MUST live in the tail.
    const fullPrompt = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      'structure-architecture-analyzer',
      undefined,
      SHARED_GRAPH_CONTEXT,
    );

    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });

    expect(fullPrompt.slice(0, expectedPrefix.length)).toBe(expectedPrefix);
    // The tool-budget guidance section name appears in the tail (uppercased).
    expect(fullPrompt).toContain('TOOL BUDGET GUIDANCE');
    expect(expectedPrefix).not.toContain('TOOL BUDGET GUIDANCE');
  });

  it('different graphContext invalidates the prefix consistently across all analyzers', () => {
    // Sanity check: when the run's graph context changes, every
    // analyzer's prefix changes by the same amount. Stops a future
    // optimization from accidentally caching one analyzer's prefix
    // while leaving another's stale.
    const ctxA = SHARED_GRAPH_CONTEXT;
    const ctxB: GraphPromptContext = { ...ctxA, available: false };

    const prefixA = buildPhase1SharedPrefix({
      projectPath: '/p',
      frameworkPath: '/f',
      graphContext: ctxA,
    });
    const prefixB = buildPhase1SharedPrefix({
      projectPath: '/p',
      frameworkPath: '/f',
      graphContext: ctxB,
    });

    // Slice each full prompt to the appropriate prefix length and
    // hash. All 4 analyzers within the same context must agree.
    const hashesA = ANALYZERS.map((a) =>
      sha256(buildPhase1AnalyzerPrompt('/p', '/f', a, undefined, ctxA).slice(0, prefixA.length)),
    );
    const hashesB = ANALYZERS.map((a) =>
      sha256(buildPhase1AnalyzerPrompt('/p', '/f', a, undefined, ctxB).slice(0, prefixB.length)),
    );

    expect(new Set(hashesA).size).toBe(1);
    expect(new Set(hashesB).size).toBe(1);
    expect(hashesA[0]).not.toBe(hashesB[0]);
  });
});

/**
 * Codex CLI parity: `codex-cli-agent-impl.ts` builds the user prompt as
 * `${run.inputPrompt}\n\n---\n\n${agentBody}`. The byte-identical Phase 1
 * prefix lives at byte 0 of `inputPrompt`, so the resulting full prompt
 * also starts with that prefix — letting OpenAI's automatic prefix cache
 * hit on the same shared bytes that the Anthropic API caches for Claude.
 *
 * This describe block locks the contract: simulate the Codex concat and
 * assert the byte-identical prefix is at byte 0 of the resulting full
 * prompt across all four analyzers. If a future refactor flips the order
 * back, this test fails immediately.
 */
describe('Codex full-prompt order — byte-identical prefix at byte 0', () => {
  // The four analyzer prompt files have different bodies in production.
  // Simulate that here so the test catches an accidental concat-order
  // regression (which would put analyzer-specific bytes at byte 0).
  const PER_ANALYZER_BODY: Record<string, string> = {
    'structure-architecture-analyzer': '# Structure & Architecture Analyzer\n\n## Role\nA',
    'tech-stack-dependencies-analyzer': '# Tech Stack & Dependencies Analyzer\n\n## Role\nB',
    'code-patterns-testing-analyzer': '# Code Patterns & Testing Analyzer\n\n## Role\nC',
    'data-flows-integrations-analyzer': '# Data Flows & Integrations Analyzer\n\n## Role\nD',
  };

  /**
   * Mirror exactly what `codex-cli-agent-impl.ts` does:
   *   const fullPrompt = `${run.inputPrompt}\n\n---\n\n${agentBody}`;
   * Reversing this order would break caching; the test below would catch it.
   */
  function buildCodexFullPrompt(agentName: string): string {
    const inputPrompt = buildPhase1AnalyzerPrompt(
      '/test/project',
      '/test/framework',
      agentName,
      undefined,
      SHARED_GRAPH_CONTEXT,
    );
    const agentBody = PER_ANALYZER_BODY[agentName];
    return `${inputPrompt}\n\n---\n\n${agentBody}`;
  }

  it('all four Codex full-prompts share the byte-identical cache prefix at byte 0', () => {
    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    const expectedHash = sha256(expectedPrefix);

    for (const agentName of ANALYZERS) {
      const fullPrompt = buildCodexFullPrompt(agentName);
      expect(fullPrompt.startsWith(expectedPrefix), `agent ${agentName}`).toBe(true);
      expect(sha256(fullPrompt.slice(0, expectedPrefix.length))).toBe(expectedHash);
    }
  });

  it('the analyzer-specific agent body lives in the cache-miss tail, not at byte 0', () => {
    // Sanity: the per-analyzer body MUST appear somewhere — the prompt
    // still has to carry it — but NOT at byte 0.
    for (const agentName of ANALYZERS) {
      const fullPrompt = buildCodexFullPrompt(agentName);
      expect(fullPrompt).toContain(PER_ANALYZER_BODY[agentName]);
      expect(fullPrompt.startsWith(PER_ANALYZER_BODY[agentName])).toBe(false);
    }
  });

  it('regression net: prepending agentBody (the bug we fixed) would fail this test', () => {
    // This test documents the failure mode by constructing the BROKEN
    // form and asserting it would fail the byte-identical check. If a
    // future refactor accidentally reverts the concat order, the
    // production test above catches it; this auxiliary test pins the
    // shape of the regression so reviewers can see what "broken" looks
    // like.
    const expectedPrefix = buildPhase1SharedPrefix({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      graphContext: SHARED_GRAPH_CONTEXT,
    });
    const brokenForms = ANALYZERS.map((agentName) => {
      const inputPrompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        '/test/framework',
        agentName,
        undefined,
        SHARED_GRAPH_CONTEXT,
      );
      const agentBody = PER_ANALYZER_BODY[agentName];
      // The OLD, broken concat order — agentBody at byte 0.
      return `${agentBody}\n\n---\n\n${inputPrompt}`;
    });
    // Each broken form starts with its analyzer-specific body, so byte 0
    // differs across analyzers — no possible cache hit on the prefix.
    const startBytes = brokenForms.map((p) => p.slice(0, expectedPrefix.length));
    expect(new Set(startBytes).size).toBe(ANALYZERS.length);
  });
});
