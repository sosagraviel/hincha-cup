import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validationNode } from '../../../../../src/nodes/initialize-project/phase6/validation.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      blank: vi.fn(),
    })),
  },
}));

describe('validationNode', () => {
  let mockState: InitializeProjectState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase5_resources',
      temp_dir: '/test/temp',
      claude_md_path: '/test/project/.claude/CLAUDE.md',
      project_context_path: '/test/project/.claude/project-context/SKILL.md',
      framework_config_path: '/test/project/.claude/framework-config.json',
      phase1_analysis: { all_completed: true },
      phase1_retry_tracking: {},
      phase2_consolidation: { consolidated_findings: {}, timestamp: '2024-01-01T00:00:00Z' },
      phase3_synthesis: {
        synthesis_content: 'test',
        timestamp: '2024-01-01T00:00:00Z',
        validation_passed: true,
      },
      phase4_context: {
        framework_config_generated: true,
        claude_md_written: true,
        project_context_written: true,
        timestamp: '2024-01-01T00:00:00Z',
      },
      errors: [],
      warnings: [],
      started_at: '2024-01-01T00:00:00Z',
    };

    // Mock successful validation scenario
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('docs/ai-knowledge/services/main.md')) {
        return [
          '---',
          'document_type: service',
          'generated_at: 2026-04-21T00:00:00.000Z',
          'generated_by: ai-agentic-framework',
          'graph_version: abc123',
          'graph_queries_used:',
          '  - mcp__code_graph__semantic_search_nodes',
          'service_id: main',
          '---',
          '# Main Service',
        ].join('\n');
      }
      if (path.includes('docs/ai-knowledge')) {
        return [
          '---',
          'document_type: architecture',
          'generated_at: 2026-04-21T00:00:00.000Z',
          'generated_by: ai-agentic-framework',
          'graph_version: abc123',
          'graph_queries_used:',
          '  - mcp__code_graph__list_communities',
          '---',
          '# Wiki Document',
        ].join('\n');
      }
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({
          version: '2.0.0',
          project_metadata: {},
          stack_profile: {
            services: [{ id: 'main', language: 'typescript', path: 'src', type: 'backend' }],
            file_counts: {
              total: 70,
              by_language: {
                typescript: 50,
                javascript: 20,
              },
            },
          },
        });
      }
      return '';
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      'planner.md',
      'implementer-typescript.md',
      'implement.md',
    ] as any);
  });

  it('should validate successfully with all requirements met', async () => {
    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
    expect(result.completed_at).toBeDefined();
  });

  it('should validate wiki files when wiki state is present', async () => {
    mockState.ai_knowledge_path = '/test/project/docs/ai-knowledge';
    mockState.phase4_wiki_generation = {
      ai_knowledge_written: true,
      files: [
        '/test/project/docs/ai-knowledge/index.md',
        '/test/project/docs/ai-knowledge/ARCHITECTURE.md',
        '/test/project/docs/ai-knowledge/SERVICES.md',
        '/test/project/docs/ai-knowledge/DATA-FLOWS.md',
        '/test/project/docs/ai-knowledge/PATTERNS.md',
      ],
      timestamp: '2024-01-01T00:00:00Z',
    };

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
    expect(result.ai_knowledge_path).toBe('/test/project/docs/ai-knowledge');
    expect(result.ai_knowledge_files).toHaveLength(6);
  });

  it('should fail if wiki state is present but a core wiki file is missing', async () => {
    mockState.ai_knowledge_path = '/test/project/docs/ai-knowledge';
    mockState.phase4_wiki_generation = {
      ai_knowledge_written: true,
      files: [],
      timestamp: '2024-01-01T00:00:00Z',
    };
    vi.mocked(fs.existsSync).mockImplementation(
      (path: any) => !String(path).includes('PATTERNS.md'),
    );

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((error) => error.includes('docs/ai-knowledge/PATTERNS.md'))).toBe(
      true,
    );
  });

  it('should fail if CLAUDE.md path not set', async () => {
    mockState.claude_md_path = undefined;
    // Mock existsSync to return false for CLAUDE.md
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('CLAUDE.md'));

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('CLAUDE.md not found'))).toBe(true);
  });

  it('should fail if CLAUDE.md does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('CLAUDE.md'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('CLAUDE.md not found'))).toBe(true);
  });

  it('should warn if CLAUDE.md content is too short', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'short';
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, stack_profile: {} });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.warnings).toBeDefined();
    expect(result.warnings?.some((w) => w.includes('CLAUDE.md content seems too short'))).toBe(
      true,
    );
  });

  it('should fail if project-context/SKILL.md not found', async () => {
    mockState.project_context_path = undefined;
    // Mock existsSync to return false for SKILL.md
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('SKILL.md'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('project-context/SKILL.md not found'))).toBe(true);
  });

  it('should warn if SKILL.md content is too short', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'short';
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, stack_profile: {} });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.warnings).toBeDefined();
    expect(
      result.warnings?.some((w) => w.includes('project-context/SKILL.md content seems too short')),
    ).toBe(true);
  });

  it('should fail if framework-config.json not found', async () => {
    mockState.framework_config_path = undefined;
    // Mock existsSync to return false for framework-config.json
    vi.mocked(fs.existsSync).mockImplementation(
      (path: any) => !path.includes('framework-config.json'),
    );

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('framework-config.json not found'))).toBe(true);
  });

  it('should fail if framework-config.json has invalid JSON', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) return 'invalid json{';
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors?.some((e) => e.includes('invalid JSON'))).toBe(true);
  });

  it('should fail if framework-config.json missing version', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ project_metadata: {}, stack_profile: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('framework-config.json missing version'))).toBe(
      true,
    );
  });

  it('should fail if framework-config.json missing project_metadata', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', stack_profile: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(
      result.errors?.some((e) => e.includes('framework-config.json missing project_metadata')),
    ).toBe(true);
  });

  it('should fail if framework-config.json missing stack_profile', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(
      result.errors?.some((e) => e.includes('framework-config.json missing stack_profile')),
    ).toBe(true);
  });

  it('should fail if skills directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('.claude/skills'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Skills directory not found'))).toBe(true);
  });

  it('should fail if agents directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('.claude/agents'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Agents directory not found'))).toBe(true);
  });

  it('should fail if insufficient agents generated', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md'] as any);

    const result = await validationNode(mockState);

    expect(result.errors?.some((e) => e.includes('Insufficient agents'))).toBe(true);
  });

  it('should fail if planner agent not found', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['implementer.md', 'other.md'] as any);

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Planner agent not found'))).toBe(true);
  });

  it('should warn about missing implementers for significant languages', async () => {
    // Mock framework config with services array showing typescript and javascript
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({
          version: '2.0.0',
          project_metadata: {},
          stack_profile: {
            services: [
              { id: 'main', language: 'typescript', path: 'src', type: 'backend' },
              { id: 'web', language: 'javascript', path: 'web', type: 'frontend' },
            ],
            file_counts: {
              total: 70,
              by_language: {
                typescript: 50,
                javascript: 20,
              },
            },
          },
        });
      }
      return '';
    });
    // Only provide python implementer - should warn about missing typescript and javascript
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md', 'implementer-python.md'] as any);

    const result = await validationNode(mockState);

    expect(result.warnings?.some((w) => w.includes('Missing implementers'))).toBe(true);
  });

  it('should validate multi-stack coverage successfully', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'planner.md',
      'implementer-typescript.md',
      'implementer-javascript.md',
    ] as any);

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
  });

  it('should fail if commands directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !path.includes('.claude/commands'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Commands directory not found'))).toBe(true);
  });

  it('should fail if phase1 not completed', async () => {
    // Mock existsSync to return false for phase1 output files
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes('phase1-outputs')) return false;
      return true;
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 1 analysis'))).toBe(true);
  });

  it('should fail if phase2 missing', async () => {
    // Mock existsSync to return false for phase2 consolidation file
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes('phase2-consolidation.json')) return false;
      return true;
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 2 consolidation'))).toBe(true);
  });

  it('should fail if phase3 missing', async () => {
    // Mock existsSync to return false for phase3 synthesis file
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes('synthesis-raw.md')) return false;
      return true;
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 3 synthesis'))).toBe(true);
  });

  it('should fail if phase4 not complete', async () => {
    // Mock existsSync to return false for phase4 files (framework-config.json or CLAUDE.md)
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.includes('framework-config.json') && pathStr.includes('.claude')) return false;
      return true;
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 4 context generation'))).toBe(true);
  });

  it('should calculate total duration', async () => {
    const result = await validationNode(mockState);

    expect(result.total_duration_ms).toBeDefined();
    expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing started_at', async () => {
    mockState.started_at = undefined;

    const result = await validationNode(mockState);

    expect(result.total_duration_ms).toBeUndefined();
  });

  it('should preserve existing warnings', async () => {
    mockState.warnings = ['Previous warning'];

    const result = await validationNode(mockState);

    expect(result.warnings).toContain('Previous warning');
  });

  it('should handle validation errors gracefully', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('File system error');
    });

    const result = await validationNode(mockState);

    expect(result.errors?.some((e) => e.includes('Validation failed'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should filter only .md files in agents directory', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'planner.md',
      'test.txt',
      'implementer.md',
      'data.json',
    ] as any);

    const result = await validationNode(mockState);

    // Should only count .md files (2 agents)
    expect(result.current_phase).toBe('complete');
  });

  it('should filter only .md files in commands directory', async () => {
    vi.mocked(fs.readdirSync).mockImplementation((path: any) => {
      if (path.includes('agents')) return ['planner.md', 'implementer.md'] as any;
      if (path.includes('commands')) return ['implement.md', 'test.txt', 'review.md'] as any;
      return [] as any;
    });

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
  });

  it('should handle errors reading framework config for multi-stack validation', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        if (path.includes('validation')) throw new Error('Read error');
        return JSON.stringify({
          version: '2.0.0',
          project_metadata: {},
          analysis_results: {},
          stack_profile: {},
        });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    // Should still succeed, just with a warning
    expect(result.current_phase).toBe('complete');
  });
});
