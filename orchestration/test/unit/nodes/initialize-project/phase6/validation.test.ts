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
      phase3_synthesis: { synthesis_content: 'test', timestamp: '2024-01-01T00:00:00Z', validation_passed: true },
      phase4_context: { framework_config_generated: true, claude_md_written: true, project_context_written: true, timestamp: '2024-01-01T00:00:00Z' },
      errors: [],
      warnings: [],
      started_at: '2024-01-01T00:00:00Z',
    };

    // Mock successful validation scenario
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({
          version: '2.0.0',
          project_metadata: {},
          analysis_results: {},
          stack_profile: { file_counts: { '.ts': 50, '.js': 20 } },
        });
      }
      return '';
    });
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md', 'implementer-typescript.md', 'implement.md'] as any);
  });

  it('should validate successfully with all requirements met', async () => {
    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('complete');
    expect(result.completed_at).toBeDefined();
  });

  it('should fail if CLAUDE.md path not set', async () => {
    mockState.claude_md_path = undefined;

    const result = await validationNode(mockState);

    expect(result.current_phase).toBe('failed');
    expect(result.errors).toContain('CLAUDE.md not found');
  });

  it('should fail if CLAUDE.md does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) =>
      !path.includes('CLAUDE.md')
    );

    const result = await validationNode(mockState);

    expect(result.errors).toContain('CLAUDE.md not found');
  });

  it('should warn if CLAUDE.md content is too short', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'short';
      if (path.includes('SKILL.md')) return 'x'.repeat(200);
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, analysis_results: {}, stack_profile: {} });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.warnings).toContain('CLAUDE.md content seems too short');
  });

  it('should fail if project-context/SKILL.md not found', async () => {
    mockState.project_context_path = undefined;

    const result = await validationNode(mockState);

    expect(result.errors).toContain('project-context/SKILL.md not found');
  });

  it('should warn if SKILL.md content is too short', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('CLAUDE.md')) return 'x'.repeat(200);
      if (path.includes('SKILL.md')) return 'short';
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, analysis_results: {}, stack_profile: {} });
      }
      return '';
    });

    const result = await validationNode(mockState);

    expect(result.warnings).toContain('project-context/SKILL.md content seems too short');
  });

  it('should fail if framework-config.json not found', async () => {
    mockState.framework_config_path = undefined;

    const result = await validationNode(mockState);

    expect(result.errors).toContain('framework-config.json not found');
  });

  it('should fail if framework-config.json has invalid JSON', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) return 'invalid json{';
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors?.some(e => e.includes('invalid JSON'))).toBe(true);
  });

  it('should fail if framework-config.json missing version', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ project_metadata: {}, analysis_results: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toContain('framework-config.json missing version');
  });

  it('should fail if framework-config.json missing project_metadata', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', analysis_results: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toContain('framework-config.json missing project_metadata');
  });

  it('should fail if framework-config.json missing analysis_results', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ version: '2.0.0', project_metadata: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    expect(result.errors).toContain('framework-config.json missing analysis_results');
  });

  it('should fail if skills directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) =>
      !path.includes('.claude/skills')
    );

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Skills directory not found');
  });

  it('should fail if agents directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) =>
      !path.includes('.claude/agents')
    );

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Agents directory not found');
  });

  it('should fail if insufficient agents generated', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md'] as any);

    const result = await validationNode(mockState);

    expect(result.errors?.some(e => e.includes('Insufficient agents'))).toBe(true);
  });

  it('should fail if planner agent not found', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['implementer.md', 'other.md'] as any);

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Planner agent not found');
  });

  it('should warn about missing implementers for significant languages', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md', 'implementer-python.md'] as any);

    const result = await validationNode(mockState);

    expect(result.warnings?.some(w => w.includes('Missing implementers'))).toBe(true);
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
    vi.mocked(fs.existsSync).mockImplementation((path: any) =>
      !path.includes('.claude/commands')
    );

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Commands directory not found');
  });

  it('should fail if phase1 not completed', async () => {
    mockState.phase1_analysis = { all_completed: false };

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Phase 1 analysis not marked as complete');
  });

  it('should fail if phase2 missing', async () => {
    mockState.phase2_consolidation = undefined;

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Phase 2 consolidation missing');
  });

  it('should fail if phase3 missing', async () => {
    mockState.phase3_synthesis = undefined;

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Phase 3 synthesis missing');
  });

  it('should fail if phase4 not complete', async () => {
    mockState.phase4_context = { framework_config_generated: false, claude_md_written: true, project_context_written: true, timestamp: '2024-01-01T00:00:00Z' };

    const result = await validationNode(mockState);

    expect(result.errors).toContain('Phase 4 context generation not complete');
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

    expect(result.errors?.some(e => e.includes('Validation failed'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should filter only .md files in agents directory', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['planner.md', 'test.txt', 'implementer.md', 'data.json'] as any);

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
        return JSON.stringify({ version: '2.0.0', project_metadata: {}, analysis_results: {}, stack_profile: {} });
      }
      return 'x'.repeat(200);
    });

    const result = await validationNode(mockState);

    // Should still succeed, just with a warning
    expect(result.current_phase).toBe('complete');
  });
});
