import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentInvokerService } from '../../../../src/services/implement-ticket/agent-invoker.service.js';
import * as fs from 'fs';
import { HybridAgentFactory } from '../../../../src/agents/agent-factory-hybrid.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../../src/agents/agent-factory-hybrid.js', () => ({
  HybridAgentFactory: {
    create: vi.fn(),
  },
}));

describe('AgentInvokerService', () => {
  let service: AgentInvokerService;
  let mockAgent: any;
  let mockFactory: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AgentInvokerService('/test/project', '/test/framework');

    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: 'Test agent output',
        mode: 'api_key',
        executionTimeMs: 1000,
      }),
    };

    mockFactory = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
    };

    vi.mocked(HybridAgentFactory.create).mockResolvedValue(mockFactory);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Agent Instructions\n\nTest instructions');
  });

  describe('invokeAgent', () => {
    it('should throw if agent file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        service.invokeAgent('planner', 'planner.md', 'test input')
      ).rejects.toThrow('Agent file not found');
    });

    it('should read agent file from project .claude/agents directory', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude/agents/planner.md'),
        'utf-8'
      );
    });

    it('should create hybrid agent factory', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input');

      expect(HybridAgentFactory.create).toHaveBeenCalled();
    });

    it('should create agent with full prompt', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input');

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'planner',
        agentFile: 'planner.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        additionalContext: expect.stringContaining('Test instructions'),
        timeout: 600000,
      });
    });

    it('should invoke agent with input', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input');

      expect(mockAgent.invoke).toHaveBeenCalledWith({ input: 'test input' });
    });

    it('should return agent result', async () => {
      const result = await service.invokeAgent('planner', 'planner.md', 'test input');

      expect(result).toEqual({
        output: 'Test agent output',
        mode: 'api_key',
        executionTimeMs: 1000,
      });
    });

    it('should use custom timeout if provided', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input', undefined, 120000);

      expect(mockFactory.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120000 })
      );
    });

    it('should include additional context in prompt', async () => {
      await service.invokeAgent(
        'planner',
        'planner.md',
        'test input',
        'Additional context here'
      );

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'planner',
        agentFile: 'planner.md',
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        additionalContext: expect.stringContaining('ADDITIONAL CONTEXT'),
        timeout: 600000,
      });
    });

    it('should build prompt with correct structure', async () => {
      await service.invokeAgent('planner', 'planner.md', 'test input', 'extra context');

      const call = mockFactory.createAgent.mock.calls[0][0];
      const prompt = call.additionalContext;

      expect(prompt).toContain('Test instructions');
      expect(prompt).toContain('ADDITIONAL CONTEXT');
      expect(prompt).toContain('extra context');
      expect(prompt).toContain('=== TASK ===');
      expect(prompt).toContain('test input');
    });
  });

  describe('invokePlanner', () => {
    it('should invoke planner agent with formatted input', async () => {
      const stackProfile = {
        primary_language: 'typescript',
        languages: ['typescript', 'javascript'],
        frameworks: {
          frontend: ['react'],
          backend: ['express'],
        },
        testing_frameworks: { typescript: ['vitest'] },
      };

      const result = await service.invokePlanner(
        'Implementation context',
        stackProfile,
        'TICKET-123'
      );

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        input: expect.stringContaining('TICKET-123'),
      });
      expect(result).toBe('Test agent output');
    });

    it('should format stack profile in planner input', async () => {
      const stackProfile = {
        primary_language: 'python',
        languages: ['python'],
        frameworks: { frontend: [], backend: ['django'] },
        testing_frameworks: { python: ['pytest'] },
      };

      await service.invokePlanner('context', stackProfile, 'TICKET-456');

      const call = mockAgent.invoke.mock.calls[0][0];
      expect(call.input).toContain('python');
      expect(call.input).toContain('django');
      // testing_frameworks are joined with Object.keys(), so 'python' is the key
      expect(call.input).toContain('**Testing**:');
    });

    it('should handle missing stack profile fields', async () => {
      const stackProfile = {};

      await service.invokePlanner('context', stackProfile, 'TICKET-789');

      const call = mockAgent.invoke.mock.calls[0][0];
      expect(call.input).toContain('Unknown');
      expect(call.input).toContain('None');
    });

    it('should use planner.md agent file', async () => {
      await service.invokePlanner('context', {}, 'TICKET-123');

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('planner.md')
      );
    });
  });

  describe('invokeImplementer', () => {
    it('should use language-specific implementer', async () => {
      const result = await service.invokeImplementer(
        'typescript',
        'Implementation plan',
        'Context'
      );

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('implementer-typescript.md')
      );
      expect(result).toBe('Test agent output');
    });

    it('should include plan and context in input', async () => {
      await service.invokeImplementer(
        'python',
        'Test plan content',
        'Test context content'
      );

      const call = mockAgent.invoke.mock.calls[0][0];
      expect(call.input).toContain('Test plan content');
      expect(call.input).toContain('Test context content');
    });

    it('should fall back to generic implementer if language-specific not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementer-typescript.md')) return false;
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.invokeImplementer('typescript', 'plan', 'context');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to generic implementer')
      );
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('implementer-generic.md')
      );

      consoleSpy.mockRestore();
    });

    it('should throw if generic implementer not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        service.invokeImplementer('typescript', 'plan', 'context', true)
      ).rejects.toThrow('Generic implementer not found');
    });

    it('should use generic implementer when useGenericImplementer is true', async () => {
      await service.invokeImplementer('typescript', 'plan', 'context', true);

      expect(mockFactory.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: 'implementer-generic' })
      );
    });
  });

  describe('invokeVisualVerifier', () => {
    it('should invoke visual verifier with screenshots and diff', async () => {
      const before = ['/path/to/before1.png', '/path/to/before2.png'];
      const after = ['/path/to/after1.png', '/path/to/after2.png'];
      const diffReport = { differences: 5, threshold: 0.1 };

      const result = await service.invokeVisualVerifier(before, after, diffReport);

      expect(mockAgent.invoke).toHaveBeenCalled();
      expect(result).toBe('Test agent output');
    });

    it('should include screenshots in input', async () => {
      const before = ['/before.png'];
      const after = ['/after.png'];

      await service.invokeVisualVerifier(before, after, {});

      const call = mockAgent.invoke.mock.calls[0][0];
      expect(call.input).toContain('/before.png');
      expect(call.input).toContain('/after.png');
    });

    it('should include diff report in input', async () => {
      const diffReport = { changes: 10, percentage: 5 };

      await service.invokeVisualVerifier([], [], diffReport);

      const call = mockAgent.invoke.mock.calls[0][0];
      expect(call.input).toContain(JSON.stringify(diffReport, null, 2));
    });

    it('should return SKIP message if visual verifier not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('visual-verifier.md')) return false;
        return true;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.invokeVisualVerifier([], [], {});

      expect(result).toContain('SKIP');
      expect(result).toContain('frontend frameworks not detected');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Visual verifier not found')
      );

      consoleSpy.mockRestore();
    });

    it('should use visual-verifier.md agent file', async () => {
      await service.invokeVisualVerifier([], [], {});

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('visual-verifier.md')
      );
    });
  });
});
