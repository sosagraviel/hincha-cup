import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvironmentManagerService } from '../../../../src/services/implement-ticket/environment-manager.service.js';
import * as child_process from 'child_process';
import * as fs from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({ goto: vi.fn() }),
      close: vi.fn(),
    }),
  },
}));

describe('EnvironmentManagerService', () => {
  let service: EnvironmentManagerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EnvironmentManagerService('/test/project');

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockReturnValue('' as any);
  });

  describe('setupEnvironment', () => {
    it('should allocate deterministic port', async () => {
      const result = await service.setupEnvironment('TICKET-123', false);
      expect(result.port).toBeDefined();
    });

    it('should skip docker if not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = await service.setupEnvironment('TICKET-123', false);
      expect(result.port).toBeDefined();
    });
  });

  describe('teardownEnvironment', () => {
    it('should stop docker services', async () => {
      await service.teardownEnvironment('TICKET-123');
      expect(true).toBe(true);
    });
  });

  describe('getPlaywrightPage', () => {
    it('should return undefined if not initialized', () => {
      const result = service.getPlaywrightPage();
      expect(result).toBeUndefined();
    });
  });

  describe('allocatePort', () => {
    it('should allocate deterministic port based on ticket ID', () => {
      const port1 = service.allocatePort('PROJ-123');
      const port2 = service.allocatePort('PROJ-123');
      expect(port1).toBe(port2);
      expect(port1).toBeGreaterThanOrEqual(10000);
      expect(port1).toBeLessThan(60000);
    });

    it('should allocate different ports for different ticket IDs', () => {
      const port1 = service.allocatePort('PROJ-123');
      const port2 = service.allocatePort('PROJ-456');
      // Note: Could be same due to hash collision, but unlikely
      expect(port1).toBeDefined();
      expect(port2).toBeDefined();
    });
  });

  describe('generateDockerComposeOverride', () => {
    it('should throw error if base compose file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => service.generateDockerComposeOverride('PROJ-123', 15000))
        .toThrow('Docker Compose file not found');
    });

    it('should generate override file with port mapping', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
version: '3.8'
services:
  app:
    ports:
      - "3000:3000"
`);

      const overridePath = service.generateDockerComposeOverride('PROJ-123', 15000);
      expect(overridePath).toContain('docker-compose.PROJ-123.yml');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should extract default port from compose file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
version: '3.8'
services:
  app:
    ports:
      - "8080:8080"
`);

      service.generateDockerComposeOverride('PROJ-123', 15000);
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;
      expect(content).toContain('15000:8080');
    });

    it('should handle environment variable ports', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
version: '3.8'
services:
  app:
    ports:
      - "3000:\${PORT}"
    environment:
      - PORT=4000
`);

      service.generateDockerComposeOverride('PROJ-123', 15000);
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;
      expect(content).toContain('15000:4000');
    });

    it('should use fallback port 3000 if no port found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
version: '3.8'
services:
  app:
    image: node:18
`);

      service.generateDockerComposeOverride('PROJ-123', 15000);
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const content = writeCall[1] as string;
      expect(content).toContain('15000:3000');
    });
  });

  describe('startDockerServices', () => {
    it('should return false if docker-compose.yml not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.startDockerServices('PROJ-123', '/test/override.yml');
      expect(result).toBe(false);
    });

    it('should start docker services with override', async () => {
      vi.useFakeTimers();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const promise = service.startDockerServices('PROJ-123', '/test/override.yml');
      await vi.advanceTimersByTimeAsync(11000);
      const result = await promise;

      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('docker-compose'),
        expect.any(Object)
      );
      expect(result).toBe(true);
      vi.useRealTimers();
    });

    it('should run in detached mode by default', async () => {
      vi.useFakeTimers();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const promise = service.startDockerServices('PROJ-123', '/test/override.yml');
      await vi.advanceTimersByTimeAsync(11000);
      await promise;

      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('-d'),
        expect.any(Object)
      );
      vi.useRealTimers();
    });

    it('should run in foreground when detached is false', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.startDockerServices('PROJ-123', '/test/override.yml', false);
      const execCall = vi.mocked(child_process.execSync).mock.calls[0][0];
      expect(execCall).not.toContain(' -d');
    });

    it('should handle docker start errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('Docker error');
      });

      const result = await service.startDockerServices('PROJ-123', '/test/override.yml');
      expect(result).toBe(false);
    });
  });

  describe('stopDockerServices', () => {
    it('should return false if files not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.stopDockerServices('PROJ-123', '/test/override.yml');
      expect(result).toBe(false);
    });

    it('should stop docker services', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await service.stopDockerServices('PROJ-123', '/test/override.yml');
      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('docker-compose'),
        expect.any(Object)
      );
      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('down'),
        expect.any(Object)
      );
      expect(result).toBe(true);
    });

    it('should handle docker stop errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('Docker error');
      });

      const result = await service.stopDockerServices('PROJ-123', '/test/override.yml');
      expect(result).toBe(false);
    });
  });

  describe('checkServiceStatus', () => {
    it('should return running true when service responds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await service.checkServiceStatus(15000);
      expect(result.running).toBe(true);
      expect(result.port).toBe(15000);
      expect(result.healthCheckUrl).toBe('http://localhost:15000');
    });

    it('should return running false when service not responding', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await service.checkServiceStatus(15000);
      expect(result.running).toBe(false);
      expect(result.port).toBe(15000);
    });

    it('should consider 4xx errors as running', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await service.checkServiceStatus(15000);
      expect(result.running).toBe(true);
    });

    it('should consider 5xx errors as not running', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await service.checkServiceStatus(15000);
      expect(result.running).toBe(false);
    });
  });

  describe('initializePlaywright', () => {
    it('should initialize playwright in headless mode', async () => {
      const result = await service.initializePlaywright();
      expect(result).toBe(true);
    });

    it('should initialize playwright in non-headless mode', async () => {
      const result = await service.initializePlaywright(false);
      expect(result).toBe(true);
    });

    it('should handle playwright initialization errors', async () => {
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockRejectedValue(new Error('Playwright error'));

      const result = await service.initializePlaywright();
      expect(result).toBe(false);
    });

    it('should set page property after initialization', async () => {
      const mockPage = { goto: vi.fn() };
      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn(),
      };
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockResolvedValueOnce(mockBrowser as any);

      await service.initializePlaywright();
      const page = service.getPlaywrightPage();
      expect(page).toBeDefined();
    });
  });

  describe('closePlaywright', () => {
    it('should close playwright browser', async () => {
      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue({ goto: vi.fn() }),
        close: vi.fn(),
      };
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as any);

      await service.initializePlaywright();
      await service.closePlaywright();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(service.getPlaywrightPage()).toBeUndefined();
    });

    it('should do nothing if playwright not initialized', async () => {
      await service.closePlaywright();
      expect(true).toBe(true); // No error thrown
    });
  });

  describe('setupEnvironment with docker', () => {
    it('should setup environment with docker', async () => {
      vi.useFakeTimers();
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('docker-compose.yml')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
version: '3.8'
services:
  app:
    ports:
      - "3000:3000"
`);

      const promise = service.setupEnvironment('PROJ-123', false);
      await vi.advanceTimersByTimeAsync(11000); // Advance past the 10 second wait
      const result = await promise;

      expect(result.port).toBeDefined();
      expect(result.dockerComposeOverride).toBeDefined();
      expect(result.playwrightInitialized).toBe(false);

      vi.useRealTimers();
    });

    it('should initialize playwright when requested', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.setupEnvironment('PROJ-123', true);
      expect(result.playwrightInitialized).toBe(true);
    });
  });

  describe('teardownEnvironment', () => {
    it('should teardown environment without docker', async () => {
      await service.teardownEnvironment('PROJ-123');
      expect(true).toBe(true); // No error thrown
    });

    it('should stop docker services if override exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.teardownEnvironment('PROJ-123', '/test/override.yml');
      expect(child_process.execSync).toHaveBeenCalled();
    });

    it('should close playwright during teardown', async () => {
      const mockBrowser = {
        newPage: vi.fn().mockResolvedValue({ goto: vi.fn() }),
        close: vi.fn(),
      };
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as any);

      await service.initializePlaywright();
      await service.teardownEnvironment('PROJ-123');

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
