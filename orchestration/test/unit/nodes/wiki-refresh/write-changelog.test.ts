import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeChangelogNode } from '../../../../src/nodes/wiki-refresh/write-changelog.node.js';
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
  changed_files: ['src/auth.ts'],
  refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
  generated_pages: [
    {
      filename: 'docs/llm-wiki/wiki/services/auth.md',
      content: '# Auth\nUpdated.',
    },
  ],
  errors: [],
  current_phase: 'refresh_pages',
};

describe('writeChangelogNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips writes in dry_run mode', async () => {
    const result = await writeChangelogNode({ ...baseState, dry_run: true });

    expect(result.current_phase).toBe('write_changelog');
    expect(result.generated_pages).toBeUndefined();
  });

  it('creates a new CHANGELOG.md when none exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await writeChangelogNode(baseState);

    const changelogPage = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/CHANGELOG.md',
    );
    expect(changelogPage).toBeDefined();
    expect(changelogPage!.content).toContain('## [Unreleased]');
    expect(changelogPage!.content).toContain('### Added');
    expect(changelogPage!.content).toContain('auth.md');
  });

  it('classifies as Changed when the page already exists on disk', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('CHANGELOG')) {
        return '# Changelog\n\n## [Unreleased]\n\n';
      }
      return '# Auth\nOriginal content.';
    });

    const result = await writeChangelogNode(baseState);

    const changelogPage = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/CHANGELOG.md',
    );
    expect(changelogPage!.content).toContain('### Changed');
    expect(changelogPage!.content).toContain('auth.md');
  });

  it('inserts the entry under the [Unreleased] section', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('CHANGELOG')) {
        return '# Changelog\n\n## [Unreleased]\n\n## [2026-01-01]\n\n### Added\n- old entry\n';
      }
      return '# Auth\nOriginal.';
    });

    const result = await writeChangelogNode(baseState);

    const content =
      result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/CHANGELOG.md')?.content ??
      '';

    const unreleasedIndex = content.indexOf('## [Unreleased]');
    const oldSectionIndex = content.indexOf('## [2026-01-01]');
    const changedIndex = content.indexOf('### Changed');

    expect(unreleasedIndex).toBeLessThan(changedIndex);
    expect(changedIndex).toBeLessThan(oldSectionIndex);
  });

  it('returns no generated pages when nothing has changed', async () => {
    const sameContent = '# Auth\nUpdated.';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(sameContent);

    const state: WikiRefreshState = {
      ...baseState,
      generated_pages: [{ filename: 'docs/llm-wiki/wiki/services/auth.md', content: sameContent }],
    };

    const result = await writeChangelogNode(state);

    expect(result.generated_pages ?? []).toHaveLength(0);
  });
});
