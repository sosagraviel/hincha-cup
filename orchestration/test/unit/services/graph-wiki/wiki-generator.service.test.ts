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

  it('frontmatter is the minimal 6-field shape (no graph_queries_used / sources / confidence)', async () => {
    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => `# ${filename}\n\nbody`,
    });
    const result = await service.generateAll();
    for (const file of result.files) {
      if (!file.filename.startsWith('wiki/')) continue;
      const data = matter(file.content).data as Record<string, unknown>;
      expect(data).not.toHaveProperty('graph_queries_used');
      expect(data).not.toHaveProperty('sources');
      expect(data).not.toHaveProperty('confidence');
      expect(data).not.toHaveProperty('graph_version');
      expect(data).not.toHaveProperty('graph_commit');
      expect(data).not.toHaveProperty('generated_by');
      expect(data).not.toHaveProperty('last_verified');
      expect(data).toHaveProperty('document_type');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('last_updated');
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
    expect(wikiFilenames).toContain('wiki/index.md');
    expect(wikiFilenames).toContain('wiki/services/api.md');
    // Cross-cutting DATA-FLOWS.md / PATTERNS.md retired in H4 — flows are
    // now per-service, patterns are prescriptive (in convention skills).
    expect(wikiFilenames).not.toContain('wiki/DATA-FLOWS.md');
    expect(wikiFilenames).not.toContain('wiki/PATTERNS.md');
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

  it('prompts inject the digested upstream narrative (synthesis, CLAUDE.md, architectural narrative)', async () => {
    const prompts: string[] = [];
    const service = new WikiGeneratorService({
      ...buildInput(),
      digestedUpstream: {
        synthesis: '# Synthesis\n\n## Architecture\nMonorepo shape.\n\n## Patterns\nUnit-tested.\n',
        claudeMd: '# CLAUDE\n\n## Architecture\nNestJS service boundaries.\n',
        architecturalNarrative:
          '# Architectural Narrative\n\n## Architecture\nNotes about the project shape.\n',
      },
      agentInvoker: async ({ prompt }: WikiAgentInvocation) => {
        prompts.push(prompt);
        return '# Body\n\nGenerated body.';
      },
    });

    await service.generateAll();

    expect(prompts.some((p) => p.includes('phase 3 synthesis'))).toBe(true);
    expect(prompts.some((p) => p.includes('generated CLAUDE.md'))).toBe(true);
    expect(prompts.some((p) => p.includes('architectural narrative'))).toBe(true);
  });

  it('service-doc concurrency is bounded by the default cap (8) when the project has more services', async () => {
    const stackProfile = {
      services: Array.from({ length: 12 }, (_, i) => ({
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

    // Default cap is 8 (see WIKI_CONCURRENCY_DEFAULT). With 12 services the
    // concurrency must reach 8 but never exceed it.
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it('service-doc concurrency caps at the service count for small projects', async () => {
    const stackProfile = {
      services: [
        { id: 'a', path: 'a', type: 'backend' },
        { id: 'b', path: 'b', type: 'backend' },
      ],
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

    expect(peak).toBeLessThanOrEqual(2);
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
        ['---', 'document_type: wrong', 'summary: malicious', '---', '# Body'].join('\n'),
    });

    const result = await service.generateAll();
    const architecture = result.files.find((file) => file.filename === 'wiki/ARCHITECTURE.md')!;
    const parsed = matter(architecture.content);

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
    expect(parsed.data).not.toHaveProperty('graph_queries_used');
    expect(parsed.content).toContain('[**api**](services/api.md)');
    expect(invocations).not.toContain('SERVICES.md');
  });

  it('SERVICES.md uses the stack-agnostic role one-liner derived from type + framework', async () => {
    // Previously the catalog inlined the per-service doc's
    // first paragraph (often 30+ lines for 5 services). The new
    // contract: derive `<role>` from `service.type` +
    // `service.frameworks.main` so the catalog stays a thin pointer
    // index. The fixture's api service has type=backend +
    // frameworks.main='Express', so the role is "Express HTTP service".
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
    expect(servicesDoc.content).toContain('Express HTTP service');
    // The first paragraph of the service doc must NOT be inlined now.
    expect(servicesDoc.content).not.toContain('Handles user CRUD traffic for the platform.');
  });

  it('SERVICES.md falls back to per-service doc first paragraph when type+framework cannot derive a role', async () => {
    // The fallback path still exists for unusual services where the
    // type is missing/unknown and there is no framework match. Build
    // a fixture with no recognizable type or framework, then assert
    // the first-paragraph fallback fires.
    const input = buildInput();
    // No type, no recognizable framework — both deriveStackAgnosticRole
    // branches return undefined, so the per-service doc's first
    // paragraph is the next fallback. Cast to never to bypass the
    // narrow buildInput shape since this fixture deliberately omits
    // the canonical fields.
    (input as { stackProfile: unknown }).stackProfile = {
      ...input.stackProfile,
      services: [{ id: 'api', path: 'src' }],
    };
    const service = new WikiGeneratorService({
      ...input,
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
    // Cross-cutting Data flows / Patterns groups retired in H4.
    expect(index).not.toContain('## Data flows');
    expect(index).not.toContain('## Patterns');

    expect(index).toContain('[ARCHITECTURE](ARCHITECTURE.md)');
    expect(index).toContain('[SERVICES](SERVICES.md)');
    expect(index).toContain('[api](services/api.md)');
    expect(index).not.toContain('[DATA-FLOWS](DATA-FLOWS.md)');
    expect(index).not.toContain('[PATTERNS](PATTERNS.md)');

    // Inline metadata: document_type + tags (confidence dropped in 2026-05 simplification)
    expect(index).toMatch(/\*architecture\*/);
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
      (f) => f.filename === 'wiki/ARCHITECTURE.md' || f.filename === 'wiki/services/api.md',
    );
    expect(interestingPages.length).toBeGreaterThan(0);
    for (const page of interestingPages) {
      const data = matter(page.content).data as Record<string, unknown>;
      expect(Array.isArray(data.tags)).toBe(true);
      expect((data.tags as string[]).length).toBeGreaterThan(0);
    }
  });

  it('renders the only remaining core doc (ARCHITECTURE.md) once', async () => {
    // After H4, ARCHITECTURE.md is the sole cross-cutting LLM-generated wiki
    // page. The previous test asserted that the three core docs ran in
    // parallel; with only one core doc, parallelism is moot — this test
    // just confirms the path executes and emits the page.
    const invocations: string[] = [];

    const service = new WikiGeneratorService({
      ...buildInput(),
      agentInvoker: async ({ filename }: WikiAgentInvocation) => {
        const isCore = !filename.startsWith('services/');
        if (isCore) invocations.push(filename);
        return `# ${filename}`;
      },
    });

    const result = await service.generateAll();
    expect(invocations).toEqual(['ARCHITECTURE.md']);
    expect(result.files.some((f) => f.filename === 'wiki/ARCHITECTURE.md')).toBe(true);
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

  it('configures wiki-generator with the same model alias as architect-synthesizer in every tier', () => {
    // wiki-generator and architect-synthesizer share the same model family
    // because both produce long-form narrative content; only their reasoning
    // effort / thinking-budget differs (the synthesizer reasons across
    // analyzers, the wiki shapes content per service). Asserting on the
    // alias only keeps the regression guard while letting Phase A tune
    // effort independently.
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'config/model-config.json'), 'utf-8'),
    );

    const aliasOf = (entry: unknown): string =>
      typeof entry === 'string' ? entry : ((entry as { alias: string }).alias as string);

    for (const tier of Object.values(config.tiers) as any[]) {
      expect(aliasOf(tier.agents['wiki-generator'])).toBe(
        aliasOf(tier.agents['architect-synthesizer']),
      );
    }
  });
});
