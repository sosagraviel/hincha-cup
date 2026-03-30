import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataFlowsIntegrationsAnalyzerNode } from '../../../../../src/nodes/initialize-project/phase1/data-flows-integrations-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as agentFactory from '../../../../../src/utils/agent-factory.js';
import * as enhancedRetry from '../../../../../src/utils/enhanced-retry.js';

vi.mock('fs', () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../../../../src/utils/agent-factory.js', () => ({ createAgentFromMarkdown: vi.fn() }));
vi.mock('../../../../../src/utils/validator.js', () => ({ validateAndParseAgentOutput: vi.fn() }));
vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3 },
}));

describe('dataFlowsIntegrationsAnalyzerNode', () => {
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
          agent_name: 'data-flows-integrations-analyzer',
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

  it('should successfully analyze data flows', async () => {
    const result = await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
  });

  it('should use correct agent configuration', async () => {
    await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith({
      agentName: 'data-flows-integrations-analyzer',
      agentFile: '04-data-flows-integrations.md',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      additionalContext: '',
      timeout: 600000,
      useUltrathink: true,
    });
  });

  it('should write to correct output file', async () => {
    await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('04-data-flows-integrations.json'),
      expect.any(String)
    );
  });

  it('should handle errors', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('Test error'));
    const result = await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(result.errors).toContain('data-flows-integrations-analyzer: Test error');
  });

  it('should propagate SIGINT', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('interrupted by user'));
    await expect(dataFlowsIntegrationsAnalyzerNode(mockState)).rejects.toThrow();
  });
});
