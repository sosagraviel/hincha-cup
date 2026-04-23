import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wikiGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/wiki-generation.node.js';
import { AI_KNOWLEDGE_CONTEXT_START } from '../../../../../src/services/graph-wiki/wiki-generator.service.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    blank: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

function buildCoreDoc(filename: string, documentType: string) {
  return {
    filename,
    content: [
      `---`,
      `document_type: ${documentType}`,
      `---`,
      '',
      `# ${filename}`,
      '',
      'Body.',
    ].join('\n'),
  };
}

describe('wikiGenerationNode (finalization)', () => {
  let state: InitializeProjectState;

  beforeEach(() => {
    vi.clearAllMocks();

    state = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase4_context',
      temp_dir: '/test/temp',
      claude_md_path: '/test/project/.claude/CLAUDE.md',
      project_context_path: '/test/project/.claude/skills/project-context/SKILL.md',
      code_graph_available: true,
      code_graph_path: '/test/project/.code-graph.db',
      code_graph_mcp_port: 3100,
      code_graph_stats: {
        files: 12,
        functions: 20,
        edges: 30,
        languages: ['typescript'],
        build_time_ms: 1000,
      },
      phase4_wiki_docs: {
        context: {
          analyzers: {
            structure_architecture: { graph_queries_used: ['list_communities'], findings: {} },
            tech_stack_dependencies: {
              graph_queries_used: ['semantic_search_nodes'],
              findings: {},
            },
            code_patterns_testing: { graph_queries_used: ['find_large_functions'], findings: {} },
            data_flows_integrations: { graph_queries_used: ['list_flows'], findings: {} },
          },
          stackProfile: {
            services: [
              {
                id: 'api',
                path: 'src',
                type: 'backend',
                language: 'typescript',
                frameworks: { main: 'Express' },
              },
            ],
          },
          generatedAt: '2026-04-21T00:00:00.000Z',
          graphVersion: 'deadbeef',
        },
        architecture: buildCoreDoc('ARCHITECTURE.md', 'architecture'),
        data_flows: buildCoreDoc('DATA-FLOWS.md', 'data-flow'),
        patterns: buildCoreDoc('PATTERNS.md', 'pattern'),
        service_docs: [buildCoreDoc('services/api.md', 'service')],
      },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      const pathString = String(path);
      if (pathString.includes('CLAUDE.md')) return '# Existing Claude\n';
      if (pathString.includes('SKILL.md')) return '# Existing Skill\n';
      return '{}';
    });
  });

  it('writes ARCHITECTURE, SERVICES (catalog), DATA-FLOWS, PATTERNS, service docs, and index', async () => {
    const result = await wikiGenerationNode(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/project/docs/ai-knowledge', {
      recursive: true,
    });

    for (const fileName of [
      'ARCHITECTURE.md',
      'SERVICES.md',
      'DATA-FLOWS.md',
      'PATTERNS.md',
      'index.md',
    ]) {
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `/test/project/docs/ai-knowledge/${fileName}`,
        expect.any(String),
      );
    }
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/docs/ai-knowledge/services/api.md',
      expect.any(String),
    );
    expect(result.current_phase).toBe('phase4_wiki_generation');
    expect(result.ai_knowledge_path).toBe('/test/project/docs/ai-knowledge');
    expect(result.ai_knowledge_files).toHaveLength(6);
    expect(result.phase4_wiki_generation?.ai_knowledge_written).toBe(true);
  });

  it('SERVICES.md written by finalization is a deterministic catalog', async () => {
    await wikiGenerationNode(state);

    const servicesWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('SERVICES.md'));
    const content = String(servicesWrite?.[1]);

    expect(content).toContain('document_type: services');
    expect(content).toContain('[**api**](services/api.md)');
    // Should reference other core docs for cross-navigation.
    expect(content).toContain('[ARCHITECTURE.md](ARCHITECTURE.md)');
    expect(content).toContain('[DATA-FLOWS.md](DATA-FLOWS.md)');
  });

  it('appends context guidance to CLAUDE.md and project-context', async () => {
    await wikiGenerationNode(state);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.claude/CLAUDE.md',
      expect.stringContaining('## AI Knowledge Wiki'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.claude/skills/project-context/SKILL.md',
      expect.stringContaining('docs/ai-knowledge/index.md'),
    );
  });

  it('replaces the context section on rerun instead of duplicating it', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      const pathString = String(path);
      if (pathString.includes('CLAUDE.md') || pathString.includes('SKILL.md')) {
        return [
          '# Existing',
          AI_KNOWLEDGE_CONTEXT_START,
          '## AI Knowledge Wiki',
          '- Old content',
          '<!-- AI_KNOWLEDGE_WIKI_END -->',
        ].join('\n');
      }
      return '{}';
    });

    await wikiGenerationNode(state);

    const claudeWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).includes('CLAUDE.md'));
    expect(String(claudeWrite?.[1]).match(/AI Knowledge Wiki/g)).toHaveLength(1);
  });

  it('fails fast when a core doc is missing from state', async () => {
    // Simulate upstream failure: architecture slot never populated.
    const broken = {
      ...state,
      phase4_wiki_docs: {
        ...state.phase4_wiki_docs!,
        architecture: undefined,
      },
    };

    const result = await wikiGenerationNode(broken);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((e) => e.includes('core wiki docs are missing'))).toBe(true);
  });
});
