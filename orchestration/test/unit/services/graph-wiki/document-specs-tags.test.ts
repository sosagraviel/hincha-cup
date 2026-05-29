import matter from 'gray-matter';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { WikiGeneratorService } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import type { WikiAgentInvocation } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { Provider } from '../../../../src/providers/types.js';

function buildOptions(services: Array<Record<string, unknown>>) {
  const projectPath = mkdtempSync(join(tmpdir(), 'tag-test-'));
  const graphPath = join(projectPath, '.code-review-graph/graph.db');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, 'graph-content');

  return {
    projectPath,
    frameworkPath: '/framework',
    provider: Provider.CLAUDE,
    generatedAt: '2026-04-28T00:00:00.000Z',
    graph: { available: true, path: graphPath },
    analyzers: {
      structure_architecture: { graph_queries_used: [], findings: {} },
      tech_stack_dependencies: { graph_queries_used: [], findings: {} },
      code_patterns_testing: { graph_queries_used: [], findings: {} },
      data_flows_integrations: { graph_queries_used: [], findings: {} },
    },
    stackProfile: { services },
    agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}\n\nbody`,
  };
}

async function runAndGetTags(filename: string, services: Array<Record<string, unknown>>) {
  const service = new WikiGeneratorService(buildOptions(services));
  const result = await service.generateAll();
  const file = result.files.find((f) => f.filename === filename);
  if (!file) throw new Error(`expected file ${filename} not generated`);
  const data = matter(file.content).data as Record<string, unknown>;
  return (data.tags ?? []) as string[];
}

describe('tag derivation hygiene', () => {
  it('strips version constraints from a single-framework service', async () => {
    const tags = await runAndGetTags('wiki/services/api.md', [
      {
        id: 'api',
        path: 'services/api',
        type: 'backend',
        language: 'typescript',
        frameworks: { main: 'NestJS ^11.0.11' },
      },
    ]);
    expect(tags).toContain('nestjs');
    expect(tags).not.toContain('nestjs ^11.0.11');
    for (const tag of tags) {
      expect(tag).not.toMatch(/[\^~]\d/);
      expect(tag).not.toMatch(/\d+\.\d+\.\d+/);
    }
  });

  it('splits + joiners into separate tags', async () => {
    const tags = await runAndGetTags('wiki/services/shared.md', [
      {
        id: 'shared',
        path: 'packages/shared',
        type: 'library',
        language: 'typescript',
        frameworks: { main: 'class-transformer ^0.5.1 + class-validator ^0.14.1' },
      },
    ]);
    expect(tags).toContain('class-transformer');
    expect(tags).toContain('class-validator');
    for (const tag of tags) {
      expect(tag).not.toContain('+');
      expect(tag).not.toContain('^');
    }
  });

  it('strips @scope/ prefix from package-named frameworks', async () => {
    const tags = await runAndGetTags('wiki/services/keycloak.md', [
      {
        id: 'keycloak',
        path: 'services/keycloak',
        type: 'cli',
        language: 'typescript',
        frameworks: { main: '@keycloak/keycloak-admin-client ^26.1.4' },
      },
    ]);
    expect(tags).toContain('keycloak-admin-client');
    expect(tags.every((t) => !t.startsWith('@'))).toBe(true);
  });

  it('caps service tags at 5', async () => {
    const tags = await runAndGetTags('wiki/services/many.md', [
      {
        id: 'many',
        path: 'services/many',
        type: 'backend',
        language: 'typescript',
        frameworks: { main: 'a + b + c + d + e + f + g + h' },
      },
    ]);
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  it('drops candidates longer than 30 chars', async () => {
    const tags = await runAndGetTags('wiki/services/weird.md', [
      {
        id: 'weird',
        path: 'services/weird',
        type: 'backend',
        language: 'typescript',
        frameworks: { main: 'this-is-a-totally-unreasonably-long-package-name-1.0.0' },
      },
    ]);
    expect(tags.every((t) => t.length <= 30)).toBe(true);
  });

  it('core docs (architecture/data-flows/patterns) also get clean tags', async () => {
    const archTags = await runAndGetTags('wiki/ARCHITECTURE.md', [
      {
        id: 'api',
        path: 'services/api',
        type: 'backend',
        language: 'typescript',
        frameworks: { main: 'NestJS ^11.0.11' },
      },
    ]);
    expect(archTags).toContain('nestjs');
    for (const tag of archTags) {
      expect(tag).not.toMatch(/\^\d/);
    }
  });
});
