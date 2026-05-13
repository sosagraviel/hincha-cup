import matter from 'gray-matter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { wikiPreparationNode } from '../../src/nodes/initialize-project/phase4/wiki-docs/wiki-preparation.node.js';
import { wikiArchitectureDocNode } from '../../src/nodes/initialize-project/phase4/wiki-docs/wiki-architecture.node.js';
import { wikiServiceDocsNode } from '../../src/nodes/initialize-project/phase4/wiki-docs/wiki-service-docs.node.js';
import { wikiGenerationNode } from '../../src/nodes/initialize-project/phase4/wiki-generation.node.js';
import type { InitializeProjectState } from '../../src/state/schemas/initialize-project.schema.js';

vi.mock('../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: {
    create: vi.fn(async () => ({
      createAgent: vi.fn(async () => ({
        invoke: vi.fn(async ({ inputPrompt }) => ({
          output: `# Generated Wiki\n\n${inputPrompt.includes('services/api.md') ? 'Service body.' : 'Core body.'}`,
          sessionId: 'integration-test-session',
          mode: 'claude_cli',
          executionTimeMs: 1,
        })),
      })),
    })),
  },
}));

vi.mock('../../src/utils/provider-paths.js', () => ({
  getActiveProvider: vi.fn(() => 'claude'),
}));

describe('wiki generation smoke on simple-api fixture', () => {
  let projectPath: string | undefined;

  afterEach(() => {
    if (projectPath && existsSync(projectPath)) {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('creates graph-backed LLM wiki docs without breaking context outputs', async () => {
    const sourceProject = resolve(
      process.cwd(),
      '..',
      'tests',
      'integration',
      'initialize-project',
      'projects',
      'simple-api',
    );
    projectPath = mkdtempSync(join(tmpdir(), 'simple-api-wiki-'));
    cpSync(sourceProject, projectPath, { recursive: true });

    const tempDir = join(projectPath, '.claude-temp', 'initialize-project');
    const phase1Dir = join(tempDir, 'phase1-outputs');
    mkdirSync(phase1Dir, { recursive: true });
    mkdirSync(join(projectPath, '.claude'), { recursive: true });
    writeFileSync(join(projectPath, '.claude', 'CLAUDE.md'), '# Simple API\n');
    mkdirSync(join(projectPath, '.code-review-graph'), { recursive: true });
    writeFileSync(join(projectPath, '.code-review-graph/graph.db'), 'graph');
    writeFileSync(
      join(tempDir, 'stack-profile.json'),
      JSON.stringify({
        package_manager: 'npm',
        services: [
          {
            id: 'api',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'Express', testing: 'Jest' },
          },
        ],
      }),
    );
    // The wiki preparation node REQUIRES architectural-narrative.md
    // (Phase 4a writes it; tests stage it directly).
    writeFileSync(
      join(tempDir, 'architectural-narrative.md'),
      '# Architectural Narrative\n\nA descriptive cross-service narrative.\n',
    );
    writePhase1Output(phase1Dir, '01-structure-architecture.json', {
      agent_name: 'structure-architecture-analyzer',
      graph_queries_used: ['list_communities'],
      findings: {
        services: [
          {
            id: 'api',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'Express' },
            entry_points: ['src/index.ts'],
          },
        ],
      },
    });
    writePhase1Output(phase1Dir, '02-tech-stack-dependencies.json', {
      agent_name: 'tech-stack-dependencies-analyzer',
      graph_queries_used: ['semantic_search_nodes'],
      findings: {
        dependencies: { by_service: { api: { production: ['express'], development: ['jest'] } } },
      },
    });
    writePhase1Output(phase1Dir, '03-code-patterns-testing.json', {
      agent_name: 'code-patterns-testing-analyzer',
      graph_queries_used: ['find_large_functions'],
      findings: { patterns: ['service/controller split'], testing: ['Jest tests'] },
    });
    writePhase1Output(phase1Dir, '04-data-flows-integrations.json', {
      agent_name: 'data-flows-integrations-analyzer',
      graph_queries_used: ['list_flows'],
      findings: { routes: [{ method: 'GET', route: '/users' }] },
    });

    const baseState: InitializeProjectState = {
      project_path: projectPath,
      framework_path: resolve(process.cwd(), '..'),
      temp_dir: tempDir,
      current_phase: 'phase4_context',
      claude_md_path: join(projectPath, '.claude', 'CLAUDE.md'),
      architectural_narrative_path: join(tempDir, 'architectural-narrative.md'),
      code_graph_available: true,
      code_graph_path: join(projectPath, '.code-review-graph/graph.db'),
      phase4_context: {
        claude_md_written: true,
        conventions_skills_written: true,
        architectural_narrative_written: true,
        framework_config_generated: true,
        timestamp: new Date().toISOString(),
      },
      errors: [],
      warnings: [],
      phase1_retry_tracking: {},
    };

    // The Phase 4 wiki subgraph is
    // `wiki_preparation → [wiki_architecture_doc, wiki_service_docs]
    // (parallel) → wiki_generation`. The integration test runs each
    // node in sequence and merges the resulting partial-state slices,
    // mirroring how LangGraph would compose them. We can't call
    // `wikiGenerationNode` directly any more — it requires
    // `phase4_wiki_docs.context` populated by the upstream
    // preparation node, plus the `architecture` + `service_docs`
    // outputs from the parallel branches.
    const prepResult = await wikiPreparationNode(baseState);
    expect(prepResult.errors ?? []).toEqual([]);
    const afterPrep: InitializeProjectState = {
      ...baseState,
      ...prepResult,
      phase4_wiki_docs: { ...(prepResult.phase4_wiki_docs ?? {}) },
    };

    const archResult = await wikiArchitectureDocNode(afterPrep);
    expect(archResult.errors ?? []).toEqual([]);
    const afterArch: InitializeProjectState = {
      ...afterPrep,
      ...archResult,
      phase4_wiki_docs: {
        ...afterPrep.phase4_wiki_docs,
        ...(archResult.phase4_wiki_docs ?? {}),
      },
    };

    const svcResult = await wikiServiceDocsNode(afterArch);
    expect(svcResult.errors ?? []).toEqual([]);
    const afterSvc: InitializeProjectState = {
      ...afterArch,
      ...svcResult,
      phase4_wiki_docs: {
        ...afterArch.phase4_wiki_docs,
        ...(svcResult.phase4_wiki_docs ?? {}),
      },
    };

    const result = await wikiGenerationNode(afterSvc);

    expect(result.current_phase).toBe('phase4_wiki_generation');
    expect(existsSync(join(projectPath, '.code-review-graph/graph.db'))).toBe(true);

    // Only ARCHITECTURE.md is rendered as a cross-cutting LLM-generated
    // wiki page. DATA-FLOWS.md / PATTERNS.md were retired (per-service
    // narratives + prescriptive convention skills replace them).
    for (const fileName of ['wiki/index.md', 'wiki/ARCHITECTURE.md', 'wiki/SERVICES.md']) {
      expect(existsSync(join(projectPath, 'docs', 'llm-wiki', fileName))).toBe(true);
    }
    expect(existsSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'DATA-FLOWS.md'))).toBe(false);
    expect(existsSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'PATTERNS.md'))).toBe(false);
    expect(existsSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'services', 'api.md'))).toBe(
      true,
    );
    const architecture = matter(
      readFileSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'ARCHITECTURE.md'), 'utf-8'),
    );
    const serviceDoc = matter(
      readFileSync(join(projectPath, 'docs', 'llm-wiki', 'wiki', 'services', 'api.md'), 'utf-8'),
    );
    expect(architecture.data.generated_by).toBe('ai-agentic-framework');
    expect(architecture.data.graph_version).toBeDefined();
    expect(serviceDoc.data.service_id).toBe('api');
    // The CLAUDE.md cross-reference is upserted into the project's
    // schema doc by the finalization node.
    expect(readFileSync(join(projectPath, '.claude', 'CLAUDE.md'), 'utf-8')).toContain(
      'docs/llm-wiki',
    );
  });
});

function writePhase1Output(
  phase1Dir: string,
  fileName: string,
  content: Record<string, unknown>,
): void {
  writeFileSync(
    join(phase1Dir, fileName),
    JSON.stringify({
      agent_name: 'test-analyzer',
      timestamp: '2026-04-21T00:00:00.000Z',
      ...content,
    }),
  );
}
