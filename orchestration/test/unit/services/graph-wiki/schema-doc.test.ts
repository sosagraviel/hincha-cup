import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { SCHEMA_FILENAME_BY_PROVIDER } from '../../../../src/services/graph-wiki/types.js';
import { Provider } from '../../../../src/providers/types.js';

function buildOptions(provider: Provider) {
  const projectPath = mkdtempSync(join(tmpdir(), 'schema-doc-test-'));
  const graphPath = join(projectPath, '.code-graph.db');
  writeFileSync(graphPath, 'graph-content');

  return {
    projectPath,
    frameworkPath: '/framework',
    provider,
    generatedAt: '2026-04-24T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {},
    stackProfile: { services: [] },
  };
}

describe('WikiGeneratorService.buildSchemaDoc', () => {
  it.each([
    { provider: Provider.CLAUDE, expectedFilename: 'CLAUDE.md' },
    { provider: Provider.CODEX, expectedFilename: 'AGENTS.md' },
  ])('emits $expectedFilename for provider $provider', ({ provider, expectedFilename }) => {
    const service = new WikiGeneratorService(buildOptions(provider));
    const result = service.buildSchemaDoc('my-project', '2026-04-24T00:00:00.000Z');

    expect(result.filename).toBe(expectedFilename);
    expect(SCHEMA_FILENAME_BY_PROVIDER[provider]).toBe(expectedFilename);
  });

  it('body content is byte-identical across claude and codex providers', () => {
    const claudeService = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const codexService = new WikiGeneratorService(buildOptions(Provider.CODEX));

    const claudeResult = claudeService.buildSchemaDoc('my-project', '2026-04-24T00:00:00.000Z');
    const codexResult = codexService.buildSchemaDoc('my-project', '2026-04-24T00:00:00.000Z');

    const normalise = (content: string) =>
      content
        .replace(/CLAUDE\.md/g, '{{schema_filename}}')
        .replace(/AGENTS\.md/g, '{{schema_filename}}')
        .replace(/COPILOT\.md/g, '{{schema_filename}}');

    expect(normalise(claudeResult.content)).toBe(normalise(codexResult.content));
  });

  it('substitutes project_name into the document heading', () => {
    const service = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const result = service.buildSchemaDoc('my-awesome-project', '2026-04-24T00:00:00.000Z');

    expect(result.content).toContain('my-awesome-project');
    expect(result.content).toContain('# my-awesome-project');
  });

  it('body references the correct schema filename for each provider', () => {
    const claudeService = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const codexService = new WikiGeneratorService(buildOptions(Provider.CODEX));

    const claudeResult = claudeService.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');
    const codexResult = codexService.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');

    expect(claudeResult.content).toContain('`CLAUDE.md`');
    expect(codexResult.content).toContain('`AGENTS.md`');
  });

  it('body describes the wiki layout structure', () => {
    const service = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const result = service.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');

    expect(result.content).toContain('raw/');
    expect(result.content).toContain('wiki/');
    expect(result.content).toContain('CHANGELOG.md');
    expect(result.content).toContain('log.md');
    expect(result.content).toContain('.state.json');
  });

  it('raw/ layer description references only snapshots/ and external/ subdirs', () => {
    const service = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const result = service.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');

    expect(result.content).toContain('snapshots/');
    expect(result.content).toContain('external/');
    expect(result.content).toContain('phase1-outputs');
    expect(result.content).toContain('graph_stats');
  });
});
