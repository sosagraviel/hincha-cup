import { describe, expect, it } from 'vitest';
import { normalizeGraphQueriesUsed } from '../../../../src/services/graph-wiki/query-name-normalizer.js';

describe('normalizeGraphQueriesUsed', () => {
  it('drops free-form analyzer prose strings', () => {
    expect(
      normalizeGraphQueriesUsed([
        "list_communities({ detail_level: 'standard' }) — exceeded token limit",
        'mcp__code_graph__list_communities_tool',
        'foo bar',
        'mcp__code_graph__get_community_tool',
      ]),
    ).toEqual(['mcp__code_graph__get_community_tool', 'mcp__code_graph__list_communities_tool']);
  });

  it('returns [] for empty input', () => {
    expect(normalizeGraphQueriesUsed([])).toEqual([]);
  });

  it('dedupes', () => {
    expect(
      normalizeGraphQueriesUsed([
        'mcp__code_graph__list_communities_tool',
        'mcp__code_graph__list_communities_tool',
      ]),
    ).toEqual(['mcp__code_graph__list_communities_tool']);
  });

  it('sorts ASCII ascending for stable diffs', () => {
    expect(
      normalizeGraphQueriesUsed([
        'mcp__code_graph__list_communities_tool',
        'mcp__code_graph__get_architecture_overview_tool',
        'mcp__code_graph__find_large_functions_tool',
      ]),
    ).toEqual([
      'mcp__code_graph__find_large_functions_tool',
      'mcp__code_graph__get_architecture_overview_tool',
      'mcp__code_graph__list_communities_tool',
    ]);
  });

  it('rejects names without the canonical prefix', () => {
    expect(
      normalizeGraphQueriesUsed([
        'list_communities',
        'get_community',
        'mcp__code_graph__list_communities_tool',
      ]),
    ).toEqual(['mcp__code_graph__list_communities_tool']);
  });

  it('rejects names with trailing call syntax', () => {
    expect(
      normalizeGraphQueriesUsed([
        'mcp__code_graph__list_communities_tool({ detail_level: minimal })',
        'mcp__code_graph__list_communities_tool',
      ]),
    ).toEqual(['mcp__code_graph__list_communities_tool']);
  });

  it('drops non-string entries (defensive against bad upstream)', () => {
    const input = [
      'mcp__code_graph__list_flows_tool',
      null as unknown as string,
      undefined as unknown as string,
      42 as unknown as string,
      '',
    ];
    expect(normalizeGraphQueriesUsed(input)).toEqual(['mcp__code_graph__list_flows_tool']);
  });
});
