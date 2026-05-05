/**
 * Plan §F.6 + commit 9 (2026-05-05) — render-time tests for the
 * cache-hit-rate + graph-overflow rows in the run index sidebar.
 *
 * The renderer must:
 *   - Show the rows ONLY when stats are passed (callers that don't
 *     opt in see the prior layout).
 *   - Show "—" when there are no observations (better than a
 *     deceptive 0%).
 *   - Show "0/N" form rather than collapsing to 0% when N > 0
 *     (operators care whether caching is engaged at all).
 *   - Surface the offending tool name(s) when overflows occur.
 */
import { describe, expect, it } from 'vitest';
import type { RunStats } from '../../../../../src/services/framework/debug-store/run-stats.js';
import type { RunManifest } from '../../../../../src/services/framework/debug-store/types.js';
import { renderRunIndexHtml } from '../../../../../src/services/framework/transcripts/renderer/render-run-index.js';

const MANIFEST: RunManifest = {
  runId: 'test-run-id',
  workflow: 'initialize-project',
  projectPath: '/test/project',
  provider: 'claude',
  debug: false,
  startedAt: '2026-05-05T00:00:00Z',
};

describe('renderRunIndexHtml — sidebar stats rows', () => {
  it('omits the stats rows entirely when stats are not provided', async () => {
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [] });
    expect(html).not.toContain('Cache hit rate');
    expect(html).not.toContain('Graph overflows');
  });

  it('renders both stats rows when stats are provided', async () => {
    const stats: RunStats = {
      totalAgentCalls: 10,
      cacheHits: 6,
      cacheHitRate: 0.6,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
      graphOverflowCount: 0,
      graphOverflowTools: [],
    };
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
    expect(html).toContain('Cache hit rate');
    expect(html).toContain('60%');
    expect(html).toContain('6/10');
    expect(html).toContain('Graph overflows');
  });

  it('renders "—" + "(no calls)" when there are zero observations', async () => {
    const stats: RunStats = {
      totalAgentCalls: 0,
      cacheHits: 0,
      cacheHitRate: null,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
      graphOverflowCount: 0,
      graphOverflowTools: [],
    };
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
    expect(html).toContain('—');
    expect(html).toContain('(no calls)');
  });

  it('renders "0%" with detail when caching observed but no hits yet', async () => {
    // Operators care: 0% with N>0 means caching is engaged but
    // failing to hit. Crucial signal — must NOT collapse to "—".
    const stats: RunStats = {
      totalAgentCalls: 4,
      cacheHits: 0,
      cacheHitRate: 0,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
      graphOverflowCount: 0,
      graphOverflowTools: [],
    };
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
    expect(html).toContain('0%');
    expect(html).toContain('0/4');
  });

  it('lists the overflowing tool names alongside the count', async () => {
    const stats: RunStats = {
      totalAgentCalls: 10,
      cacheHits: 5,
      cacheHitRate: 0.5,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
      graphOverflowCount: 3,
      graphOverflowTools: [
        'mcp__code_graph__get_community_tool',
        'mcp__code_graph__list_communities_tool',
      ],
    };
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
    expect(html).toContain('Graph overflows');
    expect(html).toContain('3');
    expect(html).toContain('mcp__code_graph__get_community_tool');
    expect(html).toContain('mcp__code_graph__list_communities_tool');
  });

  it('shows just the count when overflows occurred but no tool names captured', async () => {
    const stats: RunStats = {
      totalAgentCalls: 10,
      cacheHits: 5,
      cacheHitRate: 0.5,
      cacheReadInputTokens: -1,
      cacheCreationInputTokens: -1,
      graphOverflowCount: 2,
      graphOverflowTools: [],
    };
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
    // Should appear as the bare overflow count with no tool list parens.
    // (Hard to over-assert without coupling to layout — assert the
    //  count is present and no rogue parens leaked in.)
    expect(html).toContain('Graph overflows');
    // Count should be rendered as a standalone "2" inside a <dd>.
    expect(html).toMatch(/<dd>2<\/dd>/);
  });

  // Plan §F.6 codex-parity follow-up (2026-05-05): the previous
  // sidebar showed only `Cache hit rate: 60%` — operators couldn't
  // see whether the cached prefixes were 100 tokens or 100K. The new
  // `Cached tokens` row surfaces the actual savings volume.
  describe('Cached tokens row', () => {
    it('omits the row entirely when token volumes are unknown (older runs)', async () => {
      const stats: RunStats = {
        totalAgentCalls: 4,
        cacheHits: 3,
        cacheHitRate: 0.75,
        cacheReadInputTokens: -1,
        cacheCreationInputTokens: -1,
        graphOverflowCount: 0,
        graphOverflowTools: [],
      };
      const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
      expect(html).not.toContain('Cached tokens');
    });

    it('renders the row with a 0 when caching engaged but read 0 tokens', async () => {
      // Cache_hit:false on every call but the field is observed (>= 0).
      // Distinguishes "field measured zero" from "no field at all".
      const stats: RunStats = {
        totalAgentCalls: 4,
        cacheHits: 0,
        cacheHitRate: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        graphOverflowCount: 0,
        graphOverflowTools: [],
      };
      const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
      expect(html).toContain('Cached tokens');
      expect(html).toMatch(/<dd>0<\/dd>/);
    });

    it('formats large counts compactly (K and M suffixes)', async () => {
      const stats: RunStats = {
        totalAgentCalls: 4,
        cacheHits: 4,
        cacheHitRate: 1.0,
        cacheReadInputTokens: 18_500,
        cacheCreationInputTokens: 0,
        graphOverflowCount: 0,
        graphOverflowTools: [],
      };
      const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
      // Should appear as "19K" or "18K" depending on rounding (Math.round used).
      expect(html).toMatch(/Cached tokens/);
      expect(html).toMatch(/<dd>(18|19)K<\/dd>/);
    });

    it('shows creation cost alongside reads when both are present', async () => {
      const stats: RunStats = {
        totalAgentCalls: 4,
        cacheHits: 4,
        cacheHitRate: 1.0,
        cacheReadInputTokens: 18_500,
        cacheCreationInputTokens: 4_700,
        graphOverflowCount: 0,
        graphOverflowTools: [],
      };
      const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
      expect(html).toContain('Cached tokens');
      expect(html).toContain('written');
    });

    it('omits the +X written suffix when creation cost is zero (Codex)', async () => {
      // OpenAI doesn't surface a creation cost — the field is 0 on
      // Codex-only runs. The "+X written" suffix would be misleading.
      const stats: RunStats = {
        totalAgentCalls: 4,
        cacheHits: 4,
        cacheHitRate: 1.0,
        cacheReadInputTokens: 18_500,
        cacheCreationInputTokens: 0,
        graphOverflowCount: 0,
        graphOverflowTools: [],
      };
      const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [], stats });
      expect(html).toContain('Cached tokens');
      expect(html).not.toContain('written');
    });
  });
});
