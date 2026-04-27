import matter from 'gray-matter';
import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { WikiGeneratorService } from '../../src/services/graph-wiki/wiki-generator.service.js';
import {
  ALL_SCHEMA_FILENAMES,
  SCHEMA_FILENAME_BY_PROVIDER,
} from '../../src/services/graph-wiki/types.js';
import type {
  WikiAgentInvocation,
  WikiAnalyzerOutputs,
} from '../../src/services/graph-wiki/types.js';
import { Provider } from '../../src/providers/types.js';

function buildProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'llm-wiki-full-tree-'));
  writeFileSync(join(dir, '.code-graph.db'), 'stub-graph-content');
  writeFileSync(join(dir, 'README.md'), '# Test Project\n\nA test project for wiki generation.');
  return dir;
}

const STUB_ANALYZERS: WikiAnalyzerOutputs = {
  structure_architecture: {
    agent_name: 'structure-architecture-analyzer',
    graph_queries_used: ['mcp__code_graph__list_communities'],
    findings: {
      services: [{ id: 'api', entry_points: ['src/index.ts'], community_id: 'community-1' }],
    },
  },
  tech_stack_dependencies: {
    agent_name: 'tech-stack-dependencies-analyzer',
    graph_queries_used: ['mcp__code_graph__semantic_search_nodes'],
    findings: {
      dependencies: {
        by_service: { api: { production: ['express'], development: ['jest'] } },
      },
    },
  },
  code_patterns_testing: {
    agent_name: 'code-patterns-testing-analyzer',
    graph_queries_used: ['mcp__code_graph__find_large_functions'],
    findings: { patterns: ['service/controller split'], testing: ['Jest unit tests'] },
  },
  data_flows_integrations: {
    agent_name: 'data-flows-integrations-analyzer',
    graph_queries_used: ['mcp__code_graph__list_flows'],
    findings: { routes: [{ method: 'GET', route: '/users', description: 'List users' }] },
  },
};

const STUB_STACK_PROFILE = {
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
};

function stubAgentInvoker({ filename }: WikiAgentInvocation): Promise<string> {
  const title = filename.replace(/^services\//, '').replace('.md', '');
  return Promise.resolve(
    `# ${title}\n\nStub content for ${filename}. This service handles core business logic.`,
  );
}

function buildService(projectPath: string, provider: Provider): WikiGeneratorService {
  return new WikiGeneratorService({
    projectPath,
    frameworkPath: '/framework',
    provider,
    generatedAt: '2026-04-24T00:00:00.000Z',
    graph: {
      available: true,
      path: join(projectPath, '.code-graph.db'),
      mcpPort: 3100,
      stats: {
        files: 12,
        functions: 20,
        edges: 30,
        languages: ['typescript'],
        build_time_ms: 1000,
      },
    },
    analyzers: STUB_ANALYZERS,
    stackProfile: STUB_STACK_PROFILE,
    agentInvoker: stubAgentInvoker,
  });
}

function writeFilesToDir(
  files: Array<{ filename: string; content: string }>,
  outDir: string,
): void {
  for (const file of files) {
    const fullPath = join(outDir, file.filename);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
  }
}

describe('llm-wiki full tree integration', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'llm-wiki-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('generates the full docs/llm-wiki/ tree with all expected files', async () => {
    const projectPath = buildProjectDir();
    const outDir = makeTempDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    writeFilesToDir(result.files, outDir);

    const allFilenames = result.files.map((f) => f.filename);

    for (const wikiFile of [
      'wiki/index.md',
      'wiki/ARCHITECTURE.md',
      'wiki/SERVICES.md',
      'wiki/DATA-FLOWS.md',
      'wiki/PATTERNS.md',
    ]) {
      expect(allFilenames, `expected ${wikiFile} in generated files`).toContain(wikiFile);
      expect(existsSync(join(outDir, wikiFile)), `${wikiFile} must exist on disk`).toBe(true);
    }

    expect(allFilenames.some((f) => f.startsWith('wiki/services/'))).toBe(true);
    expect(existsSync(join(outDir, 'wiki', 'services', 'api.md'))).toBe(true);

    expect(allFilenames).toContain('raw/manifest.json');
    expect(existsSync(join(outDir, 'raw', 'manifest.json'))).toBe(true);
    expect(() =>
      JSON.parse(readFileSync(join(outDir, 'raw', 'manifest.json'), 'utf-8')),
    ).not.toThrow();

    expect(allFilenames).not.toContain('raw/analyzers/01-structure-architecture.json');
    expect(existsSync(join(outDir, 'raw', 'analyzers'))).toBe(false);
    expect(allFilenames.some((f) => f.startsWith('raw/graph-stats/'))).toBe(false);
    expect(existsSync(join(outDir, 'raw', 'graph-stats'))).toBe(false);

    expect(allFilenames).toContain('CHANGELOG.md');
    expect(allFilenames).toContain('log.md');
    expect(allFilenames).toContain('.state.json');
    expect(existsSync(join(outDir, 'CHANGELOG.md'))).toBe(true);
    expect(existsSync(join(outDir, 'log.md'))).toBe(true);
    expect(existsSync(join(outDir, '.state.json'))).toBe(true);
  });

  it('every wiki page has valid YAML frontmatter with required keys', async () => {
    const projectPath = buildProjectDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    const wikiPages = result.files.filter((f) => f.filename.startsWith('wiki/'));
    expect(wikiPages.length).toBeGreaterThan(0);

    for (const page of wikiPages) {
      const parsed = matter(page.content);
      expect(parsed.data, `${page.filename} missing summary`).toHaveProperty('summary');
      expect(parsed.data, `${page.filename} missing sources`).toHaveProperty('sources');
      expect(parsed.data, `${page.filename} missing confidence`).toHaveProperty('confidence');
      expect(parsed.data, `${page.filename} missing graph_commit`).toHaveProperty('graph_commit');
      expect(parsed.data, `${page.filename} missing document_type`).toHaveProperty('document_type');
      expect(parsed.data, `${page.filename} missing generated_by`).toHaveProperty('generated_by');
    }
  });

  it('emits exactly CLAUDE.md (not AGENTS.md or COPILOT.md) for Provider.CLAUDE', async () => {
    const projectPath = buildProjectDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    const allFilenames = result.files.map((f) => f.filename);
    expect(allFilenames).toContain(SCHEMA_FILENAME_BY_PROVIDER[Provider.CLAUDE]);
    expect(allFilenames).not.toContain(SCHEMA_FILENAME_BY_PROVIDER[Provider.CODEX]);
  });

  it('emits exactly AGENTS.md (not CLAUDE.md or COPILOT.md) for Provider.CODEX', async () => {
    const projectPath = buildProjectDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CODEX);
    const result = await service.generateAll();

    const allFilenames = result.files.map((f) => f.filename);
    expect(allFilenames).toContain(SCHEMA_FILENAME_BY_PROVIDER[Provider.CODEX]);
    expect(allFilenames).not.toContain(SCHEMA_FILENAME_BY_PROVIDER[Provider.CLAUDE]);
  });

  it('provider-switch: re-generating with a different provider yields only the new schema file', async () => {
    const projectPath = buildProjectDir();
    const outDir = makeTempDir();
    tempDirs.push(projectPath);

    const claudeService = buildService(projectPath, Provider.CLAUDE);
    const claudeResult = await claudeService.generateAll();
    writeFilesToDir(claudeResult.files, outDir);

    expect(existsSync(join(outDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(outDir, 'AGENTS.md'))).toBe(false);

    const codexService = buildService(projectPath, Provider.CODEX);
    const codexResult = await codexService.generateAll();

    const staleClaudePath = join(outDir, SCHEMA_FILENAME_BY_PROVIDER[Provider.CLAUDE]);
    if (existsSync(staleClaudePath)) {
      unlinkSync(staleClaudePath);
    }

    writeFilesToDir(codexResult.files, outDir);

    expect(existsSync(join(outDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(outDir, 'CLAUDE.md'))).toBe(false);

    const schemaCount = ALL_SCHEMA_FILENAMES.filter((name) =>
      existsSync(join(outDir, name)),
    ).length;
    expect(schemaCount).toBe(1);
  });

  it('.state.json has all required keys and valid ISO timestamps', async () => {
    const projectPath = buildProjectDir();
    const outDir = makeTempDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    writeFilesToDir(result.files, outDir);

    const stateRaw = readFileSync(join(outDir, '.state.json'), 'utf-8');
    const state = JSON.parse(stateRaw) as Record<string, unknown>;

    expect(state).toHaveProperty('last_indexed_commit');
    expect(state).toHaveProperty('graph_sha');
    expect(state).toHaveProperty('graph_commit');
    expect(state).toHaveProperty('pipeline_version');
    expect(state).toHaveProperty('last_ingest_at');
    expect(state).toHaveProperty('graph_stats');
    expect(state.graph_stats).toMatchObject({ files: 12, functions: 20, edges: 30 });
    expect(new Date(state.last_ingest_at as string).toISOString()).toBe('2026-04-24T00:00:00.000Z');
  });

  it('CHANGELOG.md has Keep-a-Changelog structure with Added section', async () => {
    const projectPath = buildProjectDir();
    const outDir = makeTempDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    writeFilesToDir(result.files, outDir);

    const changelog = readFileSync(join(outDir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain('# Changelog');
    expect(changelog).toContain('## [Unreleased]');
    expect(changelog).toContain('### Added');
  });

  it('raw/analyzers/ and raw/graph-stats/ are never created', async () => {
    const projectPath = buildProjectDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    const analyzerFiles = result.files.filter((f) => f.filename.startsWith('raw/analyzers/'));
    expect(analyzerFiles).toHaveLength(0);

    const graphStatsFiles = result.files.filter((f) => f.filename.startsWith('raw/graph-stats/'));
    expect(graphStatsFiles).toHaveLength(0);
  });

  it('wiki/services/api.md has service frontmatter with service_id', async () => {
    const projectPath = buildProjectDir();
    tempDirs.push(projectPath);

    const service = buildService(projectPath, Provider.CLAUDE);
    const result = await service.generateAll();

    const serviceDoc = result.files.find((f) => f.filename === 'wiki/services/api.md');
    expect(serviceDoc).toBeDefined();

    const parsed = matter(serviceDoc!.content);
    expect(parsed.data.document_type).toBe('service');
    expect(parsed.data.service_id).toBe('api');
  });
});
