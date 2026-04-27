import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readStateNode } from '../../../../src/nodes/wiki-refresh/read-state.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const { existsSync, readFileSync } = await import('fs');

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
  current_phase: 'init',
  hints: [],
};

describe('readStateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets since_commit from .state.json when the file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ last_indexed_commit: 'abc1234', last_ingest_at: '2026-01-01T00:00:00Z' }),
    );

    const result = await readStateNode(baseState);

    expect(result.since_commit).toBe('abc1234');
    expect(result.current_phase).toBe('read_state');
  });

  it('leaves since_commit undefined when .state.json does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await readStateNode(baseState);

    expect(result.since_commit).toBeUndefined();
    expect(result.current_phase).toBe('read_state');
  });

  it('leaves since_commit undefined when --force is set regardless of .state.json', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ last_indexed_commit: 'abc1234' }));

    const result = await readStateNode({ ...baseState, force: true });

    expect(result.since_commit).toBeUndefined();
    expect(result.current_phase).toBe('read_state');
  });

  it('leaves since_commit undefined when last_indexed_commit is "unknown"', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ last_indexed_commit: 'unknown' }));

    const result = await readStateNode(baseState);

    expect(result.since_commit).toBeUndefined();
  });

  it('returns an error and undefined since_commit when .state.json is malformed JSON', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{ invalid json }');

    const result = await readStateNode(baseState);

    expect(result.since_commit).toBeUndefined();
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('read_state');
  });
});
