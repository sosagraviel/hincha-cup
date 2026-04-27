import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateStateNode } from '../../../../src/nodes/wiki-refresh/update-state.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const { execSync } = await import('child_process');

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
});
