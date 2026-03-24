import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAgentFromMarkdown,
  createDeepAgentDirect,
  getAgentConfig,
  PHASE1_AGENTS,
  type AgentConfig
} from '../../../src/utils/agent-factory.js';
import * as fs from 'fs';

// Mock dependencies
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('deepagents', () => ({
  createDeepAgent: vi.fn(),
}));

vi.mock('../../../src/llm/llm-factory.js', () => ({
  getLLMFactory: vi.fn(),
}));

vi.mock('../../../src/agents/agent-factory-hybrid.js', () => ({
  HybridAgentFactory: {
    create: vi.fn(),
  },
}));

describe('agent-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
    agentName: 'test-analyzer',
    agentFile: 'test-agent.md',
    projectPath: '/test/project',
    frameworkPath: '/test/framework',
    additionalContext: '',
    timeout: 300000,
    ...overrides
  });

  describe('PHASE1_AGENTS constant', () => {
    it('should contain 4 phase1 agents', () => {
      expect(PHASE1_AGENTS).toHaveLength(4);
    });

    it('should include structure-architecture-analyzer', () => {
      const agent = PHASE1_AGENTS.find(a => a.name === 'structure-architecture-analyzer');
      expect(agent).toBeDefined();
      expect(agent?.file).toBe('01-structure-architecture.md');
    });

    it('should include tech-stack-dependencies-analyzer', () => {
      const agent = PHASE1_AGENTS.find(a => a.name === 'tech-stack-dependencies-analyzer');
      expect(agent).toBeDefined();
      expect(agent?.file).toBe('02-tech-stack-dependencies.md');
    });

    it('should include code-patterns-testing-analyzer', () => {
      const agent = PHASE1_AGENTS.find(a => a.name === 'code-patterns-testing-analyzer');
      expect(agent).toBeDefined();
      expect(agent?.file).toBe('03-code-patterns-testing.md');
    });

    it('should include data-flows-integrations-analyzer', () => {
      const agent = PHASE1_AGENTS.find(a => a.name === 'data-flows-integrations-analyzer');
      expect(agent).toBeDefined();
      expect(agent?.file).toBe('04-data-flows-integrations.md');
    });
  });

  describe('getAgentConfig', () => {
    it('should return agent config by name', () => {
      const config = getAgentConfig('structure-architecture-analyzer');
      expect(config).toBeDefined();
      expect(config?.name).toBe('structure-architecture-analyzer');
      expect(config?.file).toBe('01-structure-architecture.md');
    });

    it('should return undefined for unknown agent', () => {
      const config = getAgentConfig('unknown-agent');
      expect(config).toBeUndefined();
    });

    it('should return correct file for each agent', () => {
      expect(getAgentConfig('structure-architecture-analyzer')?.file).toBe('01-structure-architecture.md');
      expect(getAgentConfig('tech-stack-dependencies-analyzer')?.file).toBe('02-tech-stack-dependencies.md');
      expect(getAgentConfig('code-patterns-testing-analyzer')?.file).toBe('03-code-patterns-testing.md');
      expect(getAgentConfig('data-flows-integrations-analyzer')?.file).toBe('04-data-flows-integrations.md');
    });
  });

  describe('createAgentFromMarkdown', () => {
    it('should create agent with hybrid factory', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = `---
name: test-agent
model: sonnet
---
# Test Agent
Analyze the project.`;

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({
          output: 'test output',
          mode: 'api',
          executionTimeMs: 1000
        }),
        getInfo: vi.fn().mockReturnValue({ mode: 'api' })
      };

      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      const agent = await createAgentFromMarkdown(config);

      expect(agent).toBeDefined();
      expect(agent.invoke).toBeDefined();
      expect(agent.getInfo).toBeDefined();
    });

    it('should read agent file from correct path', async () => {
      const config = createMockConfig({
        agentFile: 'custom-agent.md',
        frameworkPath: '/custom/framework'
      });

      const mockAgentInstructions = '# Test Agent';
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/custom/framework/orchestration/agents/custom-agent.md',
        'utf-8'
      );
    });

    it('should remove frontmatter from agent instructions', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = `---
name: test-agent
model: sonnet
---
# Test Agent
Instructions here.`;

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      // Verify createAgent was called with instructions without frontmatter
      expect(mockFactory.createAgent).toHaveBeenCalled();
      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).not.toContain('---');
      expect(callArg.additionalContext).toContain('# Test Agent');
    });

    it('should include project path in prompt', async () => {
      const config = createMockConfig({
        projectPath: '/my/project/path'
      });

      const mockAgentInstructions = '# Test Agent';
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('/my/project/path');
    });

    it('should include additional context in prompt', async () => {
      const config = createMockConfig({
        additionalContext: 'Additional context here'
      });

      const mockAgentInstructions = '# Test Agent';
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('Additional context here');
    });

    it('should include JSON format instructions', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = '# Test Agent';
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('CRITICAL OUTPUT FORMAT');
      expect(callArg.additionalContext).toContain('Output ONLY raw JSON');
      expect(callArg.additionalContext).toContain('Do NOT wrap in markdown');
    });

    it('should return agent with invoke method', async () => {
      const config = createMockConfig();
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({
          output: 'test result',
          mode: 'api',
          executionTimeMs: 500
        }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test Agent');
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      const agent = await createAgentFromMarkdown(config);
      const result = await agent.invoke({ input: 'test input' });

      expect(result).toBeDefined();
      expect(result.output).toBe('test result');
      expect(result.content).toBe('test result');
      expect(result.mode).toBe('api');
      expect(result.executionTimeMs).toBe(500);
    });

    it('should return agent with getInfo method', async () => {
      const config = createMockConfig();
      const mockInfo = { mode: 'cli', provider: 'anthropic' };
      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn().mockReturnValue(mockInfo)
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test Agent');
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      const agent = await createAgentFromMarkdown(config);
      const info = agent.getInfo();

      expect(info).toEqual(mockInfo);
    });

    it('should use default timeout when not provided', async () => {
      const config = createMockConfig();
      delete config.timeout;

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test Agent');
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.timeout).toBe(300000); // 5 minutes default
    });

    it('should handle markdown without frontmatter', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = `# Test Agent
No frontmatter here.`;

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('# Test Agent');
      expect(callArg.additionalContext).toContain('No frontmatter here');
    });

    it('should extract agent display name from markdown heading', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = `# Custom Agent Name
Instructions here.`;

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('You are the Custom Agent Name');
    });

    it('should use default agent name when no heading found', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = 'No heading in this file.';

      const mockHybridAgent = {
        invoke: vi.fn().mockResolvedValue({ output: '', mode: 'api', executionTimeMs: 0 }),
        getInfo: vi.fn()
      };
      const mockFactory = {
        createAgent: vi.fn().mockResolvedValue(mockHybridAgent)
      };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { HybridAgentFactory } = await import('../../../src/agents/agent-factory-hybrid.js');
      vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory as any);

      await createAgentFromMarkdown(config);

      const callArg = mockFactory.createAgent.mock.calls[0][0];
      expect(callArg.additionalContext).toContain('You are the Analyzer Agent');
    });
  });

  describe('createDeepAgentDirect', () => {
    it('should create deep agent directly with LLM factory', async () => {
      const config = createMockConfig();
      const mockAgentInstructions = '# Test Agent';

      const mockModel = { name: 'test-model' };
      const mockLLMFactory = {
        createModel: vi.fn().mockResolvedValue(mockModel),
        getModelInfo: vi.fn().mockReturnValue({
          tier: 'standard',
          modelId: 'claude-3-sonnet',
          provider: 'anthropic'
        })
      };
      const mockAgent = { invoke: vi.fn() };

      vi.mocked(fs.readFileSync).mockReturnValue(mockAgentInstructions);
      const { getLLMFactory } = await import('../../../src/llm/llm-factory.js');
      vi.mocked(getLLMFactory).mockReturnValue(mockLLMFactory as any);
      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue(mockAgent);

      const agent = await createDeepAgentDirect(config);

      expect(agent).toBe(mockAgent);
      expect(mockLLMFactory.createModel).toHaveBeenCalledWith('test-analyzer');
    });

    it('should read agent file and build prompt', async () => {
      const config = createMockConfig({
        agentFile: 'direct-agent.md',
        frameworkPath: '/direct/framework'
      });

      const mockModel = {};
      const mockLLMFactory = {
        createModel: vi.fn().mockResolvedValue(mockModel),
        getModelInfo: vi.fn().mockReturnValue({ tier: 'standard', modelId: 'test', provider: 'test' })
      };
      const mockAgent = {};

      vi.mocked(fs.readFileSync).mockReturnValue('# Direct Agent');
      const { getLLMFactory } = await import('../../../src/llm/llm-factory.js');
      vi.mocked(getLLMFactory).mockReturnValue(mockLLMFactory as any);
      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue(mockAgent);

      await createDeepAgentDirect(config);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/direct/framework/orchestration/agents/direct-agent.md',
        'utf-8'
      );
    });

    it('should log model info', async () => {
      const config = createMockConfig({ agentName: 'test-agent' });
      const consoleLogSpy = vi.spyOn(console, 'log');

      const mockModel = {};
      const mockLLMFactory = {
        createModel: vi.fn().mockResolvedValue(mockModel),
        getModelInfo: vi.fn().mockReturnValue({
          tier: 'premium',
          modelId: 'claude-3-opus',
          provider: 'anthropic'
        })
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test');
      const { getLLMFactory } = await import('../../../src/llm/llm-factory.js');
      vi.mocked(getLLMFactory).mockReturnValue(mockLLMFactory as any);
      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue({});

      await createDeepAgentDirect(config);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-agent] Tier: premium')
      );
    });

    it('should pass systemPrompt to createDeepAgent', async () => {
      const config = createMockConfig();

      const mockModel = {};
      const mockLLMFactory = {
        createModel: vi.fn().mockResolvedValue(mockModel),
        getModelInfo: vi.fn().mockReturnValue({ tier: 'standard', modelId: 'test', provider: 'test' })
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test Agent');
      const { getLLMFactory } = await import('../../../src/llm/llm-factory.js');
      vi.mocked(getLLMFactory).mockReturnValue(mockLLMFactory as any);
      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue({});

      await createDeepAgentDirect(config);

      expect(createDeepAgent).toHaveBeenCalledWith({
        model: mockModel,
        systemPrompt: expect.stringContaining('# Test Agent'),
        tools: []
      });
    });

    it('should use default timeout when not provided', async () => {
      const config = createMockConfig();
      delete config.timeout;

      const mockLLMFactory = {
        createModel: vi.fn().mockResolvedValue({}),
        getModelInfo: vi.fn().mockReturnValue({ tier: 'standard', modelId: 'test', provider: 'test' })
      };

      vi.mocked(fs.readFileSync).mockReturnValue('# Test');
      const { getLLMFactory } = await import('../../../src/llm/llm-factory.js');
      vi.mocked(getLLMFactory).mockReturnValue(mockLLMFactory as any);
      const { createDeepAgent } = await import('deepagents');
      vi.mocked(createDeepAgent).mockResolvedValue({});

      await createDeepAgentDirect(config);

      // Timeout is used in config but not passed to createDeepAgent
      expect(createDeepAgent).toHaveBeenCalled();
    });
  });
});
