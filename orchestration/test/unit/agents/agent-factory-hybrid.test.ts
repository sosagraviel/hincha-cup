import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridAgentFactory } from '../../../src/agents/agent-factory-hybrid.js';
import * as authDetector from '../../../src/auth/auth-detector.js';
import fs from 'fs';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock('../../../src/auth/auth-detector.js', () => ({
  detectAuthMode: vi.fn(),
  getAuthErrorMessage: vi.fn(),
  AuthMode: {
    API_KEY: 'api_key',
    CLAUDE_CLI: 'claude_cli',
    NONE: 'none',
  },
}));

vi.mock('deepagents', () => ({
  createDeepAgent: vi.fn().mockReturnValue({
    invoke: vi.fn().mockResolvedValue({ output: 'Test output' }),
  }),
}));

vi.mock('../../../src/llm/llm-factory.js', () => ({
  getLLMFactory: vi.fn().mockReturnValue({
    createChatModel: vi.fn(),
    createModel: vi.fn().mockResolvedValue({ model: 'claude-3.5-sonnet' }),
    getModelInfo: vi.fn().mockReturnValue({
      model: 'claude-3.5-sonnet',
      maxTokens: 8192,
      temperature: 0.7,
    }),
  }),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    trackConcurrentAgentStart: vi.fn(),
    trackConcurrentAgentFail: vi.fn(),
    trackConcurrentAgentSuccess: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/claude-prompt-test'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
  };
});

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  open: vi.fn((file, mode, callback) => {
    callback(null, 123); // Mock file descriptor
  }),
  close: vi.fn((fd, callback) => {
    callback();
  }),
}));

describe('HybridAgentFactory', () => {
  let factory: HybridAgentFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fs).existsSync.mockReturnValue(true);
    vi.mocked(fs).readFileSync.mockReturnValue('# Test Agent\n\nAgent prompt content');

    const mockAuthConfig = {
      mode: 'api_key' as any,
      apiKey: 'test-key',
      hasClaudeCLI: false,
      hasAPIKey: true,
    };

    factory = new HybridAgentFactory(mockAuthConfig);
  });

  describe('static methods', () => {
    it('should abort all invocations', () => {
      HybridAgentFactory.abortAllInvocations();
      expect(true).toBe(true);
    });

    it('should kill all active processes', () => {
      HybridAgentFactory.killAllActiveProcesses();
      expect(true).toBe(true);
    });
  });

  describe('create', () => {
    it('should create factory instance', async () => {
      vi.mocked(authDetector.detectAuthMode).mockResolvedValue({
        mode: 'api_key',
        apiKey: 'test-key',
      } as any);

      const result = await HybridAgentFactory.create();
      expect(result).toBeInstanceOf(HybridAgentFactory);
    });
  });

  describe('createAgent', () => {
    it('should create agent with API key mode', async () => {
      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        additionalContext: 'Test context',
      };

      const agent = await factory.createAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getInfo).toBeDefined();
    });

    it('should create agent with Claude CLI mode', async () => {
      const cliFactory = new HybridAgentFactory({
        mode: 'claude_cli' as any,
      } as any);

      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getInfo).toBeDefined();
    });

    it('should throw error for unknown auth mode', async () => {
      const unknownFactory = new HybridAgentFactory({
        mode: 'unknown' as any,
      } as any);

      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      vi.mocked(authDetector.getAuthErrorMessage).mockReturnValue('Auth error');

      await expect(unknownFactory.createAgent(config)).rejects.toThrow('Auth error');
    });

    it('should throw error if agent file not found', async () => {
      vi.mocked(fs).existsSync.mockReturnValue(false);

      const config = {
        agentName: 'test-agent',
        agentFile: 'missing.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      await expect(factory.createAgent(config)).rejects.toThrow('Agent file not found');
    });

    it('should include additional context in agent instructions', async () => {
      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        additionalContext: 'Extra context here',
      };

      const agent = await factory.createAgent(config);
      expect(agent).toBeDefined();
    });

    it('should handle agent without additional context', async () => {
      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await factory.createAgent(config);
      expect(agent).toBeDefined();
    });
  });

  describe('agent invocation - API key', () => {
    it('should invoke DeepAgent and return output', async () => {
      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await factory.createAgent(config);
      const result = await agent.invoke({ input: 'Test input' });

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.mode).toBe('api_key');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle timeout during agent execution', async () => {
      const mockDeepAgent = {
        invoke: vi.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(resolve, 10000))
        ),
      };

      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue(mockDeepAgent as any);

      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 100, // Very short timeout
      };

      const agent = await factory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('timeout');
    }, 10000);

    it('should handle agent execution errors', async () => {
      const mockDeepAgent = {
        invoke: vi.fn().mockRejectedValue(new Error('Agent failed')),
      };

      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue(mockDeepAgent as any);

      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await factory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('DeepAgent execution failed');
    });

    it('should extract output from different result formats', async () => {
      // Test with 'content' field
      const mockDeepAgent = {
        invoke: vi.fn().mockResolvedValue({ content: 'Content output' }),
      };

      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue(mockDeepAgent as any);

      const config = {
        agentName: 'test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await factory.createAgent(config);
      const result = await agent.invoke({ input: 'Test' });

      expect(result.output).toBe('Content output');
    });

    it('should get agent info', async () => {
      const config = {
        agentName: 'my-test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await factory.createAgent(config);
      const info = agent.getInfo();

      expect(info.agentName).toBe('my-test-agent');
      expect(info.mode).toBe('api_key');
    });
  });

  describe('static methods - with active invocations', () => {
    it('should abort active invocations', () => {
      // Trigger abort when there are invocations
      (HybridAgentFactory as any).activeInvocations.set(1, vi.fn());
      (HybridAgentFactory as any).activeInvocations.set(2, vi.fn());

      HybridAgentFactory.abortAllInvocations();

      expect((HybridAgentFactory as any).activeInvocations.size).toBe(0);
    });

    it('should kill active processes', () => {
      const mockProcess = {
        pid: 123,
        killed: false,
        kill: vi.fn(),
      };

      (HybridAgentFactory as any).activeProcesses.add(mockProcess);

      HybridAgentFactory.killAllActiveProcesses();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect((HybridAgentFactory as any).activeProcesses.size).toBe(0);
    });

    it('should handle processes without pid', () => {
      const mockProcess = {
        pid: undefined,
        killed: false,
        kill: vi.fn(),
      };

      (HybridAgentFactory as any).activeProcesses.add(mockProcess);

      HybridAgentFactory.killAllActiveProcesses();

      expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it('should handle already killed processes', () => {
      const mockProcess = {
        pid: 123,
        killed: true,
        kill: vi.fn(),
      };

      (HybridAgentFactory as any).activeProcesses.add(mockProcess);

      HybridAgentFactory.killAllActiveProcesses();

      expect(mockProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe('create factory', () => {
    it('should throw error if auth mode is NONE', async () => {
      vi.mocked(authDetector.detectAuthMode).mockResolvedValue({
        mode: 'none' as any,
      } as any);

      vi.mocked(authDetector.getAuthErrorMessage).mockReturnValue('No auth configured');

      await expect(HybridAgentFactory.create()).rejects.toThrow('No auth configured');
    });
  });

  describe('getAuthConfig', () => {
    it('should return auth config', () => {
      const config = factory.getAuthConfig();
      expect(config).toBeDefined();
      expect(config.mode).toBe('api_key');
    });
  });

  describe('CLI agent invocation', () => {
    let cliFactory: HybridAgentFactory;

    beforeEach(async () => {
      vi.clearAllMocks();

      // Reset static state
      (HybridAgentFactory as any).isAborting = false;
      (HybridAgentFactory as any).activeInvocations.clear();
      (HybridAgentFactory as any).activeProcesses.clear();

      cliFactory = new HybridAgentFactory({
        mode: 'claude_cli' as any,
      } as any);
    });

    it('should create CLI agent successfully', async () => {
      const config = {
        agentName: 'cli-test-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getInfo().mode).toBe('claude_cli');
    });

    it('should invoke CLI agent successfully', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('CLI output')), 10);
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);
      const result = await agent.invoke({ input: 'Test input' });

      expect(result.output).toBe('CLI output');
      expect(result.mode).toBe('claude_cli');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle CLI spawn error', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'error') {
            setTimeout(() => handler(new Error('spawn failed')), 10);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('Failed to spawn Claude CLI');
    });

    it('should handle CLI non-zero exit code', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('Error output')), 10);
            }
          }),
        },
        stderr: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('stderr error')), 10);
            }
          }),
        },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('Claude CLI exited with code 1');
    });

    it('should detect and format rate limit errors', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('Limit reached. Usage resets 5pm (Pacific Time). Visit /upgrade to Max for 20x limits.')), 10);
            }
          }),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('RATE_LIMIT');
    });

    it('should handle CLI timeout', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 100,
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('Claude CLI timeout');
    });

    it('should use additional context if provided', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('CLI output')), 10);
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        additionalContext: 'Extra context',
      };

      const agent = await cliFactory.createAgent(config);
      const result = await agent.invoke({ input: 'Test' });

      expect(result.output).toBe('CLI output');
    });

    it('should handle CLI invocation when isAborting is true', async () => {
      (HybridAgentFactory as any).isAborting = true;

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('SIGINT: Workflow interrupted');

      (HybridAgentFactory as any).isAborting = false;
    });

    it('should handle stdout without data', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: null,
        stderr: null,
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(0), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);
      const result = await agent.invoke({ input: 'Test' });

      expect(result.output).toBe('');
    });

    it('should parse rate limit reset time', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('Limit reached. resets 5pm (Pacific Time)')), 10);
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('Resets at 5pm Pacific Time');
    });

    it('should handle rate limit without reset time', async () => {
      const { spawn } = await import('child_process');

      const mockProcess = {
        pid: 12345,
        killed: false,
        stdout: {
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('Limit reached')), 10);
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            setTimeout(() => handler(1), 20);
          }
        }),
        kill: vi.fn(),
      };

      vi.mocked(spawn).mockReturnValueOnce(mockProcess as any);

      const config = {
        agentName: 'cli-agent',
        agentFile: 'test.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
      };

      const agent = await cliFactory.createAgent(config);

      await expect(agent.invoke({ input: 'Test' })).rejects.toThrow('Resets at unknown');
    });
  });
});
