import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { lintLlmWiki } from '../../src/services/graph-wiki/wiki-lint.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function graphVersion(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function buildFullFrontmatter(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    document_type: 'architecture',
    graph_version: 'a'.repeat(64),
    graph_commit: 'b'.repeat(40),
    generated_at: '2026-01-01T00:00:00.000Z',
    summary: 'Full test page summary for integration.',
    sources: [],
    confidence: 'high',
    related: [],
    last_verified: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  const lines = Object.entries(base).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function buildProject(): {
  projectPath: string;
  wikiDir: string;
  rawDir: string;
  artifactsDir: string;
  graphDbPath: string;
} {
  const projectPath = mkdtempSync(join(tmpdir(), 'wiki-lint-integ-'));
  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const rawDir = join(projectPath, 'docs', 'llm-wiki', 'raw');
  const artifactsDir = join(projectPath, '.claude-temp', 'wiki-lint-integ');
  const graphDbPath = join(projectPath, '.code-review-graph/graph.db');

  mkdirSync(join(wikiDir, 'services'), { recursive: true });
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(join(rawDir, 'analyzers'), { recursive: true });
  mkdirSync(join(rawDir, 'snapshots'), { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  // The graph DB lives at <projectPath>/.code-review-graph/graph.db; tests
  // that opt into writing it need the parent directory to exist first.
  mkdirSync(join(projectPath, '.code-review-graph'), { recursive: true });

  return { projectPath, wikiDir, rawDir, artifactsDir, graphDbPath };
}

function writeWikiFile(dir: string, filename: string, content: string): void {
  const filePath = join(dir, filename);
  if (filename.includes('/')) {
    mkdirSync(join(dir, filename.split('/').slice(0, -1).join('/')), { recursive: true });
  }
  writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Healthy fixture
// ---------------------------------------------------------------------------

describe('wiki-lint integration — healthy fixture', () => {
  it('reports zero structural violations and zero semantic warnings on a well-formed wiki', async () => {
    const { projectPath, wikiDir, rawDir, artifactsDir, graphDbPath } = buildProject();

    const graphDbContent = 'fake-graph-db-content';
    writeFileSync(graphDbPath, graphDbContent, 'utf-8');
    const gv = graphVersion(graphDbContent);
    const gc = 'a'.repeat(40);

    const fm = (type: string) =>
      buildFullFrontmatter({ document_type: type, graph_version: gv, graph_commit: gc });

    const indexContent =
      fm('index') +
      [
        '# Project Wiki',
        '',
        '## Core Documents',
        '- [Architecture](ARCHITECTURE.md)',
        '- [Services](SERVICES.md)',
        '- [Data flows](DATA-FLOWS.md)',
        '- [Patterns](PATTERNS.md)',
        '',
        '## Service Documents',
        '- [auth](services/auth.md)',
        '',
      ].join('\n');

    writeWikiFile(wikiDir, 'index.md', indexContent);
    writeWikiFile(wikiDir, 'ARCHITECTURE.md', fm('architecture') + '# Architecture\n');
    writeWikiFile(wikiDir, 'SERVICES.md', fm('services') + '# Services\n');
    writeWikiFile(wikiDir, 'DATA-FLOWS.md', fm('data-flow') + '# Data Flows\n');
    writeWikiFile(wikiDir, 'PATTERNS.md', fm('pattern') + '# Patterns\n');
    writeWikiFile(wikiDir, 'services/auth.md', fm('service') + '# Auth Service\n');

    writeFileSync(
      join(rawDir, 'manifest.json'),
      JSON.stringify({ generated_at: '2026-01-01T00:00:00.000Z', sources: [] }),
      'utf-8',
    );
    writeFileSync(
      join(rawDir, 'analyzers', '01-structure-architecture.json'),
      JSON.stringify({ agent_name: 'structure-architecture-analyzer' }),
      'utf-8',
    );
    writeFileSync(join(projectPath, 'docs', 'llm-wiki', 'CHANGELOG.md'), '# Changelog\n', 'utf-8');
    writeFileSync(join(projectPath, 'docs', 'llm-wiki', 'log.md'), '', 'utf-8');
    writeFileSync(
      join(projectPath, 'docs', 'llm-wiki', '.state.json'),
      JSON.stringify({ last_indexed_commit: gc }),
      'utf-8',
    );

    const report = await lintLlmWiki({
      projectPath,
      graphDbPath,
      skipSemantic: false,
      changedPages: [],
      artifactsDir,
    });

    expect(report.structural).toHaveLength(0);
    expect(report.semantic.filter((v) => v.rule === 'orphans')).toHaveLength(0);
    expect(report.stats.pages_scanned).toBe(6);
    expect(report.stats.graph_version).toBe(gv);
  });

  it('writes both JSON and Markdown reports for the healthy fixture', async () => {
    const { projectPath, wikiDir, artifactsDir, graphDbPath } = buildProject();
    const gv = 'a'.repeat(64);
    const gc = 'b'.repeat(40);
    const fm = buildFullFrontmatter({
      document_type: 'index',
      graph_version: gv,
      graph_commit: gc,
    });

    writeWikiFile(wikiDir, 'index.md', fm + '# Index\n');

    await lintLlmWiki({ projectPath, graphDbPath, skipSemantic: true, artifactsDir });

    expect(existsSync(join(artifactsDir, 'lint', 'wiki-lint-report.json'))).toBe(true);
    expect(existsSync(join(artifactsDir, 'lint', 'wiki-lint-report.md'))).toBe(true);

    const jsonReport = JSON.parse(
      readFileSync(join(artifactsDir, 'lint', 'wiki-lint-report.json'), 'utf-8'),
    ) as Record<string, unknown>;

    expect(jsonReport).toHaveProperty('structural');
    expect(jsonReport).toHaveProperty('semantic');
    expect(jsonReport).toHaveProperty('stats');

    const mdReport = readFileSync(join(artifactsDir, 'lint', 'wiki-lint-report.md'), 'utf-8');
    expect(mdReport).toContain('## Structural (fail)');
    expect(mdReport).toContain('## Semantic (warn)');
    expect(mdReport).toContain('## Stats');
  });
});

// ---------------------------------------------------------------------------
// Seeded-broken fixture
// ---------------------------------------------------------------------------

describe('wiki-lint integration — seeded-broken fixture', () => {
  it('flags a broken wikilink, a dead source, and a missing frontmatter key', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProject();

    // Page 1: broken wikilink
    writeWikiFile(
      wikiDir,
      'ARCHITECTURE.md',
      buildFullFrontmatter({ document_type: 'architecture' }) +
        '# Architecture\n\nSee [broken link](non-existent-page.md) for details.\n',
    );

    // Page 2: dead source reference
    writeWikiFile(
      wikiDir,
      'SERVICES.md',
      buildFullFrontmatter({
        document_type: 'services',
        sources: [
          {
            path: 'src/deleted-service.ts',
            sha256: 'x'.repeat(64),
            ingested_at: '2026-01-01T00:00:00.000Z',
            commit: 'y'.repeat(40),
          },
        ],
      }) + '# Services\n',
    );

    // Page 3: missing summary (one of the required keys)
    writeWikiFile(
      wikiDir,
      'PATTERNS.md',
      '---\ndocument_type: "pattern"\ngraph_version: "' +
        'a'.repeat(64) +
        '"\ngenerated_at: "2026-01-01T00:00:00.000Z"\nsources: []\nconfidence: "high"\n---\n# Patterns\n',
    );

    // Add index so broken-link pages are not orphans
    writeWikiFile(
      wikiDir,
      'index.md',
      buildFullFrontmatter({ document_type: 'index' }) +
        '# Index\n\n- [Architecture](ARCHITECTURE.md)\n- [Services](SERVICES.md)\n- [Patterns](PATTERNS.md)\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    const brokenWikilinks = report.structural.filter((v) => v.rule === 'broken-wikilinks');
    const deadSources = report.structural.filter((v) => v.rule === 'dead-sources');
    const missingFm = report.structural.filter((v) => v.rule === 'missing-frontmatter');

    expect(brokenWikilinks.length).toBeGreaterThanOrEqual(1);
    expect(deadSources.length).toBeGreaterThanOrEqual(1);
    expect(missingFm.length).toBeGreaterThanOrEqual(1);

    expect(brokenWikilinks.some((v) => v.page.includes('ARCHITECTURE.md'))).toBe(true);
    expect(deadSources.some((v) => v.page.includes('SERVICES.md'))).toBe(true);
    expect(missingFm.some((v) => v.message.includes('summary'))).toBe(true);
    expect(missingFm.some((v) => v.page.includes('PATTERNS.md'))).toBe(true);

    expect(report.structural.every((v) => v.severity === 'fail')).toBe(true);
  });

  it('broken fixture produces non-empty structural array and clean semantic array when skipSemantic=true', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProject();

    writeWikiFile(wikiDir, 'index.md', '---\ndocument_type: "index"\n---\n# Index\n');

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    expect(report.structural.length).toBeGreaterThan(0);
    expect(report.semantic).toHaveLength(0);
  });

  it('all violations on broken fixture reference a page path relative to projectPath', async () => {
    const { projectPath, wikiDir, artifactsDir } = buildProject();

    writeWikiFile(
      wikiDir,
      'index.md',
      buildFullFrontmatter({ document_type: 'index' }) + '# Index\n\nSee [gone](gone.md).\n',
    );

    const report = await lintLlmWiki({
      projectPath,
      skipSemantic: true,
      artifactsDir,
    });

    for (const v of report.structural) {
      expect(v.page).not.toContain(projectPath);
      expect(v.page.startsWith('docs/llm-wiki')).toBe(true);
    }
  });
});
