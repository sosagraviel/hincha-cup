import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import matter from 'gray-matter';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  LLM_WIKI_CORE_GENERATION_ORDER,
  WikiGeneratorService,
  slugifyServiceId,
  upsertLlmWikiContextSection,
} from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import type { WikiAgentInvocation } from '../../../../src/services/graph-wiki/wiki-generator.service.js';
import { Provider } from '../../../../src/providers/types.js';

describe('wiki-generator.service', () => {
  function buildInput() {
    const projectPath = mkdtempSync(join(tmpdir(), 'simple-api-wiki-service-'));
    const graphPath = join(projectPath, '.code-review-graph/graph.db');
    mkdirSync(dirname(graphPath), { recursive: true });
    writeFileSync(graphPath, 'graph-content');

    return {
      projectPath,
      frameworkPath: '/framework',
      provider: Provider.CLAUDE,
      generatedAt: '2026-04-21T00:00:00.000Z',
      graph: {
        available: true,
        path: graphPath,
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

  it('drops non-canonical graph_queries_used strings from wiki frontmatter (defence in depth)', async () => {
    const input = buildInput();
    // Simulate a Phase 1 regression: free-form prose in graph_queries_used.
    input.analyzers = {
      ...input.analyzers,
      structure_architecture: {
        ...input.analyzers.structure_architecture!,
        graph_queries_used: [
          "list_communities({ detail_level: 'standard' }) — exceeded token limit",
          'mcp__code_graph__list_communities_tool',
        ],
      },
    };

    const service = new WikiGeneratorService({
      ...input,
      agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}\n\nbody`,
    });

    const result = await service.generateAll();

    for (const file of result.files) {
      if (!file.filename.startsWith('wiki/')) continue;
      const data = matter(file.content).data as Record<string, unknown>;
      const queries = (data.graph_queries_used ?? []) as string[];
      expect(queries.every((q) => /^mcp__code_graph__[A-Za-z0-9_]+$/.test(q))).toBe(true);
      expect(queries).not.toContain(
        "list_communities({ detail_level: 'standard' }) — exceeded token limit",
      );
    }
  });

  it('invokes the agent only for LLM-backed docs (SERVICES.md is now deterministic)', async () => {
    const invocations: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        invocations.push(filename);
        return `# ${filename}\n\nGenerated body.`;
      },
    });

    const result = await service.generateAll();

    expect(new Set(invocations)).toEqual(
      new Set([...LLM_WIKI_CORE_GENERATION_ORDER, 'services/api.md']),
    );
    expect(invocations).not.toContain('SERVICES.md');

    const wikiFilenames = result.files
      .map((file) => file.filename)
      .filter((f) => f.startsWith('wiki/'));
    expect(wikiFilenames).toContain('wiki/ARCHITECTURE.md');
    expect(wikiFilenames).toContain('wiki/SERVICES.md');
    expect(wikiFilenames).toContain('wiki/DATA-FLOWS.md');
    expect(wikiFilenames).toContain('wiki/PATTERNS.md');
    expect(wikiFilenames).toContain('wiki/index.md');
    expect(wikiFilenames).toContain('wiki/services/api.md');
  });

  it('prompts are closed-book: no graph-first directive, no MCP tool names', async () => {
    const prompts: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ prompt }: WikiAgentInvocation) => {
        prompts.push(prompt);
        return '# Body\n\nGenerated body.';
      },
    });

    await service.generateAll();

    const joined = prompts.join('\n');
    expect(joined).not.toContain('Use graph MCP tools first');
    expect(joined).not.toContain('mcp__code_graph__');
    expect(prompts.every((prompt) => prompt.includes('You have NO tools'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('(not determined by analysis)'))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes('Digested upstream (structured):'))).toBe(
      true,
    );
  });

  it('prompts inject the digested upstream narrative (synthesis, CLAUDE.md, project-context)', async () => {
    const prompts: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      digestedUpstream: {
        synthesis: '# Synthesis\n\n## Architecture\nMonorepo shape.\n\n## Patterns\nUnit-tested.\n',
        claudeMd: '# CLAUDE\n\n## Architecture\nNestJS service boundaries.\n',
        projectContext: '# project-context\n\nNotes about the project.\n',
      },
      agentInvoker: async ({ prompt }: WikiAgentInvocation) => {
        prompts.push(prompt);
        return '# Body\n\nGenerated body.';
      },
    });

    await service.generateAll();

    expect(prompts.some((p) => p.includes('phase 3 synthesis'))).toBe(true);
    expect(prompts.some((p) => p.includes('generated CLAUDE.md'))).toBe(true);
    expect(prompts.some((p) => p.includes('project-context skill'))).toBe(true);
  });

  it('service-doc concurrency is bounded (default 3)', async () => {
    const stackProfile = {
      services: Array.from({ length: 8 }, (_, i) => ({
        id: `svc-${i}`,
        path: `apps/svc-${i}`,
        type: 'backend',
      })),
    };

    let inFlight = 0;
    let peak = 0;

    const service = new WikiGeneratorService({
      ...buildInput(),
      stackProfile,
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        if (filename.startsWith('services/')) {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 25));
          inFlight--;
        }
        return `# ${filename}`;
      },
    });

    await service.generateAll();

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('serviceDocConcurrency option overrides the default cap', async () => {
    const stackProfile = {
      services: Array.from({ length: 6 }, (_, i) => ({
        id: `svc-${i}`,
        path: `apps/svc-${i}`,
        type: 'backend',
      })),
    };

    let inFlight = 0;
    let peak = 0;

    const service = new WikiGeneratorService({
      ...buildInput(),
      stackProfile,
      serviceDocConcurrency: 1,
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        if (filename.startsWith('services/')) {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
        }
        return `# ${filename}`;
      },
    });

    await service.generateAll();
    expect(peak).toBe(1);
  });

  it('strips LLM frontmatter and writes deterministic orchestration frontmatter', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async () =>
        ['---', 'generated_by: malicious', 'document_type: wrong', '---', '# Body'].join('\n'),
    });

    const result = await service.generateAll();
    const architecture = result.files.find((file) => file.filename === 'wiki/ARCHITECTURE.md')!;
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
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        invocations.push(filename);
        return `# ${filename}\n\nExpress backend handling user requests.`;
      },
    });

    const result = await service.generateAll();
    const servicesDoc = result.files.find((file) => file.filename === 'wiki/SERVICES.md')!;
    const parsed = matter(servicesDoc.content);

    expect(parsed.data.document_type).toBe('services');
    expect(parsed.data.graph_queries_used).toEqual([]);
    expect(parsed.content).toContain('[**api**](services/api.md)');
    expect(invocations).not.toContain('SERVICES.md');
  });

  it('SERVICES.md falls back to per-service doc first paragraph when stackProfile lacks description', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        if (filename === 'services/api.md') {
          return '# Api\n\nHandles user CRUD traffic for the platform.';
        }
        return `# ${filename}\n\nBody.`;
      },
    });

    const result = await service.generateAll();
    const servicesDoc = result.files.find((file) => file.filename === 'wiki/SERVICES.md')!;
    expect(servicesDoc.content).toContain('Handles user CRUD traffic for the platform.');
  });

  it('index renders a summary catalog with links, document_type, tags, and grouping headings', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}`,
    });

    const result = await service.generateAll();
    const index = result.files.find((file) => file.filename === 'wiki/index.md')?.content;

    expect(index).toContain('## Architecture');
    expect(index).toContain('## Services catalog');
    expect(index).toContain('## Per-service docs');
    expect(index).toContain('## Data flows');
    expect(index).toContain('## Patterns');

    expect(index).toContain('[ARCHITECTURE](ARCHITECTURE.md)');
    expect(index).toContain('[SERVICES](SERVICES.md)');
    expect(index).toContain('[DATA-FLOWS](DATA-FLOWS.md)');
    expect(index).toContain('[PATTERNS](PATTERNS.md)');
    expect(index).toContain('[api](services/api.md)');

    // Inline metadata: document_type + confidence + tags
    expect(index).toMatch(/architecture, confidence:/);
    expect(index).toMatch(/\*\*Tags:\*\* /);
  });

  it('index entries carry summary text from each page frontmatter', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) =>
        `# ${filename}\n\nFirst paragraph for ${filename}.`,
    });

    const result = await service.generateAll();
    const index = result.files.find((file) => file.filename === 'wiki/index.md')?.content;

    expect(index).toContain('First paragraph for ARCHITECTURE.md');
  });

  it('every generated page carries a tags frontmatter array', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}\n\nBody.`,
    });

    const result = await service.generateAll();
    const interestingPages = result.files.filter(
      (f) =>
        f.filename === 'wiki/ARCHITECTURE.md' ||
        f.filename === 'wiki/DATA-FLOWS.md' ||
        f.filename === 'wiki/PATTERNS.md' ||
        f.filename === 'wiki/services/api.md',
    );
    expect(interestingPages.length).toBeGreaterThan(0);
    for (const page of interestingPages) {
      const data = matter(page.content).data as Record<string, unknown>;
      expect(Array.isArray(data.tags)).toBe(true);
      expect((data.tags as string[]).length).toBeGreaterThan(0);
    }
  });

  it('runs the 3 core docs concurrently (not sequentially)', async () => {
    let inFlight = 0;
    let peak = 0;

    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
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
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
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
      .filter((f) => f.startsWith('wiki/services/'));
    expect(serviceFilenames).toEqual([
      'wiki/services/api.md',
      'wiki/services/web.md',
      'wiki/services/worker.md',
    ]);
  });

  it('fails fast when graph is unavailable, analyzers are missing, or services are missing', async () => {
    await expect(
      new WikiGeneratorService({
        ...buildInput(),
        graph: { available: false, path: '/missing/.code-review-graph/graph.db' },
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
      agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}`,
    });
    const first = (await service.generateAll()).contextSection;
    const second = first.replace('Graph-backed docs:', 'Graph-backed docs: updated');
    const content = upsertLlmWikiContextSection('hello\n\n' + first, second);

    expect(content.match(/LLM Wiki/g)).toHaveLength(1);
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
      expect(tier.agents['wiki-generator']).toStrictEqual(tier.agents['architect-synthesizer']);
    }
  });
});
