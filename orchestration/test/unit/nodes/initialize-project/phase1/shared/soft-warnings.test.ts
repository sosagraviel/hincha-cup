import { describe, expect, it } from 'vitest';
import {
  PER_ANALYZER_PER_TOOL_CAPS,
  PER_ANALYZER_TOOL_CALL_CAPS,
  computeSoftWarnings,
  renderPerToolCapsTable,
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

  describe('per_tool_budget_exceeded', () => {
    // Added 2026-05-05 after the gira run showed structure-architecture
    // making 38 get_community_tool calls + 4 overflows. The per-tool cap
    // is the structural fix; this warning surfaces the breach.
    it('fires when a tool exceeds its per-analyzer cap', () => {
      // structure-architecture cap on get_community_tool = 4.
      const out = computeSoftWarnings(
        'structure-architecture-analyzer',
        38,
        0,
        { mcp__code_graph__get_community_tool: 38 },
        [],
      );
      expect(out).toContain('per_tool_budget_exceeded');
    });

    it('treats overflows as DOUBLE-counted against the per-tool budget', () => {
      // structure-architecture cap on get_community_tool = 4.
      // 3 calls + 1 overflow = effective 4 → AT the cap, not over.
      const atCap = computeSoftWarnings(
        'structure-architecture-analyzer',
        3,
        0,
        { mcp__code_graph__get_community_tool: 3 },
        [{ tool: 'mcp__code_graph__get_community_tool', callIndex: 2 }],
      );
      expect(atCap).not.toContain('per_tool_budget_exceeded');

      // 3 calls + 2 overflows = effective 5 → over cap of 4.
      const overCap = computeSoftWarnings(
        'structure-architecture-analyzer',
        3,
        0,
        { mcp__code_graph__get_community_tool: 3 },
        [
          { tool: 'mcp__code_graph__get_community_tool', callIndex: 2 },
          { tool: 'mcp__code_graph__get_community_tool', callIndex: 4 },
        ],
      );
      expect(overCap).toContain('per_tool_budget_exceeded');
    });

    it('does NOT fire when the analyzer has no per-tool cap table (forward-compat)', () => {
      const out = computeSoftWarnings(
        'unknown-analyzer',
        100,
        0,
        { mcp__code_graph__get_community_tool: 100 },
        [],
      );
      expect(out).not.toContain('per_tool_budget_exceeded');
    });
  });

  describe('graph_overflow_detected', () => {
    it('fires whenever any overflow is recorded', () => {
      const out = computeSoftWarnings('structure-architecture-analyzer', 5, 0, {}, [
        { tool: 'mcp__code_graph__get_community_tool', callIndex: 1 },
      ]);
      expect(out).toContain('graph_overflow_detected');
    });

    it('does NOT fire when overflows[] is empty', () => {
      const out = computeSoftWarnings('structure-architecture-analyzer', 5, 0, {}, []);
      expect(out).not.toContain('graph_overflow_detected');
    });
  });

  describe('PER_ANALYZER_PER_TOOL_CAPS — sanity', () => {
    it('covers all four Phase 1 analyzers', () => {
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('structure-architecture-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('tech-stack-dependencies-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('code-patterns-testing-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('data-flows-integrations-analyzer');
    });

    it('every per-tool cap is a positive integer ≤ 8', () => {
      // Above 8 the overflow risk dwarfs any incremental value — if an
      // analyzer wants more than 8 calls of one tool, it's brute-forcing
      // and should rethink. The per-analyzer total cap (15-30) is the
      // outer envelope; per-tool caps must fit comfortably under it.
      for (const caps of Object.values(PER_ANALYZER_PER_TOOL_CAPS)) {
        for (const cap of Object.values(caps)) {
          expect(cap).toBeGreaterThanOrEqual(1);
          expect(cap).toBeLessThanOrEqual(8);
        }
      }
    });

    it('every tool name uses the canonical mcp__code_graph__*_tool spelling', () => {
      // Drift-proof against typos. The MCP server exposes tools with
      // canonical names; a typo in the cap table would silently disable
      // capping for that tool.
      for (const caps of Object.values(PER_ANALYZER_PER_TOOL_CAPS)) {
        for (const tool of Object.keys(caps)) {
          expect(tool).toMatch(/^mcp__code_graph__\w+_tool$/);
        }
      }
    });

    it('forbidden tools are NOT capped (because they MUST NOT be called)', () => {
      // get_architecture_overview_tool has no bounding knob; the discipline
      // forbids it outright. Listing it in PER_ANALYZER_PER_TOOL_CAPS would
      // implicitly suggest a cap value > 0 is acceptable.
      for (const caps of Object.values(PER_ANALYZER_PER_TOOL_CAPS)) {
        expect(caps).not.toHaveProperty('mcp__code_graph__get_architecture_overview_tool');
      }
    });
  });

  describe('renderPerToolCapsTable', () => {
    it('returns an empty string for an unknown analyzer', () => {
      expect(renderPerToolCapsTable('unknown-analyzer')).toBe('');
    });

    it('renders a markdown table with one row per capped tool', () => {
      const out = renderPerToolCapsTable('structure-architecture-analyzer');
      expect(out).toContain('| Tool | Max calls |');
      // Spot-check a few entries from the structure-architecture row.
      expect(out).toContain('`mcp__code_graph__get_community_tool` | 4');
      expect(out).toContain('`mcp__code_graph__get_minimal_context_tool` | 2');
    });

    it('encodes the "overflow counts double" rule in the table caption', () => {
      const out = renderPerToolCapsTable('data-flows-integrations-analyzer');
      expect(out).toMatch(/counts? DOUBLE/i);
      expect(out).toContain('per_tool_budget_exceeded');
    });

    it('rows are sorted alphabetically (deterministic output)', () => {
      const out = renderPerToolCapsTable('structure-architecture-analyzer');
      const toolLines = out.split('\n').filter((line) => line.startsWith('| `mcp__code_graph__'));
      const names = toolLines.map((line) => line.match(/`(mcp__code_graph__\w+_tool)`/)?.[1] ?? '');
      expect(names).toEqual([...names].sort());
    });
  });
});
