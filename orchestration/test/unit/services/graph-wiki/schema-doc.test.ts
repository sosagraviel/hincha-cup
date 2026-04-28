import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { SCHEMA_FILENAME_BY_PROVIDER } from '../../../../src/services/graph-wiki/types.js';
import { Provider } from '../../../../src/providers/types.js';

function buildOptions(
  provider: Provider,
  overrides: Partial<{
    services: Array<Record<string, unknown>>;
    catalog: Array<{ name: string; description: string }>;
  }> = {},
) {
  const projectPath = mkdtempSync(join(tmpdir(), 'schema-doc-test-'));
  const graphPath = join(projectPath, '.code-review-graph/graph.db');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, 'graph-content');

  return {
    projectPath,
    frameworkPath: '/framework',
    provider,
    generatedAt: '2026-04-24T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {},
    stackProfile: { services: overrides.services ?? [] },
    codeGraphToolCatalog: overrides.catalog,
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

  it('body is a runtime router with a decision table and tier discipline', () => {
    const service = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const result = service.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');

    expect(result.content).toContain('## How to query (decision table)');
    expect(result.content).toContain('| Question is about… | Read first | Drill into… |');
    expect(result.content).toContain('## Tier discipline');
    expect(result.content).toContain('Tier 1');
    expect(result.content).toContain('Tier 2');
    expect(result.content).toContain('Tier 3');
    expect(result.content).toContain('## Ingest workflow');
    expect(result.content).toContain('## Off-limits');
  });

  it('body is capped at <= 150 lines so loading the router stays cheap', () => {
    const service = new WikiGeneratorService(
      buildOptions(Provider.CLAUDE, {
        services: Array.from({ length: 12 }, (_, i) => ({ id: `svc-${i}` })),
      }),
    );
    const result = service.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');
    const lineCount = result.content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(150);
  });

  it('templates the project-specific service list into the at-a-glance section', () => {
    const service = new WikiGeneratorService(
      buildOptions(Provider.CLAUDE, {
        services: [{ id: 'backend' }, { id: 'frontend' }, { id: 'worker' }],
      }),
    );
    const result = service.buildSchemaDoc('my-project', '2026-04-24T00:00:00.000Z');
    expect(result.content).toContain('## Wiki at a glance');
    expect(result.content).toContain('my-project');
    expect(result.content).toContain('3 services');
    expect(result.content).toContain('`backend`');
    expect(result.content).toContain('`frontend`');
    expect(result.content).toContain('`worker`');
  });

  it('renders the live graph-tool catalog when present, omits the section otherwise', () => {
    const withCatalog = new WikiGeneratorService(
      buildOptions(Provider.CLAUDE, {
        catalog: [
          {
            name: 'mcp__code_graph__get_minimal_context_tool',
            description: 'Fetch minimal context\nMore detail.',
          },
          { name: 'mcp__code_graph__list_communities_tool', description: 'List communities.' },
        ],
      }),
    );
    const withCatalogResult = withCatalog.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');
    expect(withCatalogResult.content).toContain('## Available graph tools');
    expect(withCatalogResult.content).toContain('`mcp__code_graph__get_minimal_context_tool`');
    expect(withCatalogResult.content).toContain('Fetch minimal context');

    const withoutCatalog = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const withoutCatalogResult = withoutCatalog.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');
    expect(withoutCatalogResult.content).not.toContain('## Available graph tools');
  });

  it('does not embed the frontmatter contract (that lives in framework docs)', () => {
    const service = new WikiGeneratorService(buildOptions(Provider.CLAUDE));
    const result = service.buildSchemaDoc('proj', '2026-04-24T00:00:00.000Z');
    expect(result.content).not.toContain('Frontmatter contract');
    expect(result.content).not.toContain('document_type: <architecture');
  });
});
