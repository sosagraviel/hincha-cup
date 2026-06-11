import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validationNode } from '../../../../../src/nodes/initialize-project/phase6/validation.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as mcpConfigService from '../../../../../src/services/framework/mcp-config.service.js';

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

vi.mock('../../../../../src/services/framework/mcp-config.service.js', () => ({
  validateCodeGraphMcpConfig: vi.fn(),
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
      code_conventions_path: '/test/project/.claude/skills/code-conventions/SKILL.md',
      multi_file_workflows_path: '/test/project/.claude/skills/multi-file-workflows/SKILL.md',
      testing_conventions_path: '/test/project/.claude/skills/testing-conventions/SKILL.md',
      architectural_narrative_path: '/test/temp/architectural-narrative.md',
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
        conventions_skills_written: true,
        architectural_narrative_written: true,
        timestamp: '2024-01-01T00:00:00Z',
      },
      errors: [],
      warnings: [],
      started_at: '2024-01-01T00:00:00Z',
    };

    // Mock successful validation scenario
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('docs/llm-wiki/wiki/services/main.md')) {
        return [
          '---',
          'document_type: service',
          'summary: Main backend service',
          'last_updated: 2026-05-12T00:00:00.000Z',
          'service_id: main',
          '---',
          '# Main Service',
        ].join('\n');
      }
      if (path.includes('docs/llm-wiki')) {
        return [
          '---',
          'document_type: architecture',
          'summary: Project architecture',
          'last_updated: 2026-05-12T00:00:00.000Z',
          '---',
          '# Wiki Document',
        ].join('\n');
      }
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
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

    vi.mocked(mcpConfigService.validateCodeGraphMcpConfig).mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    });
  });

  it('should validate successfully with all requirements met', async () => {
    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
    expect(result.completed_at).toBeDefined();
  });

  it('should validate wiki files when wiki state is present', async () => {
    mockState.llm_wiki_path = '/test/project/docs/llm-wiki';
    mockState.phase4_wiki_generation = {
      llm_wiki_written: true,
      files: [
        '/test/project/docs/llm-wiki/wiki/index.md',
        '/test/project/docs/llm-wiki/wiki/ARCHITECTURE.md',
        '/test/project/docs/llm-wiki/wiki/SERVICES.md',
      ],
      timestamp: '2024-01-01T00:00:00Z',
    };

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
    expect(result.llm_wiki_path).toBe('/test/project/docs/llm-wiki');
    // After H4 the cross-cutting wiki shrank to: index.md + ARCHITECTURE.md
    // + SERVICES.md (catalog) + per-service docs (none in this fixture).
    expect(result.llm_wiki_files).toHaveLength(4);
  });

  it('should fail if wiki state is present but a core wiki file is missing', async () => {
    mockState.llm_wiki_path = '/test/project/docs/llm-wiki';
    mockState.phase4_wiki_generation = {
      llm_wiki_written: true,
      files: [],
      timestamp: '2024-01-01T00:00:00Z',
    };
    vi.mocked(fs.existsSync).mockImplementation(
      (path: any) => !String(path).includes('ARCHITECTURE.md'),
    );

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(
      result.errors?.some((error) => error.includes('docs/llm-wiki/wiki/ARCHITECTURE.md')),
    ).toBe(true);
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
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
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

  it('should fail if any of the three convention skills is missing', async () => {
    mockState.code_conventions_path = undefined;
    mockState.multi_file_workflows_path = undefined;
    mockState.testing_conventions_path = undefined;
    // Mock existsSync to return false for any SKILL.md path
    vi.mocked(fs.existsSync).mockImplementation((path: any) => !String(path).includes('SKILL.md'));

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    // At least one of the three convention skills must be reported missing.
    expect(
      result.errors?.some((e) =>
        /code-conventions\/SKILL\.md not found|multi-file-workflows\/SKILL\.md not found|testing-conventions\/SKILL\.md not found/.test(
          e,
        ),
      ),
    ).toBe(true);
  });

  it('should warn if a convention-skill SKILL.md is too short', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'short';
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, stack_profile: {} });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.warnings).toBeDefined();
    // Each of the three convention skills validates short-content separately;
    // any of the three reporting "content seems too short" satisfies the contract.
    expect(
      result.warnings?.some((w) =>
        /code-conventions\/SKILL\.md content seems too short|multi-file-workflows\/SKILL\.md content seems too short|testing-conventions\/SKILL\.md content seems too short/.test(
          w,
        ),
      ),
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
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      if (path.includes('framework-config.json')) return 'invalid json{';
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors?.some((e) => e.includes('invalid JSON'))).toBe(true);
  });

  it('should fail if framework-config.json missing version', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ stack_profile: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('framework-config.json missing version'))).toBe(
      true,
    );
  });

  it('should fail if framework-config.json missing stack_profile', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0' });
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
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
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

  it('should fail if generated planner or implementer agents are not graph-aware', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('.claude/agents/planner.md')) return 'tools: Read, Grep, Glob';
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({
          version: '2.0.0',
          project_metadata: {},
          stack_profile: {
            services: [{ id: 'main', language: 'typescript', path: 'src', type: 'backend' }],
          },
        });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((e) => e.includes('planner.md missing mcp__code_graph'))).toBe(true);
  });

  it('should fail if code graph MCP config is missing', async () => {
    vi.mocked(mcpConfigService.validateCodeGraphMcpConfig).mockReturnValue({
      valid: false,
      errors: ['Project MCP config not found: .mcp.json'],
      warnings: [],
    });

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((e) => e.includes('Project MCP config not found'))).toBe(true);
  });

  it('should fail if code graph MCP config is invalid', async () => {
    vi.mocked(mcpConfigService.validateCodeGraphMcpConfig).mockReturnValue({
      valid: false,
      errors: ['Project MCP config .mcp.json is missing mcpServers.code_graph'],
      warnings: [],
    });

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors?.some((e) => e.includes('mcpServers.code_graph'))).toBe(true);
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

  it('returns only validation-node-derived warnings; the reducer concatenates with prior state', async () => {
    // Phase E: nodes return only their NEW entries — the LangGraph reducer
    // (`(left, right) => [...left, ...right]`) handles the merge. The
    // pre-Phase-E spread duplicated prior warnings every time a node ran.
    mockState.warnings = ['Previous warning'];

    const result = await validationNode(mockState);

    // The returned `warnings` is the validation-node's own contribution
    // (possibly empty when nothing flagged) — NOT a union with state.warnings.
    if (Array.isArray(result.warnings)) {
      expect(result.warnings).not.toContain('Previous warning');
    }
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

  it('should handle errors reading framework config for multi-stack validation', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('.claude/agents')) return 'tools: Read, Grep, Glob, mcp__code_graph';
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
