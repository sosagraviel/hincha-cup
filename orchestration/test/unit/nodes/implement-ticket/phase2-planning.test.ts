import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase2PlanningNode } from '../../../../src/nodes/implement-ticket/phase2-planning.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { AgentFactory } from '../../../../src/utils/shared/agent-factory/index.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: { create: vi.fn() },
}));

describe('phase2PlanningNode', () => {
  let mockState: ImplementTicketState;
  let mockAgent: any;

  const defaultPlannerOutput = `
# Implementation Plan

Implement the new feature...

## Test Plan

- Unit tests for core functionality
- Integration tests for API endpoints
- E2E tests for user flow

## Environment Requirements

Requires Docker for running the database.
Environment variables: DATABASE_URL=postgres://...
`;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase2_planning',
      errors: [],
    } as unknown as ImplementTicketState;

    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: defaultPlannerOutput,
        sessionId: 'test-session-123',
      }),
    };

    const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('planning-complete.json')) return false;
      if (path.includes('context-complete.json')) return true;
      if (path.includes('full-context.md')) return true;
      if (path.includes('stack-profile.json')) return true;
      if (path.includes('.code-graph.db')) return true;
      if (path.includes('planner.md')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('full-context.md')) return '# Full Context\n\nContext here...';
      if (path.includes('stack-profile.json')) {
        return JSON.stringify({
          primary_language: 'typescript',
          testing_frameworks: { typescript: ['vitest'] },
        });
      }
      if (path.includes('planner.md')) return 'tools: Read, Grep, Glob, mcp__code_graph';
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        planning_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('phase3_environment');
      expect(result.phase2_complete).toBe(true);
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });

    it('should read planning data from disk', async () => {
      const completionData = {
        planning_data: { implementation_plan: 'Plan content' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning).toEqual({ implementation_plan: 'Plan content' });
    });
  });

  describe('phase1 validation', () => {
    it('should fail if phase1 not complete (context-complete.json missing)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return false;
        return false;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Phase 1 not complete');
    });

    it('should fail if phase1 not complete (full-context.md missing)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return false;
        return false;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Phase 1 not complete');
    });

    it('should fail if stack-profile.json not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return false;
        return false;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Stack profile not found');
    });
  });

  describe('agent invocation', () => {
    it('should create agent with correct configuration', async () => {
      const mockFactory = { createAgent: vi.fn().mockResolvedValue(mockAgent) };
      vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);

      await phase2PlanningNode(mockState);

      expect(mockFactory.createAgent).toHaveBeenCalledWith({
        agentName: 'planner',
        agentFilePath: expect.stringContaining('planner.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 600000,
        settingsPath: expect.stringContaining('settings.json'),
      });
    });

    it('should invoke agent with planner prompt', async () => {
      await phase2PlanningNode(mockState);

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        inputPrompt: expect.stringContaining('TICKET-123'),
      });
    });

    it('should include graph instructions in planner prompt', async () => {
      await phase2PlanningNode(mockState);

      expect(mockAgent.invoke).toHaveBeenCalledWith({
        inputPrompt: expect.stringContaining('Use mcp__code_graph before broad Grep/Glob'),
      });
    });

    it('should handle agent errors gracefully', async () => {
      mockAgent.invoke.mockRejectedValue(new Error('Agent failed'));

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Planning failed');
    });

    it('should fail before invoking agent when code graph is missing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return false;
        return false;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Code graph database not found');
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });

    it('should fail before invoking agent when planner is not graph-aware', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        if (path.includes('.code-graph.db')) return true;
        if (path.includes('planner.md')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('full-context.md')) return '# Full Context\n\nContext here...';
        if (path.includes('stack-profile.json'))
          return JSON.stringify({ primary_language: 'typescript' });
        if (path.includes('planner.md')) return 'tools: Read, Grep, Glob';
        return '';
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Generated agent is not graph-aware');
      expect(mockAgent.invoke).not.toHaveBeenCalled();
    });
  });

  describe('plan parsing', () => {
    it('should extract implementation plan from output', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.implementation_plan).toContain('Implement the new feature');
    });

    it('should extract test plan section', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan).toBeDefined();
      expect(result.phase2_planning?.test_plan.unit_tests).toBeDefined();
    });

    it('should detect unit test requirement', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.unit_tests.required).toBe(true);
    });

    it('should handle missing test plan section', async () => {
      mockAgent.invoke.mockResolvedValue({
        output: '# Implementation Plan\n\nNo tests mentioned',
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.unit_tests.required).toBe(false);
    });
  });

  describe('disk persistence', () => {
    it('should write planning files to disk', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should write completion marker', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('planning-complete.json'),
        expect.any(String),
      );
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase3_environment', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('phase3_environment');
    });

    it('should set phase2_complete to true', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_complete).toBe(true);
    });

    it('should include phase2_planning data', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning).toBeDefined();
      expect(result.phase2_planning?.implementation_plan).toBeDefined();
    });
  });
});
