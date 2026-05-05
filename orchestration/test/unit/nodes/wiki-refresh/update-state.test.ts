import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateStateNode } from '../../../../src/nodes/wiki-refresh/update-state.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
}));

const { execSync } = await import('child_process');
const fs = await import('fs');

const baseState: WikiRefreshState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  provider: Provider.CLAUDE,
  force: false,
  dry_run: false,
  changed_files: ['src/auth.ts'],
  refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
  generated_pages: [],
  lint_report: {
    structural: [],
    semantic: [],
    stats: { pages_scanned: 1, duration_ms: 0 },
  },
  errors: [],
  current_phase: 'run_lint',
  hints: [],
};

describe('updateStateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue('headcommit\n');
  });

  it('skips writes in dry_run mode', async () => {
    const result = await updateStateNode({ ...baseState, dry_run: true });

    expect(result.current_phase).toBe('update_state');
    expect(result.generated_pages).toBeUndefined();
  });

  it('writes .state.json with new last_indexed_commit when lint passes', async () => {
    const result = await updateStateNode(baseState);

    const stateFile = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/.state.json',
    );
    expect(stateFile).toBeDefined();

    const parsed = JSON.parse(stateFile!.content);
    expect(parsed.last_indexed_commit).toBe('headcommit');
    expect(typeof parsed.last_ingest_at).toBe('string');
  });

  it('skips .state.json write when structural lint failures exist', async () => {
    const state: WikiRefreshState = {
      ...baseState,
      lint_report: {
        structural: [
          {
            page: 'wiki/auth.md',
            rule: 'missing-frontmatter',
            severity: 'fail',
            message: 'missing',
          },
        ],
        semantic: [],
        stats: { pages_scanned: 1, duration_ms: 0 },
      },
    };

    const result = await updateStateNode(state);

    const stateFile = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/.state.json',
    );
    expect(stateFile).toBeUndefined();
    expect(result.current_phase).toBe('update_state');
  });

  it('writes .state.json when lint_report is undefined (Phase D stub path)', async () => {
    const result = await updateStateNode({ ...baseState, lint_report: undefined });

    const stateFile = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/.state.json',
    );
    expect(stateFile).toBeDefined();
  });

  it('falls back to "unknown" commit when git rev-parse fails', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const result = await updateStateNode(baseState);

    const stateFile = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/.state.json',
    );
    const parsed = JSON.parse(stateFile!.content);
    expect(parsed.last_indexed_commit).toBe('unknown');
  });

  describe('Wave 1.6 — preserves Phase 4 fields across refreshes', () => {
    // Pre-Wave 1.6 the refresh path silently dropped every field except
    // last_indexed_commit + last_ingest_at, so the durable preflight
    // metadata (graph_commit, graph_sha, pipeline_version, graph_stats)
    // disappeared on the first refresh after init. The merge below keeps
    // them intact.
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(
          {
            last_indexed_commit: 'oldcommit',
            last_ingest_at: '2026-04-01T00:00:00Z',
            graph_commit: 'graphcommit',
            graph_sha: 'graphsha',
            pipeline_version: 'ai-agentic-framework',
            graph_stats: {
              files: 42,
              functions: 100,
              edges: 250,
              languages: ['python', 'typescript'],
              build_time_ms: 1234,
            },
          },
          null,
          2,
        ),
      );
    });

    it('preserves graph_commit, graph_sha, pipeline_version, graph_stats', async () => {
      const result = await updateStateNode(baseState);

      const stateFile = result.generated_pages?.find(
        (p) => p.filename === 'docs/llm-wiki/.state.json',
      );
      const parsed = JSON.parse(stateFile!.content);
      expect(parsed.graph_commit).toBe('graphcommit');
      expect(parsed.graph_sha).toBe('graphsha');
      expect(parsed.pipeline_version).toBe('ai-agentic-framework');
      expect(parsed.graph_stats).toEqual({
        files: 42,
        functions: 100,
        edges: 250,
        languages: ['python', 'typescript'],
        build_time_ms: 1234,
      });
    });

    it('still advances last_indexed_commit + last_ingest_at on top of preserved fields', async () => {
      const result = await updateStateNode(baseState);

      const stateFile = result.generated_pages?.find(
        (p) => p.filename === 'docs/llm-wiki/.state.json',
      );
      const parsed = JSON.parse(stateFile!.content);
      expect(parsed.last_indexed_commit).toBe('headcommit');
      expect(parsed.last_indexed_commit).not.toBe('oldcommit');
      expect(parsed.last_ingest_at).not.toBe('2026-04-01T00:00:00Z');
    });

    it('handles malformed existing state gracefully (treats as empty)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const result = await updateStateNode(baseState);

      const stateFile = result.generated_pages?.find(
        (p) => p.filename === 'docs/llm-wiki/.state.json',
      );
      const parsed = JSON.parse(stateFile!.content);
      expect(parsed.last_indexed_commit).toBe('headcommit');
      // No graph_stats / graph_commit when prior file was unreadable.
      expect(parsed.graph_stats).toBeUndefined();
      expect(parsed.graph_commit).toBeUndefined();
    });

    it('handles a JSON array at the top level (defensively coerced to empty)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('[1, 2, 3]');

      const result = await updateStateNode(baseState);

      const stateFile = result.generated_pages?.find(
        (p) => p.filename === 'docs/llm-wiki/.state.json',
      );
      const parsed = JSON.parse(stateFile!.content);
      expect(parsed.last_indexed_commit).toBe('headcommit');
      expect(Array.isArray(parsed)).toBe(false);
    });
  });
});
