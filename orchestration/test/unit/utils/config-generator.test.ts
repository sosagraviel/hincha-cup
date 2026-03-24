import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFrameworkConfig, type StackProfile } from '../../../src/utils/config-generator.js';
import type { InitializeProjectState } from '../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('config-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockState = (overrides: Partial<InitializeProjectState> = {}): InitializeProjectState => ({
    project_path: '/test/project',
    framework_path: '/test/framework',
    current_phase: 'complete',
    phase1_analysis: {
      all_completed: false
    },
    phase1_retry_tracking: {},
    errors: [],
    warnings: [],
    ...overrides
  });

  const createMockStackProfile = (overrides: Partial<StackProfile> = {}): StackProfile => ({
    languages: ['typescript'],
    primary_language: 'typescript',
    frameworks: {
      frontend: ['react'],
      backend: ['express'],
      mobile: []
    },
    testing_frameworks: {
      typescript: ['vitest']
    },
    detected_workspaces: [],
    file_counts: {},
    ...overrides
  });

  describe('generateFrameworkConfig', () => {
    it('should generate valid framework config with minimal data', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config).toBeDefined();
      expect(config.version).toBe('2.0.0');
      expect(config.schema_version).toBe('1.0.0');
      expect(config.framework_version).toBe('2.0.0');
      expect(config.project_metadata.project_path).toBe('/test/project');
      expect(config.project_metadata.last_analysis).toBeDefined();
      expect(config.project_metadata.initialization_hash).toBeDefined();
    });

    it('should read framework version from package.json', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '3.5.0' }));

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.version).toBe('3.5.0');
      expect(config.framework_version).toBe('3.5.0');
    });

    it('should use default version when package.json has no version', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.version).toBe('2.0.0');
    });

    it('should include stack profile data', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        languages: ['typescript', 'python'],
        primary_language: 'typescript',
        frameworks: {
          frontend: ['react', 'nextjs'],
          backend: ['express', 'fastapi'],
          mobile: []
        }
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.languages).toEqual(['typescript', 'python']);
      expect(config.stack_profile.primary_language).toBe('typescript');
      expect(config.stack_profile.frameworks.frontend).toEqual(['react', 'nextjs']);
      expect(config.stack_profile.frameworks.backend).toEqual(['express', 'fastapi']);
    });

    it('should include detected workspaces', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        detected_workspaces: [
          { path: 'packages/web', language: 'typescript', type: 'frontend', frameworks: ['react'] },
          { path: 'packages/api', language: 'typescript', type: 'backend', frameworks: ['express'] }
        ]
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.detected_workspaces).toHaveLength(2);
      expect(config.stack_profile.detected_workspaces[0].path).toBe('packages/web');
      expect(config.stack_profile.detected_workspaces[1].path).toBe('packages/api');
    });

    it('should handle phase1_analysis data', () => {
      const state = createMockState({
        phase1_analysis: {
          structure_architecture: {
            agent_name: 'structure-architecture-analyzer',
            timestamp: '2024-01-01T00:00:00Z',
            findings: { project_type: 'monorepo' }
          },
          all_completed: true
        }
      });
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase1_analysis).toBeDefined();
      expect(config.analysis_results.phase1_analysis.structure_architecture).toBeDefined();
    });

    it('should handle phase2_consolidation data', () => {
      const state = createMockState({
        phase2_consolidation: {
          consolidated_findings: {},
          timestamp: '2024-01-01T10:00:00Z'
        }
      });
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase2_consolidation.consolidation_timestamp)
        .toBe('2024-01-01T10:00:00Z');
    });

    it('should handle phase3_synthesis data', () => {
      const state = createMockState({
        phase3_synthesis: {
          synthesis_content: '# Synthesis',
          timestamp: '2024-01-01T11:00:00Z',
          validation_passed: true
        }
      });
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase3_synthesis.synthesis_timestamp)
        .toBe('2024-01-01T11:00:00Z');
    });

    it('should handle testing frameworks', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        testing_frameworks: {
          typescript: ['vitest', 'playwright'],
          python: ['pytest']
        }
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.testing_frameworks).toEqual({
        typescript: ['vitest', 'playwright'],
        python: ['pytest']
      });
    });

    it('should handle infrastructure data', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        infrastructure: ['docker', 'kubernetes', 'aws']
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.infrastructure).toEqual(['docker', 'kubernetes', 'aws']);
    });

    it('should handle file counts', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        file_counts: {
          '.ts': 150,
          '.tsx': 50,
          '.py': 20
        }
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.file_counts).toEqual({
        '.ts': 150,
        '.tsx': 50,
        '.py': 20
      });
    });

    it('should generate unique initialization hash', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config1 = generateFrameworkConfig(state, stackProfile, '/test/framework');
      const config2 = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config1.project_metadata.initialization_hash).toBeDefined();
      expect(config2.project_metadata.initialization_hash).toBeDefined();
      expect(config1.project_metadata.initialization_hash)
        .not.toBe(config2.project_metadata.initialization_hash);
    });

    it('should include resource state', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.resource_state).toBeDefined();
      expect(config.resource_state.skills).toEqual({});
      expect(config.resource_state.agents).toEqual({});
      expect(config.resource_state.commands).toEqual({});
      expect(config.resource_state.last_sync).toBeDefined();
    });

    it('should handle empty stack profile', () => {
      const state = createMockState();
      const stackProfile: StackProfile = {
        languages: [],
        frameworks: {
          frontend: [],
          backend: [],
          mobile: []
        }
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.languages).toEqual([]);
      expect(config.stack_profile.frameworks.frontend).toEqual([]);
    });

    it('should handle workspaces fallback to detected_workspaces', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        detected_workspaces: undefined,
        workspaces: [
          { path: 'packages/lib', language: 'typescript', type: 'library', frameworks: [] }
        ] as any
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.detected_workspaces).toHaveLength(1);
      expect(config.stack_profile.detected_workspaces[0].path).toBe('packages/lib');
    });

    it('should include phase4_context data', () => {
      const state = createMockState({
        phase4_context: {
          claude_md_written: true,
          project_context_written: true,
          framework_config_generated: true,
          timestamp: '2024-01-01T12:00:00Z'
        }
      });
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase4_context).toBeDefined();
      expect(config.analysis_results.phase4_context.files_generated).toContain('.claude/CLAUDE.md');
    });

    it('should validate generated config against schema', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw
      expect(() => {
        generateFrameworkConfig(state, stackProfile, '/test/framework');
      }).not.toThrow();
    });

    it('should handle missing optional fields gracefully', () => {
      const state = createMockState();
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        frameworks: {
          frontend: [],
          backend: []
        }
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.primary_language).toBeUndefined();
      expect(config.stack_profile.infrastructure).toBeUndefined();
      expect(config.stack_profile.testing_frameworks).toEqual({});
    });

    it('should handle complex multi-workspace monorepo', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        languages: ['typescript', 'python', 'go'],
        primary_language: 'typescript',
        detected_workspaces: [
          { path: 'packages/web', language: 'typescript', type: 'frontend', frameworks: ['react', 'nextjs'] },
          { path: 'packages/mobile', language: 'typescript', type: 'mobile', frameworks: ['react-native'] },
          { path: 'services/api', language: 'typescript', type: 'backend', frameworks: ['express'] },
          { path: 'services/worker', language: 'python', type: 'service', frameworks: ['celery'] },
          { path: 'services/gateway', language: 'go', type: 'service', frameworks: ['gin'] }
        ]
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.languages).toEqual(['typescript', 'python', 'go']);
      expect(config.stack_profile.detected_workspaces).toHaveLength(5);
      expect(config.stack_profile.primary_language).toBe('typescript');
    });

    it('should handle mobile frameworks', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        frameworks: {
          frontend: ['react'],
          backend: ['express'],
          mobile: ['react-native', 'flutter']
        }
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.frameworks.mobile).toEqual(['react-native', 'flutter']);
    });

    it('should generate ISO timestamp for last_analysis', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.project_metadata.last_analysis).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle package.json read error gracefully', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File read error');
      });

      // Should throw since it's not caught
      expect(() => {
        generateFrameworkConfig(state, stackProfile, '/test/framework');
      }).toThrow('File read error');
    });

    it('should handle workspaces with package_manager', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        package_manager: 'pnpm',
        workspace_type: 'monorepo'
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config).toBeDefined();
      expect(config.stack_profile).toBeDefined();
    });

    it('should use provided phase data timestamps', () => {
      const state = createMockState({
        phase2_consolidation: {
          consolidated_findings: {},
          timestamp: '2024-06-15T10:00:00Z'
        },
        phase3_synthesis: {
          synthesis_content: '# Test',
          timestamp: '2024-06-15T11:00:00Z',
          validation_passed: true
        }
      });
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase2_consolidation.consolidation_timestamp).toBe('2024-06-15T10:00:00Z');
      expect(config.analysis_results.phase3_synthesis.synthesis_timestamp).toBe('2024-06-15T11:00:00Z');
    });

    it('should handle fallback to empty workspaces array', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile({
        detected_workspaces: undefined,
        workspaces: undefined
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.stack_profile.detected_workspaces).toEqual([]);
    });

    it('should include phase4_context with standard files', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(state, stackProfile, '/test/framework');

      expect(config.analysis_results.phase4_context.files_generated).toContain('.claude/CLAUDE.md');
      expect(config.analysis_results.phase4_context.files_generated).toContain('.claude/project-context/SKILL.md');
    });

    it('should validate against schema', () => {
      const state = createMockState();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw Zod validation error
      expect(() => {
        const config = generateFrameworkConfig(state, stackProfile, '/test/framework');
        expect(config.schema_version).toBe('1.0.0');
      }).not.toThrow();
    });
  });
});
