import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataFlowsIntegrationsAnalyzerNode } from '../../../../../../src/nodes/initialize-project/phase1/data-flows-analyzer/data-flows-integrations-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import { AgentFactory } from '../../../../../../src/utils/shared/agent-factory/index.js';
import * as enhancedRetry from '../../../../../../src/utils/enhanced-retry.js';

vi.mock('fs', () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn() }));
vi.mock('../../../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../../../../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: { create: vi.fn() },
}));
vi.mock('../../../../../../src/utils/validator.js', () => ({
  validateAndParseAgentOutput: vi.fn(),
}));
vi.mock('../../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3 },
}));

describe('dataFlowsIntegrationsAnalyzerNode', () => {
  let mockState: InitializeProjectState;
  let mockAgent: any;
  let mockFactory: any;

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
    mockFactory = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any) => {
        const { output } = await agentInvoke('');
        return JSON.parse(output);
      },
    );
  });

  it('should successfully analyze data flows', async () => {
    const result = await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
  });

  it('should use correct agent configuration', async () => {
    await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(mockFactory.createAgent).toHaveBeenCalledWith({
      agentName: 'data-flows-integrations-analyzer',
      agentFilePath: expect.stringContaining('data-flows-analyzer/prompts/agent.md'),
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      timeout: 1800000,
      resumeSessionId: undefined,
      settingsPath: expect.stringContaining('data-flows-analyzer/settings.json'),
    });
  });

  it('should write to correct output file', async () => {
    await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('04-data-flows-integrations.json'),
      expect.any(String),
    );
  });

  it('should handle errors', async () => {
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('Test error'));
    const result = await dataFlowsIntegrationsAnalyzerNode(mockState);
    expect(result.errors).toContain('data-flows-integrations-analyzer: Test error');
  });

  it('should propagate SIGINT', async () => {
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('interrupted by user'));
    await expect(dataFlowsIntegrationsAnalyzerNode(mockState)).rejects.toThrow();
  });
});
