import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wikiGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/wiki-generation.node.js';
import { LLM_WIKI_CONTEXT_START } from '../../../../../src/services/graph-wiki/types.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
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

vi.mock('../../../../../src/utils/provider-paths.js', () => ({
  getActiveProvider: vi.fn(() => 'claude'),
  getAllProviderManagedDirs: vi.fn(() => ['.claude', '.codex']),
  getAllProviderConfigDirs: vi.fn(() => ['.claude', '.codex']),
  getAllProviderTempDirs: vi.fn(() => ['.claude-temp', '.codex-temp']),
  getAllProviderBackupDirs: vi.fn(() => ['.claude-backup', '.codex-backup']),
  getProviderPaths: vi.fn(() => ({
    configDir: '.claude',
    instructionFile: 'CLAUDE.md',
    tempDir: '.claude-temp',
    backupDir: '.claude-backup',
    homeConfigDir: '~/.claude',
    hooksFile: 'settings.json',
    credentialsPath: '.claude/credentials.json',
  })),
  resolveConfigPath: vi.fn((projectPath: string, ...segments: string[]) =>
    [projectPath, '.claude', ...segments].join('/'),
  ),
  resolveInstructionFilePath: vi.fn((projectPath: string) => `${projectPath}/.claude/CLAUDE.md`),
  resolveTempPath: vi.fn((projectPath: string, ...segments: string[]) =>
    [projectPath, '.claude-temp', ...segments].join('/'),
  ),
  getInstructionFileName: vi.fn(() => 'CLAUDE.md'),
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

  it('writes ARCHITECTURE, SERVICES (catalog), DATA-FLOWS, PATTERNS, service docs, and index under docs/llm-wiki/', async () => {
    const result = await wikiGenerationNode(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/project/docs/llm-wiki', {
      recursive: true,
    });

    const writtenPaths = vi.mocked(fs.writeFileSync).mock.calls.map(([p]) => String(p));

    expect(writtenPaths.some((p) => p.includes('ARCHITECTURE.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('SERVICES.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('DATA-FLOWS.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('PATTERNS.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('index.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('services/api.md'))).toBe(true);
    expect(result.current_phase).toBe('phase4_wiki_generation');
    expect(result.llm_wiki_path).toBe('/test/project/docs/llm-wiki');
    expect(result.phase4_wiki_generation?.llm_wiki_written).toBe(true);
  });

  it('also writes CHANGELOG.md, log.md, .state.json, and schema doc at wiki root', async () => {
    await wikiGenerationNode(state);

    for (const fileName of ['CHANGELOG.md', 'log.md', '.state.json', 'CLAUDE.md']) {
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `/test/project/docs/llm-wiki/${fileName}`,
        expect.any(String),
      );
    }
  });

  it('SERVICES.md written by finalization is a deterministic catalog', async () => {
    await wikiGenerationNode(state);

    const servicesWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('SERVICES.md'));
    const content = String(servicesWrite?.[1]);

    expect(content).toContain('document_type: services');
    expect(content).toContain('[**api**](services/api.md)');
    expect(content).toContain('[ARCHITECTURE.md](ARCHITECTURE.md)');
    expect(content).toContain('[DATA-FLOWS.md](DATA-FLOWS.md)');
  });

  it('appends LLM wiki context guidance to CLAUDE.md and project-context', async () => {
    await wikiGenerationNode(state);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.claude/CLAUDE.md',
      expect.stringContaining('LLM Wiki'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.claude/skills/project-context/SKILL.md',
      expect.stringContaining('docs/llm-wiki/wiki/'),
    );
  });

  it('replaces the context section on rerun instead of duplicating it', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      const pathString = String(path);
      if (pathString.includes('CLAUDE.md') || pathString.includes('SKILL.md')) {
        return [
          '# Existing',
          LLM_WIKI_CONTEXT_START,
          '## LLM Wiki',
          '- Old content',
          '<!-- LLM_WIKI_END -->',
        ].join('\n');
      }
      return '{}';
    });

    await wikiGenerationNode(state);

    const claudeWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).includes('CLAUDE.md'));
    expect(String(claudeWrite?.[1]).match(/LLM Wiki/g)).toHaveLength(1);
  });

  it('fails fast when a core doc is missing from state', async () => {
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
