import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consolidationNode } from '../../../../../src/nodes/initialize-project/phase2/consolidation.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as consolidationUtil from '../../../../../src/utils/consolidation.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    stopAllSpinners: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('../../../../../src/utils/consolidation.js', () => ({
  consolidateAnalyses: vi.fn(),
}));

vi.mock('../../../../../src/utils/agent-factory.js', () => ({
  createAgentFromMarkdown: vi.fn(),
}));

vi.mock('../../../../../src/utils/validator.js', () => ({
  extractJSON: vi.fn(),
}));

vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3 },
}));

describe('consolidationNode', () => {
  let mockState: InitializeProjectState;

  const mockPhase1Files = {
    '01-structure-architecture.json': JSON.stringify({
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: { languages: ['typescript'] },
    }),
    '02-tech-stack-dependencies.json': JSON.stringify({
      agent_name: 'tech-stack-dependencies-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: { dependencies: {} },
    }),
    '03-code-patterns-testing.json': JSON.stringify({
      agent_name: 'code-patterns-testing-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {},
    }),
    '04-data-flows-integrations.json': JSON.stringify({
      agent_name: 'data-flows-integrations-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {},
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase1_analysis',
      temp_dir: '/test/temp',
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    // Mock successful scenario
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      const filename = path.split('/').pop() as string;
      if (mockPhase1Files[filename as keyof typeof mockPhase1Files]) {
        return mockPhase1Files[filename as keyof typeof mockPhase1Files];
      }
      if (path.includes('phase2-consolidation.json')) {
        return JSON.stringify({
          consolidated_findings: {},
          identified_gaps: [],
          conflicting_findings: [],
        });
      }
      return '';
    });

    vi.mocked(consolidationUtil.consolidateAnalyses).mockReturnValue({
      consolidated_findings: { test: 'data' },
      identified_gaps: [],
      conflicting_findings: [],
      consolidation_summary: {
        total_analyzers: 4,
        merged_fields: 10,
        timestamp: '2024-01-01T00:00:00Z',
      },
    } as any);
  });

  it('should throw if phase1 outputs directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('phase1-outputs')) return false;
      return true;
    });

    await expect(consolidationNode(mockState)).rejects.toThrow(
      'Phase 1 outputs directory not found'
    );
  });

  it('should throw if a phase1 output file is missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('01-structure-architecture.json')) return false;
      return true;
    });

    await expect(consolidationNode(mockState)).rejects.toThrow(
      'Phase 1 output file not found'
    );
  });

  it('should load all 4 phase1 files', async () => {
    await consolidationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      'utf-8'
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      'utf-8'
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('03-code-patterns-testing.json'),
      'utf-8'
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('04-data-flows-integrations.json'),
      'utf-8'
    );
  });

  it('should call consolidateAnalyses with all phase1 outputs', async () => {
    await consolidationNode(mockState);

    expect(consolidationUtil.consolidateAnalyses).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ agent_name: 'structure-architecture-analyzer' }),
        expect.objectContaining({ agent_name: 'tech-stack-dependencies-analyzer' }),
        expect.objectContaining({ agent_name: 'code-patterns-testing-analyzer' }),
        expect.objectContaining({ agent_name: 'data-flows-integrations-analyzer' }),
      ])
    );
  });

  it('should write consolidation to disk', async () => {
    await consolidationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('phase2-consolidation.json'),
      expect.any(String)
    );
  });

  it('should handle no gaps scenario', async () => {
    const result = await consolidationNode(mockState);

    expect(result.phase2_consolidation).toBeDefined();
    expect(result.current_phase).toBe('phase2_consolidation');
  });

  it('should use default temp_dir if not provided', async () => {
    mockState.temp_dir = undefined;

    await consolidationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/phase1-outputs'),
      'utf-8'
    );
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(consolidationUtil.consolidateAnalyses).mockImplementation(() => {
      throw new Error('Consolidation failed');
    });

    const result = await consolidationNode(mockState);

    expect(result.errors?.some(e => e.includes('Consolidation failed'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should set phase2_consolidation in result', async () => {
    const result = await consolidationNode(mockState);

    expect(result.phase2_consolidation).toEqual(expect.objectContaining({
      consolidated_findings: expect.any(Object),
      timestamp: expect.any(String),
    }));
  });

  it('should set current_phase to phase2_consolidation', async () => {
    const result = await consolidationNode(mockState);

    expect(result.current_phase).toBe('phase2_consolidation');
  });

  it('should preserve existing errors', async () => {
    mockState.errors = ['Previous error'];
    vi.mocked(consolidationUtil.consolidateAnalyses).mockImplementation(() => {
      throw new Error('New error');
    });

    const result = await consolidationNode(mockState);

    expect(result.errors).toContain('Previous error');
  });
});
