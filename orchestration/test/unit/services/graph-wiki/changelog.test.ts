import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { Provider } from '../../../../src/providers/types.js';

function buildService() {
  const projectPath = mkdtempSync(join(tmpdir(), 'changelog-test-'));
  const graphPath = join(projectPath, '.code-review-graph/graph.db');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, 'graph-content');

  return new WikiGeneratorService({
    projectPath,
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-04-24T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {},
    stackProfile: { services: [] },
  });
}

describe('WikiGeneratorService.buildChangelog', () => {
  it('emits CHANGELOG.md filename', () => {
    const service = buildService();
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', {
      added: ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md'],
    });

    expect(result.filename).toBe('CHANGELOG.md');
  });

  it('produces Keep-a-Changelog header', () => {
    const service = buildService();
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', {
      added: ['wiki/ARCHITECTURE.md'],
    });

    expect(result.content).toContain('# Changelog');
    expect(result.content).toContain('Keep a Changelog');
  });

  it('contains ## [Unreleased] section', () => {
    const service = buildService();
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', {
      added: ['wiki/ARCHITECTURE.md'],
    });

    expect(result.content).toContain('## [Unreleased]');
  });

  it('contains ### Added section listing initial wiki pages', () => {
    const service = buildService();
    const pages = ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md', 'wiki/DATA-FLOWS.md'];
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', { added: pages });

    expect(result.content).toContain('### Added');
    for (const page of pages) {
      expect(result.content).toContain(`- ${page}`);
    }
  });

  it('has no trailing whitespace on any line', () => {
    const service = buildService();
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', {
      added: ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md'],
    });

    const lines = result.content.split('\n');
    const trailingWhitespaceLines = lines.filter((line) => line !== line.trimEnd());
    expect(trailingWhitespaceLines).toHaveLength(0);
  });

  it('includes a dated initial generation section', () => {
    const service = buildService();
    const result = service.buildChangelog('2026-04-24T00:00:00.000Z', {
      added: ['wiki/ARCHITECTURE.md'],
    });

    expect(result.content).toContain('2026-04-24');
    expect(result.content).toContain('Initial generation');
  });
});
