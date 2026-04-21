import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wikiGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/wiki-generation.node.js';
import {
  AI_KNOWLEDGE_CONTEXT_START,
  AI_KNOWLEDGE_FILE_NAMES,
} from '../../../../../src/services/graph-wiki/wiki-generator.service.js';
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

describe('wikiGenerationNode', () => {
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
      phase4_context: {
        claude_md_written: true,
        project_context_written: true,
        framework_config_generated: true,
        stack_profile: {
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
        },
        timestamp: '2026-04-21T00:00:00.000Z',
      },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      const pathString = String(path);
      if (pathString.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          graph_queries_used: ['list_communities'],
          findings: { architecture_patterns: ['Layered API'] },
        });
      }
      if (pathString.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({ graph_queries_used: ['semantic_search_nodes'], findings: {} });
      }
      if (pathString.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          graph_queries_used: ['find_large_functions'],
          findings: { patterns: ['service/controller split'] },
        });
      }
      if (pathString.includes('04-data-flows-integrations.json')) {
        return JSON.stringify({
          graph_queries_used: ['list_flows'],
          findings: { routes: [{ method: 'GET', route: '/users' }] },
        });
      }
      if (pathString.includes('stack-profile.json')) {
        return JSON.stringify(state.phase4_context?.stack_profile);
      }
      if (pathString.includes('CLAUDE.md')) {
        return '# Existing Claude\n';
      }
      if (pathString.includes('SKILL.md')) {
        return '# Existing Skill\n';
      }
      return '{}';
    });
  });

  it('writes docs/ai-knowledge and returns wiki state', async () => {
    const result = await wikiGenerationNode(state);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/test/project/docs/ai-knowledge', {
      recursive: true,
    });
    for (const fileName of AI_KNOWLEDGE_FILE_NAMES) {
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `/test/project/docs/ai-knowledge/${fileName}`,
        expect.any(String),
      );
    }
    expect(result.current_phase).toBe('phase4_wiki_generation');
    expect(result.ai_knowledge_path).toBe('/test/project/docs/ai-knowledge');
    expect(result.ai_knowledge_files).toHaveLength(5);
    expect(result.phase4_wiki_generation?.ai_knowledge_written).toBe(true);
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
      if (pathString.includes('stack-profile.json')) {
        return JSON.stringify(state.phase4_context?.stack_profile);
      }
      return JSON.stringify({ graph_queries_used: [], findings: {} });
    });

    await wikiGenerationNode(state);

    const claudeWrite = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find(([path]) => String(path).includes('CLAUDE.md'));
    expect(String(claudeWrite?.[1]).match(/AI Knowledge Wiki/g)).toHaveLength(1);
  });

  it('fails when required context files are missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !String(path).includes('CLAUDE.md'));

    const result = await wikiGenerationNode(state);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((error) => error.includes('CLAUDE.md not found'))).toBe(true);
  });
});
