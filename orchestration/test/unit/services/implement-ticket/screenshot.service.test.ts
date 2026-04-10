import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotService } from '../../../../src/services/implement-ticket/screenshot.service.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('pixelmatch', () => ({
  default: vi.fn().mockReturnValue(0),
}));

vi.mock('pngjs', () => ({
  default: {
    PNG: class PNG {
      static sync = {
        read: vi.fn().mockReturnValue({ width: 100, height: 100, data: Buffer.alloc(40000) }),
        write: vi.fn().mockReturnValue(Buffer.from('diff-image')),
      };
      constructor(opts?: any) {
        (this as any).data = Buffer.alloc(40000);
      }
      pack = vi.fn().mockReturnThis();
      on = vi.fn((event: string, cb: Function) => {
        if (event === 'end') setTimeout(cb, 0);
        return this;
      });
    },
  },
  PNG: class PNG {
    static sync = {
      read: vi.fn().mockReturnValue({ width: 100, height: 100, data: Buffer.alloc(40000) }),
      write: vi.fn().mockReturnValue(Buffer.from('diff-image')),
    };
    constructor(opts?: any) {
      (this as any).data = Buffer.alloc(40000);
    }
    pack = vi.fn().mockReturnThis();
    on = vi.fn((event: string, cb: Function) => {
      if (event === 'end') setTimeout(cb, 0);
      return this;
    });
  },
}));

describe('ScreenshotService', () => {
  let service: ScreenshotService;
  let mockPage: any;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-png-data'));

    service = new ScreenshotService('/test/screenshots');

    mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
      setViewportSize: vi.fn().mockResolvedValue(null),
      waitForTimeout: vi.fn().mockResolvedValue(null),
      waitForLoadState: vi.fn().mockResolvedValue(null),
      waitForSelector: vi.fn().mockResolvedValue(null),
      $: vi.fn().mockResolvedValue(null),
    };
  });

  describe('captureScreenshot', () => {
    it('should capture single screenshot', async () => {
      const result = await service.captureScreenshot(mockPage, 'http://localhost:3000', 'home');
      expect(result).toBeDefined();
      expect(mockPage.goto).toHaveBeenCalled();
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it('should handle navigation errors', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));
      await expect(
        service.captureScreenshot(mockPage, 'http://localhost:3000', 'home'),
      ).rejects.toThrow();
    });
  });

  describe('captureMultipleScreenshots', () => {
    it('should handle multiple routes', async () => {
      const result = await service.captureMultipleScreenshots(
        mockPage,
        'http://localhost:3000',
        ['/', '/about'],
        'before',
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty routes', async () => {
      const result = await service.captureMultipleScreenshots(
        mockPage,
        'http://localhost:3000',
        [],
        'before',
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('compareScreenshots', () => {
    it('should handle missing before screenshot', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        service.compareScreenshots('/path/to/before.png', '/path/to/after.png', '/diff.png'),
      ).rejects.toThrow('Before screenshot not found');
    });

    it('should handle missing after screenshot', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('before')) return true;
        return false;
      });

      await expect(
        service.compareScreenshots('/path/to/before.png', '/path/to/after.png', '/diff.png'),
      ).rejects.toThrow('After screenshot not found');
    });

    it('should successfully compare matching screenshots', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await service.compareScreenshots(
        '/path/to/before.png',
        '/path/to/after.png',
        '/diff.png',
      );

      expect(result).toBeDefined();
      expect(result.diffPixels).toBe(0);
      expect(result.diffPercentage).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should detect differences in screenshots', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const pixelmatch = await import('pixelmatch');
      vi.mocked(pixelmatch.default).mockReturnValue(1000); // 1000 different pixels

      const result = await service.compareScreenshots(
        '/path/to/before.png',
        '/path/to/after.png',
        '/diff.png',
      );

      expect(result.diffPixels).toBe(1000);
      expect(result.diffPercentage).toBeGreaterThan(0);
    });

    it('should fail comparison if diff exceeds 5%', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const pixelmatch = await import('pixelmatch');
      vi.mocked(pixelmatch.default).mockReturnValue(600); // 6% of 10000 pixels

      const result = await service.compareScreenshots(
        '/path/to/before.png',
        '/path/to/after.png',
        '/diff.png',
      );

      expect(result.passed).toBe(false);
      expect(result.diffPercentage).toBeGreaterThan(5);
    });

    it('should handle dimension mismatch', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const pngjs = await import('pngjs');
      const PNGDefault = pngjs.default;

      vi.mocked((PNGDefault as any).PNG.sync.read)
        .mockReturnValueOnce({ width: 100, height: 100, data: Buffer.alloc(40000) } as any)
        .mockReturnValueOnce({ width: 200, height: 200, data: Buffer.alloc(160000) } as any);

      await expect(
        service.compareScreenshots('/before.png', '/after.png', '/diff.png'),
      ).rejects.toThrow("Image dimensions don't match");
    });

    it('should write diff image', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.compareScreenshots('/before.png', '/after.png', '/diff.png');

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('compareMultipleScreenshots', () => {
    it('should compare multiple screenshot pairs', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const beforeScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
        {
          url: 'http://test.com/about',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-about.png',
        },
      ];

      const afterScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/after-home.png',
        },
        {
          url: 'http://test.com/about',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/after-about.png',
        },
      ];

      const results = await service.compareMultipleScreenshots(beforeScreenshots, afterScreenshots);

      expect(results.length).toBe(2);
    });

    it('should skip screenshots without matching after', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const beforeScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
        {
          url: 'http://test.com/missing',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-missing.png',
        },
      ];

      const afterScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/after-home.png',
        },
      ];

      const results = await service.compareMultipleScreenshots(beforeScreenshots, afterScreenshots);

      expect(results.length).toBe(1);
    });

    it('should handle comparison errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const beforeScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
      ];

      const afterScreenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/after-home.png',
        },
      ];

      const results = await service.compareMultipleScreenshots(beforeScreenshots, afterScreenshots);

      expect(results.length).toBe(0);
    });
  });

  describe('generateComparisonReport', () => {
    it('should generate report with all passed', () => {
      const results = [
        {
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 10000,
          diffImagePath: '/diff1.png',
          passed: true,
          threshold: 0.1,
        },
        {
          diffPixels: 10,
          diffPercentage: 0.1,
          totalPixels: 10000,
          diffImagePath: '/diff2.png',
          passed: true,
          threshold: 0.1,
        },
      ];

      const screenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
        {
          url: 'http://test.com/about',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-about.png',
        },
      ];

      const report = service.generateComparisonReport(results, screenshots);

      expect(report.summary.total_comparisons).toBe(2);
      expect(report.summary.passed).toBe(2);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.pass_rate).toBe('100.00%');
    });

    it('should generate report with failures', () => {
      const results = [
        {
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 10000,
          diffImagePath: '/diff1.png',
          passed: true,
          threshold: 0.1,
        },
        {
          diffPixels: 600,
          diffPercentage: 6,
          totalPixels: 10000,
          diffImagePath: '/diff2.png',
          passed: false,
          threshold: 0.1,
        },
      ];

      const screenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
        {
          url: 'http://test.com/about',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-about.png',
        },
      ];

      const report = service.generateComparisonReport(results, screenshots);

      expect(report.summary.total_comparisons).toBe(2);
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(1);
      expect(report.summary.pass_rate).toBe('50.00%');
    });

    it('should calculate statistics correctly', () => {
      const results = [
        {
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 10000,
          diffImagePath: '/diff1.png',
          passed: true,
          threshold: 0.1,
        },
        {
          diffPixels: 100,
          diffPercentage: 1,
          totalPixels: 10000,
          diffImagePath: '/diff2.png',
          passed: true,
          threshold: 0.1,
        },
        {
          diffPixels: 200,
          diffPercentage: 2,
          totalPixels: 10000,
          diffImagePath: '/diff3.png',
          passed: true,
          threshold: 0.1,
        },
      ];

      const screenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
        {
          url: 'http://test.com/about',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-about.png',
        },
        {
          url: 'http://test.com/contact',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-contact.png',
        },
      ];

      const report = service.generateComparisonReport(results, screenshots);

      expect(report.statistics.average_diff_percentage).toBe('1.00%');
      expect(report.statistics.max_diff_percentage).toBe('2.00%');
      expect(report.statistics.min_diff_percentage).toBe('0.00%');
    });

    it('should include details for each comparison', () => {
      const results = [
        {
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 10000,
          diffImagePath: '/diff1.png',
          passed: true,
          threshold: 0.1,
        },
      ];

      const screenshots = [
        {
          url: 'http://test.com/',
          timestamp: '2024-01-01',
          viewport: { width: 1920, height: 1080 },
          path: '/before-home.png',
        },
      ];

      const report = service.generateComparisonReport(results, screenshots);

      expect(report.details.length).toBe(1);
      expect(report.details[0].url).toBe('http://test.com/');
      expect(report.details[0].diff_percentage).toBe('0.00%');
      expect(report.details[0].passed).toBe(true);
    });
  });

  describe('determineRoutesToCapture', () => {
    it('should return default routes', async () => {
      const routes = await service.determineRoutesToCapture('/test/project');

      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThan(0);
      expect(routes).toContain('/');
    });
  });

  describe('captureScreenshot with custom viewport', () => {
    it('should use custom viewport', async () => {
      const customViewport = { width: 1280, height: 720 };

      const result = await service.captureScreenshot(
        mockPage,
        'http://localhost:3000',
        'custom-viewport',
        customViewport,
      );

      expect(mockPage.setViewportSize).toHaveBeenCalledWith(customViewport);
      expect(result.viewport).toEqual(customViewport);
    });
  });

  describe('captureMultipleScreenshots error handling', () => {
    it('should continue capturing after error', async () => {
      mockPage.goto
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Navigation failed'))
        .mockResolvedValueOnce(null);

      const result = await service.captureMultipleScreenshots(
        mockPage,
        'http://localhost:3000',
        ['/', '/error', '/about'],
        'before',
      );

      expect(result.length).toBe(2);
    });
  });

  describe('service initialization', () => {
    it('should create output directory if not exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      new ScreenshotService('/new/screenshots');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/screenshots', { recursive: true });
    });

    it('should not create directory if exists', () => {
      vi.clearAllMocks();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      new ScreenshotService('/existing/screenshots');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });
});
