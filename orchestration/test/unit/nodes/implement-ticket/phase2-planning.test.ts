import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase2PlanningNode } from '../../../../src/nodes/implement-ticket/phase2-planning.node.js';
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

describe('phase2PlanningNode', () => {
  let mockState: ImplementTicketState;
  let mockAgentInvoker: any;

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
    } as ImplementTicketState;

    mockAgentInvoker = {
      invokePlanner: vi.fn().mockResolvedValue(defaultPlannerOutput),
    };

    vi.mocked(AgentInvokerService).mockImplementation(function(this: any) {
      return mockAgentInvoker;
    } as any);

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('full-context.md')) return '# Full Context\n\nContext here...';
      if (path.includes('stack-profile.json')) {
        return JSON.stringify({
          primary_language: 'typescript',
          testing_frameworks: { typescript: ['vitest'] },
        });
      }
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
      expect(mockAgentInvoker.invokePlanner).not.toHaveBeenCalled();
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
    it('should throw if phase1 completion marker not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return false;
        return true;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('Phase 1 not complete'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should throw if full-context.md not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return false;
        return true;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('Phase 1 not complete'))).toBe(true);
    });

    it('should read full context from disk', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });

      await phase2PlanningNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('full-context.md'),
        'utf-8'
      );
    });
  });

  describe('phase0 validation', () => {
    it('should throw if stack profile not found', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return false;
        return false;
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('Stack profile not found'))).toBe(true);
    });

    it('should read stack profile from disk', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });

      await phase2PlanningNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('stack-profile.json'),
        'utf-8'
      );
    });
  });

  describe('framework path validation', () => {
    it('should throw if framework_path not set', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });

      mockState.framework_path = undefined as any;

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('framework_path not set'))).toBe(true);
    });
  });

  describe('agent invocation', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });
    });

    it('should create AgentInvokerService with paths', async () => {
      await phase2PlanningNode(mockState);

      expect(AgentInvokerService).toHaveBeenCalledWith('/test/project', '/test/framework');
    });

    it('should invoke planner with context and stack profile', async () => {
      const stackProfile = { primary_language: 'python' };
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('full-context.md')) return 'Context content';
        if (path.includes('stack-profile.json')) return JSON.stringify(stackProfile);
        return '';
      });

      await phase2PlanningNode(mockState);

      expect(mockAgentInvoker.invokePlanner).toHaveBeenCalledWith(
        'Context content',
        stackProfile,
        'TICKET-123'
      );
    });

    it('should handle planner agent invocation errors', async () => {
      mockAgentInvoker.invokePlanner.mockRejectedValue(new Error('Agent failed'));

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('Planner agent invocation failed'))).toBe(true);
      expect(result.errors?.some(e => e.includes('planner.md'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });
  });

  describe('plan extraction', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });
    });

    it('should extract implementation plan from planner output', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue('# Plan\nImplementation details');

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.implementation_plan).toContain('Implementation details');
    });

    it('should extract test plan with unit tests', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Test Plan
- Unit tests for all components
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.unit_tests.required).toBe(true);
    });

    it('should extract test plan with integration tests', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Testing Plan
- Integration tests for API
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.integration_tests.required).toBe(true);
    });

    it('should extract test plan with e2e tests', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Test Plan
- E2E tests for user workflows
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.e2e_tests.required).toBe(true);
    });

    it('should extract test plan with end-to-end tests', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Test Plan
- End-to-end tests for critical paths
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.e2e_tests.required).toBe(true);
    });

    it('should set coverage target for unit tests', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.unit_tests.coverage_target).toBe(80);
    });

    it('should include testing frameworks from stack profile', async () => {
      const stackProfile = {
        primary_language: 'typescript',
        testing_frameworks: { typescript: ['vitest', 'jest'] },
      };
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('full-context.md')) return 'Context';
        if (path.includes('stack-profile.json')) return JSON.stringify(stackProfile);
        return '';
      });

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.test_plan.unit_tests.frameworks).toEqual({
        typescript: ['vitest', 'jest'],
      });
    });

    it('should extract environment requirements with docker', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Environment
Requires Docker for database services
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.environment_requirements?.docker.required).toBe(true);
    });

    it('should extract environment variables', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Environment Requirements
DATABASE_URL=postgres://localhost
API_KEY=secret
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.environment_requirements?.env_vars).toContain('DATABASE_URL');
      expect(result.phase2_planning?.environment_requirements?.env_vars).toContain('API_KEY');
    });

    it('should set environment requirements to undefined if no section found', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue('# Plan\nNo environment section');

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.environment_requirements).toBeUndefined();
    });

    it('should handle empty environment section', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Environment
`);

      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning?.environment_requirements).toBeUndefined();
    });
  });

  describe('disk persistence', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });
    });

    it('should create phase2 directory', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('phase2'),
        { recursive: true }
      );
    });

    it('should write implementation plan to disk', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue('Implementation plan content');

      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('implementation-plan.md'),
        'Implementation plan content'
      );
    });

    it('should write test plan to disk', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-plan.json'),
        expect.stringContaining('unit_tests')
      );
    });

    it('should write environment requirements if present', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue(`
## Environment
Requires Docker
`);

      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('environment-requirements.json'),
        expect.stringContaining('docker')
      );
    });

    it('should not write environment requirements if not present', async () => {
      mockAgentInvoker.invokePlanner.mockResolvedValue('No environment section');

      await phase2PlanningNode(mockState);

      const envCalls = vi.mocked(fs.writeFileSync).mock.calls.filter(call =>
        (call[0] as string).includes('environment-requirements.json')
      );

      expect(envCalls.length).toBe(0);
    });

    it('should write planning data to disk', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('planning-data.json'),
        expect.stringContaining('"implementation_plan"')
      );
    });

    it('should write completion marker last', async () => {
      await phase2PlanningNode(mockState);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('planning-complete.json'),
        expect.stringContaining('completed_at')
      );
    });

    it('should include ticket id in completion marker', async () => {
      await phase2PlanningNode(mockState);

      const lastCall = vi.mocked(fs.writeFileSync).mock.calls.find(call =>
        (call[0] as string).includes('planning-complete.json')
      );

      expect(lastCall).toBeDefined();
      expect(lastCall![1]).toContain('TICKET-123');
    });
  });

  describe('return state', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });
    });

    it('should return minimal state with phase completion', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result).toEqual({
        current_phase: 'phase3_environment',
        phase2_complete: true,
        phase2_planning: expect.any(Object),
      });
    });

    it('should set current_phase to phase3_environment', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.current_phase).toBe('phase3_environment');
    });

    it('should set phase2_complete to true', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_complete).toBe(true);
    });

    it('should include planning data in state', async () => {
      const result = await phase2PlanningNode(mockState);

      expect(result.phase2_planning).toEqual({
        implementation_plan: expect.any(String),
        test_plan: expect.any(Object),
        environment_requirements: expect.any(Object),
        timestamp: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    it('should catch phase1 validation errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await phase2PlanningNode(mockState);

      expect(result.errors?.some(e => e.includes('Planning failed'))).toBe(true);
      expect(result.current_phase).toBe('failed');
    });

    it('should use default temp_dir if not provided', async () => {
      mockState.temp_dir = undefined;
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('planning-complete.json')) return false;
        if (path.includes('context-complete.json')) return true;
        if (path.includes('full-context.md')) return true;
        if (path.includes('stack-profile.json')) return true;
        return false;
      });

      await phase2PlanningNode(mockState);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude-temp/implement-ticket/TICKET-123/phase1'),
        'utf-8'
      );
    });
  });
});
