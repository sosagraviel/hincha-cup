import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshPagesNode } from '../../../../src/nodes/wiki-refresh/refresh-pages.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('../../../../src/services/graph-wiki/agent-invoker.js', () => ({
  invokeWikiAgent: vi.fn(),
  computeGraphVersion: vi.fn().mockReturnValue('sha256abc'),
  computeGraphCommit: vi.fn().mockReturnValue('headcommit'),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const { invokeWikiAgent } = await import('../../../../src/services/graph-wiki/agent-invoker.js');
const { existsSync, readFileSync } = await import('fs');

const baseState: WikiRefreshState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  provider: Provider.CLAUDE,
  force: false,
  dry_run: false,
  changed_files: ['src/auth/service.ts'],
  refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
  generated_pages: [],
  errors: [],
  current_phase: 'compute_refresh_set',
};

describe('refreshPagesNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      '---\ndocument_type: service\nsources: []\nrelated: []\n---\n# Auth\n',
    );
  });

  it('skips agent calls and returns early in dry_run mode', async () => {
    const result = await refreshPagesNode({ ...baseState, dry_run: true });

    expect(invokeWikiAgent).not.toHaveBeenCalled();
    expect(result.current_phase).toBe('refresh_pages');
    expect(result.generated_pages).toBeUndefined();
  });

  it('returns early when refresh_set is empty', async () => {
    const result = await refreshPagesNode({ ...baseState, refresh_set: [] });

    expect(invokeWikiAgent).not.toHaveBeenCalled();
    expect(result.current_phase).toBe('refresh_pages');
  });

  it('invokes the wiki agent for each page in refresh_set', async () => {
    vi.mocked(invokeWikiAgent).mockResolvedValue('# Auth service\nUpdated content.');

    const result = await refreshPagesNode(baseState);

    expect(invokeWikiAgent).toHaveBeenCalledTimes(1);
    expect(result.generated_pages).toBeDefined();
    expect(result.generated_pages!.length).toBe(1);
    expect(result.generated_pages![0].filename).toBe('docs/llm-wiki/wiki/services/auth.md');
    expect(result.generated_pages![0].content).toContain('# Auth service');
    expect(result.current_phase).toBe('refresh_pages');
  });

  it('includes graph metadata in the generated page frontmatter', async () => {
    vi.mocked(invokeWikiAgent).mockResolvedValue('# Auth service\nContent.');

    const result = await refreshPagesNode(baseState);

    const content = result.generated_pages![0].content;
    expect(content).toContain('graph_version: sha256abc');
    expect(content).toContain('graph_commit: headcommit');
  });

  it('continues with other pages when one agent call fails', async () => {
    vi.mocked(invokeWikiAgent)
      .mockRejectedValueOnce(new Error('agent timeout'))
      .mockResolvedValueOnce('# Patterns\nContent.');

    const state: WikiRefreshState = {
      ...baseState,
      refresh_set: ['docs/llm-wiki/wiki/services/auth.md', 'docs/llm-wiki/wiki/PATTERNS.md'],
    };

    const result = await refreshPagesNode(state);

    expect(result.generated_pages!.length).toBe(1);
    expect(result.generated_pages![0].filename).toBe('docs/llm-wiki/wiki/PATTERNS.md');
  });
});
