import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Provider } from '../../src/providers/types.js';

// Mock out the heavy dependencies so the integration test runs without real
// git repos or live agents. The test focuses on the node wiring and state
// propagation through the workflow, not on the agent's LLM output.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn((cmd: string) => {
      if (cmd.includes('rev-parse HEAD')) return 'deadbeef\n';
      if (cmd.includes('diff') && cmd.includes('--name-only')) return 'src/auth/service.ts\n';
      if (cmd.includes('ls-files')) return 'src/auth/service.ts\nsrc/index.ts\n';
      return '';
    }),
    spawn: vi.fn(() => {
      const ee: any = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() };
      setTimeout(() => {
        const closeListeners = ee.on.mock.calls.filter((c: any) => c[0] === 'close');
        closeListeners.forEach((c: any) => c[1](0));
      }, 0);
      return ee;
    }),
  };
});

vi.mock('../../src/services/graph-wiki/agent-invoker.js', () => ({
  invokeWikiAgent: vi.fn().mockResolvedValue('# Auth Service\n\nUpdated content after refresh.'),
  computeGraphVersion: vi.fn().mockReturnValue('sha256abc'),
  computeGraphCommit: vi.fn().mockReturnValue('deadbeef'),
}));

vi.mock('../../src/services/graph-wiki/code-graph.service.js', () => ({
  buildCodeGraph: vi.fn().mockResolvedValue({
    code_graph_available: true,
    code_graph_path: '/tmp/test/.code-graph.db',
    code_graph_mcp_port: 3100,
    code_graph_stats: { files: 5, functions: 10 },
  }),
}));

const AUTH_PAGE_CONTENT = [
  '---',
  'document_type: service',
  'summary: Auth service.',
  'confidence: high',
  'generated_at: 2026-01-01T00:00:00Z',
  'generated_by: ai-agentic-framework',
  'graph_version: oldsha',
  'graph_commit: abc123',
  'graph_queries_used: []',
  'sources:',
  '  - path: src/auth/service.ts',
  '    sha256: abc',
  '    ingested_at: 2026-01-01T00:00:00Z',
  '    commit: abc123',
  'related: []',
  'last_verified: 2026-01-01T00:00:00Z',
  '---',
  '',
  '# Auth Service',
  '',
  'Original content.',
].join('\n');

const SERVICES_PAGE_CONTENT = [
  '---',
  'document_type: services',
  'summary: Catalog of services.',
  'confidence: high',
  'generated_at: 2026-01-01T00:00:00Z',
  'generated_by: ai-agentic-framework',
  'graph_version: oldsha',
  'graph_commit: abc123',
  'graph_queries_used: []',
  'sources:',
  '  - path: src/auth/service.ts',
  '    sha256: abc',
  '    ingested_at: 2026-01-01T00:00:00Z',
  '    commit: abc123',
  'related: []',
  'last_verified: 2026-01-01T00:00:00Z',
  '---',
  '',
  '# Services',
  '',
  '- [auth](services/auth.md)',
].join('\n');

describe('wiki-refresh integration', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'wiki-refresh-test-'));

    mkdirSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'services'), { recursive: true });
    mkdirSync(join(projectPath, '.code-review-graph'), { recursive: true });

    writeFileSync(join(projectPath, '.code-graph.db'), 'binary', 'utf-8');

    writeFileSync(
      join(projectPath, 'docs', 'llm-wiki', '.state.json'),
      JSON.stringify({ last_indexed_commit: 'abc123', last_ingest_at: '2026-01-01T00:00:00Z' }),
    );

    writeFileSync(
      join(projectPath, 'docs', 'llm-wiki', 'CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n\n## [2026-01-01] — Initial generation\n\n### Added\n- wiki/SERVICES.md\n',
    );

    writeFileSync(join(projectPath, 'docs', 'llm-wiki', 'log.md'), '');

    writeFileSync(
      join(projectPath, 'docs', 'llm-wiki', 'wiki', 'SERVICES.md'),
      SERVICES_PAGE_CONTENT,
    );

    writeFileSync(
      join(projectPath, 'docs', 'llm-wiki', 'wiki', 'services', 'auth.md'),
      AUTH_PAGE_CONTENT,
    );
  });

  afterEach(() => {
    if (existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('populates changed_files from git diff since since_commit', async () => {
    const { computeDiffNode } = await import('../../src/nodes/wiki-refresh/compute-diff.node.js');
    const state = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: false,
      since_commit: 'abc123',
      changed_files: [],
      refresh_set: [],
      generated_pages: [],
      errors: [],
      current_phase: 'read_state',
    };

    const result = await computeDiffNode(state);

    expect(result.changed_files).toBeDefined();
    expect(result.changed_files!.length).toBeGreaterThan(0);
    expect(result.changed_files).toContain('src/auth/service.ts');
  });

  it('includes the auth service page in refresh_set when auth source changed', async () => {
    const { computeRefreshSetNode } =
      await import('../../src/nodes/wiki-refresh/compute-refresh-set.node.js');
    const state = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: false,
      changed_files: ['src/auth/service.ts'],
      refresh_set: [],
      generated_pages: [],
      errors: [],
      current_phase: 'compute_diff',
    };

    const result = await computeRefreshSetNode(state);

    const refreshSet = result.refresh_set ?? [];
    const hasAuthPage = refreshSet.some((p) => p.includes('auth'));
    expect(hasAuthPage).toBe(true);
  });

  it('appends a Changed entry to CHANGELOG.md after refresh', async () => {
    const { writeChangelogNode } =
      await import('../../src/nodes/wiki-refresh/write-changelog.node.js');

    const state = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: false,
      changed_files: ['src/auth/service.ts'],
      refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
      generated_pages: [
        {
          filename: 'docs/llm-wiki/wiki/services/auth.md',
          content: AUTH_PAGE_CONTENT + '\nNew paragraph.',
        },
      ],
      errors: [],
      current_phase: 'refresh_pages',
    };

    const result = await writeChangelogNode(state);

    const changelogPage = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/CHANGELOG.md',
    );
    expect(changelogPage).toBeDefined();
    expect(changelogPage!.content).toContain('### Changed');
    expect(changelogPage!.content).toContain('auth.md');
  });

  it('appends a refresh entry to log.md', async () => {
    const { writeLogNode } = await import('../../src/nodes/wiki-refresh/write-log.node.js');

    const state = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: false,
      since_commit: 'abc123',
      changed_files: ['src/auth/service.ts'],
      refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
      generated_pages: [
        { filename: 'docs/llm-wiki/wiki/services/auth.md', content: '# Auth\nUpdated.' },
      ],
      errors: [],
      current_phase: 'write_changelog',
    };

    const result = await writeLogNode(state);

    const logPage = result.generated_pages?.find((p) => p.filename === 'docs/llm-wiki/log.md');
    expect(logPage).toBeDefined();

    const lines = logPage!.content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.type).toBe('refresh');
    expect(entry.since_commit).toBe('abc123');
  });

  it('bumps last_indexed_commit in .state.json when lint passes', async () => {
    const { updateStateNode } = await import('../../src/nodes/wiki-refresh/update-state.node.js');

    const state = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: false,
      changed_files: ['src/auth/service.ts'],
      refresh_set: [],
      generated_pages: [],
      lint_report: { structural: [], semantic: [], stats: { pages_scanned: 1, duration_ms: 0 } },
      errors: [],
      current_phase: 'run_lint',
    };

    const result = await updateStateNode(state);

    const stateFile = result.generated_pages?.find(
      (p) => p.filename === 'docs/llm-wiki/.state.json',
    );
    expect(stateFile).toBeDefined();
    const parsed = JSON.parse(stateFile!.content);
    expect(parsed.last_indexed_commit).toBe('deadbeef');
  });

  it('dry-run: produces no file writes', async () => {
    const { writeChangelogNode } =
      await import('../../src/nodes/wiki-refresh/write-changelog.node.js');
    const { writeLogNode } = await import('../../src/nodes/wiki-refresh/write-log.node.js');
    const { updateStateNode } = await import('../../src/nodes/wiki-refresh/update-state.node.js');
    const { writePagesNode } = await import('../../src/nodes/wiki-refresh/write-pages.node.js');

    const dryRunState = {
      project_path: projectPath,
      framework_path: '/framework',
      provider: Provider.CLAUDE,
      force: false,
      dry_run: true,
      changed_files: ['src/auth/service.ts'],
      refresh_set: ['docs/llm-wiki/wiki/services/auth.md'],
      generated_pages: [
        { filename: 'docs/llm-wiki/wiki/services/auth.md', content: '# Auth\nNew.' },
      ],
      lint_report: { structural: [], semantic: [], stats: { pages_scanned: 1, duration_ms: 0 } },
      errors: [],
      current_phase: 'refresh_pages',
    };

    const changelog = await writeChangelogNode(dryRunState);
    expect(changelog.generated_pages).toBeUndefined();

    const log = await writeLogNode(dryRunState);
    expect(log.generated_pages).toBeUndefined();

    const stateUpdate = await updateStateNode(dryRunState);
    expect(stateUpdate.generated_pages).toBeUndefined();

    const writes = await writePagesNode(dryRunState);
    expect(writes.current_phase).toBe('write_pages');

    const originalState = readFileSync(
      join(projectPath, 'docs', 'llm-wiki', '.state.json'),
      'utf-8',
    );
    expect(JSON.parse(originalState).last_indexed_commit).toBe('abc123');
  });
});
