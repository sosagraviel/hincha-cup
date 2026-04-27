import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRefreshSetNode } from '../../../../src/nodes/wiki-refresh/compute-refresh-set.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const { existsSync, readdirSync, readFileSync } = await import('fs');

const baseState: WikiRefreshState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  provider: Provider.CLAUDE,
  force: false,
  dry_run: false,
  changed_files: ['src/auth/service.ts'],
  refresh_set: [],
  generated_pages: [],
  errors: [],
  current_phase: 'compute_diff',
  hints: [],
};

function makeDirent(name: string, isFile = true): import('fs').Dirent {
  return {
    name,
    parentPath: '',
    path: '',
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as unknown as import('fs').Dirent;
}

describe('computeRefreshSetNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error and empty set when wiki directory does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await computeRefreshSetNode(baseState);

    expect(result.refresh_set).toEqual([]);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('compute_refresh_set');
  });

  it('returns empty refresh_set when no wiki pages are found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);

    const result = await computeRefreshSetNode(baseState);

    expect(result.refresh_set).toEqual([]);
    expect(result.current_phase).toBe('compute_refresh_set');
  });

  it('includes pages whose sources[] reference the changed file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const seenDirs = new Set<string>();
    vi.mocked(readdirSync).mockImplementation(((dir: unknown) => {
      const dirStr = String(dir);
      if (seenDirs.has(dirStr)) return [];
      seenDirs.add(dirStr);
      if (dirStr.endsWith('/wiki')) {
        return [makeDirent('services', false), makeDirent('ARCHITECTURE.md', true)];
      }
      if (dirStr.endsWith('/services')) {
        return [makeDirent('auth.md', true)];
      }
      return [];
    }) as any);

    const authPageContent = [
      '---',
      'document_type: service',
      'sources:',
      '  - path: src/auth/service.ts',
      '    sha256: abc123',
      '    ingested_at: 2026-01-01T00:00:00Z',
      '    commit: abc123',
      'related: []',
      '---',
      '# Auth service',
    ].join('\n');

    const archContent = [
      '---',
      'document_type: architecture',
      'sources: []',
      'related: []',
      '---',
      '# Architecture',
    ].join('\n');

    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('auth.md')) return authPageContent;
      if (path.includes('ARCHITECTURE.md')) return archContent;
      return '---\nsources: []\nrelated: []\n---\n';
    });

    const result = await computeRefreshSetNode(baseState);

    const refreshSet = result.refresh_set ?? [];
    expect(refreshSet.some((p) => p.includes('auth'))).toBe(true);
  });

  it('applies pages_filter to cap the result', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation(((dir: unknown) => {
      if (String(dir).includes('wiki')) {
        return [makeDirent('ARCHITECTURE.md'), makeDirent('PATTERNS.md')];
      }
      return [];
    }) as any);

    const makeContent = (type: string) =>
      `---\ndocument_type: ${type}\nsources:\n  - path: src/auth/service.ts\n    sha256: abc\n    ingested_at: 2026-01-01T00:00:00Z\n    commit: abc\nrelated: []\n---\n# ${type}`;

    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('ARCHITECTURE')) return makeContent('architecture');
      if (path.includes('PATTERNS')) return makeContent('pattern');
      return '---\nsources: []\nrelated: []\n---\n';
    });

    const result = await computeRefreshSetNode({
      ...baseState,
      pages_filter: ['ARCHITECTURE'],
    });

    const refreshSet = result.refresh_set ?? [];
    expect(refreshSet.every((p) => p.includes('ARCHITECTURE'))).toBe(true);
  });

  it('respects WIKI_REFRESH_MAX_PAGES env variable', async () => {
    process.env.WIKI_REFRESH_MAX_PAGES = '1';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation(((dir: unknown) => {
      if (String(dir).includes('wiki')) {
        return [makeDirent('ARCHITECTURE.md'), makeDirent('SERVICES.md')];
      }
      return [];
    }) as any);

    const makeContent = (type: string) =>
      `---\ndocument_type: ${type}\nsources:\n  - path: src/auth/service.ts\n    sha256: abc\n    ingested_at: 2026-01-01T00:00:00Z\n    commit: abc\nrelated: []\n---\n# ${type}`;

    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('ARCHITECTURE')) return makeContent('architecture');
      if (path.includes('SERVICES')) return makeContent('services');
      return '---\nsources: []\nrelated: []\n---\n';
    });

    const result = await computeRefreshSetNode(baseState);

    expect((result.refresh_set ?? []).length).toBeLessThanOrEqual(1);

    delete process.env.WIKI_REFRESH_MAX_PAGES;
  });

  it('includes hint pages in the refresh set even when diff is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);

    const result = await computeRefreshSetNode({
      ...baseState,
      changed_files: [],
      hints: [
        {
          file_path: 'src/auth/oauth.ts',
          suggested_page: 'services/auth.md',
          action: 'update',
          reason: 'OAuth added',
        },
        {
          file_path: 'src/billing/invoice.ts',
          suggested_page: 'PATTERNS.md',
          action: 'update',
          reason: 'billing pattern',
        },
      ],
    });

    const refreshSet = result.refresh_set ?? [];
    expect(refreshSet.some((p) => p.includes('services/auth.md'))).toBe(true);
    expect(refreshSet.some((p) => p.includes('PATTERNS.md'))).toBe(true);
  });

  it('deduplicates when hints and diff resolve to the same page', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const seenDirs = new Set<string>();
    vi.mocked(readdirSync).mockImplementation(((dir: unknown) => {
      const dirStr = String(dir);
      if (seenDirs.has(dirStr)) return [];
      seenDirs.add(dirStr);
      if (dirStr.endsWith('/wiki')) {
        return [makeDirent('services', false)];
      }
      if (dirStr.endsWith('/services')) {
        return [makeDirent('auth.md', true)];
      }
      return [];
    }) as any);

    const authPageContent = [
      '---',
      'document_type: service',
      'sources:',
      '  - path: src/auth/service.ts',
      '    sha256: abc123',
      '    ingested_at: 2026-01-01T00:00:00Z',
      '    commit: abc123',
      'related: []',
      '---',
      '# Auth service',
    ].join('\n');

    vi.mocked(readFileSync).mockImplementation(() => authPageContent);

    const result = await computeRefreshSetNode({
      ...baseState,
      changed_files: ['src/auth/service.ts'],
      hints: [
        {
          file_path: 'src/auth/service.ts',
          suggested_page: 'services/auth.md',
          action: 'update',
          reason: 'same page',
        },
      ],
    });

    const refreshSet = result.refresh_set ?? [];
    const authPages = refreshSet.filter((p) => p.includes('auth.md'));
    expect(authPages.length).toBe(1);
  });

  it('hints respect the MAX_PAGES cap', async () => {
    process.env.WIKI_REFRESH_MAX_PAGES = '2';

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([] as any);

    const result = await computeRefreshSetNode({
      ...baseState,
      changed_files: [],
      hints: [
        { file_path: 'src/a.ts', suggested_page: 'services/a.md', action: 'update', reason: 'a' },
        { file_path: 'src/b.ts', suggested_page: 'services/b.md', action: 'update', reason: 'b' },
        { file_path: 'src/c.ts', suggested_page: 'services/c.md', action: 'add', reason: 'c' },
      ],
    });

    expect((result.refresh_set ?? []).length).toBeLessThanOrEqual(2);

    delete process.env.WIKI_REFRESH_MAX_PAGES;
  });
});
