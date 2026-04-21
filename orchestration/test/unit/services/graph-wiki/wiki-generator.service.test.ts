import { describe, expect, it } from 'vitest';
import {
  AI_KNOWLEDGE_FILE_NAMES,
  generateAiKnowledgeWiki,
  upsertAiKnowledgeContextSection,
} from '../../../../src/services/graph-wiki/wiki-generator.service.js';

describe('wiki-generator.service', () => {
  const baseInput = {
    projectPath: '/tmp/simple-api',
    generatedAt: '2026-04-21T00:00:00.000Z',
    graph: {
      available: true,
      path: '/tmp/simple-api/.code-graph.db',
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
        graph_queries_used: ['get_minimal_context', 'list_communities'],
        findings: {
          architecture_patterns: ['Layered API'],
          project_structure: ['src/controllers', 'src/services'],
        },
      },
      tech_stack_dependencies: {
        graph_queries_used: ['semantic_search_nodes'],
        findings: {},
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
          persistence: ['in-memory repository'],
        },
      },
    },
  };

  it('generates the five core docs', () => {
    const result = generateAiKnowledgeWiki(baseInput);

    expect(result.files.map((file) => file.filename)).toEqual([...AI_KNOWLEDGE_FILE_NAMES]);
  });

  it('includes graph status, graph stats, and graph queries', () => {
    const result = generateAiKnowledgeWiki(baseInput);
    const allContent = result.files.map((file) => file.content).join('\n');

    expect(allContent).toContain('Available: yes');
    expect(allContent).toContain('files=8');
    expect(allContent).toContain('list_communities');
    expect(allContent).toContain('list_flows');
  });

  it('renders service data from the stack profile', () => {
    const result = generateAiKnowledgeWiki(baseInput);
    const services = result.files.find((file) => file.filename === 'SERVICES.md')?.content;

    expect(services).toContain('| api | src | backend | typescript | Express | Jest | npm |');
  });

  it('handles missing optional analyzer sections without throwing', () => {
    const result = generateAiKnowledgeWiki({
      projectPath: '/tmp/simple-api',
      generatedAt: '2026-04-21T00:00:00.000Z',
      graph: { available: false },
      analyzers: {},
      stackProfile: {},
    });

    expect(result.files).toHaveLength(5);
    expect(result.files.map((file) => file.content).join('\n')).toContain(
      'Not detected in Phase 1 analysis.',
    );
  });

  it('replaces an existing context section instead of duplicating it', () => {
    const first = generateAiKnowledgeWiki(baseInput).contextSection;
    const second = first.replace('Graph-backed docs:', 'Graph-backed docs: updated');
    const content = upsertAiKnowledgeContextSection('hello\n\n' + first, second);

    expect(content.match(/AI Knowledge Wiki/g)).toHaveLength(1);
    expect(content).toContain('Graph-backed docs: updated');
  });
});
