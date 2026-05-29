import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { Provider } from '../../../../src/providers/types.js';

function buildService() {
  const projectPath = mkdtempSync(join(tmpdir(), 'state-json-test-'));
  const graphPath = join(projectPath, '.code-review-graph/graph.db');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, 'graph-content');

  return new WikiGeneratorService({
    projectPath,
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-05-12T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {},
    stackProfile: { services: [] },
  });
}

const VALID_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe('WikiGeneratorService.buildStateJson', () => {
  it('emits .state.json filename', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: { '.': 'a'.repeat(40) },
      last_refresh_at: '2026-05-12T00:00:00.000Z',
    });

    expect(result.filename).toBe('.state.json');
  });

  it('produces valid JSON', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: { '.': 'a'.repeat(40) },
      last_refresh_at: '2026-05-12T00:00:00.000Z',
    });

    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('contains the new repos + last_refresh_at shape', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: { '.': 'a'.repeat(40) },
      last_refresh_at: '2026-05-12T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('repos');
    expect(parsed).toHaveProperty('last_refresh_at');
    expect(parsed.repos).toEqual({ '.': 'a'.repeat(40) });
  });

  it('does NOT carry legacy graph_* fields', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: { '.': 'a'.repeat(40) },
      last_refresh_at: '2026-05-12T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(parsed).not.toHaveProperty('graph_commit');
    expect(parsed).not.toHaveProperty('graph_sha');
    expect(parsed).not.toHaveProperty('pipeline_version');
    expect(parsed).not.toHaveProperty('last_indexed_commit');
    expect(parsed).not.toHaveProperty('last_ingest_at');
    expect(parsed).not.toHaveProperty('graph_stats');
  });

  it('last_refresh_at is a valid ISO timestamp', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: { '.': 'a'.repeat(40) },
      last_refresh_at: '2026-05-12T12:34:56.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(VALID_ISO_RE.test(parsed.last_refresh_at)).toBe(true);
    expect(new Date(parsed.last_refresh_at).toISOString()).toBe('2026-05-12T12:34:56.000Z');
  });

  it('supports multi-repo with N child entries', () => {
    const service = buildService();
    const result = service.buildStateJson({
      repos: {
        'cm-ai-api': 'a'.repeat(40),
        'cm-delivery-tool': 'b'.repeat(40),
        'qubika-agentic-framework': 'c'.repeat(40),
      },
      last_refresh_at: '2026-05-12T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(Object.keys(parsed.repos)).toHaveLength(3);
    expect(parsed.repos['cm-ai-api']).toBe('a'.repeat(40));
    expect(parsed.repos['cm-delivery-tool']).toBe('b'.repeat(40));
  });
});
