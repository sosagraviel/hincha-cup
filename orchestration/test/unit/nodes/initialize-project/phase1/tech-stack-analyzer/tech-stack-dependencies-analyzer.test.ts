import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { techStackDependenciesAnalyzerNode } from '../../../../../../src/nodes/initialize-project/phase1/tech-stack-analyzer/tech-stack-dependencies-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import { AgentFactory } from '../../../../../../src/utils/shared/agent-factory/index.js';
import * as validator from '../../../../../../src/utils/validator.js';
import * as enhancedRetry from '../../../../../../src/utils/enhanced-retry.js';

// Mock all dependencies
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../../../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: { create: vi.fn() },
}));

vi.mock('../../../../../../src/utils/validator.js', () => ({
  validateAndParseAgentOutput: vi.fn(),
}));

vi.mock('../../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3, timeout: 600000 },
}));

describe('techStackDependenciesAnalyzerNode', () => {
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
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['typescript', 'javascript'],
            dependencies: ['react', 'express'],
          },
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
        return { data: JSON.parse(output), sessionId: undefined };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully analyze tech stack', async () => {
    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.temp_dir).toBeDefined();
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should create temp directory if not provided', async () => {
    const stateWithoutTemp = { ...mockState, temp_dir: undefined };

    await techStackDependenciesAnalyzerNode(stateWithoutTemp);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/phase1-outputs'),
      { recursive: true },
    );
  });

  it('should use provided temp directory', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('/test/temp/phase1-outputs'),
      { recursive: true },
    );
  });

  it('should create agent with correct configuration', async () => {
    await techStackDependenciesAnalyzerNode(mockState);
    expect(mockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'tech-stack-dependencies-analyzer',
        agentFilePath: expect.stringContaining('tech-stack-analyzer/prompts/agent.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 1800000,
        resumeSessionId: undefined,
        settingsPath: expect.stringContaining('tech-stack-analyzer/settings.json'),
        phase: expect.objectContaining({
          phaseId: 'phase-1-discovery',
          phaseNumber: 1,
        }),
      }),
    );
  });

  it('should invoke agent with project path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(mockAgent.invoke).toHaveBeenCalledWith({
      inputPrompt: expect.stringContaining('/test/project'),
    });
  });

  it('should write analysis output to correct file path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      expect.any(String),
    );
  });

  it('should write formatted JSON output', async () => {
    const mockData = {
      agent_name: 'tech-stack-dependencies-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: { test: 'data' },
    };

    // The node now expects { data, sessionId } from retryWithEnhancedFeedback
    // and overwrites graph_queries_used from the Stop hook's sidecar before
    // persisting. With sessionId=undefined the helper forces graph_queries_used=[].
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockResolvedValue({
      data: mockData,
      sessionId: undefined,
    });

    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(
        {
          ...mockData,
          graph_queries_used: [],
          graph_overflow_count: 0,
          graph_overflow_tools: [],
          soft_warning: [],
        },
        null,
        2,
      ),
    );
  });

  it('should use retryWithEnhancedFeedback for validation', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(enhancedRetry.retryWithEnhancedFeedback).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      enhancedRetry.DEFAULT_RETRY_CONFIG,
      expect.objectContaining({ agentName: 'tech-stack-dependencies-analyzer' }),
    );
  });

  it('should handle agent output variations', async () => {
    const variations = [
      { output: 'test output' },
      { content: 'test content' },
      { someField: 'test' },
    ];

    for (const variation of variations) {
      vi.clearAllMocks();
      mockAgent.invoke.mockResolvedValue(variation);
      vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
        async (agentInvoke: any) => {
          await agentInvoke('');
          return {
            data: { agent_name: 'test', timestamp: '2024-01-01T00:00:00Z', findings: {} },
            sessionId: undefined,
          };
        },
      );

      const result = await techStackDependenciesAnalyzerNode(mockState);

      expect(result.temp_dir).toBeDefined();
    }
  });

  it('should handle errors and return error state', async () => {
    const testError = new Error('Analysis failed');
    vi.mocked(AgentFactory.create).mockRejectedValue(testError);

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.errors).toContain('tech-stack-dependencies-analyzer: Analysis failed');
    expect(result.current_phase).toBe('failed');
  });

  it('should propagate SIGINT errors', async () => {
    const sigintError = new Error('Process interrupted by user');
    vi.mocked(AgentFactory.create).mockRejectedValue(sigintError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow(
      'Process interrupted by user',
    );
  });

  it('should propagate errors with SIGINT in message', async () => {
    const sigintError = new Error('Received SIGINT signal');
    vi.mocked(AgentFactory.create).mockRejectedValue(sigintError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow(
      'Received SIGINT signal',
    );
  });

  it('returns only the new error; the LangGraph reducer merges with existing state.errors', async () => {
    // Phase E: nodes return only NEW entries. The LangGraph annotation
    // reducer (`(left, right) => [...left, ...right]`) concatenates.
    const stateWithErrors = {
      ...mockState,
      errors: ['Previous error 1', 'Previous error 2'],
    };

    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('New error'));

    const result = await techStackDependenciesAnalyzerNode(stateWithErrors);

    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain('New error');
  });

  it('should handle validation errors', async () => {
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockRejectedValue(
      new Error('Validation failed after retries'),
    );

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe('failed');
  });

  it('should return temp_dir in successful result', async () => {
    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result).toHaveProperty('temp_dir');
    expect(result.temp_dir).toContain('/test/temp');
  });

  it('should handle agent invoke throwing error', async () => {
    mockAgent.invoke.mockRejectedValue(new Error('Agent invocation failed'));

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe('failed');
  });

  it('should create recursive directory structure', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    const mkdirCalls = vi.mocked(fs.mkdirSync).mock.calls;
    expect(
      mkdirCalls.some(
        (call) =>
          typeof call[1] === 'object' &&
          call[1] !== null &&
          'recursive' in call[1] &&
          call[1].recursive === true,
      ),
    ).toBe(true);
  });

  it('should use correct agent file name', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(mockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentFilePath: expect.stringContaining('tech-stack-analyzer/prompts/agent.md'),
      }),
    );
  });

  it('should use correct agent name', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(mockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'tech-stack-dependencies-analyzer',
      }),
    );
  });

  it('should set 30 minute timeout', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(mockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 1800000,
      }),
    );
  });

  it('should handle empty agent output', async () => {
    mockAgent.invoke.mockResolvedValue({});

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any) => {
        const output = await agentInvoke('');
        return { data: JSON.parse(JSON.stringify(output)), sessionId: undefined };
      },
    );

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.temp_dir).toBeDefined();
  });

  it('should handle non-Error thrown values', async () => {
    // When a non-Error is thrown, the code will try to access .message which may be undefined
    // This will cause the SIGINT check to fail, but should still return error state
    const nonError = { toString: () => 'Non-standard error' };
    vi.mocked(AgentFactory.create).mockRejectedValue(nonError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow();
  });

  it('should construct correct output file path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeCall[0]).toContain('phase1-outputs');
    expect(writeCall[0]).toContain('02-tech-stack-dependencies.json');
  });

  it('should handle agent output with documented commands data', async () => {
    const mockOutputWithCommands = {
      agent_name: 'tech-stack-dependencies-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {
        dependencies: {
          by_service: {
            backend: {
              production: ['express', 'mongoose'],
              development: ['jest', 'nodemon'],
            },
          },
        },
        documented_commands: {
          by_task: {
            dev: 'npm run dev',
            test: 'npm test',
            build: 'npm run build',
            lint: 'npm run lint',
          },
          source: 'documented',
          conflicts: [
            {
              task: 'test',
              documented: 'npm test',
              discovered: 'jest',
            },
          ],
        },
      },
    };

    mockAgent.invoke.mockResolvedValue({
      output: JSON.stringify(mockOutputWithCommands),
      sessionId: 'test-session-123',
    });

    const result = await techStackDependenciesAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      expect.stringContaining('documented_commands'),
    );
  });
});
