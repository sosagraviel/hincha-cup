import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase9ReviewNode } from '../../../../src/nodes/implement-ticket/phase9-review.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { ReviewLoopService } from '../../../../src/services/implement-ticket/review-loop.service.js';
import { TestOrchestratorService } from '../../../../src/services/implement-ticket/test-orchestrator.service.js';
import { AgentInvokerService } from '../../../../src/services/implement-ticket/agent-invoker.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/review-loop.service.js', () => ({
  ReviewLoopService: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/test-orchestrator.service.js', () => ({
  TestOrchestratorService: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/agent-invoker.service.js', () => ({
  AgentInvokerService: vi.fn(),
}));

describe('phase9ReviewNode', () => {
  let mockState: ImplementTicketState;
  let mockReviewLoop: any;
  let mockTestOrchestrator: any;
  let mockAgentInvoker: any;

  const mockReviewResult = {
    finalPassed: true,
    iterations: [
      {
        iteration: 1,
        prReview: { blockerCount: 2, majorCount: 3 },
        securityReview: { blockerCount: 0, majorCount: 1 },
        fixesApplied: ['fix1', 'fix2'],
        testsPassedAfterFix: true,
        improvement: 50,
      },
    ],
    convergence: 'converged',
    totalIssuesResolved: 6,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase9_review',
      errors: [],
    } as ImplementTicketState;

    mockReviewLoop = {
      runReviewLoop: vi.fn().mockResolvedValue(mockReviewResult),
    };

    mockTestOrchestrator = {};
    mockAgentInvoker = {};

    vi.mocked(ReviewLoopService).mockImplementation(function(this: any) {
      return mockReviewLoop;
    } as any);
    vi.mocked(TestOrchestratorService).mockImplementation(function(this: any) {
      return mockTestOrchestrator;
    } as any);
    vi.mocked(AgentInvokerService).mockImplementation(function(this: any) {
      return mockAgentInvoker;
    } as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('review-complete.json')) return false;
      if (path.includes('pr-complete.json')) return true;
      if (path.includes('pr-data.json')) return true;
      if (path.includes('stack-profile.json')) return true;
      if (path.includes('framework-config.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('pr-data.json')) {
        return JSON.stringify({ pr_url: 'https://github.com/org/repo/pull/123' });
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
        review_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase9ReviewNode(mockState);

      expect(result.current_phase).toBe('phase10_cleanup');
      expect(result.phase9_complete).toBe(true);
      expect(mockReviewLoop.runReviewLoop).not.toHaveBeenCalled();
    });
  });

  describe('phase8 validation', () => {
    it('should continue to phase10 if phase8 not complete (non-blocking)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('review-complete.json')) return false;
        if (path.includes('pr-complete.json')) return false;
        return true;
      });

      const result = await phase9ReviewNode(mockState);

      expect(result.current_phase).toBe('phase10_cleanup');
      expect(result.phase9_complete).toBe(true);
    });

    it('should continue to phase10 if pr data not found (non-blocking)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('review-complete.json')) return false;
        if (path.includes('pr-complete.json')) return true;
        if (path.includes('pr-data.json')) return false;
        return true;
      });

      const result = await phase9ReviewNode(mockState);

      expect(result.current_phase).toBe('phase10_cleanup');
      expect(result.phase9_complete).toBe(true);
    });
  });

  describe('review loop execution', () => {
    it('should create ReviewLoopService with correct params', async () => {
      await phase9ReviewNode(mockState);

      expect(ReviewLoopService).toHaveBeenCalledWith(
        '/test/project',
        '/test/framework',
        3,
        10.0
      );
    });

    it('should run review loop with services', async () => {
      const result = await phase9ReviewNode(mockState);

      expect(mockReviewLoop.runReviewLoop).toHaveBeenCalled();
      expect(result.current_phase).toBe('phase10_cleanup');
      expect(result.phase9_complete).toBe(true);
    });

    it('should handle review loop errors gracefully', async () => {
      mockReviewLoop.runReviewLoop.mockRejectedValue(new Error('Review failed'));

      const result = await phase9ReviewNode(mockState);

      expect(result.current_phase).toBe('phase10_cleanup');
      expect(result.phase9_complete).toBe(true);
    });
  });

  describe('disk persistence', () => {
    it('should write files to disk', async () => {
      await phase9ReviewNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase10_cleanup', async () => {
      const result = await phase9ReviewNode(mockState);

      expect(result.current_phase).toBe('phase10_cleanup');
    });

    it('should set phase9_complete to true', async () => {
      const result = await phase9ReviewNode(mockState);

      expect(result.phase9_complete).toBe(true);
    });
  });
});
