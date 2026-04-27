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
    generatedAt: '2026-04-24T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {},
    stackProfile: { services: [] },
  });
}

const VALID_SHA_RE = /^([0-9a-f]{40}|unknown)$/i;
const VALID_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe('WikiGeneratorService.buildStateJson', () => {
  it('emits .state.json filename', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });

    expect(result.filename).toBe('.state.json');
  });

  it('produces valid JSON', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });

    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('contains all required keys', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('last_indexed_commit');
    expect(parsed).toHaveProperty('graph_sha');
    expect(parsed).toHaveProperty('graph_commit');
    expect(parsed).toHaveProperty('pipeline_version');
    expect(parsed).toHaveProperty('last_ingest_at');
  });

  it('last_ingest_at is a valid ISO timestamp', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T12:34:56.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(VALID_ISO_RE.test(parsed.last_ingest_at)).toBe(true);
    expect(new Date(parsed.last_ingest_at).toISOString()).toBe('2026-04-24T12:34:56.000Z');
  });

  it('graph_commit matches valid SHA or unknown sentinel', () => {
    const service = buildService();

    const withSha = service.buildStateJson({
      graph_commit: 'deadbeef'.repeat(5),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'deadbeef'.repeat(5),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });
    const parsedSha = JSON.parse(withSha.content);
    expect(VALID_SHA_RE.test(parsedSha.graph_commit)).toBe(true);

    const withUnknown = service.buildStateJson({
      graph_commit: 'unknown',
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'unknown',
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });
    const parsedUnknown = JSON.parse(withUnknown.content);
    expect(parsedUnknown.graph_commit).toBe('unknown');
    expect(VALID_SHA_RE.test(parsedUnknown.graph_commit)).toBe(true);
  });

  it('last_indexed_commit matches valid SHA or unknown sentinel', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(VALID_SHA_RE.test(parsed.last_indexed_commit)).toBe(true);
  });

  it('includes graph_stats when provided', () => {
    const service = buildService();
    const stats = {
      files: 10,
      functions: 20,
      edges: 30,
      languages: ['typescript'],
      build_time_ms: 500,
    };
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
      graph_stats: stats,
    });

    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('graph_stats');
    expect(parsed.graph_stats).toMatchObject(stats);
  });

  it('graph_stats is null when not provided', () => {
    const service = buildService();
    const result = service.buildStateJson({
      graph_commit: 'a'.repeat(40),
      graph_sha: 'b'.repeat(64),
      pipeline_version: 'ai-agentic-framework',
      last_indexed_commit: 'a'.repeat(40),
      last_ingest_at: '2026-04-24T00:00:00.000Z',
    });

    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveProperty('graph_stats');
    expect(parsed.graph_stats).toBeNull();
  });
});
