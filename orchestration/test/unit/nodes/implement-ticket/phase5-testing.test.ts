import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase5TestingNode } from '../../../../src/nodes/implement-ticket/phase5-testing.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { TestOrchestratorService } from '../../../../src/services/implement-ticket/test-orchestrator.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/test-orchestrator.service.js', () => ({
  TestOrchestratorService: vi.fn(),
}));

describe('phase5TestingNode', () => {
  let mockState: ImplementTicketState;
  let mockTestOrchestrator: any;

  const mockTestResults = [
    {
      testType: 'unit',
      passed: true,
      totalTests: 100,
      passedTests: 100,
      failedTests: 0,
      skippedTests: 0,
      duration: 5000,
      coverage: {
        overall: 85.5,
        lines: { percentage: 85.5, covered: 171, total: 200 },
        statements: { percentage: 85.5, covered: 171, total: 200 },
        functions: { percentage: 90, covered: 18, total: 20 },
        branches: { percentage: 80, covered: 16, total: 20 },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase5_testing',
      errors: [],
    } as ImplementTicketState;

    mockTestOrchestrator = {
      runAllTests: vi.fn().mockResolvedValue(mockTestResults),
    };

    vi.mocked(TestOrchestratorService).mockImplementation(function(this: any) {
      return mockTestOrchestrator;
    } as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('testing-complete.json')) return false;
      if (path.includes('implementation-complete.json')) return true;
      if (path.includes('implementation-data.json')) return true;
      if (path.includes('stack-profile.json')) return true;
      if (path.includes('framework-config.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('implementation-data.json')) {
        return JSON.stringify({ files_modified: ['file1.ts', 'file2.ts'] });
      }
      if (path.includes('stack-profile.json')) {
        return JSON.stringify({ primary_language: 'typescript' });
      }
      if (path.includes('framework-config.json')) {
        return JSON.stringify({ project_name: 'test' });
      }
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        testing_data: { all_passed: true },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase5TestingNode(mockState);

      expect(result.current_phase).toBe('phase6_visual');
      expect(result.phase5_complete).toBe(true);
      expect(mockTestOrchestrator.runAllTests).not.toHaveBeenCalled();
    });

    it('should read testing data from disk', async () => {
      const completionData = {
        testing_data: { all_passed: true, total_tests: 100 },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase5TestingNode(mockState);

      expect(result.phase5_testing).toEqual({ all_passed: true, total_tests: 100 });
    });
  });

  describe('phase4 validation', () => {
    it('should throw if phase4 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('testing-complete.json')) return false;
        if (path.includes('implementation-complete.json')) return false;
        return true;
      });

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Phase 4 not complete'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should throw if implementation data not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('testing-complete.json')) return false;
        if (path.includes('implementation-complete.json')) return true;
        if (path.includes('implementation-data.json')) return false;
        return true;
      });

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Implementation data not found'))).toBe(true);
    });

    it('should read implementation data from disk', async () => {
      await phase5TestingNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-data.json'),
        'utf-8'
      );
    });
  });

  describe('phase0 validation', () => {
    it('should throw if stack profile not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('testing-complete.json')) return false;
        if (path.includes('implementation-complete.json')) return true;
        if (path.includes('implementation-data.json')) return true;
        if (path.includes('stack-profile.json')) return false;
        return true;
      });

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Stack profile not found'))).toBe(true);
    });

    it('should throw if framework config not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('testing-complete.json')) return false;
        if (path.includes('implementation-complete.json')) return true;
        if (path.includes('implementation-data.json')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('framework-config.json')) return false;
        return true;
      });

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Framework config not found'))).toBe(true);
    });
  });

  describe('test execution', () => {
    it('should create TestOrchestratorService', async () => {
      await phase5TestingNode(mockState);

      expect(TestOrchestratorService).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({ project_name: 'test' })
      );
    });

    it('should run all tests with coverage and 80% threshold', async () => {
      await phase5TestingNode(mockState);

      expect(mockTestOrchestrator.runAllTests).toHaveBeenCalledWith(true, 80);
    });

    it('should handle test execution errors', async () => {
      mockTestOrchestrator.runAllTests.mockRejectedValue(new Error('Tests failed'));

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Phase 5 failed'))).toBe(true);
      expect(result.errors?.some(e => e.includes('HARD STOP'))).toBe(true);
    });

    it('should write test failure file on error', async () => {
      mockTestOrchestrator.runAllTests.mockRejectedValue(new Error('Tests failed'));

      await phase5TestingNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-failure.txt'),
        expect.stringContaining('Tests failed')
      );
    });
  });

  describe('test validation', () => {
    it('should throw if any tests failed', async () => {
      mockTestOrchestrator.runAllTests.mockResolvedValue([
        { ...mockTestResults[0], passed: false, failedTests: 5, passedTests: 95 },
      ]);

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Tests failed'))).toBe(true);
      expect(result.errors?.some(e => e.includes('HARD STOP'))).toBe(true);
    });

    it('should throw if coverage below threshold', async () => {
      mockTestOrchestrator.runAllTests.mockResolvedValue([
        {
          ...mockTestResults[0],
          coverage: { ...mockTestResults[0].coverage, overall: 75 },
        },
      ]);

      const result = await phase5TestingNode(mockState);

      expect(result.errors?.some(e => e.includes('Coverage below threshold'))).toBe(true);
      expect(result.errors?.some(e => e.includes('75.00%'))).toBe(true);
    });

    it('should pass if coverage meets threshold', async () => {
      mockTestOrchestrator.runAllTests.mockResolvedValue([
        {
          ...mockTestResults[0],
          coverage: { ...mockTestResults[0].coverage, overall: 85 },
        },
      ]);

      const result = await phase5TestingNode(mockState);

      expect(result.current_phase).toBe('phase6_visual');
    });

    it('should pass if no coverage data', async () => {
      mockTestOrchestrator.runAllTests.mockResolvedValue([
        {
          testType: 'unit',
          passed: true,
          totalTests: 100,
          passedTests: 100,
          failedTests: 0,
          skippedTests: 0,
          duration: 5000,
        },
      ]);

      const result = await phase5TestingNode(mockState);

      expect(result.current_phase).toBe('phase6_visual');
    });
  });

  describe('disk persistence', () => {
    it('should create phase5 directory', async () => {
      await phase5TestingNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('phase5'),
        { recursive: true }
      );
    });

    it('should write test results to disk', async () => {
      await phase5TestingNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-results.json'),
        expect.stringContaining('"testType"')
      );
    });

    it('should write test summary markdown', async () => {
      await phase5TestingNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-summary.md'),
        expect.stringContaining('Test Results Summary')
      );
    });

    it('should write testing data', async () => {
      await phase5TestingNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('testing-data.json'),
        expect.stringContaining('"test_results"')
      );
    });

    it('should write completion marker last', async () => {
      await phase5TestingNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('testing-complete.json'),
        expect.stringContaining('completed_at')
      );
    });
  });

  describe('return state', () => {
    it('should return minimal state with phase completion', async () => {
      const result = await phase5TestingNode(mockState);

      expect(result).toEqual({
        current_phase: 'phase6_visual',
        phase5_complete: true,
        phase5_testing: expect.any(Object),
      });
    });

    it('should set current_phase to phase6_visual', async () => {
      const result = await phase5TestingNode(mockState);

      expect(result.current_phase).toBe('phase6_visual');
    });

    it('should include testing data in state', async () => {
      const result = await phase5TestingNode(mockState);

      expect(result.phase5_testing).toEqual({
        test_results: expect.any(Array),
        total_tests: 100,
        passed_tests: 100,
        failed_tests: 0,
        all_passed: true,
        overall_passed: true,
        coverage_threshold_met: true,
        timestamp: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    it('should use default temp_dir if not provided', async () => {
      mockState.temp_dir = undefined;

      await phase5TestingNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude-temp/implement-ticket/TICKET-123'),
        'utf-8'
      );
    });
  });
});
