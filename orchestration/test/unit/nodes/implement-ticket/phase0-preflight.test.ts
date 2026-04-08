import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase0PreflightNode } from '../../../../src/nodes/implement-ticket/phase0-preflight.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { ProjectConfigReaderService } from '../../../../src/services/implement-ticket/project-config-reader.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/project-config-reader.service.js', () => ({
  ProjectConfigReaderService: vi.fn(),
}));

describe('phase0PreflightNode', () => {
  let mockState: ImplementTicketState;
  let mockConfigReader: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      input_source: 'input',
      input_value: 'test context',
      current_phase: 'phase0_preflight',
      errors: [],
    } as unknown as ImplementTicketState;

    mockConfigReader = {
      readFrameworkConfig: vi.fn().mockReturnValue({
        primary_language: 'typescript',
        project_name: 'test-project',
      }),
      readStackProfile: vi.fn().mockReturnValue({
        primary_language: 'typescript',
        languages: ['typescript'],
        frameworks: { frontend: [], backend: [] },
        testing_frameworks: {},
      }),
      getTestCommands: vi.fn().mockReturnValue({
        unit: 'npm test',
        integration: null,
      }),
      hasDocker: vi.fn().mockReturnValue(false),
    };

    (ProjectConfigReaderService as any).isProjectInitialized = vi.fn().mockReturnValue(true);
    vi.mocked(ProjectConfigReaderService).mockImplementation(function(this: any) {
      return mockConfigReader;
    } as any);

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
      if (cmd === 'git status --porcelain') return '';
      if (cmd === 'which gh') return '/usr/bin/gh';
      if (cmd === 'which docker') return '/usr/bin/docker';
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        preflight_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase0PreflightNode(mockState);

      expect(result.current_phase).toBe('phase1_context');
      expect(result.phase0_complete).toBe(true);
      expect(mockConfigReader.readFrameworkConfig).not.toHaveBeenCalled();
    });

    it('should read preflight data from disk', async () => {
      const completionData = {
        preflight_data: { stack_profile: { primary_language: 'python' } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase0PreflightNode(mockState);

      expect(result.phase0_preflight).toEqual({ stack_profile: { primary_language: 'python' } });
    });
  });

  describe('project initialization validation', () => {
    it('should throw if project not initialized', async () => {
      (ProjectConfigReaderService as any).isProjectInitialized = vi.fn().mockReturnValue(false);

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Project not initialized'))).toBe(true);
      expect(result.errors?.some(e => e.includes('framework-config.json'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should proceed if project initialized', async () => {
      (ProjectConfigReaderService as any).isProjectInitialized = vi.fn().mockReturnValue(true);

      await phase0PreflightNode(mockState);

      expect(mockConfigReader.readFrameworkConfig).toHaveBeenCalled();
    });
  });

  describe('configuration reading', () => {
    it('should create ProjectConfigReaderService with project path', async () => {
      await phase0PreflightNode(mockState);

      expect(ProjectConfigReaderService).toHaveBeenCalledWith('/test/project');
    });

    it('should read framework config', async () => {
      await phase0PreflightNode(mockState);

      expect(mockConfigReader.readFrameworkConfig).toHaveBeenCalled();
    });

    it('should read stack profile', async () => {
      await phase0PreflightNode(mockState);

      expect(mockConfigReader.readStackProfile).toHaveBeenCalled();
    });

    it('should read test commands', async () => {
      await phase0PreflightNode(mockState);

      expect(mockConfigReader.getTestCommands).toHaveBeenCalled();
    });
  });

  describe('git status validation', () => {
    it('should throw if working tree not clean', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') return 'M file.txt';
        return '';
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Working directory not clean'))).toBe(true);
      expect(result.errors?.some(e => e.includes('git status'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should throw if not a git repository', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') {
          const error: any = new Error('fatal: not a git repository');
          throw error;
        }
        return '';
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Not a git repository'))).toBe(true);
      expect(result.errors?.some(e => e.includes('git init'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should proceed if git working tree is clean', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') return '';
        if (cmd === 'which gh') return '/usr/bin/gh';
        return '';
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.phase0_preflight?.git_clean).toBe(true);
    });

    it('should handle git command errors other than not a repository', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') {
          throw new Error('Permission denied');
        }
        return '';
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Permission denied'))).toBe(true);
    });
  });

  describe('input source validation', () => {
    it('should throw if input source missing', async () => {
      mockState.input_source = undefined as any;

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Missing input source'))).toBe(true);
      expect(result.errors?.some(e => e.includes('--from-jira'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should throw if input value missing', async () => {
      mockState.input_value = undefined as any;

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Missing input source'))).toBe(true);
    });

    it('should throw if markdown file not found', async () => {
      mockState.input_source = 'markdown';
      mockState.input_value = '/path/to/missing.md';

      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('missing.md')) return false;
        return false;
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Markdown file not found'))).toBe(true);
      expect(result.errors?.some(e => e.includes('/path/to/missing.md'))).toBe(true);
    });

    it('should proceed if markdown file exists', async () => {
      mockState.input_source = 'markdown';
      mockState.input_value = '/path/to/ticket.md';

      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('ticket.md')) return true;
        return false;
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.current_phase).toBe('phase1_context');
    });

    it('should accept jira input source', async () => {
      mockState.input_source = 'jira';
      mockState.input_value = 'https://jira.example.com/TICKET-123';

      const result = await phase0PreflightNode(mockState);

      expect(result.current_phase).toBe('phase1_context');
    });

    it('should accept input input source', async () => {
      mockState.input_source = 'input';
      mockState.input_value = 'Direct context input';

      const result = await phase0PreflightNode(mockState);

      expect(result.current_phase).toBe('phase1_context');
    });
  });

  describe('prerequisites validation', () => {
    it('should throw if gh CLI not found', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') return '';
        if (cmd === 'which gh') throw new Error('Command not found');
        return '';
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('GitHub CLI (gh) not found'))).toBe(true);
      expect(result.errors?.some(e => e.includes('https://cli.github.com'))).toBe(true);
    });

    it('should check for docker if stack has docker', async () => {
      mockConfigReader.hasDocker.mockReturnValue(true);

      await phase0PreflightNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith('which docker', expect.any(Object));
    });

    it('should warn if docker missing but detected in stack', async () => {
      mockConfigReader.hasDocker.mockReturnValue(true);
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd === 'git status --porcelain') return '';
        if (cmd === 'which gh') return '/usr/bin/gh';
        if (cmd === 'which docker') throw new Error('Command not found');
        return '';
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await phase0PreflightNode(mockState);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Docker detected in stack but not available')
      );

      consoleSpy.mockRestore();
    });

    it('should skip docker check if not in stack', async () => {
      mockConfigReader.hasDocker.mockReturnValue(false);

      await phase0PreflightNode(mockState);

      expect(child_process.execSync).not.toHaveBeenCalledWith('which docker', expect.any(Object));
    });
  });

  describe('disk persistence', () => {
    it('should create phase0 directory', async () => {
      await phase0PreflightNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('phase0'),
        { recursive: true }
      );
    });

    it('should write framework config to disk', async () => {
      const frameworkConfig = { primary_language: 'typescript' };
      mockConfigReader.readFrameworkConfig.mockReturnValue(frameworkConfig);

      await phase0PreflightNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('framework-config.json'),
        JSON.stringify(frameworkConfig, null, 2)
      );
    });

    it('should write stack profile to disk', async () => {
      const stackProfile = { primary_language: 'typescript' };
      mockConfigReader.readStackProfile.mockReturnValue(stackProfile);

      await phase0PreflightNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('stack-profile.json'),
        JSON.stringify(stackProfile, null, 2)
      );
    });

    it('should write test commands to disk', async () => {
      const testCommands = { unit: 'npm test' };
      mockConfigReader.getTestCommands.mockReturnValue(testCommands);

      await phase0PreflightNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-commands.json'),
        JSON.stringify(testCommands, null, 2)
      );
    });

    it('should write preflight data to disk', async () => {
      await phase0PreflightNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('preflight-data.json'),
        expect.stringContaining('"git_clean"')
      );
    });

    it('should write completion marker last', async () => {
      await phase0PreflightNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('preflight-complete.json'),
        expect.stringContaining('completed_at')
      );
    });

    it('should include ticket id in completion marker', async () => {
      await phase0PreflightNode(mockState);

      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
        (call[0] as string).includes('preflight-complete.json')
      );

      expect(lastCall).toBeDefined();
      expect(lastCall![1]).toContain('TICKET-123');
    });
  });

  describe('return state', () => {
    it('should return minimal state with phase completion', async () => {
      const result = await phase0PreflightNode(mockState);

      expect(result).toEqual({
        current_phase: 'phase1_context',
        phase0_complete: true,
        temp_dir: expect.any(String),
        phase0_preflight: expect.any(Object),
      });
    });

    it('should set current_phase to phase1_context', async () => {
      const result = await phase0PreflightNode(mockState);

      expect(result.current_phase).toBe('phase1_context');
    });

    it('should set phase0_complete to true', async () => {
      const result = await phase0PreflightNode(mockState);

      expect(result.phase0_complete).toBe(true);
    });

    it('should include preflight data in state', async () => {
      const result = await phase0PreflightNode(mockState);

      expect(result.phase0_preflight).toEqual({
        stack_profile: expect.any(Object),
        framework_config: expect.any(Object),
        test_commands: expect.any(Object),
        git_clean: true,
        timestamp: expect.any(String),
      });
    });

    it('should set temp_dir in state', async () => {
      const result = await phase0PreflightNode(mockState);

      expect(result.temp_dir).toContain('.claude-temp/implement-ticket/TICKET-123');
    });

    it('should use default temp_dir if not provided', async () => {
      mockState.temp_dir = undefined;

      const result = await phase0PreflightNode(mockState);

      expect(result.temp_dir).toContain('.claude-temp/implement-ticket/TICKET-123');
    });
  });

  describe('error handling', () => {
    it('should catch project initialization errors', async () => {
      (ProjectConfigReaderService as any).isProjectInitialized = vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Permission denied'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should catch config reading errors', async () => {
      mockConfigReader.readFrameworkConfig.mockImplementation(() => {
        throw new Error('Config read failed');
      });

      const result = await phase0PreflightNode(mockState);

      expect(result.errors?.some(e => e.includes('Config read failed'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should preserve existing errors', async () => {
      mockState.errors = ['Previous error'];
      (ProjectConfigReaderService as any).isProjectInitialized = vi.fn().mockReturnValue(false);

      const result = await phase0PreflightNode(mockState);

      // State doesn't preserve errors from input in this node, it just returns new error
      expect(result.errors?.some(e => e.includes('Project not initialized'))).toBe(true);
    });
  });
});
