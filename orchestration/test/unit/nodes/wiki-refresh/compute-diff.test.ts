import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDiffNode } from '../../../../src/nodes/wiki-refresh/compute-diff.node.js';
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
  changed_files: [],
  refresh_set: [],
  generated_pages: [],
  errors: [],
  current_phase: 'read_state',
  hints: [],
};

describe('computeDiffNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs git diff when since_commit is set', async () => {
    vi.mocked(execSync).mockReturnValue('src/auth.ts\nsrc/user.ts\n');

    const result = await computeDiffNode({ ...baseState, since_commit: 'abc123' });

    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      expect.stringContaining('git -C'),
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    expect(result.changed_files).toEqual(['src/auth.ts', 'src/user.ts']);
    expect(result.current_phase).toBe('compute_diff');
  });

  it('runs git ls-files when since_commit is undefined', async () => {
    vi.mocked(execSync).mockReturnValue('src/auth.ts\nsrc/index.ts\n');

    const result = await computeDiffNode({ ...baseState, since_commit: undefined });

    const call = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(call).toContain('ls-files');
    expect(result.changed_files).toEqual(['src/auth.ts', 'src/index.ts']);
  });

  it('runs git ls-files when --force is set even with since_commit', async () => {
    vi.mocked(execSync).mockReturnValue('src/auth.ts\n');

    const result = await computeDiffNode({
      ...baseState,
      since_commit: 'abc123',
      force: true,
    });

    const call = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(call).toContain('ls-files');
    expect(result.changed_files).toEqual(['src/auth.ts']);
  });

  it('sets current_phase to no_changes when diff is empty and force is false', async () => {
    vi.mocked(execSync).mockReturnValue('\n');

    const result = await computeDiffNode({ ...baseState, since_commit: 'abc123' });

    expect(result.changed_files).toEqual([]);
    expect(result.current_phase).toBe('no_changes');
  });

  it('does not set no_changes phase when --force is set and diff is empty', async () => {
    vi.mocked(execSync).mockReturnValue('\n');

    const result = await computeDiffNode({ ...baseState, force: true });

    expect(result.current_phase).toBe('compute_diff');
  });

  it('filters out empty lines from git output', async () => {
    vi.mocked(execSync).mockReturnValue('src/a.ts\n\nsrc/b.ts\n  \n');

    const result = await computeDiffNode({ ...baseState, since_commit: 'abc123' });

    expect(result.changed_files).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
