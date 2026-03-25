import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { structureArchitectureAnalyzerNode } from '../../../../../src/nodes/initialize-project/phase1/structure-architecture-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as agentFactory from '../../../../../src/utils/agent-factory.js';
import * as enhancedRetry from '../../../../../src/utils/enhanced-retry.js';

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../../../src/utils/agent-factory.js', () => ({
  createAgentFromMarkdown: vi.fn(),
}));

vi.mock('../../../../../src/utils/validator.js', () => ({
  validateAndParseAgentOutput: vi.fn(),
}));

vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3, timeout: 600000 },
}));

describe('structureArchitectureAnalyzerNode', () => {
  let mockState: InitializeProjectState;
  let mockAgent: any;

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
    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { structure: 'monorepo' },
        }),
      }),
    };
    vi.mocked(agentFactory.createAgentFromMarkdown).mockResolvedValue(mockAgent);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any) => {
        const output = await agentInvoke('');
        return JSON.parse(output);
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully analyze structure', async () => {
    const result = await structureArchitectureAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should use correct agent configuration', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith({
      agentName: 'structure-architecture-analyzer',
      agentFile: '01-structure-architecture.md',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      additionalContext: '',
      timeout: 600000,
      useUltrathink: true,
    });
  });

  it('should write to correct output file', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      expect.any(String)
    );
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('Test error'));
    const result = await structureArchitectureAnalyzerNode(mockState);
    expect(result.errors).toContain('structure-architecture-analyzer: Test error');
    expect(result.current_phase).toBe('failed');
  });

  it('should propagate SIGINT errors', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('SIGINT received'));
    await expect(structureArchitectureAnalyzerNode(mockState)).rejects.toThrow('SIGINT received');
  });

  it('should invoke agent with correct input', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(mockAgent.invoke).toHaveBeenCalledWith({
      input: 'Analyze the project structure and architecture at: /test/project',
    });
  });
});
