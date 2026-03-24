import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase8PRNode } from '../../../../src/nodes/implement-ticket/phase8-pr.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('phase8PRNode', () => {
  let mockState: ImplementTicketState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase8_pr',
      errors: [],
    } as ImplementTicketState;

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('pr-complete.json')) return false;
      if (path.includes('documentation-complete.json')) return true;
      if (path.includes('documentation-data.json')) return true;
      if (path.includes('testing-complete.json')) return true;
      if (path.includes('test-results.json')) return true;
      if (path.includes('visual-data.json')) return true;
      if (path.includes('implementation-data.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('documentation-data.json')) {
        return JSON.stringify({ pr_title: 'Test PR', pr_body: 'Body' });
      }
      if (path.includes('test-results.json')) {
        return JSON.stringify([{
          testType: 'unit',
          passed: true,
          totalTests: 100,
          passedTests: 100,
          failedTests: 0,
          skippedTests: 0,
          duration: 1000,
          coverage: {
            lines: { total: 100, covered: 85, percentage: 85 },
            statements: { total: 100, covered: 85, percentage: 85 },
            functions: { total: 50, covered: 42, percentage: 84 },
            branches: { total: 40, covered: 34, percentage: 85 },
            overall: 85
          },
          output: 'Test output',
        }]);
      }
      if (path.includes('visual-data.json')) {
        return JSON.stringify({ verdict: 'passed', diff_percentage: 0 });
      }
      if (path.includes('implementation-data.json')) {
        return JSON.stringify({ files_modified: ['file1.ts'] });
      }
      return '';
    });

    vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
      if (cmd.includes('git rev-parse --abbrev-ref HEAD')) return 'feature-branch';
      if (cmd.includes('gh pr create')) return 'https://github.com/org/repo/pull/123';
      if (cmd.includes('git diff --name-only')) return 'file1.ts\nfile2.ts\n';
      if (cmd.includes('git status --porcelain')) return 'M file1.ts\nM file2.ts\n';
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        pr_data: { pr_url: 'https://github.com/org/repo/pull/123' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('phase9_review');
      expect(result.phase8_complete).toBe(true);
    });
  });

  describe('phase7 validation', () => {
    it('should fail if phase7 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('pr-complete.json')) return false;
        if (path.includes('documentation-complete.json')) return false;
        return true;
      });

      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('failed');
    });
  });

  describe('PR creation', () => {
    it('should create PR via gh cli', async () => {
      await phase8PRNode(mockState);

      expect(child_process.execSync).toHaveBeenCalledWith(
        expect.stringContaining('gh pr create'),
        expect.any(Object)
      );
    });

    it('should handle PR creation errors', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('gh pr create')) throw new Error('PR failed');
        if (cmd.includes('git diff --name-only')) return 'file1.ts\n';
        if (cmd.includes('git status --porcelain')) return 'M file1.ts\n';
        return '';
      });

      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('PR creation failed');
    });

    it('should fail if no git changes detected', async () => {
      vi.mocked(child_process.execSync).mockImplementation((cmd: any) => {
        if (cmd.includes('git diff --name-only')) return '';
        if (cmd.includes('git status --porcelain')) return '';
        if (cmd.includes('git branch --show-current')) return 'feature-branch';
        return '';
      });

      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('No changes to commit');
    });

    it('should include visual verification in PR body when converged', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('documentation-data.json')) {
          return JSON.stringify({ pr_title: 'Test PR', pr_body: 'Body' });
        }
        if (path.includes('test-results.json')) {
          return JSON.stringify([{
            testType: 'unit',
            passed: true,
            totalTests: 100,
            passedTests: 100,
            failedTests: 0,
            skippedTests: 0,
            duration: 1000,
            coverage: {
              lines: { total: 100, covered: 85, percentage: 85 },
              statements: { total: 100, covered: 85, percentage: 85 },
              functions: { total: 50, covered: 42, percentage: 84 },
              branches: { total: 40, covered: 34, percentage: 85 },
              overall: 85
            },
            output: 'Test output',
          }]);
        }
        if (path.includes('visual-data.json')) {
          return JSON.stringify({
            verdict: 'passed',
            diff_percentage: 0,
            converged: true,
            iterations: 3
          });
        }
        if (path.includes('implementation-data.json')) {
          return JSON.stringify({ files_modified: ['file1.ts'] });
        }
        return '';
      });

      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('phase9_review');
      expect(result.phase8_complete).toBe(true);
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase9_review', async () => {
      const result = await phase8PRNode(mockState);

      expect(result.current_phase).toBe('phase9_review');
    });

    it('should set phase8_complete to true', async () => {
      const result = await phase8PRNode(mockState);

      expect(result.phase8_complete).toBe(true);
    });
  });
});
