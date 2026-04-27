import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import type { WikiSource } from '../../../../src/services/graph-wiki/types.js';
import { Provider } from '../../../../src/providers/types.js';

const SHA256_RE = /^[0-9a-f]{64}$/i;

function buildService() {
  const projectPath = mkdtempSync(join(tmpdir(), 'raw-manifest-test-'));
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

function buildSources(): WikiSource[] {
  return [
    {
      path: 'docs/llm-wiki/raw/snapshots/README.md',
      sha256: 'a'.repeat(64),
      ingested_at: '2026-04-24T00:00:00.000Z',
      commit: 'b'.repeat(40),
    },
    {
      path: 'docs/llm-wiki/raw/external/some-lib-docs.md',
      sha256: 'c'.repeat(64),
      ingested_at: '2026-04-24T00:00:00.000Z',
      commit: 'b'.repeat(40),
    },
  ];
}

describe('WikiGeneratorService.buildRawManifest', () => {
  it('emits raw/manifest.json filename', () => {
    const service = buildService();
    const result = service.buildRawManifest(buildSources());

    expect(result.filename).toBe('raw/manifest.json');
  });

  it('produces valid JSON', () => {
    const service = buildService();
    const result = service.buildRawManifest(buildSources());

    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('lists each source with doc_id, sha256, ingested_at, commit, and touched_pages', () => {
    const service = buildService();
    const sources = buildSources();
    const result = service.buildRawManifest(sources);

    const manifest = JSON.parse(result.content);
    expect(Array.isArray(manifest.sources)).toBe(true);

    for (const entry of manifest.sources) {
      expect(entry).toHaveProperty('doc_id');
      expect(entry).toHaveProperty('sha256');
      expect(entry).toHaveProperty('ingested_at');
      expect(entry).toHaveProperty('commit');
      expect(entry).toHaveProperty('touched_pages');
      expect(Array.isArray(entry.touched_pages)).toBe(true);
    }
  });

  it('sha256 values are 64-character hex strings', () => {
    const service = buildService();
    const result = service.buildRawManifest(buildSources());

    const manifest = JSON.parse(result.content);
    for (const entry of manifest.sources) {
      expect(SHA256_RE.test(entry.sha256)).toBe(true);
    }
  });

  it('doc_id reflects the raw/ relative path of the source', () => {
    const service = buildService();
    const sources = buildSources();
    const result = service.buildRawManifest(sources);

    const manifest = JSON.parse(result.content);
    const docIds = manifest.sources.map((e: { doc_id: string }) => e.doc_id);
    expect(docIds).toContain('docs/llm-wiki/raw/snapshots/README.md');
    expect(docIds).toContain('docs/llm-wiki/raw/external/some-lib-docs.md');
  });

  it('does not include an analyzers key', () => {
    const service = buildService();
    const result = service.buildRawManifest([]);

    const manifest = JSON.parse(result.content);
    expect(manifest).not.toHaveProperty('analyzers');
  });

  it('has a generated_at ISO timestamp', () => {
    const service = buildService();
    const result = service.buildRawManifest([]);

    const manifest = JSON.parse(result.content);
    expect(typeof manifest.generated_at).toBe('string');
    expect(() => new Date(manifest.generated_at)).not.toThrow();
  });

  it('content ends with a newline', () => {
    const service = buildService();
    const result = service.buildRawManifest([]);

    expect(result.content.endsWith('\n')).toBe(true);
  });
});
