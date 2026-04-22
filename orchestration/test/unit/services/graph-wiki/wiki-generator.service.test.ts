import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import matter from 'gray-matter';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AI_KNOWLEDGE_CORE_GENERATION_ORDER,
  WikiGeneratorService,
  slugifyServiceId,
  upsertAiKnowledgeContextSection,
} from '../../../../src/services/graph-wiki/wiki-generator.service.js';

describe('wiki-generator.service', () => {
  function buildInput() {
    const projectPath = mkdtempSync(join(tmpdir(), 'simple-api-wiki-service-'));
    const graphPath = join(projectPath, '.code-graph.db');
    writeFileSync(graphPath, 'graph-content');

    return {
      projectPath,
      frameworkPath: '/framework',
      generatedAt: '2026-04-21T00:00:00.000Z',
      graph: {
        available: true,
        path: graphPath,
        mcpPort: 3100,
        stats: {
          files: 8,
          functions: 10,
          classes: 2,
          edges: 14,
          languages: ['typescript'],
          build_time_ms: 1200,
        },
      },
      stackProfile: {
        package_manager: 'npm',
        services: [
          {
            id: 'api',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'Express',
              testing: 'Jest',
            },
          },
        ],
      },
      analyzers: {
        structure_architecture: {
          graph_queries_used: ['list_communities'],
          findings: {
            services: [
              {
                id: 'api',
                entry_points: ['src/index.ts'],
                community_id: 'community-api',
              },
            ],
          },
        },
        tech_stack_dependencies: {
          graph_queries_used: ['semantic_search_nodes'],
          findings: {
            dependencies: {
              by_service: {
                api: {
                  production: ['express'],
                  development: ['jest'],
                },
              },
            },
          },
        },
        code_patterns_testing: {
          graph_queries_used: ['find_large_functions'],
          findings: {
            testing: ['unit tests under test/'],
            patterns: ['service/controller split'],
          },
        },
        data_flows_integrations: {
          graph_queries_used: ['list_flows'],
          findings: {
            routes: [{ method: 'GET', route: '/users', description: 'List users' }],
          },
        },
      },
    };
  }

  it('invokes the agent only for LLM-backed docs (SERVICES.md is now deterministic)', async () => {
    const invocations: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => {
        invocations.push(filename);
        return `# ${filename}\n\nGenerated body.`;
      },
    });

    const result = await service.generateAll();

    // Core docs are LLM-generated in parallel (non-deterministic order), plus one per service.
    expect(new Set(invocations)).toEqual(
      new Set([...AI_KNOWLEDGE_CORE_GENERATION_ORDER, 'services/api.md']),
    );
    // SERVICES.md is emitted but not invoked via the agent.
    expect(invocations).not.toContain('SERVICES.md');

    expect(result.files.map((file) => file.filename)).toEqual([
      'ARCHITECTURE.md',
      'SERVICES.md',
      'DATA-FLOWS.md',
      'PATTERNS.md',
      'services/api.md',
      'index.md',
    ]);
  });

  it('prompts include graph-first instructions and relevant graph MCP tools', async () => {
    const prompts: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ prompt }) => {
        prompts.push(prompt);
        return '# Body\n\nGenerated body.';
      },
    });

    await service.generateAll();

    expect(prompts.every((prompt) => prompt.includes('Use graph MCP tools first'))).toBe(true);
    expect(prompts.join('\n')).toContain('mcp__code_graph__get_architecture_overview');
    expect(prompts.join('\n')).toContain('mcp__code_graph__list_flows');
    expect(prompts.join('\n')).toContain('mcp__code_graph__find_large_functions');
    expect(prompts.join('\n')).toContain('mcp__code_graph__semantic_search_nodes');
  });

  it('strips LLM frontmatter and writes deterministic orchestration frontmatter', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async () =>
        ['---', 'generated_by: malicious', 'document_type: wrong', '---', '# Body'].join('\n'),
    });

    const result = await service.generateAll();
    const architecture = result.files.find((file) => file.filename === 'ARCHITECTURE.md')!;
    const parsed = matter(architecture.content);

    expect(parsed.data.generated_by).toBe('ai-agentic-framework');
    expect(parsed.data.document_type).toBe('architecture');
    expect(parsed.content).toContain('# Body');
    expect(parsed.content).not.toContain('malicious');
  });

  it('builds a deterministic SERVICES.md catalog (no agent call, links to per-service docs)', async () => {
    const invocations: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => {
        invocations.push(filename);
        return `# ${filename}\n\nExpress backend handling user requests.`;
      },
    });

    const result = await service.generateAll();
    const servicesDoc = result.files.find((file) => file.filename === 'SERVICES.md')!;
    const parsed = matter(servicesDoc.content);

    expect(parsed.data.document_type).toBe('services');
    expect(parsed.data.graph_queries_used).toEqual([]);
    expect(parsed.content).toContain('[**api**](services/api.md)');
    expect(invocations).not.toContain('SERVICES.md');
  });

  it('SERVICES.md falls back to per-service doc first paragraph when stackProfile lacks description', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => {
        if (filename === 'services/api.md') {
          return '# Api\n\nHandles user CRUD traffic for the platform.';
        }
        return `# ${filename}\n\nBody.`;
      },
    });

    const result = await service.generateAll();
    const servicesDoc = result.files.find((file) => file.filename === 'SERVICES.md')!;
    expect(servicesDoc.content).toContain('Handles user CRUD traffic for the platform.');
  });

  it('index links all core docs and service docs', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => `# ${filename}`,
    });

    const result = await service.generateAll();
    const index = result.files.find((file) => file.filename === 'index.md')?.content;

    expect(index).toContain('[Architecture](ARCHITECTURE.md)');
    expect(index).toContain('[Services](SERVICES.md)');
    expect(index).toContain('[Data flows](DATA-FLOWS.md)');
    expect(index).toContain('[Patterns](PATTERNS.md)');
    expect(index).toContain('[api](services/api.md)');
  });

  it('runs the 3 core docs concurrently (not sequentially)', async () => {
    let inFlight = 0;
    let peak = 0;

    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => {
        // Only observe core-doc overlap; service docs run in a later wave.
        const isCore = !filename.startsWith('services/');
        if (isCore) {
          inFlight++;
          peak = Math.max(peak, inFlight);
        }
        await new Promise((r) => setTimeout(r, 15));
        if (isCore) inFlight--;
        return `# ${filename}`;
      },
    });

    await service.generateAll();
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it('runs service docs concurrently and preserves input order', async () => {
    const stackProfile = {
      services: [
        { id: 'api', path: 'apps/api', type: 'backend' },
        { id: 'web', path: 'apps/web', type: 'frontend' },
        { id: 'worker', path: 'apps/worker', type: 'backend' },
      ],
    };

    let inFlight = 0;
    let peak = 0;

    const input = buildInput();
    const service = new WikiGeneratorService({
      ...input,
      stackProfile,
      agentInvoker: async ({ filename }) => {
        if (filename.startsWith('services/')) {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 15));
          inFlight--;
        }
        return `# ${filename}`;
      },
    });

    const result = await service.generateAll();
    expect(peak).toBeGreaterThanOrEqual(2);

    const serviceFilenames = result.files
      .map((f) => f.filename)
      .filter((f) => f.startsWith('services/'));
    expect(serviceFilenames).toEqual(['services/api.md', 'services/web.md', 'services/worker.md']);
  });

  it('fails fast when graph is unavailable, analyzers are missing, or services are missing', async () => {
    await expect(
      new WikiGeneratorService({
        ...buildInput(),
        graph: { available: false, path: '/missing/.code-graph.db' },
        agentInvoker: async () => '# Body',
      }).generateAll(),
    ).rejects.toThrow('Code graph is required');

    await expect(
      new WikiGeneratorService({
        ...buildInput(),
        analyzers: {},
        agentInvoker: async () => '# Body',
      }).generateAll(),
    ).rejects.toThrow('Required Phase 1 analyzer output missing');

    await expect(
      new WikiGeneratorService({
        ...buildInput(),
        stackProfile: { services: [] },
        agentInvoker: async () => '# Body',
      }).generateAll(),
    ).rejects.toThrow('stack_profile.services');
  });

  it('replaces an existing context section instead of duplicating it', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }) => `# ${filename}`,
    });
    const first = (await service.generateAll()).contextSection;
    const second = first.replace('Graph-backed docs:', 'Graph-backed docs: updated');
    const content = upsertAiKnowledgeContextSection('hello\n\n' + first, second);

    expect(content.match(/AI Knowledge Wiki/g)).toHaveLength(1);
    expect(content).toContain('Graph-backed docs: updated');
  });

  it('keeps safe service IDs and replaces unsafe filename characters', () => {
    expect(slugifyServiceId('api')).toBe('api');
    expect(slugifyServiceId('backend/api service')).toBe('backend-api-service');
  });

  it('configures wiki-generator with the same tier mappings as architect-synthesizer', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'config/model-config.json'), 'utf-8'),
    );

    for (const tier of Object.values(config.tiers) as any[]) {
      expect(tier.agents['wiki-generator']).toBe(tier.agents['architect-synthesizer']);
    }
  });
});
