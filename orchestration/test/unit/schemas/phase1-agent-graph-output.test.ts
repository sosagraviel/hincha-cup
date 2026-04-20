import { describe, expect, it } from 'vitest';
import { StructureAnalyzerOutputSchema } from '../../../src/schemas/phase1-agent-outputs.schema.js';

describe('phase1 graph-enhanced analyzer output', () => {
  it('allows optional graph_queries_used without requiring a schema rewrite', () => {
    const output = {
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2026-04-20T00:00:00.000Z',
      graph_queries_used: ['get_minimal_context', 'list_communities'],
      findings: {
        services: [
          {
            id: 'api',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'express' },
          },
        ],
      },
      needs_verification: [],
    };

    const result = StructureAnalyzerOutputSchema.parse(output);

    expect((result as any).graph_queries_used).toEqual(['get_minimal_context', 'list_communities']);
  });
});
