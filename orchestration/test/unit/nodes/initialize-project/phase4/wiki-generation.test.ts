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
      architectural_narrative_path: '/test/temp/architectural-narrative.md',
      code_graph_available: true,
      code_graph_path: '/test/project/.code-review-graph/graph.db',
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

  it('writes ARCHITECTURE, SERVICES (catalog), service docs, and index under docs/llm-wiki/', async () => {
    const result = await wikiGenerationNode(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/project/docs/llm-wiki', {
      recursive: true,
    });

    const writtenPaths = vi.mocked(fs.writeFileSync).mock.calls.map(([p]) => String(p));

    expect(writtenPaths.some((p) => p.includes('ARCHITECTURE.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('SERVICES.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('index.md'))).toBe(true);
    expect(writtenPaths.some((p) => p.includes('services/api.md'))).toBe(true);
    // DATA-FLOWS.md and PATTERNS.md are intentionally NOT written — flows
    // are now per-service, patterns are prescriptive (live in skills).
    expect(writtenPaths.some((p) => p.includes('DATA-FLOWS.md'))).toBe(false);
    expect(writtenPaths.some((p) => p.includes('PATTERNS.md'))).toBe(false);
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

  it('threads code_graph_stats from preflight into .state.json', async () => {
    // Anti-regression: the wiki-generation node once called buildStateJson
    // without graph_stats, so .state.json on every run recorded
    // `graph_stats: null` even though state.code_graph_stats was available
    // in scope. Consumers (wiki refresh, lint, dashboard) had to re-run
    // `code-review-graph stats` to get the same numbers. The fix threads
    // the preflight stats through.
    await wikiGenerationNode(state);

    const stateWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('docs/llm-wiki/.state.json'));
    const parsed = JSON.parse(String(stateWrite?.[1]));
    expect(parsed.graph_stats).toEqual({
      files: 12,
      functions: 20,
      edges: 30,
      languages: ['typescript'],
      build_time_ms: 1000,
    });
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
    // Cross-cutting DATA-FLOWS.md and PATTERNS.md were retired in H4.
    expect(content).not.toContain('DATA-FLOWS.md');
    expect(content).not.toContain('PATTERNS.md');
  });

  it('appends LLM wiki context guidance to CLAUDE.md (and only CLAUDE.md)', async () => {
    await wikiGenerationNode(state);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/project/.claude/CLAUDE.md',
      expect.stringContaining('LLM Wiki'),
    );
    // The three prescriptive convention skills carry rules only — the wiki
    // pointer intentionally is NOT upserted into them.
    const skillWrites = vi
      .mocked(fs.writeFileSync)
      .mock.calls.filter(([path]) => String(path).includes('/.claude/skills/'));
    expect(skillWrites.length).toBe(0);
  });

  it('appends a Graph navigation discipline fenced section to CLAUDE.md', async () => {
    await wikiGenerationNode(state);

    const claudeWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path) === '/test/project/.claude/CLAUDE.md');
    const body = String(claudeWrite?.[1]);
    expect(body).toContain('<!-- GRAPH_DISCIPLINE_START -->');
    expect(body).toContain('<!-- GRAPH_DISCIPLINE_END -->');
    expect(body).toContain('## Graph navigation discipline');
    // The body upserted here is a SHORT POINTER to the wiki router, not
    // the full discipline body. The full body lives in
    // `docs/llm-wiki/CLAUDE.md`. Anti-regression on size bloat.
    expect(body).toMatch(/wiki router/i);
    expect(body).toContain('docs/llm-wiki/CLAUDE.md');
    // Canonical lean-defaults / forbidden-tool tokens are NOT inlined
    // here — they live in the wiki router only.
    expect(body).not.toContain('mcp__code_graph__get_architecture_overview_tool');
    // Both fenced sections coexist — the LLM Wiki section is already there.
    expect(body).toContain('<!-- LLM_WIKI_START -->');
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
    expect(result.errors?.some((e) => e.includes('Core wiki doc (architecture) is missing'))).toBe(
      true,
    );
  });
});
