import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  graphPrefetchPath,
  hashGraphDb,
  readGraphPrefetch,
  renderPrefetchHint,
  runGraphPrefetch,
  writeGraphPrefetch,
  type GraphPrefetchSnapshot,
} from '../../../../../src/services/framework/code-graph/graph-prefetch.service.js';

/**
 * Wave 3 §I.2 — graph prefetch read path + snapshot shape + write
 * path. End-to-end coverage of the prefetch helper module.
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

  // Plan v9 Phase 9 — fat-cluster names must never reach the agent's
  // prefetch hint. Each name below is a real-world community label that
  // would overflow the agent's context if the agent drilled into it.
  it('filters every fat-cluster community-name pattern (Plan v9 Phase 9)', () => {
    const offenders = [
      'users-it:should-create-user',
      'auth-test:reject-invalid-token',
      'billing-tests:archive-invoice',
      'orders-describe',
      'orders-asserts',
      'orders-constructor',
      'orders-constructors',
      'orders-handle',
      'orders-handles',
      'orders-upsert',
      'orders-exception',
      'orders-exceptions',
      'shared',
      'helpers',
      'utils',
      'base',
      'core',
      'main',
      'index',
      'foo-shared',
      'pkg-utils',
    ];
    const realServices = ['auth', 'billing', 'orders', 'users', 'inventory'];
    const hint = renderPrefetchHint({
      generatedAt: '2026-05-05T00:00:00Z',
      graphSha: 'abc',
      minimalContext: {
        topCommunities: [...realServices, ...offenders].map((n) => ({ name: n, size: 50 })),
      },
    });
    for (const bad of offenders) {
      expect(hint, `fat-cluster name "${bad}" leaked into prefetch hint`).not.toContain(bad);
    }
    for (const good of realServices) {
      expect(hint, `real service "${good}" should appear in prefetch hint`).toContain(good);
    }
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

describe('hashGraphDb', () => {
  it('returns a stable SHA-256 hex digest for an existing file', () => {
    const path = join(tempDir, 'fake-graph.db');
    writeFileSync(path, 'graph-bytes', 'utf-8');
    const sha = hashGraphDb(path);
    expect(sha).toMatch(/^[a-f0-9]{64}$/);
    // Hash is content-addressable: same content → same SHA.
    expect(hashGraphDb(path)).toBe(sha);
  });

  it('returns "unknown" when the file does not exist (defensive)', () => {
    expect(hashGraphDb(join(tempDir, 'nope.db'))).toBe('unknown');
  });

  it('produces different SHAs for different content', () => {
    const a = join(tempDir, 'a.db');
    const b = join(tempDir, 'b.db');
    writeFileSync(a, 'one', 'utf-8');
    writeFileSync(b, 'two', 'utf-8');
    expect(hashGraphDb(a)).not.toBe(hashGraphDb(b));
  });
});

describe('runGraphPrefetch — defensive paths', () => {
  // The MCP-server-spawning happy path is exercised by integration
  // tests that have a real `code-review-graph` server available. The
  // unit tests here cover the defensive paths the writer takes when
  // the server cannot be reached.

  it('short-circuits when a fresh snapshot already exists for the same SHA', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'prefetch-shortcircuit-'));
    try {
      writeGraphPrefetch(projectPath, {
        generatedAt: '2026-05-05T00:00:00Z',
        graphSha: 'matching-sha',
      });
      const result = await runGraphPrefetch({
        projectPath,
        frameworkPath: '/nowhere/framework',
        graphSha: 'matching-sha',
      });
      expect(result.wrote).toBe(false);
      expect(result.reason).toMatch(/already current.*matching-sha/);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('reports "MCP launcher not found" when the script is absent', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'prefetch-no-launcher-'));
    try {
      const result = await runGraphPrefetch({
        projectPath,
        frameworkPath: '/nowhere/framework',
        graphSha: 'fresh-sha',
      });
      expect(result.wrote).toBe(false);
      expect(result.reason).toMatch(/MCP launcher not found/);
      expect(result.path).toContain('graph-prefetch.json');
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });
});
