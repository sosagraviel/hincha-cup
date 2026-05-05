import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  graphPrefetchPath,
  readGraphPrefetch,
  renderPrefetchHint,
  writeGraphPrefetch,
  type GraphPrefetchSnapshot,
} from '../../../../../src/services/framework/code-graph/graph-prefetch.service.js';

/**
 * Wave 3 §I.2 — graph prefetch read path + snapshot shape.
 *
 * The write path (TS MCP client invoking the four orientation
 * tools at Phase 0) is deferred to a follow-up; this commit ships
 * the canonical filename / JSON shape / read API so the discipline
 * and any future writer interoperate.
 *
 * Stack-agnostic: every snapshot field is graph-derived (community
 * names, qualified_names) — no language assumption.
 */

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'graph-prefetch-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('graphPrefetchPath', () => {
  it('returns a stable path under the active provider temp dir', () => {
    const path = graphPrefetchPath(tempDir);
    expect(path).toMatch(/initialize-project[\\/]graph-prefetch\.json$/);
  });
});

describe('writeGraphPrefetch + readGraphPrefetch', () => {
  it('round-trips a complete snapshot', () => {
    const snap: GraphPrefetchSnapshot = {
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'abc123',
      minimalContext: {
        topCommunities: [{ name: 'auth', size: 50, cohesion: 0.8 }],
        topFlows: [{ id: 'f1', name: 'request', criticality: 5 }],
        riskScore: 0.3,
        suggestedNextTools: ['get_community_tool'],
      },
      communities: [{ name: 'auth', size: 50 }],
      hubs: [{ qualified_name: 'auth/Foo', kind: 'Class', score: 12 }],
      bridges: [{ qualified_name: 'auth/Bar', kind: 'Function', score: 8 }],
    };
    writeGraphPrefetch(tempDir, snap);
    const round = readGraphPrefetch(tempDir, 'abc123');
    expect(round).toEqual(snap);
  });

  it('returns null when no snapshot exists', () => {
    expect(readGraphPrefetch(tempDir, 'abc')).toBeNull();
  });

  it('returns null when the snapshot graphSha does not match (stale)', () => {
    writeGraphPrefetch(tempDir, {
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'old',
    });
    expect(readGraphPrefetch(tempDir, 'new')).toBeNull();
  });

  it('returns null on malformed JSON (defensive)', () => {
    const path = graphPrefetchPath(tempDir);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'not json', 'utf-8');
    expect(readGraphPrefetch(tempDir, 'abc')).toBeNull();
  });

  it('returns null when the snapshot has no graphSha (defensive)', () => {
    const path = graphPrefetchPath(tempDir);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify({ generatedAt: '2026-05-05T00:00:00Z' }), 'utf-8');
    expect(readGraphPrefetch(tempDir, 'abc')).toBeNull();
  });
});

describe('renderPrefetchHint', () => {
  it('returns empty string when snapshot is null', () => {
    expect(renderPrefetchHint(null)).toBe('');
  });

  it('renders a compact prose summary with community + hub + bridge tokens', () => {
    const hint = renderPrefetchHint({
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'abc',
      minimalContext: {
        topCommunities: [
          { name: 'auth', size: 50 },
          { name: 'billing', size: 30 },
        ],
      },
      hubs: [
        { qualified_name: 'auth/Foo', kind: 'Class' },
        { qualified_name: 'auth/Bar', kind: 'Function' },
      ],
      bridges: [{ qualified_name: 'auth/Baz', kind: 'Function' }],
    });
    expect(hint).toContain('Pre-fetched graph orientation');
    expect(hint).toContain('auth, billing');
    expect(hint).toContain('auth/Foo, auth/Bar');
    expect(hint).toContain('auth/Baz');
    expect(hint).toMatch(/skip.*get_minimal_context_tool/);
  });

  it('falls back to communities when minimalContext.topCommunities is absent', () => {
    const hint = renderPrefetchHint({
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'abc',
      communities: [{ name: 'svc-a' }, { name: 'svc-b' }],
    });
    expect(hint).toContain('svc-a, svc-b');
  });

  it('caps the hint to a reasonable size (≤ 1 KB)', () => {
    const hint = renderPrefetchHint({
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'abc',
      minimalContext: {
        topCommunities: Array.from({ length: 100 }, (_, i) => ({ name: `community-${i}` })),
      },
      hubs: Array.from({ length: 100 }, (_, i) => ({ qualified_name: `pkg/Hub${i}` })),
      bridges: Array.from({ length: 100 }, (_, i) => ({ qualified_name: `pkg/Bridge${i}` })),
    });
    // Even with a 100-element topCommunities, the renderer slices to 8 + 5 + 5
    // tokens — total prose stays well under 1 KB.
    expect(hint.length).toBeLessThan(1024);
  });
});
