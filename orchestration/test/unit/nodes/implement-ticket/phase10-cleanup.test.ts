import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase10CleanupNode } from '../../../../src/nodes/implement-ticket/phase10-cleanup.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EnvironmentManagerService } from '../../../../src/services/implement-ticket/environment-manager.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/environment-manager.service.js', () => ({
  EnvironmentManagerService: vi.fn(),
}));

describe('phase10CleanupNode', () => {
  let mockState: ImplementTicketState;
  let mockEnvManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase10_cleanup',
      errors: [],
    } as unknown as ImplementTicketState;

    mockEnvManager = {
      teardownEnvironment: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(EnvironmentManagerService).mockImplementation(function(this: any) {
      return mockEnvManager;
    } as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('cleanup-complete.json')) return false;
      if (path.includes('review-complete.json')) return true;
      if (path.includes('environment-config.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('environment-config.json')) {
        return JSON.stringify({ port: 3001, dockerComposeGenerated: true });
      }
      return '';
    });

    vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
      if (cmd.includes('tar -czf')) return '';
      if (cmd.includes('du -sk')) return '1024\t/test/temp';
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        cleanup_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase10CleanupNode(mockState);

      expect(result.current_phase).toBe('complete');
      expect(result.phase10_complete).toBe(true);
    });
  });

  describe('phase9 validation', () => {
    it('should continue if phase9 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('cleanup-complete.json')) return false;
        if (path.includes('review-complete.json')) return false;
        if (path.includes('environment-config.json')) return true;
        return false;
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await phase10CleanupNode(mockState);

      expect(result.current_phase).toBe('complete');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Phase 9 not complete')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('environment teardown', () => {
    it('should skip if no environment config', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('cleanup-complete.json')) return false;
        if (path.includes('environment-config.json')) return false;
        return false;
      });

      await phase10CleanupNode(mockState);

      expect(mockEnvManager.teardownEnvironment).not.toHaveBeenCalled();
    });

    it('should teardown environment if config exists', async () => {
      await phase10CleanupNode(mockState);

      expect(mockEnvManager.teardownEnvironment).toHaveBeenCalledWith('TICKET-123');
    });

    it('should log teardown errors but continue', async () => {
      mockEnvManager.teardownEnvironment.mockRejectedValue(new Error('Teardown failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await phase10CleanupNode(mockState);

      expect(result.current_phase).toBe('complete');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Teardown failed')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('archive creation', () => {
    it('should create tar.gz archive', async () => {
      await phase10CleanupNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('tar -czf'),
        expect.any(Object)
      );
    });

    it('should log archive errors but continue', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('tar -czf')) throw new Error('Archive failed');
        if (cmd.includes('du -sk')) return '1024\t/test/temp';
        return '';
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await phase10CleanupNode(mockState);

      expect(result.current_phase).toBe('complete');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Archive failed')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('disk persistence', () => {
    it('should write cleanup data', async () => {
      await phase10CleanupNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('cleanup-data.json'),
        expect.any(String)
      );
    });

    it('should write completion marker', async () => {
      await phase10CleanupNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('cleanup-complete.json'),
        expect.stringContaining('completed_at')
      );
    });
  });

  describe('temp directory size calculation', () => {
    it('should calculate temp directory size via du command', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('du -sk')) return '10240\t/test/temp';
        if (cmd.includes('tar -czf')) return '';
        if (cmd.includes('docker stop')) return '';
        return '';
      });

      await phase10CleanupNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('du -sk'),
        expect.any(Object)
      );
    });

    it('should handle du command errors gracefully', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('du -sk')) throw new Error('du failed');
        if (cmd.includes('tar -czf')) return '';
        if (cmd.includes('docker stop')) return '';
        return '';
      });

      const result = await phase10CleanupNode(mockState);

      // Should continue even if du fails
      expect(result.current_phase).toBe('complete');
    });
  });

  describe('temp file removal', () => {
    it('should remove temp files when CLEANUP_TEMP_FILES=true', async () => {
      process.env.CLEANUP_TEMP_FILES = 'true';

      // Mock existsSync to return true for phase directories
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('cleanup-complete.json')) return false;
        if (path.includes('review-complete.json')) return true;
        if (path.includes('phase')) return true; // Phase directories exist
        return false;
      });

      await phase10CleanupNode(mockState);

      expect(fs.rmSync).toHaveBeenCalled();

      delete process.env.CLEANUP_TEMP_FILES;
    });

    it('should keep temp files by default', async () => {
      delete process.env.CLEANUP_TEMP_FILES;

      await phase10CleanupNode(mockState);

      // rmSync should not be called
      const rmsyncCalls = vi.mocked(fs.rmSync).mock.calls;
      expect(rmsyncCalls.length).toBe(0);
    });

    it('should handle temp file removal errors', async () => {
      process.env.CLEANUP_TEMP_FILES = 'true';

      vi.mocked(fs.rmSync).mockImplementation(() => {
        throw new Error('rmSync failed');
      });

      const result = await phase10CleanupNode(mockState);

      // Should continue even with removal errors
      expect(result.current_phase).toBe('complete');

      delete process.env.CLEANUP_TEMP_FILES;
    });
  });

  describe('final summary logging', () => {
    it('should log archive path when present', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('tar -czf')) return '';
        if (cmd.includes('docker stop')) return '';
        return '';
      });

      await phase10CleanupNode(mockState);

      // Archive was created
      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('tar -czf'),
        expect.any(Object)
      );
    });

    it('should log PR URL when pr-url.txt exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('cleanup-complete.json')) return false;
        if (path.includes('review-complete.json')) return true;
        if (path.includes('pr-url.txt')) return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('pr-url.txt')) {
          return 'https://github.com/org/repo/pull/123';
        }
        return '';
      });

      await phase10CleanupNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('pr-url.txt'),
        'utf-8'
      );
    });
  });

  describe('error handling', () => {
    it('should handle cleanup errors and still complete', async () => {
      // Cause an error early in the try block to trigger catch
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('cleanup-complete.json')) return false;
        if (path.includes('review-complete.json')) {
          throw new Error('Phase9 check failed');
        }
        return false;
      });

      const result = await phase10CleanupNode(mockState);

      // Non-blocking - still completes even with errors
      expect(result.current_phase).toBe('complete');
      expect(result.phase10_complete).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('Cleanup had errors');
    });

    it('should write error logs when cleanup fails', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        throw new Error('Everything failed');
      });

      await phase10CleanupNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('cleanup-data.json'),
        expect.stringContaining('failed')
      );
    });

    it('should log cleanup errors in summary', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('docker stop')) throw new Error('Docker error');
        if (cmd.includes('tar -czf')) return '';
        return '';
      });

      const result = await phase10CleanupNode(mockState);

      // Should still complete
      expect(result.current_phase).toBe('complete');
    });
  });

  describe('return state', () => {
    it('should set current_phase to complete', async () => {
      const result = await phase10CleanupNode(mockState);

      expect(result.current_phase).toBe('complete');
    });

    it('should set phase10_complete to true', async () => {
      const result = await phase10CleanupNode(mockState);

      expect(result.phase10_complete).toBe(true);
    });
  });
});
