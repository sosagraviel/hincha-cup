import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase7DocumentationNode } from '../../../../src/nodes/implement-ticket/phase7-documentation.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { AgentInvokerService } from '../../../../src/services/implement-ticket/agent-invoker.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/agent-invoker.service.js', () => ({
  AgentInvokerService: vi.fn(),
}));

describe('phase7DocumentationNode', () => {
  let mockState: ImplementTicketState;
  let mockAgentInvoker: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase7_documentation',
      errors: [],
    } as ImplementTicketState;

    mockAgentInvoker = {
      invokeAgent: vi.fn().mockResolvedValue('PR Title\n\nPR Body'),
    };

    vi.mocked(AgentInvokerService).mockImplementation(function(this: any) {
      return mockAgentInvoker;
    } as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('documentation-complete.json')) return false;
      if (path.includes('visual-complete.json')) return true;
      if (path.includes('implementation-data.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('implementation-data.json')) {
        return JSON.stringify({ files_modified: ['file1.ts'] });
      }
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        documentation_data: { pr_title: 'Test' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase7DocumentationNode(mockState);

      expect(result.current_phase).toBe('phase8_pr');
      expect(result.phase7_complete).toBe(true);
    });
  });

  describe('phase6 validation', () => {
    it('should continue to phase8 if phase6 not complete (non-blocking)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('documentation-complete.json')) return false;
        if (path.includes('visual-complete.json')) return false;
        return true;
      });

      const result = await phase7DocumentationNode(mockState);

      expect(result.current_phase).toBe('phase8_pr');
      expect(result.phase7_complete).toBe(true);
    });
  });

  describe('documentation generation', () => {
    it('should skip if no modified files', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('implementation-data.json')) {
          return JSON.stringify({ files_modified: [] });
        }
        return '';
      });

      const result = await phase7DocumentationNode(mockState);

      expect(result.current_phase).toBe('phase8_pr');
      expect(result.phase7_complete).toBe(true);
    });

    it('should continue to phase8 on agent errors (non-blocking)', async () => {
      mockAgentInvoker.invokeAgent.mockRejectedValue(new Error('Agent failed'));

      const result = await phase7DocumentationNode(mockState);

      expect(result.current_phase).toBe('phase8_pr');
      expect(result.phase7_complete).toBe(true);
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase8_pr', async () => {
      const result = await phase7DocumentationNode(mockState);

      expect(result.current_phase).toBe('phase8_pr');
    });

    it('should set phase7_complete to true', async () => {
      const result = await phase7DocumentationNode(mockState);

      expect(result.phase7_complete).toBe(true);
    });
  });
});
