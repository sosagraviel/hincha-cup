import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFrameworkConfig } from '../../../../../src/nodes/initialize-project/phase4/config-generator.js';
import type { Phase1AnalysisData } from '../../../../../src/nodes/initialize-project/phase4/types.js';
import type { StackProfile } from '../../../../../src/schemas/index.js';
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

  const createMockPhase1Data = (
    overrides: Partial<Phase1AnalysisData> = {},
  ): Phase1AnalysisData => ({
    structure_architecture: {
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {},
    },
    tech_stack_dependencies: {
      agent_name: 'tech-stack-dependencies-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {},
    },
    code_patterns_testing: {
      agent_name: 'code-patterns-testing-analyzer',
      timestamp: '2024-01-01T00:00:00Z',
      findings: {},
    },
    ...overrides,
  });

  const createMockStackProfile = (overrides: Partial<StackProfile> = {}): StackProfile => ({
    services: [
      {
        id: 'main',
        path: 'src',
        type: 'backend',
        language: 'typescript',
        frameworks: {
          main: 'express',
          testing: 'vitest',
        },
      },
    ],
    is_monorepo: false,
    file_counts: {
      total: 0,
      by_language: {},
    },
    ...overrides,
  });

  describe('generateFrameworkConfig', () => {
    it('should generate valid framework config with minimal data', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis content',
        stackProfile,
        '/test/framework',
      );

      expect(config).toBeDefined();
      expect(config.version).toBe('2.0.0');
      expect(config.schema_version).toBe('1.0.0');
      expect(config.framework_version).toBe('2.0.0');
      // project_metadata.project_path was retired (zero readers in codebase) —
      // assert it's no longer present so a future regression that re-adds the
      // absolute-path field is caught by this test.
      expect((config.project_metadata as Record<string, unknown>).project_path).toBeUndefined();
      expect(config.project_metadata.last_analysis).toBeDefined();
      expect(config.project_metadata.initialization_hash).toBeDefined();
    });

    it('should read framework version from package.json', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '3.5.0' }));

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis content',
        stackProfile,
        '/test/framework',
      );

      expect(config.version).toBe('3.5.0');
      expect(config.framework_version).toBe('3.5.0');
    });

    it('should use default version when package.json has no version', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis content',
        stackProfile,
        '/test/framework',
      );

      expect(config.version).toBe('2.0.0');
    });

    it('should include stack profile data', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'frontend',
            path: 'src/frontend',
            type: 'frontend',
            language: 'typescript',
            frameworks: {
              main: 'react',
              additional: ['nextjs'],
            },
          },
          {
            id: 'backend',
            path: 'src/backend',
            type: 'backend',
            language: 'python',
            frameworks: {
              main: 'fastapi',
              additional: ['express'],
            },
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services).toHaveLength(2);
      expect(config.stack_profile.services[0].language).toBe('typescript');
      expect(config.stack_profile.services[1].language).toBe('python');
      expect(config.stack_profile.services[0].frameworks.main).toBe('react');
      expect(config.stack_profile.services[1].frameworks.main).toBe('fastapi');
    });

    it('should include detected workspaces', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'web',
            path: 'packages/web',
            language: 'typescript',
            type: 'frontend',
            frameworks: { main: 'react' },
          },
          {
            id: 'api',
            path: 'packages/api',
            language: 'typescript',
            type: 'backend',
            frameworks: { main: 'express' },
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services).toHaveLength(2);
      expect(config.stack_profile.services[0].path).toBe('packages/web');
      expect(config.stack_profile.services[1].path).toBe('packages/api');
    });

    it('should handle testing frameworks', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'typescript-service',
            path: 'src/ts',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'express' },
            testing: {
              unit: { framework: 'vitest' },
              e2e: { framework: 'playwright' },
            },
          },
          {
            id: 'python-service',
            path: 'src/py',
            type: 'backend',
            language: 'python',
            frameworks: { main: 'fastapi' },
            testing: {
              unit: { framework: 'pytest' },
            },
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services[0].testing?.unit?.framework).toBe('vitest');
      expect(config.stack_profile.services[0].testing?.e2e?.framework).toBe('playwright');
      expect(config.stack_profile.services[1].testing?.unit?.framework).toBe('pytest');
    });

    it('should handle infrastructure data', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        infrastructure: ['docker', 'kubernetes', 'aws'],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.infrastructure).toEqual(['docker', 'kubernetes', 'aws']);
    });

    it('should handle file counts', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        file_counts: {
          total: 220,
          by_language: {
            typescript: 200,
            python: 20,
          },
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.file_counts).toEqual({
        total: 220,
        by_language: {
          typescript: 200,
          python: 20,
        },
      });
    });

    it('should generate unique initialization hash', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config1 = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );
      const config2 = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config1.project_metadata.initialization_hash).toBeDefined();
      expect(config2.project_metadata.initialization_hash).toBeDefined();
      expect(config1.project_metadata.initialization_hash).not.toBe(
        config2.project_metadata.initialization_hash,
      );
    });

    it('should include resource state', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.resource_state).toBeDefined();
      expect(config.resource_state.skills).toEqual({});
      expect(config.resource_state.agents).toEqual({});
      expect(config.resource_state.last_sync).toBeDefined();
    });

    it('should handle empty stack profile', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile: StackProfile = {
        services: [
          {
            id: 'minimal',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
        is_monorepo: false,
        file_counts: {
          total: 0,
          by_language: {},
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services).toHaveLength(1);
      expect(config.stack_profile.services[0].frameworks).toEqual({});
    });

    it('should handle workspaces fallback to detected_workspaces', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'lib',
            path: 'packages/lib',
            language: 'typescript',
            type: 'library',
            frameworks: {},
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services).toHaveLength(1);
      expect(config.stack_profile.services[0].path).toBe('packages/lib');
    });

    // SKIPPED: analysis_results field removed from config to reduce bloat (Phase 4 cleanup)
    it.skip('should include phase4_context data', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      // analysis_results is optional and NOT included
      expect(config.analysis_results).toBeUndefined();
    });

    it('should validate generated config against schema', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw
      expect(() => {
        generateFrameworkConfig(
          '/test/project',
          '/test/temp',
          phase1Data,
          '# Synthesis',
          stackProfile,
          '/test/framework',
        );
      }).not.toThrow();
    });

    it('should handle missing optional fields gracefully', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile: StackProfile = {
        services: [
          {
            id: 'main',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
        is_monorepo: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.infrastructure).toBeUndefined();
      expect(config.stack_profile.workspace_tool).toBeUndefined();
      expect(config.stack_profile.services[0].testing).toBeUndefined();
    });

    it('should handle complex multi-workspace monorepo', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'web',
            path: 'packages/web',
            language: 'typescript',
            type: 'frontend',
            frameworks: { main: 'react', additional: ['nextjs'] },
          },
          {
            id: 'mobile',
            path: 'packages/mobile',
            language: 'typescript',
            type: 'mobile',
            frameworks: { main: 'react-native' },
          },
          {
            id: 'api',
            path: 'services/api',
            language: 'typescript',
            type: 'backend',
            frameworks: { main: 'express' },
          },
          {
            id: 'worker',
            path: 'services/worker',
            language: 'python',
            type: 'worker',
            frameworks: { main: 'celery' },
          },
          {
            id: 'gateway',
            path: 'services/gateway',
            language: 'go',
            type: 'backend',
            frameworks: { main: 'gin' },
          },
        ],
        is_monorepo: true,
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      const languages = new Set(config.stack_profile.services.map((s) => s.language));
      expect(Array.from(languages).sort()).toEqual(['go', 'python', 'typescript']);
      expect(config.stack_profile.services).toHaveLength(5);
      expect(config.stack_profile.is_monorepo).toBe(true);
    });

    it('should handle mobile frameworks', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'web',
            path: 'src/web',
            type: 'frontend',
            language: 'typescript',
            frameworks: { main: 'react' },
          },
          {
            id: 'api',
            path: 'src/api',
            type: 'backend',
            language: 'typescript',
            frameworks: { main: 'express' },
          },
          {
            id: 'mobile-rn',
            path: 'src/mobile',
            type: 'mobile',
            language: 'typescript',
            frameworks: { main: 'react-native' },
          },
          {
            id: 'mobile-flutter',
            path: 'src/flutter',
            type: 'mobile',
            language: 'dart',
            frameworks: { main: 'flutter' },
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      const mobileServices = config.stack_profile.services.filter((s) => s.type === 'mobile');
      expect(mobileServices).toHaveLength(2);
      expect(mobileServices.map((s) => s.frameworks.main)).toEqual(['react-native', 'flutter']);
    });

    it('should generate ISO timestamp for last_analysis', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.project_metadata.last_analysis).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('should handle package.json read error gracefully', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File read error');
      });

      // Should throw since it's not caught
      expect(() => {
        generateFrameworkConfig(
          '/test/project',
          '/test/temp',
          phase1Data,
          '# Synthesis',
          stackProfile,
          '/test/framework',
        );
      }).toThrow('File read error');
    });

    it('should handle workspaces with package_manager', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        package_manager: 'pnpm',
        is_monorepo: true,
        workspace_tool: 'pnpm workspaces',
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config).toBeDefined();
      expect(config.stack_profile).toBeDefined();
      expect(config.stack_profile.package_manager).toBe('pnpm');
      expect(config.stack_profile.is_monorepo).toBe(true);
    });

    // SKIPPED: analysis_results field removed from config to reduce bloat (Phase 4 cleanup)
    it.skip('should use provided phase data timestamps', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('phase2-consolidation.json')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('phase2-consolidation.json')) {
          return JSON.stringify({
            consolidated_findings: {},
            timestamp: '2024-06-15T10:00:00Z',
          });
        }
        return '{}';
      });

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Test',
        stackProfile,
        '/test/framework',
      );

      // analysis_results is optional and NOT included
      expect(config.analysis_results).toBeUndefined();
    });

    it('should handle fallback to empty workspaces array', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'default',
            path: '.',
            type: 'backend',
            language: 'typescript',
            frameworks: {},
          },
        ],
      });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      expect(config.stack_profile.services).toHaveLength(1);
      expect(config.stack_profile.services[0].id).toBe('default');
    });

    // SKIPPED: analysis_results field removed from config to reduce bloat (Phase 4 cleanup)
    it.skip('should include phase4_context with standard files', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = generateFrameworkConfig(
        '/test/project',
        '/test/temp',
        phase1Data,
        '# Synthesis',
        stackProfile,
        '/test/framework',
      );

      // analysis_results is optional and NOT included
      expect(config.analysis_results).toBeUndefined();
    });

    it('should validate against schema', () => {
      const phase1Data = createMockPhase1Data();
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw Zod validation error
      expect(() => {
        const config = generateFrameworkConfig(
          '/test/project',
          '/test/temp',
          phase1Data,
          '# Synthesis',
          stackProfile,
          '/test/framework',
        );
        expect(config.schema_version).toBe('1.0.0');
      }).not.toThrow();
    });
  });
});
