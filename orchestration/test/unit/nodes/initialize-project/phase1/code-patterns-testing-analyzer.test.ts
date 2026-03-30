import { describe, it, expect, vi, beforeEach } from 'vitest';
import { codePatternsTestingAnalyzerNode } from '../../../../../src/nodes/initialize-project/phase1/code-patterns-testing-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as agentFactory from '../../../../../src/utils/agent-factory.js';
import * as enhancedRetry from '../../../../../src/utils/enhanced-retry.js';
import { logger } from '../../../../../src/utils/logger.js';

vi.mock('fs', () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn(), blank: vi.fn() },
}));
vi.mock('../../../../../src/utils/agent-factory.js', () => ({ createAgentFromMarkdown: vi.fn() }));
vi.mock('../../../../../src/utils/validator.js', () => ({ validateAndParseAgentOutput: vi.fn() }));
vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3 },
}));

describe('codePatternsTestingAnalyzerNode', () => {
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
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        }),
        sessionId: 'test-session-123',
      }),
    };
    vi.mocked(agentFactory.createAgentFromMarkdown).mockResolvedValue(mockAgent);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(async (agentInvoke: any) => {
      const { output } = await agentInvoke('');
      return JSON.parse(output);
    });
  });

  it('should successfully analyze code patterns', async () => {
    const result = await codePatternsTestingAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
  });

  it('should use correct agent configuration', async () => {
    await codePatternsTestingAnalyzerNode(mockState);
    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith({
      agentName: 'code-patterns-testing-analyzer',
      agentFile: '03-code-patterns-testing.md',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      additionalContext: '',
      timeout: 600000,
      useUltrathink: true,
    });
  });

  it('should write to correct output file', async () => {
    await codePatternsTestingAnalyzerNode(mockState);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('03-code-patterns-testing.json'),
      expect.any(String)
    );
  });

  it('should handle RATE_LIMIT errors with special logging', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('RATE_LIMIT exceeded'));
    const result = await codePatternsTestingAnalyzerNode(mockState);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RATE LIMIT'));
    expect(result.errors).toBeDefined();
  });

  it('should log errors', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('Test error'));
    await codePatternsTestingAnalyzerNode(mockState);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should propagate SIGINT', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('SIGINT'));
    await expect(codePatternsTestingAnalyzerNode(mockState)).rejects.toThrow();
  });
});
