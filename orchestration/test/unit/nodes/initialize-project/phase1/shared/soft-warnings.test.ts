import { describe, expect, it } from 'vitest';
import {
  PER_ANALYZER_PER_TOOL_CAPS,
  PER_ANALYZER_TOOL_CALL_CAPS,
  computeSoftWarnings,
  renderPerToolCapsTable,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js';

describe('computeSoftWarnings — stack-agnostic budget signals', () => {
  describe('low_graph_ratio (per-analyzer thresholds)', () => {
    // Per-analyzer thresholds because legitimate non-graph reads (manifests,
    // runtime versions, build configs) scale with manifest count regardless
    // of language family. Stack-agnostic.
    //
    // Thresholds:
    //   structure-architecture: 0.25 (legitimately reads runtime versions)
    //   tech-stack-dependencies: 0.20 (legitimately reads many manifests)
    //   code-patterns-testing: 0.30 (legitimately reads test configs)
    //   data-flows-integrations: 0.40 (graph-friendly; flow tools)

    it('structure-architecture: fires below 0.25 (legitimate-work threshold)', () => {
      // 4 graph + 17 non-graph = 21 total → ratio 0.19 → fires (below 0.25).
      expect(computeSoftWarnings('structure-architecture-analyzer', 4, 17, {})).toContain(
        'low_graph_ratio',
      );
    });

    it('structure-architecture: does NOT fire at 0.25', () => {
      // 5 graph + 15 non-graph = 20 total → ratio 0.25 → does NOT fire.
      expect(computeSoftWarnings('structure-architecture-analyzer', 5, 15, {})).not.toContain(
        'low_graph_ratio',
      );
    });

    it('tech-stack: looser threshold 0.20 — legitimate manifest reads', () => {
      // 4 graph + 16 non-graph = 20 total → ratio 0.20 → does NOT fire.
      expect(computeSoftWarnings('tech-stack-dependencies-analyzer', 4, 16, {})).not.toContain(
        'low_graph_ratio',
      );
      // 3 graph + 17 non-graph = 20 total → ratio 0.15 → fires.
      expect(computeSoftWarnings('tech-stack-dependencies-analyzer', 3, 17, {})).toContain(
        'low_graph_ratio',
      );
    });

    it('code-patterns: 0.30 threshold (test configs + linter rules)', () => {
      // 6 graph + 14 non-graph = 20 → ratio 0.30 → does NOT fire.
      expect(computeSoftWarnings('code-patterns-testing-analyzer', 6, 14, {})).not.toContain(
        'low_graph_ratio',
      );
    });

    it('data-flows: tightest 0.40 (most graph-friendly analyzer)', () => {
      // 8 graph + 12 non-graph = 20 → ratio 0.40 → does NOT fire.
      expect(computeSoftWarnings('data-flows-integrations-analyzer', 8, 12, {})).not.toContain(
        'low_graph_ratio',
      );
      // 7 graph + 13 non-graph = 20 → ratio 0.35 → fires.
      expect(computeSoftWarnings('data-flows-integrations-analyzer', 7, 13, {})).toContain(
        'low_graph_ratio',
      );
    });

    it('does NOT fire when total = 0 (defensive)', () => {
      expect(computeSoftWarnings('structure-architecture-analyzer', 0, 0, {})).not.toContain(
        'low_graph_ratio',
      );
    });

    it('unknown analyzer falls back to _default (0.30)', () => {
      // 5 graph + 15 non-graph = 20 → ratio 0.25 → fires (under 0.30).
      expect(computeSoftWarnings('unknown-analyzer', 5, 15, {})).toContain('low_graph_ratio');
    });

    it('23% ratio fires for structure-arch (below 0.25 threshold)', () => {
      // 7 graph + 23 non-graph = 30 total → ratio 0.23 → BELOW 0.25.
      // Re-check at 25%: 5/15 = 0.25 = threshold = no fire.
      expect(computeSoftWarnings('structure-architecture-analyzer', 7, 23, {})).toContain(
        'low_graph_ratio',
      );
    });
  });

  // graph_search_overuse retired in favour of per_tool_budget_exceeded
  // (the per-tool cap is the single source of truth). The standalone
  // threshold conflicted with the per-tool cap for data-flows (8 vs 6).
  describe('graph_search_overuse — RETIRED', () => {
    it('no longer fires (subsumed by per_tool_budget_exceeded)', () => {
      const out = computeSoftWarnings('data-flows-integrations-analyzer', 16, 5, {
        mcp__code_graph__semantic_search_nodes_tool: 16,
      });
      expect(out).not.toContain('graph_search_overuse');
      // Per-tool cap for semantic_search is 6 in data-flows; 16 > 6
      // surfaces per_tool_budget_exceeded instead.
      expect(out).toContain('per_tool_budget_exceeded');
    });
  });

  describe('tool_call_budget_exceeded', () => {
    // Caps: structure=35, tech-stack=30, code-patterns=30, data-flows=40.
    // Calibrated to give legitimate-work distributions ~10% headroom.
    it('fires when total tool calls exceed the per-analyzer cap', () => {
      // structure cap = 35; here total = 36 → fires.
      const out = computeSoftWarnings('structure-architecture-analyzer', 12, 24, {});
      expect(out).toContain('tool_call_budget_exceeded');
    });

    it('uses per-analyzer cap (data-flows=40, code-patterns=30)', () => {
      // 35 total — below data-flows cap (40), above code-patterns cap (30).
      expect(computeSoftWarnings('data-flows-integrations-analyzer', 18, 17, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
      expect(computeSoftWarnings('code-patterns-testing-analyzer', 18, 17, {})).toContain(
        'tool_call_budget_exceeded',
      );
    });

    it('respects the structure-arch cap of 35', () => {
      // 30 total — below cap (35).
      expect(computeSoftWarnings('structure-architecture-analyzer', 15, 15, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
    });

    it('respects the tech-stack cap of 30', () => {
      // 25 total — below cap (30).
      expect(computeSoftWarnings('tech-stack-dependencies-analyzer', 10, 15, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
    });

    it('does NOT fire for an unknown agent name (defensive)', () => {
      expect(computeSoftWarnings('unknown-analyzer', 100, 100, {})).not.toContain(
        'tool_call_budget_exceeded',
      );
    });

    it('fires `per_tool_budget_exceeded` when a cap=0 tool is called even once', () => {
      // data-flows-integrations-analyzer has cap=0 for get_community_tool.
      const out = computeSoftWarnings('data-flows-integrations-analyzer', 5, 0, {
        mcp__code_graph__get_community_tool: 1,
      });
      expect(out).toContain('per_tool_budget_exceeded');
    });
  });

  describe('combinations', () => {
    it('fires multiple warnings simultaneously when criteria stack', () => {
      // 28 graph (16 semantic_search) + 24 non-graph = 52 total.
      // data-flows cap = 40 → tool_call_budget_exceeded fires.
      // semantic_search per-tool cap = 6 → per_tool_budget_exceeded fires.
      // 28/52 = 0.54 → above 0.40 data-flows threshold → low_graph_ratio NOT fired.
      const out = computeSoftWarnings('data-flows-integrations-analyzer', 28, 24, {
        mcp__code_graph__semantic_search_nodes_tool: 16,
      });
      expect(out).toContain('tool_call_budget_exceeded');
      expect(out).toContain('per_tool_budget_exceeded');
      expect(out).not.toContain('graph_search_overuse'); // retired
      expect(out).not.toContain('low_graph_ratio');
    });

    it('returns an empty array when nothing fires (clean run)', () => {
      // Heavy graph use, low non-graph, all per-tool counts within cap.
      // 18 graph + 4 non-graph = 22 → below structure cap (35).
      // 18/22 = 0.82 → above 0.25 threshold → low_graph_ratio NOT fired.
      // semantic_search = 5 → below per-tool cap of 6.
      const out = computeSoftWarnings('structure-architecture-analyzer', 18, 4, {
        mcp__code_graph__semantic_search_nodes_tool: 5,
      });
      expect(out).toEqual([]);
    });

    it('returns sorted unique warnings', () => {
      // 15 graph + 30 non-graph = 45 → above structure cap (35) → tool_call_budget_exceeded.
      // semantic_search = 15 → above structure per-tool cap of 6 → per_tool_budget_exceeded.
      // 15/45 = 0.33 → above 0.25 threshold → low_graph_ratio NOT fired.
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
    // The per-tool cap is the structural fix for runaway tool usage;
    // this warning surfaces the breach.
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

  describe('mcp_completely_unavailable', () => {
    // Heuristic: agent ran tools (nonGraphCount > 0) but produced ZERO
    // graph hits despite having a per-tool cap entry (i.e. the framework
    // expected at least some graph use). Either MCP failed completely or
    // the agent ignored the catalog — both are operator-actionable.

    it('fires when graphCount=0 and nonGraphCount>0 for an analyzer with per-tool caps', () => {
      const out = computeSoftWarnings('structure-architecture-analyzer', 0, 12, {});
      expect(out).toContain('mcp_completely_unavailable');
    });

    it('does NOT fire when the agent legitimately ran nothing (both counts zero)', () => {
      const out = computeSoftWarnings('structure-architecture-analyzer', 0, 0, {});
      expect(out).not.toContain('mcp_completely_unavailable');
    });

    it('does NOT fire when ANY graph call succeeded (graphCount > 0)', () => {
      const out = computeSoftWarnings('structure-architecture-analyzer', 1, 12, {});
      expect(out).not.toContain('mcp_completely_unavailable');
    });

    it('does NOT fire for analyzer names with no per-tool caps (forward-compat)', () => {
      // An unknown analyzer name has no entry in PER_ANALYZER_PER_TOOL_CAPS,
      // so the heuristic would be guessing about expected graph use. We
      // err on the silent side until an explicit cap is registered.
      const out = computeSoftWarnings('experimental-future-analyzer', 0, 12, {});
      expect(out).not.toContain('mcp_completely_unavailable');
    });

    it('fires for every Phase 1 analyzer (smoke check)', () => {
      // Stack-agnostic: the heuristic is the same shape for every
      // analyzer. Run it across all four to confirm the per-tool-caps
      // gate is wired for each.
      for (const name of [
        'structure-architecture-analyzer',
        'tech-stack-dependencies-analyzer',
        'code-patterns-testing-analyzer',
        'data-flows-integrations-analyzer',
      ]) {
        const out = computeSoftWarnings(name, 0, 8, {});
        expect(out).toContain('mcp_completely_unavailable');
      }
    });
  });

  describe('PER_ANALYZER_PER_TOOL_CAPS — sanity', () => {
    it('covers all four Phase 1 analyzers', () => {
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('structure-architecture-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('tech-stack-dependencies-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('code-patterns-testing-analyzer');
      expect(PER_ANALYZER_PER_TOOL_CAPS).toHaveProperty('data-flows-integrations-analyzer');
    });

    it('every per-tool cap is a non-negative integer ≤ 8', () => {
      // 0 marks a tool that's forbidden for this analyzer (any call
      // triggers `per_tool_budget_exceeded` and surfaces a soft warning).
      // Above 8 the overflow risk dwarfs any incremental value — if an
      // analyzer wants more than 8 calls of one tool, it's brute-forcing
      // and should rethink. The per-analyzer total cap (15-30) is the
      // outer envelope; per-tool caps must fit comfortably under it.
      for (const caps of Object.values(PER_ANALYZER_PER_TOOL_CAPS)) {
        for (const cap of Object.values(caps)) {
          expect(cap).toBeGreaterThanOrEqual(0);
          expect(cap).toBeLessThanOrEqual(8);
          expect(Number.isInteger(cap)).toBe(true);
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

    it('renders cap=0 tools under a "Forbidden" heading', () => {
      const out = renderPerToolCapsTable('data-flows-integrations-analyzer');
      expect(out).toMatch(/Forbidden/);
      expect(out).toContain('`mcp__code_graph__get_community_tool`');
      expect(out).toContain('`mcp__code_graph__list_communities_tool`');
      expect(out).not.toMatch(/\|\s*`mcp__code_graph__get_community_tool`\s*\|\s*0\s*\|/);
    });

    it('rows are sorted alphabetically (deterministic output)', () => {
      const out = renderPerToolCapsTable('structure-architecture-analyzer');
      const toolLines = out.split('\n').filter((line) => line.startsWith('| `mcp__code_graph__'));
      const names = toolLines.map((line) => line.match(/`(mcp__code_graph__\w+_tool)`/)?.[1] ?? '');
      expect(names).toEqual([...names].sort());
    });
  });
});
