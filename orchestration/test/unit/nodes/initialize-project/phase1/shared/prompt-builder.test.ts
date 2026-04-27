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
    expect(prompt).toContain('"graph_queries_used": string[]');
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
});
