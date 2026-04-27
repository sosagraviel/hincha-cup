import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { Provider } from '../../../../src/providers/types.js';

function buildService() {
  const projectPath = mkdtempSync(join(tmpdir(), 'log-md-test-'));
  const graphPath = join(projectPath, '.code-graph.db');
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

describe('WikiGeneratorService.buildLog', () => {
  it('emits log.md filename', () => {
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary: 'Initial wiki generation for test-project',
      touched_pages: ['wiki/ARCHITECTURE.md'],
    });

    expect(result.filename).toBe('log.md');
  });

  it('produces valid JSON on the first line', () => {
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary: 'Initial wiki generation',
      touched_pages: ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md'],
    });

    const firstLine = result.content.split('\n')[0];
    expect(() => JSON.parse(firstLine)).not.toThrow();
  });

  it('log entry includes ISO timestamp', () => {
    const generatedAt = '2026-04-24T12:34:56.000Z';
    const service = buildService();
    const result = service.buildLog(generatedAt, {
      type: 'ingest',
      summary: 'test',
      touched_pages: [],
    });

    const entry = JSON.parse(result.content.split('\n')[0]);
    expect(entry.ts).toBe(generatedAt);
    expect(() => new Date(entry.ts)).not.toThrow();
    expect(new Date(entry.ts).toISOString()).toBe(generatedAt);
  });

  it('log entry includes entry type', () => {
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary: 'test',
      touched_pages: [],
    });

    const entry = JSON.parse(result.content.split('\n')[0]);
    expect(entry.type).toBe('ingest');
  });

  it('log entry includes summary line', () => {
    const summary = 'Initial wiki generation for my-project';
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary,
      touched_pages: [],
    });

    const entry = JSON.parse(result.content.split('\n')[0]);
    expect(entry.summary).toBe(summary);
  });

  it('log entry includes touched_pages as a structured array', () => {
    const pages = ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md', 'wiki/DATA-FLOWS.md'];
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary: 'test',
      touched_pages: pages,
    });

    const entry = JSON.parse(result.content.split('\n')[0]);
    expect(Array.isArray(entry.touched_pages)).toBe(true);
    expect(entry.touched_pages).toEqual(pages);
  });

  it('content ends with a newline', () => {
    const service = buildService();
    const result = service.buildLog('2026-04-24T00:00:00.000Z', {
      type: 'ingest',
      summary: 'test',
      touched_pages: [],
    });

    expect(result.content.endsWith('\n')).toBe(true);
  });
});
