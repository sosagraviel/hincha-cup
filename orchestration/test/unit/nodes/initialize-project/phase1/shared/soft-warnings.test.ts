import { describe, expect, it } from 'vitest';
import { computeSoftWarnings } from '../../../../../../src/nodes/initialize-project/phase1/shared/graph-tool-usage.js';

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

  describe('combinations', () => {
    it('returns an empty array when nothing fires (clean run)', () => {
      // Heavy graph use, low non-graph.
      // 18 graph + 4 non-graph = 22 total.
      // 18/22 = 0.82 → above 0.25 threshold → low_graph_ratio NOT fired.
      const out = computeSoftWarnings('structure-architecture-analyzer', 18, 4, {
        mcp__code_graph__semantic_search_nodes_tool: 5,
      });
      expect(out).toEqual([]);
    });

    it('returns sorted unique warnings', () => {
      // graphCount=0 and nonGraphCount>0 → mcp_completely_unavailable fires.
      // ratio=0/10=0 → low_graph_ratio fires.
      const out = computeSoftWarnings('structure-architecture-analyzer', 0, 10, {});
      expect(out).toEqual([...new Set(out)].sort());
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
    // graph hits. Either MCP failed completely or the agent ignored the
    // catalog — both are operator-actionable.

    it('fires when graphCount=0 and nonGraphCount>0', () => {
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

    it('fires for unknown analyzer names too (no longer gated on per-tool caps)', () => {
      const out = computeSoftWarnings('experimental-future-analyzer', 0, 12, {});
      expect(out).toContain('mcp_completely_unavailable');
    });

    it('fires for every Phase 1 analyzer (smoke check)', () => {
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
});
