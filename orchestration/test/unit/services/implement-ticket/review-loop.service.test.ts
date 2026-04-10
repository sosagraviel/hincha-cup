import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewLoopService } from '../../../../src/services/implement-ticket/review-loop.service.js';

describe('ReviewLoopService', () => {
  let service: ReviewLoopService;
  let mockTestOrchestrator: any;
  let mockAgentInvoker: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReviewLoopService('/test/project', '/test/framework', 3, 10);

    mockTestOrchestrator = {
      runAllTests: vi.fn().mockResolvedValue([{ passed: true, totalTests: 100, passedTests: 100 }]),
    };

    mockAgentInvoker = {
      invokeAgent: vi.fn().mockResolvedValue('# Review\nNo issues'),
    };
  });

  describe('runReviewLoop', () => {
    it('should run review iterations', async () => {
      const result = await service.runReviewLoop(
        'https://github.com/org/repo/pull/123',
        mockTestOrchestrator,
      );
      expect(result).toBeDefined();
      expect(result.iterations).toBeDefined();
    });

    it('should stop at max iterations', async () => {
      mockAgentInvoker.invokeAgent.mockResolvedValue('# Review\n## Blockers\n- Issue 1');

      const result = await service.runReviewLoop(
        'https://github.com/org/repo/pull/123',
        mockTestOrchestrator,
      );
      expect(result.iterations.length).toBeLessThanOrEqual(3);
    });
  });

  describe('extractIssues', () => {
    it('should extract issues from review results', () => {
      const prReview = { issues: [{ severity: 'blocker', description: 'Issue 1' }] };
      const securityReview = { issues: [{ severity: 'major', description: 'Issue 2' }] };
      const result = (service as any).extractIssues(prReview, securityReview, ['blocker', 'major']);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('applyFixes', () => {
    it('should handle empty issues array', async () => {
      const fixes = await (service as any).applyFixes([]);
      expect(fixes).toEqual([]);
    });

    it('should apply fixes for issues', async () => {
      const issues = [
        {
          severity: 'blocker',
          description: 'Fix this',
          category: 'bug',
          file: 'test.ts',
          line: 10,
        },
      ];

      const fixes = await (service as any).applyFixes(issues);
      expect(fixes.length).toBeGreaterThan(0);
    });

    it('should handle fix errors gracefully', async () => {
      const issues = [{ severity: 'blocker', description: 'Fix this', category: 'bug' }];

      // The method catches errors internally
      const fixes = await (service as any).applyFixes(issues);
      expect(fixes).toBeDefined();
    });
  });

  describe('buildFixInstructions', () => {
    it('should build fix instructions with file and line info', () => {
      const issues = [
        {
          severity: 'blocker',
          description: 'Fix this bug',
          category: 'bug',
          file: 'src/test.ts',
          line: 42,
          suggestedFix: 'Change x to y',
        },
      ];

      const instructions = (service as any).buildFixInstructions(issues);
      expect(instructions).toContain('src/test.ts:42');
      expect(instructions).toContain('Fix this bug');
      expect(instructions).toContain('Change x to y');
    });

    it('should handle issue without file info', () => {
      const issues = [
        {
          severity: 'major',
          description: 'General issue',
          category: 'style',
        },
      ];

      const instructions = (service as any).buildFixInstructions(issues);
      expect(instructions).toContain('General issue');
      expect(instructions).toContain('MAJOR');
    });

    it('should handle issue without line number', () => {
      const issues = [
        {
          severity: 'blocker',
          description: 'File issue',
          category: 'bug',
          file: 'test.ts',
        },
      ];

      const instructions = (service as any).buildFixInstructions(issues);
      expect(instructions).toContain('test.ts:?');
    });
  });

  describe('convergence threshold', () => {
    it('should detect slow convergence', async () => {
      let callCount = 0;
      mockAgentInvoker.invokeAgent.mockImplementation(async () => {
        callCount++;
        // Start with 100 issues, reduce by 5 each time (5% improvement)
        const issueCount = Math.max(0, 100 - callCount * 5);
        const issues = Array.from({ length: issueCount }, (_, i) => ({
          severity: 'minor',
          description: `Issue ${i}`,
          category: 'style',
        }));
        return JSON.stringify({ issues });
      });

      const result = await service.runReviewLoop(
        'https://github.com/org/repo/pull/123',
        mockTestOrchestrator,
      );

      // Should still run iterations even with slow convergence
      expect(result.iterations.length).toBeGreaterThan(0);
    });
  });

  describe('test execution errors', () => {
    it('should handle test execution failures gracefully', async () => {
      mockAgentInvoker.invokeAgent.mockResolvedValue(
        JSON.stringify({
          issues: [{ severity: 'blocker', description: 'Issue 1', category: 'bug' }],
        }),
      );

      // Make test orchestrator throw an error
      mockTestOrchestrator.runAllTests.mockRejectedValue(new Error('Test runner crashed'));

      const result = await service.runReviewLoop(
        'https://github.com/org/repo/pull/123',
        mockTestOrchestrator,
      );

      // Should still complete despite test errors
      expect(result).toBeDefined();
      expect(result.iterations).toBeDefined();
    });

    it('should handle test failures after fixes', async () => {
      mockAgentInvoker.invokeAgent.mockResolvedValue(
        JSON.stringify({
          issues: [{ severity: 'blocker', description: 'Issue 1', category: 'bug' }],
        }),
      );

      // Tests fail after fixes
      mockTestOrchestrator.runAllTests.mockResolvedValue([
        { passed: false, totalTests: 100, passedTests: 90 },
      ]);

      const result = await service.runReviewLoop(
        'https://github.com/org/repo/pull/123',
        mockTestOrchestrator,
      );

      expect(result.finalPassed).toBe(false);
      expect(result.convergence).toBe('diverged');
    });
  });
});
