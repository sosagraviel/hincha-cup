import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase3EnvironmentNode } from '../../../../src/nodes/implement-ticket/phase3-environment.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { EnvironmentManagerService } from '../../../../src/services/implement-ticket/environment-manager.service.js';
import { ScreenshotService } from '../../../../src/services/implement-ticket/screenshot.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/environment-manager.service.js', () => ({
  EnvironmentManagerService: vi.fn(),
}));
vi.mock('../../../../src/services/implement-ticket/screenshot.service.js', () => ({
  ScreenshotService: vi.fn(),
}));

describe('phase3EnvironmentNode', () => {
  let mockState: ImplementTicketState;
  let mockEnvManager: any;
  let mockScreenshotService: any;
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TEST-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase3_environment',
      errors: [],
    } as unknown as ImplementTicketState;

    mockPage = {
      screenshot: vi.fn(),
      goto: vi.fn(),
    };

    mockEnvManager = {
      setupEnvironment: vi.fn().mockResolvedValue({
        port: 3001,
        dockerComposeGenerated: false,
        servicesStarted: false,
        playwrightInitialized: false,
      }),
      getPlaywrightPage: vi.fn().mockReturnValue(null),
    };

    mockScreenshotService = {
      captureMultipleScreenshots: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(EnvironmentManagerService).mockImplementation(function(this: any) {
      return mockEnvManager;
    } as any);
    vi.mocked(ScreenshotService).mockImplementation(function(this: any) {
      return mockScreenshotService;
    } as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TEST-123',
        environment_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase3EnvironmentNode(mockState);

      expect(result.current_phase).toBe('phase4_implementation');
      expect(result.phase3_complete).toBe(true);
      expect(mockEnvManager.setupEnvironment).not.toHaveBeenCalled();
    });

    it('should read completion data from disk', async () => {
      const completionData = {
        environment_data: { port: 3001 },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase3EnvironmentNode(mockState);

      expect(result.phase3_environment).toEqual({ port: 3001 });
    });
  });

  describe('phase2 validation', () => {
    it('should throw if phase2 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        return false;
      });

      const result = await phase3EnvironmentNode(mockState);

      expect(result.errors).toContain('Environment setup failed: Phase 2 not complete. Run Phase 2 first or use --start-phase 2');
      expect(result.current_phase).toBe('failed');
    });

    it('should proceed if phase2 complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });

      await phase3EnvironmentNode(mockState);

      expect(mockEnvManager.setupEnvironment).toHaveBeenCalledWith('TEST-123', true);
    });
  });

  describe('environment setup', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });
    });

    it('should create environment manager', async () => {
      await phase3EnvironmentNode(mockState);

      expect(EnvironmentManagerService).toHaveBeenCalledWith('/test/project');
    });

    it('should setup environment with ticket id', async () => {
      await phase3EnvironmentNode(mockState);

      expect(mockEnvManager.setupEnvironment).toHaveBeenCalledWith('TEST-123', true);
    });

    it('should write environment config to disk', async () => {
      const envConfig = {
        port: 3002,
        dockerComposeGenerated: true,
        servicesStarted: true,
        playwrightInitialized: false,
      };

      mockEnvManager.setupEnvironment.mockResolvedValue(envConfig);

      await phase3EnvironmentNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('environment-config.json'),
        JSON.stringify(envConfig, null, 2)
      );
    });
  });

  describe('screenshot capture', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });
    });

    it('should skip screenshots if playwright not initialized', async () => {
      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: false,
      });

      await phase3EnvironmentNode(mockState);

      expect(mockEnvManager.getPlaywrightPage).not.toHaveBeenCalled();
      expect(ScreenshotService).not.toHaveBeenCalled();
    });

    it('should capture screenshots if playwright initialized', async () => {
      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: true,
      });
      mockEnvManager.getPlaywrightPage.mockReturnValue(mockPage);
      mockScreenshotService.captureMultipleScreenshots.mockResolvedValue([
        { url: 'http://localhost:3001/', path: '/screenshot.png' },
      ]);

      await phase3EnvironmentNode(mockState);

      expect(ScreenshotService).toHaveBeenCalled();
      expect(mockScreenshotService.captureMultipleScreenshots).toHaveBeenCalledWith(
        mockPage,
        'http://localhost:3001',
        ['/', '/about', '/contact'],
        'before'
      );
    });

    it('should create screenshots directory', async () => {
      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: true,
      });
      mockEnvManager.getPlaywrightPage.mockReturnValue(mockPage);

      await phase3EnvironmentNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('screenshots-before'),
        { recursive: true }
      );
    });

    it('should write screenshots metadata if captured', async () => {
      const screenshots = [
        { url: 'http://localhost:3001/', path: '/screenshot1.png' },
        { url: 'http://localhost:3001/about', path: '/screenshot2.png' },
      ];

      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: true,
      });
      mockEnvManager.getPlaywrightPage.mockReturnValue(mockPage);
      mockScreenshotService.captureMultipleScreenshots.mockResolvedValue(screenshots);

      await phase3EnvironmentNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('screenshots-before.json'),
        JSON.stringify(screenshots, null, 2)
      );
    });

    it('should handle screenshot capture errors gracefully', async () => {
      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: true,
      });
      mockEnvManager.getPlaywrightPage.mockReturnValue(mockPage);
      mockScreenshotService.captureMultipleScreenshots.mockRejectedValue(
        new Error('Screenshot failed')
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await phase3EnvironmentNode(mockState);

      expect(result.current_phase).toBe('phase4_implementation');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Screenshot capture failed')
      );

      consoleSpy.mockRestore();
    });

    it('should skip screenshots if no playwright page available', async () => {
      mockEnvManager.setupEnvironment.mockResolvedValue({
        port: 3001,
        playwrightInitialized: true,
      });
      mockEnvManager.getPlaywrightPage.mockReturnValue(null);

      await phase3EnvironmentNode(mockState);

      expect(mockScreenshotService.captureMultipleScreenshots).not.toHaveBeenCalled();
    });
  });

  describe('disk persistence', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });
    });

    it('should create phase3 directory', async () => {
      await phase3EnvironmentNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('phase3'),
        { recursive: true }
      );
    });

    it('should write environment data to disk', async () => {
      const envConfig = { port: 3001, playwrightInitialized: false };
      mockEnvManager.setupEnvironment.mockResolvedValue(envConfig);

      await phase3EnvironmentNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('environment-data.json'),
        expect.stringContaining('"environment_config"')
      );
    });

    it('should write completion marker last', async () => {
      await phase3EnvironmentNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('environment-complete.json'),
        expect.stringContaining('completed_at')
      );
    });

    it('should include ticket id in completion marker', async () => {
      await phase3EnvironmentNode(mockState);

      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
        (call[0] as string).includes('environment-complete.json')
      );

      expect(lastCall).toBeDefined();
      expect(lastCall![1]).toContain('TEST-123');
    });
  });

  describe('return state', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });
    });

    it('should return minimal state with phase completion', async () => {
      const result = await phase3EnvironmentNode(mockState);

      expect(result).toEqual({
        current_phase: 'phase4_implementation',
        phase3_complete: true,
        phase3_environment: expect.any(Object),
      });
    });

    it('should set current_phase to phase4_implementation', async () => {
      const result = await phase3EnvironmentNode(mockState);

      expect(result.current_phase).toBe('phase4_implementation');
    });

    it('should set phase3_complete to true', async () => {
      const result = await phase3EnvironmentNode(mockState);

      expect(result.phase3_complete).toBe(true);
    });

    it('should include environment data in state', async () => {
      const envConfig = { port: 3001, playwrightInitialized: false };
      mockEnvManager.setupEnvironment.mockResolvedValue(envConfig);

      const result = await phase3EnvironmentNode(mockState);

      expect(result.phase3_environment).toEqual({
        environment_config: envConfig,
        screenshots_before: [],
        timestamp: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    it('should catch environment setup errors', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });

      mockEnvManager.setupEnvironment.mockRejectedValue(
        new Error('Port allocation failed')
      );

      const result = await phase3EnvironmentNode(mockState);

      expect(result.errors).toContain('Environment setup failed: Port allocation failed');
      expect(result.current_phase).toBe('failed');
    });

    it('should use default temp_dir if not provided', async () => {
      mockState.temp_dir = undefined;
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return true;
        return false;
      });

      await phase3EnvironmentNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude-temp/implement-ticket/TEST-123/phase3'),
        { recursive: true }
      );
    });
  });
});
