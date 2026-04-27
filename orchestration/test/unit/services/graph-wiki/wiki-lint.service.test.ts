import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { lintLlmWiki } from '../../../../src/services/graph-wiki/wiki-lint.service.js';

function buildFrontmatter(overrides: Record<string, unknown> = {}): string {
  const base = {
    document_type: 'architecture',
    graph_version: 'a'.repeat(64),
    graph_commit: 'b'.repeat(40),
    generated_at: '2026-01-01T00:00:00.000Z',
    summary: 'Test page summary',
    sources: [],
    confidence: 'high',
    related: [],
    last_verified: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  const lines = Object.entries(base).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function buildProjectTree(): {
  projectPath: string;
  wikiDir: string;
  artifactsDir: string;
} {
  const projectPath = mkdtempSync(join(tmpdir(), 'wiki-lint-test-'));
  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const artifactsDir = join(projectPath, '.claude-temp', 'wiki-lint-test');
  mkdirSync(wikiDir, { recursive: true });
  mkdirSync(join(projectPath, 'docs', 'llm-wiki', 'raw'), { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  return { projectPath, wikiDir, artifactsDir };
}

function writeWikiPage(wikiDir: string, filename: string, content: string): string {
  const filePath = join(wikiDir, filename);
  mkdirSync(
    join(wikiDir, filename.includes('/') ? filename.split('/').slice(0, -1).join('/') : ''),
    {
      recursive: true,
    },
  );
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('wiki-lint.service — missing-frontmatter', () => {
  it('reports each missing required key separately', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(wikiDir, 'index.md', '---\ndocument_type: index\n---\n# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const missingRules = report.structural.filter((v) => v.rule === 'missing-frontmatter');
    const missingKeys = missingRules.map((v) => v.message);

    expect(missingKeys.some((m) => m.includes('graph_version'))).toBe(true);
    expect(missingKeys.some((m) => m.includes('generated_at'))).toBe(true);
    expect(missingKeys.some((m) => m.includes('summary'))).toBe(true);
    expect(missingKeys.some((m) => m.includes('confidence'))).toBe(true);
  });

  it('does not report violations for a fully-formed page', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(wikiDir, 'index.md', buildFrontmatter() + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const missing = report.structural.filter((v) => v.rule === 'missing-frontmatter');
    expect(missing).toHaveLength(0);
  });
});

describe('wiki-lint.service — broken-wikilinks', () => {
  it('flags a markdown link pointing to a non-existent file', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(
      wikiDir,
      'index.md',
      buildFrontmatter() + '# Index\n\nSee [missing](missing-file.md) for details.\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const broken = report.structural.filter((v) => v.rule === 'broken-wikilinks');
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe('fail');
    expect(broken[0].evidence).toContain('missing-file.md');
  });

  it('does not flag external http links', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(
      wikiDir,
      'index.md',
      buildFrontmatter() + '# Index\n\nSee [external](https://example.com) for details.\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const broken = report.structural.filter((v) => v.rule === 'broken-wikilinks');
    expect(broken).toHaveLength(0);
  });

  it('does not flag anchor-only links', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(
      wikiDir,
      'index.md',
      buildFrontmatter() + '# Index\n\nSee [section](#section-heading) for details.\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const broken = report.structural.filter((v) => v.rule === 'broken-wikilinks');
    expect(broken).toHaveLength(0);
  });

  it('passes when the linked file exists', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(
      wikiDir,
      'SERVICES.md',
      buildFrontmatter({ document_type: 'services' }) + '# Services\n',
    );
    writeWikiPage(
      wikiDir,
      'index.md',
      buildFrontmatter() + '# Index\n\nSee [services](SERVICES.md) for details.\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const broken = report.structural.filter((v) => v.rule === 'broken-wikilinks');
    expect(broken).toHaveLength(0);
  });
});

describe('wiki-lint.service — dead-sources', () => {
  it('flags a source path that does not exist', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const fm = buildFrontmatter({
      sources: [
        {
          path: 'src/nonexistent.ts',
          sha256: 'x'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'y'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const dead = report.structural.filter((v) => v.rule === 'dead-sources');
    expect(dead).toHaveLength(1);
    expect(dead[0].severity).toBe('fail');
    expect(dead[0].evidence).toContain('src/nonexistent.ts');
  });

  it('does not flag a source path that exists in the project tree', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeFileSync(join(projectPath, 'README.md'), '# Readme\n', 'utf-8');

    const fm = buildFrontmatter({
      sources: [
        {
          path: 'README.md',
          sha256: 'a'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'b'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const dead = report.structural.filter((v) => v.rule === 'dead-sources');
    expect(dead).toHaveLength(0);
  });
});

describe('wiki-lint.service — legacy-raw-source', () => {
  it('flags a source citing raw/analyzers/ as legacy-raw-source', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const fm = buildFrontmatter({
      sources: [
        {
          path: 'docs/llm-wiki/raw/analyzers/01-structure-architecture.json',
          sha256: 'x'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'y'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const legacy = report.structural.filter((v) => v.rule === 'legacy-raw-source');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].severity).toBe('fail');
    expect(legacy[0].evidence).toContain('raw/analyzers/');
  });

  it('flags a source citing raw/graph-stats/ as legacy-raw-source', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const fm = buildFrontmatter({
      sources: [
        {
          path: 'docs/llm-wiki/raw/graph-stats/abc123.json',
          sha256: 'x'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'y'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const legacy = report.structural.filter((v) => v.rule === 'legacy-raw-source');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].severity).toBe('fail');
    expect(legacy[0].evidence).toContain('raw/graph-stats/');
  });

  it('does not flag sources under raw/snapshots/ or raw/external/', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const rawDir = require('path').join(projectPath, 'docs', 'llm-wiki', 'raw');
    require('fs').mkdirSync(require('path').join(rawDir, 'snapshots'), { recursive: true });
    require('fs').writeFileSync(
      require('path').join(rawDir, 'snapshots', 'README.md'),
      '# Project',
      'utf-8',
    );
    const fm = buildFrontmatter({
      sources: [
        {
          path: 'docs/llm-wiki/raw/snapshots/README.md',
          sha256: 'a'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'b'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const legacy = report.structural.filter((v) => v.rule === 'legacy-raw-source');
    expect(legacy).toHaveLength(0);
  });

  it('does not flag sources nested under raw/external/<type>/<file>.md', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const externalTypeDir = require('path').join(
      projectPath,
      'docs',
      'llm-wiki',
      'raw',
      'external',
      'jira',
    );
    require('fs').mkdirSync(externalTypeDir, { recursive: true });
    require('fs').writeFileSync(
      require('path').join(externalTypeDir, 'PROJ-123.md'),
      '# PROJ-123\n\nExternal content.',
      'utf-8',
    );

    const fm = buildFrontmatter({
      sources: [
        {
          path: 'docs/llm-wiki/raw/external/jira/PROJ-123.md',
          sha256: 'd'.repeat(64),
          ingested_at: '2026-01-01T00:00:00.000Z',
          commit: 'e'.repeat(40),
        },
      ],
    });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const dead = report.structural.filter((v) => v.rule === 'dead-sources');
    expect(dead).toHaveLength(0);

    const legacy = report.structural.filter((v) => v.rule === 'legacy-raw-source');
    expect(legacy).toHaveLength(0);
  });
});

describe('wiki-lint.service — graph-version-mismatch', () => {
  it('emits a semantic warn when graph_version does not match the DB hash', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const graphDbPath = join(projectPath, '.code-review-graph/graph.db');
    mkdirSync(dirname(graphDbPath), { recursive: true });
    writeFileSync(graphDbPath, 'real-db-content', 'utf-8');
    const realHash = createHash('sha256').update('real-db-content').digest('hex');

    const fm = buildFrontmatter({ graph_version: 'wrong'.repeat(12) });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      graphDbPath,
      skipSemantic: true,
      artifactsDir,
    });

    const mismatch = report.semantic.filter((v) => v.rule === 'graph-version-mismatch');
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].severity).toBe('warn');
    expect(mismatch[0].evidence).not.toBe(realHash);
  });

  it('does not emit a violation when graph_version matches', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    const graphDbPath = join(projectPath, '.code-review-graph/graph.db');
    mkdirSync(dirname(graphDbPath), { recursive: true });
    writeFileSync(graphDbPath, 'real-db-content', 'utf-8');
    const realHash = createHash('sha256').update('real-db-content').digest('hex');

    const fm = buildFrontmatter({ graph_version: realHash });
    writeWikiPage(wikiDir, 'index.md', fm + '# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      graphDbPath,
      skipSemantic: true,
      artifactsDir,
    });

    const mismatch = report.semantic.filter((v) => v.rule === 'graph-version-mismatch');
    expect(mismatch).toHaveLength(0);
  });
});

describe('wiki-lint.service — orphans', () => {
  it('flags a page with no inbound links and not in index navigation', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();

    writeWikiPage(wikiDir, 'index.md', buildFrontmatter({ document_type: 'index' }) + '# Index\n');
    writeWikiPage(
      wikiDir,
      'ARCHITECTURE.md',
      buildFrontmatter({ document_type: 'architecture' }) + '# Architecture\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: false,
      artifactsDir,
    });

    const orphans = report.semantic.filter((v) => v.rule === 'orphans');
    const architectureOrphan = orphans.find((v) => v.page.includes('ARCHITECTURE.md'));
    expect(architectureOrphan).toBeDefined();
    expect(architectureOrphan?.severity).toBe('warn');
  });

  it('does not flag a page that is referenced in index.md', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();

    writeWikiPage(
      wikiDir,
      'ARCHITECTURE.md',
      buildFrontmatter({ document_type: 'architecture' }) + '# Architecture\n',
    );
    writeWikiPage(
      wikiDir,
      'index.md',
      buildFrontmatter({ document_type: 'index' }) +
        '# Index\n\n- [Architecture](ARCHITECTURE.md)\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: false,
      artifactsDir,
    });

    const orphans = report.semantic.filter((v) => v.rule === 'orphans');
    const architectureOrphan = orphans.find((v) => v.page.includes('ARCHITECTURE.md'));
    expect(architectureOrphan).toBeUndefined();
  });
});

describe('wiki-lint.service — stats', () => {
  it('reports correct page count', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();

    writeWikiPage(wikiDir, 'index.md', buildFrontmatter({ document_type: 'index' }) + '# Index\n');
    writeWikiPage(
      wikiDir,
      'ARCHITECTURE.md',
      buildFrontmatter({ document_type: 'architecture' }) + '# Architecture\n',
    );
    writeWikiPage(
      wikiDir,
      'SERVICES.md',
      buildFrontmatter({ document_type: 'services' }) + '# Services\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    expect(report.stats.pages_scanned).toBe(3);
  });

  it('reports zero pages when wiki dir is absent', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'wiki-lint-empty-'));
    const artifactsDir = join(projectPath, '.claude-temp', 'wiki-lint-test');
    mkdirSync(artifactsDir, { recursive: true });

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    expect(report.stats.pages_scanned).toBe(0);
    expect(report.structural).toHaveLength(0);
    expect(report.semantic).toHaveLength(0);
  });
});

describe('wiki-lint.service — skipSemantic flag', () => {
  it('skips orphan check when skipSemantic is true', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();

    writeWikiPage(wikiDir, 'index.md', buildFrontmatter({ document_type: 'index' }) + '# Index\n');
    writeWikiPage(
      wikiDir,
      'ARCHITECTURE.md',
      buildFrontmatter({ document_type: 'architecture' }) + '# Architecture\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const orphans = report.semantic.filter((v) => v.rule === 'orphans');
    expect(orphans).toHaveLength(0);
  });
});

describe('wiki-lint.service — report files', () => {
  it('writes JSON and Markdown reports to artifactsDir', async () => {
    const { existsSync } = await import('fs');
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(wikiDir, 'index.md', buildFrontmatter({ document_type: 'index' }) + '# Index\n');

    await lintLlmWiki({ projectPath, skipSemantic: true, artifactsDir });

    expect(existsSync(join(artifactsDir, 'lint', 'wiki-lint-report.json'))).toBe(true);
    expect(existsSync(join(artifactsDir, 'lint', 'wiki-lint-report.md'))).toBe(true);
  });

  it('JSON report has the correct shape', async () => {
    const { readFileSync } = await import('fs');
    const { projectPath, wikiDir, artifactsDir } = buildProjectTree();
    writeWikiPage(wikiDir, 'index.md', buildFrontmatter({ document_type: 'index' }) + '# Index\n');

    await lintLlmWiki({ projectPath, skipSemantic: true, artifactsDir });

    const raw = readFileSync(join(artifactsDir, 'lint', 'wiki-lint-report.json'), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    expect(parsed).toMatchObject({
      structural: expect.any(Array),
      semantic: expect.any(Array),
      stats: {
        pages_scanned: expect.any(Number),
        duration_ms: expect.any(Number),
      },
    });
  });
});
