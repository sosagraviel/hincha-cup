import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { buildPhase1AnalyzerPrompt } from '../../../../../../src/nodes/initialize-project/phase1/shared/prompt-builder.js';

const frameworkPath = join(process.cwd(), '..');

describe('buildPhase1AnalyzerPrompt graph context', () => {
  it('adds graph-first instructions when graph is available', () => {
    const prompt = buildPhase1AnalyzerPrompt(
      '/test/project',
      frameworkPath,
      'structure-architecture-analyzer',
      undefined,
      {
        available: true,
        dbPath: '/test/project/.code-review-graph/graph.db',
        stats: { files: 5, functions: 10, languages: ['typescript'] },
      },
    );

    expect(prompt).toContain('CODE GRAPH CONTEXT');
    expect(prompt).toContain('Available: yes');
    expect(prompt).toContain('Database: /test/project/.code-review-graph/graph.db');
    // "MCP Port" was removed — MCP is stdio-only, there is no port.
    expect(prompt).not.toContain('MCP Port');
    expect(prompt).toContain('Use the code graph as the first source of structural truth');
    // graph_queries_used is now derived by the Stop hook from the transcript;
    // the prompt no longer asks the agent to populate it.
    expect(prompt).not.toContain('"graph_queries_used": string[]');
    expect(prompt).toContain('The Stop hook records every');
  });

  it('adds fallback guidance when graph is unavailable', () => {
    const prompt = buildPhase1AnalyzerPrompt(
      '/test/project',
      frameworkPath,
      'structure-architecture-analyzer',
      undefined,
      { available: false },
    );

    expect(prompt).toContain('Available: no');
    expect(prompt).toContain('Use Read/Grep/Glob discovery as the fallback');
  });

  describe('graph navigation discipline', () => {
    it('embeds the discipline heading + body when the graph is available', () => {
      const prompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        frameworkPath,
        'structure-architecture-analyzer',
        undefined,
        { available: true, stats: { files: 50, functions: 200 } },
      );
      expect(prompt).toContain('## Graph navigation discipline');
      expect(prompt).toContain('mcp__code_graph__get_minimal_context_tool');
      expect(prompt).toContain('DO NOT CALL');
      expect(prompt).toContain('mcp__code_graph__get_architecture_overview_tool');
      // The lean defaults table must mention the load-bearing knobs.
      expect(prompt).toMatch(/detail_level: "minimal"/);
      expect(prompt).toMatch(/include_members: false/);
      expect(prompt).toMatch(/limit: 20/);
      // Spill protocol must be present so Claude/Codex recognise the sentinel.
      expect(prompt).toContain('exceeds maximum allowed tokens');
      expect(prompt).toContain('Do not read the spillover file');
    });

    it('does NOT embed the discipline when the graph is unavailable', () => {
      const prompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        frameworkPath,
        'structure-architecture-analyzer',
        undefined,
        { available: false },
      );
      expect(prompt).not.toContain('## Graph navigation discipline');
      expect(prompt).not.toContain('Drill-in budget');
    });

    it('appends a "large graph" warning when files > 200', () => {
      const prompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        frameworkPath,
        'structure-architecture-analyzer',
        undefined,
        { available: true, stats: { files: 333, functions: 800 } },
      );
      expect(prompt).toContain('large graph');
      expect(prompt).toContain('especially aggressive');
    });

    it('appends the "large graph" warning when functions > 1000', () => {
      const prompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        frameworkPath,
        'structure-architecture-analyzer',
        undefined,
        { available: true, stats: { files: 50, functions: 1543 } },
      );
      expect(prompt).toContain('large graph');
    });

    it('does NOT append the "large graph" warning on small graphs', () => {
      const prompt = buildPhase1AnalyzerPrompt(
        '/test/project',
        frameworkPath,
        'structure-architecture-analyzer',
        undefined,
        { available: true, stats: { files: 50, functions: 200 } },
      );
      expect(prompt).not.toContain('large graph');
    });
  });
});
