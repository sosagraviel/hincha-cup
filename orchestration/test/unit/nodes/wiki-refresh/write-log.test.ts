import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeLogNode } from '../../../../src/nodes/wiki-refresh/write-log.node.js';
import type { WikiRefreshState } from '../../../../src/state/schemas/wiki-refresh.schema.js';
import { Provider } from '../../../../src/providers/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const { existsSync, readFileSync } = await import('fs');
const { execSync } = await import('child_process');

const baseState: WikiRefreshState = {
  project_path: '/test/project',
  framework_path: '/test/framework',
  provider: Provider.CLAUDE,
  force: false,
  dry_run: false,
  since_commit: 'abc123',
  changed_files: ['src/auth.ts'],
  refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
  generated_pages: [
    { filename: 'docs/llm-wiki/wiki/services/auth.md', content: '# Auth\nContent.' },
  ],
  errors: [],
  current_phase: 'write_changelog',
  hints: [],
};

describe('writeLogNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue('headcommit\n');
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('');
  });

  it('skips writes in dry_run mode', async () => {
    const result = await writeLogNode({ ...baseState, dry_run: true });

    expect(result.current_phase).toBe('write_log');
    expect(result.generated_pages).toBeUndefined();
  });

  it('creates a log.md entry with the expected fields', async () => {
    const result = await writeLogNode(baseState);

    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    expect(logPage).toBeDefined();

    const entry = JSON.parse(logPage!.content.trim());
    expect(entry.type).toBe('refresh');
    expect(entry.since_commit).toBe('abc123');
    expect(entry.to_commit).toBe('headcommit');
    expect(entry.changed_files_count).toBe(1);
    expect(entry.refreshed_pages).toContain('docs/llm-wiki/wiki/services/auth.md');
    expect(typeof entry.lint_ok).toBe('boolean');
    expect(typeof entry.ts).toBe('string');
    expect(entry.hints_used).toBe(0);
  });

  it('records hints_used count when hints are present', async () => {
    const stateWithHints: WikiRefreshState = {
      ...baseState,
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
    };

    const result = await writeLogNode(stateWithHints);

    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    expect(logPage).toBeDefined();

    const entry = JSON.parse(logPage!.content.trim());
    expect(entry.hints_used).toBe(2);
  });

  it('appends to an existing log.md without overwriting prior entries', async () => {
    const priorEntry = JSON.stringify({ ts: '2026-01-01T00:00:00Z', type: 'refresh' });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(priorEntry + '\n');

    const result = await writeLogNode(baseState);

    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    expect(logPage).toBeDefined();
    const lines = logPage!.content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(2);
    const first = JSON.parse(lines[0]);
    expect(first.ts).toBe('2026-01-01T00:00:00Z');
  });

  it('sets lint_ok to false when structural lint failures are present', async () => {
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

    const result = await writeLogNode(state);

    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    const entry = JSON.parse(logPage!.content.trim());
    expect(entry.lint_ok).toBe(false);
  });

  it('excludes CHANGELOG.md and log.md from refreshed_pages list', async () => {
    const state: WikiRefreshState = {
      ...baseState,
      generated_pages: [
        { filename: 'docs/llm-wiki/wiki/services/auth.md', content: '# Auth' },
        { filename: 'docs/llm-wiki/CHANGELOG.md', content: '# Changelog' },
        { filename: 'docs/llm-wiki/log.md', content: '{}' },
      ],
    };

    const result = await writeLogNode(state);
    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    const entry = JSON.parse(logPage!.content.trim());
    expect(entry.refreshed_pages).toContain('docs/llm-wiki/wiki/services/auth.md');
    expect(entry.refreshed_pages).not.toContain('docs/llm-wiki/CHANGELOG.md');
    expect(entry.refreshed_pages).not.toContain('docs/llm-wiki/log.md');
  });
});
