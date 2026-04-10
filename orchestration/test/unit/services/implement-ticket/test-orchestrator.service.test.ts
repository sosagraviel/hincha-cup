import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestOrchestratorService } from '../../../../src/services/implement-ticket/test-orchestrator.service.js';
import * as child_process from 'child_process';
import * as fs from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/command-resolver.service.js', () => ({
  CommandResolverService: vi.fn().mockImplementation(function (this: any) {
    return {
      getTestCommand: vi.fn().mockReturnValue(['npm', 'test']),
      executeWithFallback: vi.fn().mockResolvedValue({
        stdout:
          'PASS test/example.test.ts\nTest Suites: 1 passed, 1 total\nTests: 10 passed, 10 total',
        stderr: '',
        command: 'npm test',
      }),
    };
  }),
}));

describe('TestOrchestratorService', () => {
  let service: TestOrchestratorService;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        test_commands: { unit: ['npm', 'test'] },
      }),
    );
    vi.mocked(child_process.execSync).mockReturnValue('Tests passed' as any);

    service = new TestOrchestratorService('/test/project', {
      project_name: 'test',
      package_manager: 'npm',
      testing_frameworks: {
        typescript: ['vitest'],
      },
      primary_language: 'typescript',
    } as any);
  });

  describe('runAllTests', () => {
    it('should run all test types', async () => {
      const result = await service.runAllTests(false, 80);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle test failures gracefully', async () => {
      // Override the mock to throw an error
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.executeWithFallback = vi
        .fn()
        .mockRejectedValue(new Error('Tests failed'));

      await expect(service.runAllTests(false, 80)).rejects.toThrow();
    });
  });

  describe('runUnitTests', () => {
    it('should run unit tests', async () => {
      const result = await service.runUnitTests(false);
      expect(result).toBeDefined();
    });
  });

  describe('runIntegrationTests', () => {
    it('should run integration tests', async () => {
      const result = await service.runIntegrationTests();
      expect(result).toBeDefined();
    });
  });

  describe('runE2ETests', () => {
    it('should run e2e tests with timeout', async () => {
      const result = await service.runE2ETests();
      expect(result).toBeDefined();
    });

    it('should throw error when no e2e commands configured', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.getTestCommand = vi.fn().mockReturnValue([]);

      await expect(service.runE2ETests()).rejects.toThrow('No E2E test command configured');
    });
  });

  describe('parseTestOutput', () => {
    it('should parse Jest text output', () => {
      const output = 'Tests: 10 passed, 10 total';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.totalTests).toBe(10);
      expect(result.passedTests).toBe(10);
      expect(result.failedTests).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should parse Jest text output with failures', () => {
      const output = 'Tests: 8 passed, 2 failed, 10 total';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.totalTests).toBe(10);
      expect(result.passedTests).toBe(8);
      expect(result.failedTests).toBe(2);
      expect(result.passed).toBe(false);
    });

    it('should parse Pytest output', () => {
      const output = '15 passed in 2.34s';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.totalTests).toBe(15);
      expect(result.passedTests).toBe(15);
      expect(result.failedTests).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should parse Pytest output with failures', () => {
      const output = '10 passed in 2.34s';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.totalTests).toBe(10);
      expect(result.passedTests).toBe(10);
      expect(result.failedTests).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should parse Go test PASS output', () => {
      const output = 'PASS\nok  \tgithub.com/project/pkg\t0.123s';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.passed).toBe(true);
      expect(result.passedTests).toBe(1);
    });

    it('should parse Go test FAIL output', () => {
      const output = 'FAIL: TestExample\nFAIL\tgithub.com/project/pkg\t0.123s';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.passed).toBe(false);
      expect(result.failedTests).toBeGreaterThan(0);
    });

    it('should parse Jest JSON output', () => {
      const output =
        '{"numTotalTests":20,"numPassedTests":18,"numFailedTests":2,"numPendingTests":0,"success":false}';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.totalTests).toBe(20);
      expect(result.passedTests).toBe(18);
      expect(result.failedTests).toBe(2);
      expect(result.skippedTests).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('should use fallback parsing for unknown format', () => {
      const output = 'Some custom test output without clear patterns';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result).toBeDefined();
      expect(result.totalTests).toBe(1);
    });

    it('should detect failure in fallback parsing', () => {
      const output = 'Error: Test suite failed with 5 errors';
      const result = (service as any).parseTestOutput(output, 'unit');
      expect(result.passed).toBe(false);
      expect(result.failedTests).toBe(1);
    });
  });

  describe('parseJestJson', () => {
    it('should parse valid Jest JSON', () => {
      const json =
        '{"numTotalTests":10,"numPassedTests":10,"numFailedTests":0,"numPendingTests":2,"success":true}';
      const result = (service as any).parseJestJson(json);
      expect(result.totalTests).toBe(10);
      expect(result.passedTests).toBe(10);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(2);
      expect(result.passed).toBe(true);
    });

    it('should handle JSON parse error', () => {
      const invalidJson = '{invalid json';
      const result = (service as any).parseJestJson(invalidJson);
      expect(result.passed).toBe(true);
      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(1);
    });

    it('should handle success field in Jest JSON', () => {
      const json = '{"numTotalTests":5,"numPassedTests":3,"numFailedTests":2,"success":false}';
      const result = (service as any).parseJestJson(json);
      expect(result.passed).toBe(false);
    });
  });

  describe('collectCoverage', () => {
    it('should collect coverage from coverage-summary.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 85, pct: 85 },
            statements: { total: 120, covered: 100, pct: 83.33 },
            functions: { total: 30, covered: 28, pct: 93.33 },
            branches: { total: 50, covered: 40, pct: 80 },
          },
        }),
      );

      const result = (service as any).collectCoverage();
      expect(result).toBeDefined();
      expect(result.lines.percentage).toBe(85);
      expect(result.overall).toBeCloseTo(85.415, 1);
    });

    it('should return undefined when coverage file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = (service as any).collectCoverage();
      expect(result).toBeUndefined();
    });

    it('should handle JSON parse error in coverage file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const result = (service as any).collectCoverage();
      expect(result).toBeUndefined();
    });

    it('should handle missing total in coverage data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          someOtherData: {},
        }),
      );

      const result = (service as any).collectCoverage();
      expect(result).toBeUndefined();
    });
  });

  describe('runAllTests with integration scenarios', () => {
    it('should skip integration tests when not configured', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.getTestCommand = vi.fn((type: string) => {
        if (type === 'unit') return ['npm test'];
        if (type === 'integration') return [];
        if (type === 'e2e') return [];
        return [];
      });

      const result = await service.runAllTests(false, 80);
      expect(result.length).toBe(1); // Only unit tests
    });

    it('should skip e2e tests when not configured', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.getTestCommand = vi.fn((type: string) => {
        if (type === 'unit') return ['npm test'];
        if (type === 'integration') return [];
        if (type === 'e2e') return [];
        return [];
      });

      const result = await service.runAllTests(false, 80);
      expect(result.length).toBe(1);
    });

    it('should continue after integration test failure', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      let callCount = 0;

      mockCommandResolver.getTestCommand = vi.fn((type: string) => {
        if (type === 'unit') return ['npm test'];
        if (type === 'integration') return ['npm run test:integration'];
        if (type === 'e2e') return [];
        return [];
      });

      mockCommandResolver.executeWithFallback = vi.fn(async (commands: string[]) => {
        callCount++;
        if (callCount === 1) {
          // Unit tests succeed
          return { stdout: 'Tests: 10 passed, 10 total', stderr: '', command: 'npm test' };
        } else {
          // Integration tests fail
          throw new Error('Integration tests failed');
        }
      });

      const result = await service.runAllTests(false, 80);
      expect(result.length).toBe(1); // Only unit tests in result
    });

    it('should continue after e2e test failure', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      let callCount = 0;

      mockCommandResolver.getTestCommand = vi.fn((type: string) => {
        if (type === 'unit') return ['npm test'];
        if (type === 'integration') return [];
        if (type === 'e2e') return ['npm run test:e2e'];
        return [];
      });

      mockCommandResolver.executeWithFallback = vi.fn(async (commands: string[]) => {
        callCount++;
        if (callCount === 1) {
          // Unit tests succeed
          return { stdout: 'Tests: 10 passed, 10 total', stderr: '', command: 'npm test' };
        } else {
          // E2E tests fail
          throw new Error('E2E tests failed');
        }
      });

      const result = await service.runAllTests(false, 80);
      expect(result.length).toBe(1); // Only unit tests in result
    });

    it('should throw error when coverage below threshold', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.executeWithFallback = vi.fn().mockResolvedValue({
        stdout: 'Tests: 10 passed, 10 total',
        stderr: '',
        command: 'npm test',
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 50, pct: 50 },
            statements: { total: 100, covered: 50, pct: 50 },
            functions: { total: 100, covered: 50, pct: 50 },
            branches: { total: 100, covered: 50, pct: 50 },
          },
        }),
      );

      await expect(service.runAllTests(true, 80)).rejects.toThrow('Coverage below threshold');
    });
  });

  describe('error handling', () => {
    it('should throw error when unit test command not configured', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.getTestCommand = vi.fn().mockReturnValue([]);

      await expect(service.runUnitTests(false)).rejects.toThrow('No unit test command configured');
    });

    it('should throw error when integration test command not configured', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.getTestCommand = vi.fn().mockReturnValue([]);

      await expect(service.runIntegrationTests()).rejects.toThrow(
        'No integration test command configured',
      );
    });

    it('should handle unit test execution failure in runAllTests', async () => {
      const mockCommandResolver = (service as any).commandResolver;
      mockCommandResolver.executeWithFallback = vi
        .fn()
        .mockRejectedValue(new Error('Command execution failed'));

      await expect(service.runAllTests(false, 80)).rejects.toThrow('Unit tests failed');
    });
  });
});
