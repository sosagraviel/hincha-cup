import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase4ImplementationNode } from '../../../../src/nodes/implement-ticket/phase4-implementation.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { AgentFactory } from '../../../../src/utils/shared/agent-factory/index.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: { create: vi.fn() },
}));

describe('phase4ImplementationNode', () => {
  let mockState: ImplementTicketState;
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase4_implementation',
      errors: [],
    } as unknown as ImplementTicketState;

    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: 'Implementation completed successfully',
        sessionId: 'test-session-123',
      }),
    };

    const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('implementation-complete.json')) return false;
      if (path.includes('environment-complete.json')) return true;
      if (path.includes('implementation-plan.md')) return true;
      if (path.includes('full-context.md')) return true;
      if (path.includes('stack-profile.json')) return true;
      if (path.includes('.code-graph.db')) return true;
      if (path.includes('implementer-typescript.md')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('implementation-plan.md')) return '# Implementation Plan\nSteps here...';
      if (path.includes('full-context.md')) return '# Context\nFull context here...';
      if (path.includes('stack-profile.json')) {
        return JSON.stringify({ primary_language: 'typescript' });
      }
      if (path.includes('implementer-typescript.md')) {
        return 'tools: Read, Write, Edit, mcp__code_graph';
      }
      return '';
    });

    vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
      if (cmd === 'git diff --name-only HEAD') {
        return 'src/file1.ts\nsrc/file2.ts\n';
      }
      if (cmd === 'git diff --stat HEAD') {
        return '2 files changed, 10 insertions(+), 5 deletions(-)\n';
      }
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        implementation_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('phase5_testing');
      expect(result.phase4_complete).toBe(true);
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });

    it('should read implementation data from disk', async () => {
      const completionData = {
        implementation_data: { implementation_log: 'Log content' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation).toEqual({ implementation_log: 'Log content' });
    });
  });

  describe('phase3 validation', () => {
    it('should fail if phase3 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return false;
        return true;
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Phase 3 not complete'))).toBe(true);
    });

    it('should proceed if phase3 complete', async () => {
      await phase4ImplementationNode(mockState);

      expect(mockAgent.invoke).toHaveBeenCalled();
    });
  });

  describe('phase2 validation', () => {
    it('should fail if implementation plan not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return false;
        return true;
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Implementation plan not found'))).toBe(true);
    });

    it('should read implementation plan from disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-plan.md'),
        'utf-8',
      );
    });
  });

  describe('phase1 validation', () => {
    it('should fail if context not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return false;
        return true;
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Context not found'))).toBe(true);
    });

    it('should read full context from disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('full-context.md'),
        'utf-8',
      );
    });
  });

  describe('phase0 validation', () => {
    it('should fail if stack profile not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return false;
        return true;
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Stack profile not found'))).toBe(true);
    });

    it('should read stack profile from disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('stack-profile.json'),
        'utf-8',
      );
    });

    it('should use primary language from stack profile', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('stack-profile.json')) {
          return JSON.stringify({ primary_language: 'python' });
        }
        if (path.includes('implementer-python.md')) {
          return 'tools: Read, Write, Edit, mcp__code_graph';
        }
        if (path.includes('implementation-plan.md')) return 'Plan';
        if (path.includes('full-context.md')) return 'Context';
        return '';
      });
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return true;
        if (path.includes('implementer-python.md')) return true;
        return false;
      });

      const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
      vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

      await phase4ImplementationNode(mockState);

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'implementer-python',
        agentFilePath: expect.stringContaining('implementer-python.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 900000,
        settingsPath: expect.stringContaining('settings.json'),
      });
    });

    it('should default to generic if no primary language', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('stack-profile.json')) {
          return JSON.stringify({});
        }
        if (path.includes('implementer-generic.md')) {
          return 'tools: Read, Write, Edit, mcp__code_graph';
        }
        if (path.includes('implementation-plan.md')) return 'Plan';
        if (path.includes('full-context.md')) return 'Context';
        return '';
      });
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return true;
        if (path.includes('implementer-generic.md')) return true;
        return false;
      });

      const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
      vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

      await phase4ImplementationNode(mockState);

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'implementer-generic',
        agentFilePath: expect.stringContaining('implementer-generic.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 900000,
        settingsPath: expect.stringContaining('settings.json'),
      });
    });
  });

  describe('framework path validation', () => {
    it('should fail if framework_path not set', async () => {
      mockState.framework_path = undefined as any;

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('framework_path not set'))).toBe(true);
    });
  });

  describe('agent invocation', () => {
    it('should create agent with correct configuration', async () => {
      const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
      vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

      await phase4ImplementationNode(mockState);

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'implementer-typescript',
        agentFilePath: expect.stringContaining('implementer-typescript.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 900000,
        settingsPath: expect.stringContaining('settings.json'),
      });
    });

    it('should invoke agent with implementer prompt', async () => {
      await phase4ImplementationNode(mockState);

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        inputPrompt: expect.stringContaining('Implementation Plan'),
      });
    });

    it('should include graph instructions in implementer prompt', async () => {
      await phase4ImplementationNode(mockState);

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        inputPrompt: expect.stringContaining(
          'Use mcp__code_graph before editing planned target areas',
        ),
      });
    });

    it('should handle implementer agent errors', async () => {
      mockAgent.invoke.mockRejectedValue(new Error('Agent failed'));

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Implementer agent invocation failed'))).toBe(
        true,
      );
    });

    it('should fail before invoking agent when code graph is missing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return false;
        return false;
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Code graph database not found');
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });

    it('should fail before invoking agent when implementer is not graph-aware', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-complete.json')) return false;
        if (path.includes('environment-complete.json')) return true;
        if (path.includes('implementation-plan.md')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return true;
        if (path.includes('implementer-typescript.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('implementation-plan.md')) return '# Implementation Plan\nSteps here...';
        if (path.includes('full-context.md')) return '# Context\nFull context here...';
        if (path.includes('stack-profile.json'))
          return JSON.stringify({ primary_language: 'typescript' });
        if (path.includes('implementer-typescript.md')) return 'tools: Read, Write, Edit';
        return '';
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Generated agent is not graph-aware');
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });
  });

  describe('file tracking', () => {
    it('should track modified files via git diff', async () => {
      await phase4ImplementationNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith(
        'git diff --name-only HEAD',
        expect.objectContaining({ cwd: '/test/project' }),
      );
    });

    it('should extract file list from git output', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.files_modified).toEqual([
        'src/file1.ts',
        'src/file2.ts',
      ]);
    });

    it('should handle git diff errors gracefully', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git diff --name-only HEAD') {
          throw new Error('Git error');
        }
        return '';
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.files_modified).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not track files'));

      consoleSpy.mockRestore();
    });

    it('should filter out empty file names', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git diff --name-only HEAD') {
          return 'file1.ts\n\nfile2.ts\n';
        }
        return '';
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.files_modified).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  describe('file statistics', () => {
    it('should get file statistics via git diff --stat', async () => {
      await phase4ImplementationNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith(
        'git diff --stat HEAD',
        expect.objectContaining({ cwd: '/test/project' }),
      );
    });

    it('should parse git stat output', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.file_statistics).toEqual({
        filesChanged: 2,
        linesAdded: 10,
        linesRemoved: 5,
      });
    });

    it('should handle git stat with only insertions', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git diff --name-only HEAD') return 'file1.ts\n';
        if (cmd === 'git diff --stat HEAD') return '1 file changed, 5 insertions(+)\n';
        return '';
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.file_statistics).toEqual({
        filesChanged: 1,
        linesAdded: 5,
        linesRemoved: 0,
      });
    });

    it('should handle git stat with only deletions', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git diff --name-only HEAD') return 'file1.ts\n';
        if (cmd === 'git diff --stat HEAD') return '1 file changed, 3 deletions(-)\n';
        return '';
      });

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.file_statistics).toEqual({
        filesChanged: 1,
        linesAdded: 0,
        linesRemoved: 3,
      });
    });

    it('should handle git stat errors gracefully', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git diff --name-only HEAD') return 'file1.ts\n';
        if (cmd === 'git diff --stat HEAD') throw new Error('Git error');
        return '';
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation?.file_statistics).toEqual({
        filesChanged: 1,
        linesAdded: 0,
        linesRemoved: 0,
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not get statistics'));

      consoleSpy.mockRestore();
    });
  });

  describe('disk persistence', () => {
    it('should create phase4 directory', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('phase4'), {
        recursive: true,
      });
    });

    it('should write implementation log to disk', async () => {
      mockAgent.invoke.mockResolvedValue({
        output: 'Implementation log content',
        sessionId: 'test-session-123',
      });

      await phase4ImplementationNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-log.md'),
        'Implementation log content',
      );
    });

    it('should write files modified to disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('files-modified.txt'),
        'src/file1.ts\nsrc/file2.ts',
      );
    });

    it('should write file statistics to disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('file-statistics.json'),
        expect.stringContaining('"filesChanged"'),
      );
    });

    it('should write implementation data to disk', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-data.json'),
        expect.stringContaining('"implementation_log"'),
      );
    });

    it('should write completion marker last', async () => {
      await phase4ImplementationNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-complete.json'),
        expect.stringContaining('completed_at'),
      );
    });

    it('should include ticket id in completion marker', async () => {
      await phase4ImplementationNode(mockState);

      const lastCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => (call[0] as string).includes('implementation-complete.json'));

      expect(lastCall).toBeDefined();
      expect(lastCall![1]).toContain('TICKET-123');
    });
  });

  describe('return state', () => {
    it('should return minimal state with phase completion', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result).toEqual({
        current_phase: 'phase5_testing',
        phase4_complete: true,
        phase4_implementation: expect.any(Object),
      });
    });

    it('should set current_phase to phase5_testing', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('phase5_testing');
    });

    it('should set phase4_complete to true', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_complete).toBe(true);
    });

    it('should include implementation data in state', async () => {
      const result = await phase4ImplementationNode(mockState);

      expect(result.phase4_implementation).toEqual({
        implementation_log: expect.any(String),
        files_modified: expect.any(Array),
        file_statistics: expect.any(Object),
        primary_language: 'typescript',
        agent_used: 'implementer-typescript',
        timestamp: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    it('should catch phase validation errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await phase4ImplementationNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.some((e) => e.includes('Implementation failed'))).toBe(true);
    });

    it('should use default temp_dir if not provided', async () => {
      mockState.temp_dir = undefined;

      await phase4ImplementationNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude-temp/tickets/TICKET-123'),
        'utf-8',
      );
    });
  });
});
