import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { structureArchitectureAnalyzerNode } from '../../../../../../src/nodes/initialize-project/phase1/structure-analyzer/structure-architecture-analyzer.node.js';
import type { InitializeProjectState } from '../../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import { AgentFactory } from '../../../../../../src/utils/shared/agent-factory/index.js';
import * as enhancedRetry from '../../../../../../src/utils/enhanced-retry.js';

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

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
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3, timeout: 600000 },
}));

describe('structureArchitectureAnalyzerNode', () => {
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
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { structure: 'monorepo' },
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

  it('should successfully analyze structure', async () => {
    const result = await structureArchitectureAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should use correct agent configuration', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(mockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'structure-architecture-analyzer',
        agentFilePath: expect.stringContaining('structure-analyzer/prompts/agent.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 1800000,
        resumeSessionId: undefined,
        settingsPath: expect.stringContaining('structure-analyzer/settings.json'),
        phase: expect.objectContaining({
          phaseId: 'phase-1-discovery',
          phaseNumber: 1,
        }),
      }),
    );
  });

  it('should write to correct output file', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      expect.any(String),
    );
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('Test error'));
    const result = await structureArchitectureAnalyzerNode(mockState);
    expect(result.errors).toContain('structure-architecture-analyzer: Test error');
    expect(result.current_phase).toBe('failed');
  });

  it('should propagate SIGINT errors', async () => {
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('SIGINT received'));
    await expect(structureArchitectureAnalyzerNode(mockState)).rejects.toThrow('SIGINT received');
  });

  it('should invoke agent with correct input', async () => {
    await structureArchitectureAnalyzerNode(mockState);
    expect(mockAgent.invoke).toHaveBeenCalledWith({
      inputPrompt: expect.stringContaining('/test/project'),
    });
  });

  it('should handle agent output with automation data', async () => {
    const mockOutputWithAutomation = {
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {
        services: [
          {
            id: 'backend',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'NestJS' },
          },
        ],
        automation: {
          makefiles: [
            {
              path: 'Makefile',
              targets: ['build', 'test', 'deploy'],
            },
          ],
          shell_scripts: [
            {
              path: 'scripts/setup.sh',
              name: 'setup.sh',
              purpose: 'Project setup script',
            },
          ],
        },
      },
    };

    mockAgent.invoke.mockResolvedValue({
      output: JSON.stringify(mockOutputWithAutomation),
      sessionId: 'test-session-123',
    });

    const result = await structureArchitectureAnalyzerNode(mockState);
    expect(result.temp_dir).toBeDefined();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      expect.stringContaining('automation'),
    );
  });
});
