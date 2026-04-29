import { describe, expect, it } from 'vitest';
import {
  PER_ANALYZER_TOOL_CALL_CAPS,
  computeSoftWarnings,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js';

describe('computeSoftWarnings — stack-agnostic budget signals', () => {
  describe('low_graph_ratio', () => {
    it('fires when graph_calls / total_calls < 0.4', () => {
      // 3 graph + 17 non-graph = 20 total → ratio 0.15 → fires.
      expect(computeSoftWarnings('structure-architecture-analyzer', 3, 17, {})).toContain(
        'low_graph_ratio',
      );
    });

    it('does NOT fire when graph_calls / total_calls >= 0.4', () => {
      // 8 graph + 12 non-graph = 20 total → ratio 0.4 → does NOT fire.
      expect(computeSoftWarnings('structure-architecture-analyzer', 8, 12, {})).not.toContain(
        'low_graph_ratio',
      );
    });

    it('does NOT fire when total = 0 (defensive)', () => {
      expect(computeSoftWarnings('structure-architecture-analyzer', 0, 0, {})).not.toContain(
        'low_graph_ratio',
      );
    });
  });

  describe('graph_search_overuse', () => {
    it('fires when semantic_search_nodes_tool count > 8', () => {
      const out = computeSoftWarnings('data-flows-integrations-analyzer', 16, 5, {
        mcp__code_graph__semantic_search_nodes_tool: 16,
      });
      expect(out).toContain('graph_search_overuse');
    });

    it('does NOT fire at the threshold (count = 8)', () => {
      expect(
        computeSoftWarnings('data-flows-integrations-analyzer', 8, 0, {
          mcp__code_graph__semantic_search_nodes_tool: 8,
        }),
      ).not.toContain('graph_search_overuse');
    });

    it('does NOT fire when other graph tools dominate (only counts semantic_search)', () => {
      expect(
        computeSoftWarnings('structure-architecture-analyzer', 30, 0, {
          mcp__code_graph__list_communities_tool: 30,
        }),
      ).not.toContain('graph_search_overuse');
    });
  });

  describe('tool_call_budget_exceeded', () => {
    it('fires when total tool calls exceed the per-analyzer cap', () => {
      // structure cap = 25; here total = 38.
      const out = computeSoftWarnings('structure-architecture-analyzer', 11, 27, {});
      expect(out).toContain('tool_call_budget_exceeded');
    });

    it('uses per-analyzer cap (data-flows is 30, code-patterns is 25)', () => {
      // 28 total — below data-flows cap (30), above code-patterns cap (25).
      expect(computeSoftWarnings('data-flows-integrations-analyzer', 14, 14, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
      expect(computeSoftWarnings('code-patterns-testing-analyzer', 14, 14, {})).toContain(
        'tool_call_budget_exceeded',
      );
    });

    it('does NOT fire for an unknown agent name (defensive)', () => {
      expect(computeSoftWarnings('unknown-analyzer', 100, 100, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
    });
  });

  describe('combinations', () => {
    it('fires multiple warnings simultaneously when criteria stack', () => {
      // Modeled on the gira data-flows analyzer: 28 graph (16 semantic_search) + 24 non-graph = 52 total.
      const out = computeSoftWarnings('data-flows-integrations-analyzer', 28, 24, {
        mcp__code_graph__semantic_search_nodes_tool: 16,
      });
      expect(out).toContain('graph_search_overuse');
      expect(out).toContain('tool_call_budget_exceeded');
      // 28/52 = 0.54 → ratio above threshold; low_graph_ratio NOT fired.
      expect(out).not.toContain('low_graph_ratio');
    });

    it('returns an empty array when nothing fires (clean run)', () => {
      // Modeled on the gira structure-analyzer: heavy graph use, low non-graph.
      const out = computeSoftWarnings('structure-architecture-analyzer', 18, 4, {
        mcp__code_graph__semantic_search_nodes_tool: 5,
      });
      expect(out).toEqual([]);
    });

    it('returns sorted unique warnings', () => {
      // semantic_search overuse + budget exceeded → both fire; sorted alphabetically.
      const out = computeSoftWarnings('structure-architecture-analyzer', 15, 30, {
        mcp__code_graph__semantic_search_nodes_tool: 15,
      });
      expect(out).toEqual([...new Set(out)].sort());
    });
  });

  describe('PER_ANALYZER_TOOL_CALL_CAPS — sanity', () => {
    it('covers all four Phase 1 analyzers', () => {
      expect(PER_ANALYZER_TOOL_CALL_CAPS).toHaveProperty('structure-architecture-analyzer');
      expect(PER_ANALYZER_TOOL_CALL_CAPS).toHaveProperty('tech-stack-dependencies-analyzer');
      expect(PER_ANALYZER_TOOL_CALL_CAPS).toHaveProperty('code-patterns-testing-analyzer');
      expect(PER_ANALYZER_TOOL_CALL_CAPS).toHaveProperty('data-flows-integrations-analyzer');
    });

    it('caps are reasonable (between 15 and 50 — neither too tight nor too loose)', () => {
      for (const cap of Object.values(PER_ANALYZER_TOOL_CALL_CAPS)) {
        expect(cap).toBeGreaterThanOrEqual(15);
        expect(cap).toBeLessThanOrEqual(50);
      }
    });
  });
});
