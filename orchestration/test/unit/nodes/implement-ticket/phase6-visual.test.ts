import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase6VisualNode } from '../../../../src/nodes/implement-ticket/phase6-visual.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';
import { ScreenshotService } from '../../../../src/services/implement-ticket/screenshot.service.js';
import { EnvironmentManagerService } from '../../../../src/services/implement-ticket/environment-manager.service.js';
import { AgentInvokerService } from '../../../../src/services/implement-ticket/agent-invoker.service.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/screenshot.service.js', () => ({
  ScreenshotService: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/environment-manager.service.js', () => ({
  EnvironmentManagerService: vi.fn(),
}));

vi.mock('../../../../src/services/implement-ticket/agent-invoker.service.js', () => ({
  AgentInvokerService: vi.fn(),
}));

describe('phase6VisualNode', () => {
  let mockState: ImplementTicketState;
  let mockScreenshotService: any;
  let mockEnvManager: any;
  let mockAgentInvoker: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      current_phase: 'phase6_visual',
      errors: [],
    } as unknown as ImplementTicketState;

    mockScreenshotService = {
      captureMultipleScreenshots: vi.fn().mockResolvedValue([]),
    };

    mockEnvManager = {
      getPlaywrightPage: vi.fn().mockReturnValue({ screenshot: vi.fn() }),
    };

    mockAgentInvoker = {
      invokeVisualVerifier: vi.fn().mockResolvedValue('No visual issues'),
    };

    vi.mocked(ScreenshotService).mockImplementation(function(this: any) {
      return mockScreenshotService;
    } as any);

    vi.mocked(EnvironmentManagerService).mockImplementation(function(this: any) {
      return mockEnvManager;
    } as any);

    vi.mocked(AgentInvokerService).mockImplementation(function(this: any) {
      return mockAgentInvoker;
    } as any);

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('visual-complete.json')) return false;
      if (path.includes('testing-complete.json')) return true;
      if (path.includes('environment-config.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('environment-config.json')) {
        return JSON.stringify({ port: 3001, playwrightInitialized: true });
      }
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        visual_data: { test: 'data' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase6VisualNode(mockState);

      expect(result.current_phase).toBe('phase7_documentation');
      expect(result.phase6_complete).toBe(true);
    });
  });

  describe('phase5 validation', () => {
    it('should continue to phase7 if phase5 not complete (non-blocking)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('visual-complete.json')) return false;
        if (path.includes('testing-complete.json')) return false;
        return true;
      });

      const result = await phase6VisualNode(mockState);

      expect(result.current_phase).toBe('phase7_documentation');
      expect(result.phase6_complete).toBe(true);
    });
  });

  describe('screenshot capture', () => {
    it('should skip if playwright not initialized', async () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('environment-config.json')) {
          return JSON.stringify({ port: 3001, playwrightInitialized: false });
        }
        return '';
      });

      const result = await phase6VisualNode(mockState);

      expect(result.current_phase).toBe('phase7_documentation');
    });

    it('should skip if no before screenshots found', async () => {
      const result = await phase6VisualNode(mockState);

      expect(result.current_phase).toBe('phase7_documentation');
      expect(result.phase6_complete).toBe(true);
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase7_documentation', async () => {
      const result = await phase6VisualNode(mockState);

      expect(result.current_phase).toBe('phase7_documentation');
    });

    it('should set phase6_complete to true', async () => {
      const result = await phase6VisualNode(mockState);

      expect(result.phase6_complete).toBe(true);
    });
  });
});
