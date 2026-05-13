import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  buildCoreSpecs,
  buildPrompt,
  buildServiceSpec,
} from '../../../../src/services/graph-wiki/document-specs.js';
import { buildSynthesisPrompt } from '../../../../src/nodes/initialize-project/phase3/prompt-builder.js';
import { Provider } from '../../../../src/providers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Closed-book prompt hygiene.
 *
 * Closed-book agents (consolidator, synthesizer, wiki-generator)
 * have `tools: none` in their frontmatter — they cannot call MCP
 * graph tools. The Phase 0 graph-tool catalog (a multi-line block
 * listing every `mcp__code_graph__*` tool with its description) is
 * therefore dead text in their prompts: ~8 KB of noise per spawn,
 * across 8+ closed-book attempts in a typical run.
 *
 * This test is the defensive scan: any future code path that leaks
 * the catalog into a closed-book prompt will fail this test
 * immediately.
 *
 * Stack-agnostic: every fixture uses generic ids and the test
 * matches on heading-shape patterns (`## Available graph tools`),
 * not on language-specific tokens.
 */

const CATALOG_SIGNATURES = [
  // The signature emitted by `buildSchemaDocBody` in
  // wiki-generator.service.ts when a graph-tool catalog is rendered.
  /##\s+Available graph tools/i,
  /Live MCP tool catalog/i,
  // The "call by exact name; the server will reject" sentence is
  // unique to the catalog block.
  /Call by exact name; the server will reject names that are not in this list/i,
];

function containsCatalog(prompt: string): boolean {
  return CATALOG_SIGNATURES.some((pattern) => pattern.test(prompt));
}

describe('closed-book prompt hygiene', () => {
  // Phase 2 consolidator block removed: `buildConsolidationPrompt`
  // was deleted in the Phase 2 refactor; the consolidator no longer
  // builds its prompt through that entry point.

  describe('Phase 3 synthesizer', () => {
    it('does not contain a graph-tool catalog block', () => {
      const prompt = buildSynthesisPrompt({
        services: [],
        notable_findings: [],
      });
      expect(containsCatalog(prompt)).toBe(false);
    });

    it('does not list a graph-tool catalog even with realistic consolidated data', () => {
      const prompt = buildSynthesisPrompt({
        consolidated_findings: {
          structure_architecture: {
            graph_queries_used: [
              'mcp__code_graph__get_minimal_context_tool',
              'mcp__code_graph__list_communities_tool',
            ],
            findings: { services: [] },
          },
        },
        identified_gaps: [],
        gaps: [],
      });
      // The catalog SIGNATURE patterns must not appear, even though
      // the analyzer's `graph_queries_used` references exist in the
      // serialized JSON (those are tool-NAME mentions, not the
      // human-readable catalog block).
      expect(containsCatalog(prompt)).toBe(false);
    });

    it('produces a clean prompt when feedback is present', () => {
      const prompt = buildSynthesisPrompt({}, 'previous attempt failed');
      expect(containsCatalog(prompt)).toBe(false);
    });

    it('mentions command_catalog (anti-regression — rendering rule MUST be present)', () => {
      // The synthesis-instructions prompt MUST tell the closed-book
      // agent how to render the deterministic `command_catalog`
      // (wrapper > readme > package_manager > ci). If a future prompt
      // edit drops this guidance, the synthesizer falls back to ad-hoc
      // `Essential Commands` rendering. This assertion locks the
      // contract.
      const prompt = buildSynthesisPrompt({});
      expect(prompt).toMatch(/command_catalog/);
      // The rendering rule must explicitly forbid re-ordering.
      expect(prompt.toLowerCase()).toMatch(
        /wrapper-tier|wrapper > readme|wrapper.*package_manager/,
      );
    });
  });

  describe('Phase 4 wiki-generator', () => {
    function buildOptions() {
      return {
        projectPath: '/tmp/x',
        frameworkPath: '/framework',
        provider: Provider.CLAUDE,
        generatedAt: '2026-05-05T00:00:00.000Z',
        graph: { available: true, path: '/tmp/x/.code-review-graph/graph.db' },
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

    it('architecture spec prompt does not contain a graph-tool catalog block', () => {
      const specs = buildCoreSpecs(buildOptions() as never);
      const arch = specs.find((s) => s.documentType === 'architecture')!;
      const prompt = buildPrompt(arch, '/tmp/x');
      expect(containsCatalog(prompt)).toBe(false);
    });

    it('per-service prompt does not contain a graph-tool catalog block', () => {
      const opts = buildOptions() as never as {
        analyzers: never;
        digestedUpstream: undefined;
      };
      const spec = buildServiceSpec(
        { id: 'svc-a', path: 'svc-a', type: 'backend' },
        opts.analyzers,
      );
      const prompt = buildPrompt(spec, '/tmp/x');
      expect(containsCatalog(prompt)).toBe(false);
    });
  });

  describe('Phase 2 consolidator agent file (anti-regression)', () => {
    // Architectural contract: the consolidator is a dumb
    // set-deduplicator with no code-analysis responsibility. This
    // suite locks the agent file's tool surface to `none` and
    // forbids the prompt from describing code-analysis behaviour.
    // If a future change adds tools or analyser-style language to
    // the consolidator, these tests fail and the change is
    // rejected at CI time.
    const agentPath = resolve(
      __dirname,
      '../../../../src/nodes/initialize-project/phase2/question-consolidator/prompts/agent.md',
    );
    const agentBody = readFileSync(agentPath, 'utf-8');

    it('frontmatter declares tools: none', () => {
      // Match the literal line in the YAML frontmatter. Anchored to
      // newlines so a `tools: [Read]` line sneaking in elsewhere
      // (or a stray `tools:` before the closing `---`) fails.
      const frontmatter = agentBody.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatter, 'agent.md must start with YAML frontmatter').toBeTruthy();
      expect(frontmatter![1]).toMatch(/^tools:\s*none\s*$/m);
    });

    it('does NOT mention any actual tool name (Read / Grep / Glob / Bash / mcp__code_graph__*)', () => {
      // The prompt may MENTION these tools to forbid them
      // (e.g. "Do not attempt to read files, run grep"). What it
      // must NOT do is describe them as available. Case-sensitive
      // match — capitalised tool names (`Read`, `Grep`) are
      // framework tool tokens; lowercase `read` / `grep` in
      // "do not run grep" prose is a verb, not a tool reference.
      const forbiddenAvailability = [
        /you\s+have\s+access\s+to\s+(?:Read|Grep|Glob|Bash)/,
        /use\s+(?:Read|Grep|Glob|Bash)\s+to/,
        /call\s+mcp__code_graph__/,
        /run\s+(?:Read|Grep|Glob|Bash)\b/,
      ];
      for (const pattern of forbiddenAvailability) {
        expect(agentBody, `forbidden availability pattern: ${pattern}`).not.toMatch(pattern);
      }
    });

    it('explicitly forbids code analysis (You are NOT section)', () => {
      // A "You are NOT" section must call out the three categories the
      // consolidator must NOT do: code analyzer, quality reviewer,
      // editor.
      expect(agentBody).toMatch(/You are NOT/);
      expect(agentBody.toLowerCase()).toMatch(/code analyzer/);
      expect(agentBody.toLowerCase()).toMatch(/quality reviewer/);
      expect(agentBody.toLowerCase()).toMatch(/editor/);
    });

    it('does NOT contain a graph-tool catalog block', () => {
      expect(containsCatalog(agentBody)).toBe(false);
    });
  });
});
