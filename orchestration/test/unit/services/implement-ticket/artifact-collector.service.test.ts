import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtifactCollectorService } from '../../../../src/services/implement-ticket/artifact-collector.service.js';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('ArtifactCollectorService', () => {
  let service: ArtifactCollectorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArtifactCollectorService('/test/project', '/test/temp');

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(child_process.execSync).mockReturnValue('' as any);
  });

  describe('service initialization', () => {
    it('should initialize service with paths', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getModifiedFiles', () => {
    it('should get modified files from git', () => {
      vi.mocked(child_process.execSync).mockReturnValue('file1.ts\nfile2.ts\n' as any);

      const result = service.getModifiedFiles();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getCommitStatistics', () => {
    it('should get commit statistics', () => {
      vi.mocked(child_process.execSync).mockReturnValue('5 files changed, 100 insertions(+), 20 deletions(-)' as any);

      const result = service.getCommitStatistics();
      expect(result).toBeDefined();
      expect(result.filesChanged).toBe(5);
      expect(result.linesAdded).toBe(100);
      expect(result.linesRemoved).toBe(20);
    });

    it('should handle stats without deletions', () => {
      vi.mocked(child_process.execSync).mockReturnValue('3 files changed, 50 insertions(+)' as any);

      const result = service.getCommitStatistics();
      expect(result.filesChanged).toBe(3);
      expect(result.linesAdded).toBe(50);
      expect(result.linesRemoved).toBe(0);
    });

    it('should handle stats without insertions', () => {
      vi.mocked(child_process.execSync).mockReturnValue('2 files changed, 10 deletions(-)' as any);

      const result = service.getCommitStatistics();
      expect(result.filesChanged).toBe(2);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(10);
    });

    it('should handle git errors', () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const result = service.getCommitStatistics();
      expect(result.filesChanged).toBe(0);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
    });

    it('should handle unparseable output', () => {
      vi.mocked(child_process.execSync).mockReturnValue('invalid output' as any);

      const result = service.getCommitStatistics();
      expect(result.filesChanged).toBe(0);
    });
  });

  describe('getModifiedFiles', () => {
    it('should handle git errors', () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('Git error');
      });

      const result = service.getModifiedFiles();
      expect(result).toEqual([]);
    });

    it('should filter empty lines', () => {
      vi.mocked(child_process.execSync).mockReturnValue('file1.ts\n\nfile2.ts\n' as any);

      const result = service.getModifiedFiles();
      expect(result).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  describe('collectArtifacts', () => {
    it('should collect all artifacts', async () => {
      const testResults = [
        {
          testType: 'unit' as const,
          passed: true,
          totalTests: 10,
          passedTests: 10,
          failedTests: 0,
          skippedTests: 0,
          duration: 1000,
          output: 'test output',
          coverage: {
            lines: { total: 100, covered: 90, percentage: 90 },
            statements: { total: 120, covered: 108, percentage: 90 },
            functions: { total: 30, covered: 27, percentage: 90 },
            branches: { total: 40, covered: 36, percentage: 90 },
            overall: 90
          }
        }
      ];

      const result = await service.collectArtifacts('PROJ-123', testResults);
      expect(result).toBeDefined();
      expect(result.prDescription).toContain('PROJ-123');
      expect(result.archivePath).toContain('PROJ-123');
    });

    it('should collect artifacts with screenshots', async () => {
      const beforeScreenshots = [{ path: '/before.png', timestamp: new Date().toISOString(), url: 'http://test', viewport: { width: 1920, height: 1080 } }];
      const afterScreenshots = [{ path: '/after.png', timestamp: new Date().toISOString(), url: 'http://test', viewport: { width: 1920, height: 1080 } }];
      const diffResults = [{
        passed: true,
        diffPercentage: 0.5,
        diffPixels: 100,
        totalPixels: 1000,
        threshold: 0.1,
        diffImagePath: '/diff.png',
        beforeImage: '/before.png',
        afterImage: '/after.png'
      }];

      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const result = await service.collectArtifacts(
        'PROJ-123',
        testResults,
        undefined,
        beforeScreenshots,
        afterScreenshots,
        diffResults
      );

      expect(result.artifacts.screenshots.length).toBe(3);
      expect(result.artifacts.screenshots).toContain('/before.png');
      expect(result.artifacts.screenshots).toContain('/after.png');
      expect(result.artifacts.screenshots).toContain('/diff.png');
    });

    it('should collect visual verification', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('visual-verdict.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('Visual verification passed');

      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const result = await service.collectArtifacts('PROJ-123', testResults, { passed: true });
      expect(result.artifacts.visualVerification).toBe('Visual verification passed');
    });

    it('should use JSON stringification if verdict file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const visualData = { passed: true, details: 'test' };
      const result = await service.collectArtifacts('PROJ-123', testResults, visualData);
      expect(result.artifacts.visualVerification).toContain('"passed": true');
    });
  });

  describe('collectTestResults', () => {
    it('should collect test results file', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('test-results.json')) return true;
        return false;
      });

      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const result = (service as any).collectTestResults(testResults);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('test-results.json');
    });

    it('should return empty array if test results not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = (service as any).collectTestResults([]);
      expect(result).toEqual([]);
    });
  });

  describe('collectCoverageReports', () => {
    it('should collect coverage reports', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('coverage')) return true;
        if (path.includes('index.html')) return true;
        if (path.includes('coverage-summary.json')) return true;
        return false;
      });

      const result = (service as any).collectCoverageReports();
      expect(result.length).toBe(2);
    });

    it('should return empty array if coverage dir not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = (service as any).collectCoverageReports();
      expect(result).toEqual([]);
    });

    it('should collect only existing coverage files', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('coverage') && !path.includes('.')) return true;
        if (path.includes('index.html')) return true;
        return false;
      });

      const result = (service as any).collectCoverageReports();
      expect(result.length).toBe(1);
      expect(result[0]).toContain('index.html');
    });
  });

  describe('collectImplementationLogs', () => {
    it('should collect implementation log', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('implementation-log.md')) return true;
        return false;
      });

      const result = (service as any).collectImplementationLogs();
      expect(result.length).toBe(1);
      expect(result[0]).toContain('implementation-log.md');
    });

    it('should return empty array if log not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = (service as any).collectImplementationLogs();
      expect(result).toEqual([]);
    });
  });

  describe('generatePRDescription', () => {
    it('should generate PR description with test results', () => {
      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1500,
        output: 'test output',
        coverage: {
          lines: { total: 100, covered: 85, percentage: 85 },
          statements: { total: 120, covered: 102, percentage: 85 },
          functions: { total: 30, covered: 25, percentage: 83.33 },
          branches: { total: 40, covered: 34, percentage: 85 },
          overall: 84.5
        }
      }];

      const result = (service as any).generatePRDescription('PROJ-123', testResults);
      expect(result).toContain('PROJ-123');
      expect(result).toContain('✅ UNIT Tests');
      expect(result).toContain('10/10 passed');
      expect(result).toContain('1.50s');
      expect(result).toContain('84.50%');
      expect(result).toContain('Lines: 85.00%');
    });

    it('should show failed test results', () => {
      const testResults = [{
        testType: 'unit' as const,
        passed: false,
        totalTests: 10,
        passedTests: 8,
        failedTests: 2,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const result = (service as any).generatePRDescription('PROJ-123', testResults);
      expect(result).toContain('❌ UNIT Tests');
      expect(result).toContain('FAILED');
    });

    it('should include visual verification with all passed', () => {
      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const diffResults = [{
        passed: true,
        diffPercentage: 0.5,
        diffPixels: 100,
        totalPixels: 1000,
        threshold: 0.1,
        diffImagePath: '/diff.png',
        beforeImage: '/before.png',
        afterImage: '/after.png'
      }];

      const result = (service as any).generatePRDescription(
        'PROJ-123',
        testResults,
        { passed: true },
        diffResults
      );

      expect(result).toContain('Visual Verification');
      expect(result).toContain('✅ Screenshot Comparison');
      expect(result).toContain('0.50%');
    });

    it('should include warning for visual changes', () => {
      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const diffResults = [{
        passed: false,
        diffPercentage: 5.5,
        diffPixels: 1000,
        diffImagePath: '/diff.png',
        beforeImage: '/before.png',
        afterImage: '/after.png'
      }];

      const result = (service as any).generatePRDescription(
        'PROJ-123',
        testResults,
        { passed: false },
        diffResults
      );

      expect(result).toContain('⚠️ Screenshot Comparison');
      expect(result).toContain('Visual changes detected');
    });

    it('should include footer with Claude attribution', () => {
      const testResults = [{
        testType: 'unit' as const,
        passed: true,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        skippedTests: 0,
        duration: 1000,
        output: 'test output'
      }];

      const result = (service as any).generatePRDescription('PROJ-123', testResults);
      expect(result).toContain('Claude Code');
      expect(result).toContain('Co-Authored-By');
    });
  });

  describe('createArchive', () => {
    it('should create archive with artifacts', async () => {
      const artifacts = {
        screenshots: ['/screenshot1.png', '/screenshot2.png'],
        testResults: ['/test-results.json'],
        coverageReports: ['/coverage/index.html'],
        implementationLogs: ['/implementation.log']
      };

      const result = await (service as any).createArchive('PROJ-123', artifacts);
      expect(result).toContain('PROJ-123-artifacts');
      expect(result).toContain('.tar.gz');
      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('tar -czf'),
        expect.any(Object)
      );
    });

    it('should return path even if no artifacts', async () => {
      const artifacts = {
        screenshots: [],
        testResults: [],
        coverageReports: [],
        implementationLogs: []
      };

      const result = await (service as any).createArchive('PROJ-123', artifacts);
      expect(result).toContain('PROJ-123-artifacts');
      expect(child_process.execSync).not.toHaveBeenCalled();
    });

    it('should handle tar errors', async () => {
      vi.mocked(child_process.execSync).mockImplementation(() => {
        throw new Error('tar error');
      });

      const artifacts = {
        screenshots: ['/screenshot.png'],
        testResults: [],
        coverageReports: [],
        implementationLogs: []
      };

      const result = await (service as any).createArchive('PROJ-123', artifacts);
      expect(result).toContain('PROJ-123-artifacts');
    });
  });
});
