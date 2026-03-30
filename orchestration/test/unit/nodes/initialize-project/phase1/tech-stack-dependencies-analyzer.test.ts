import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { techStackDependenciesAnalyzerNode } from '../../../../../src/nodes/initialize-project/phase1/tech-stack-dependencies-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as agentFactory from '../../../../../src/utils/agent-factory.js';
import * as validator from '../../../../../src/utils/validator.js';
import * as enhancedRetry from '../../../../../src/utils/enhanced-retry.js';

// Mock all dependencies
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
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

describe('techStackDependenciesAnalyzerNode', () => {
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

    vi.mocked(agentFactory.createAgentFromMarkdown).mockResolvedValue(mockAgent);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any) => {
        const { output } = await agentInvoke('');
        return JSON.parse(output);
      }
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
      { recursive: true }
    );
  });

  it('should use provided temp directory', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('/test/temp/phase1-outputs'),
      { recursive: true }
    );
  });

  it('should create agent with correct configuration', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith({
      agentName: 'tech-stack-dependencies-analyzer',
      agentFile: '02-tech-stack-dependencies.md',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      additionalContext: '',
      timeout: 600000,
      useUltrathink: true,
    });
  });

  it('should invoke agent with project path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(mockAgent.invoke).toHaveBeenCalledWith({
      input: 'Analyze the tech stack and dependencies at: /test/project',
    });
  });

  it('should write analysis output to correct file path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      expect.any(String)
    );
  });

  it('should write formatted JSON output', async () => {
    const mockData = {
      agent_name: 'tech-stack-dependencies-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: { test: 'data' },
    };

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockResolvedValue(mockData);

    await techStackDependenciesAnalyzerNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(mockData, null, 2)
    );
  });

  it('should use retryWithEnhancedFeedback for validation', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(enhancedRetry.retryWithEnhancedFeedback).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      enhancedRetry.DEFAULT_RETRY_CONFIG,
      expect.stringContaining('02-tech-stack-dependencies.json') // outputFilePath parameter
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
          return { agent_name: 'test', timestamp: '2024-01-01T00:00:00Z', findings: {} };
        }
      );

      const result = await techStackDependenciesAnalyzerNode(mockState);

      expect(result.temp_dir).toBeDefined();
    }
  });

  it('should handle errors and return error state', async () => {
    const testError = new Error('Analysis failed');
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(testError);

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.errors).toContain('tech-stack-dependencies-analyzer: Analysis failed');
    expect(result.current_phase).toBe('failed');
  });

  it('should propagate SIGINT errors', async () => {
    const sigintError = new Error('Process interrupted by user');
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(sigintError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow(
      'Process interrupted by user'
    );
  });

  it('should propagate errors with SIGINT in message', async () => {
    const sigintError = new Error('Received SIGINT signal');
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(sigintError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow(
      'Received SIGINT signal'
    );
  });

  it('should preserve existing errors when adding new error', async () => {
    const stateWithErrors = {
      ...mockState,
      errors: ['Previous error 1', 'Previous error 2'],
    };

    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(
      new Error('New error')
    );

    const result = await techStackDependenciesAnalyzerNode(stateWithErrors);

    expect(result.errors).toHaveLength(3);
    expect(result.errors).toContain('Previous error 1');
    expect(result.errors).toContain('Previous error 2');
    expect(result.errors?.[2]).toContain('New error');
  });

  it('should handle validation errors', async () => {
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockRejectedValue(
      new Error('Validation failed after retries')
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
    expect(mkdirCalls.some((call) => typeof call[1] === 'object' && call[1] !== null && 'recursive' in call[1] && call[1].recursive === true)).toBe(true);
  });

  it('should use correct agent file name', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        agentFile: '02-tech-stack-dependencies.md',
      })
    );
  });

  it('should use correct agent name', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'tech-stack-dependencies-analyzer',
      })
    );
  });

  it('should set 10 minute timeout', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 600000,
      })
    );
  });

  it('should handle empty agent output', async () => {
    mockAgent.invoke.mockResolvedValue({});

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any) => {
        const output = await agentInvoke('');
        return JSON.parse(JSON.stringify(output));
      }
    );

    const result = await techStackDependenciesAnalyzerNode(mockState);

    expect(result.temp_dir).toBeDefined();
  });

  it('should handle non-Error thrown values', async () => {
    // When a non-Error is thrown, the code will try to access .message which may be undefined
    // This will cause the SIGINT check to fail, but should still return error state
    const nonError = { toString: () => 'Non-standard error' };
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(nonError);

    await expect(techStackDependenciesAnalyzerNode(mockState)).rejects.toThrow();
  });

  it('should construct correct output file path', async () => {
    await techStackDependenciesAnalyzerNode(mockState);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeCall[0]).toContain('phase1-outputs');
    expect(writeCall[0]).toContain('02-tech-stack-dependencies.json');
  });
});
