import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/context-generation.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as configGenerator from '../../../../../src/utils/config-generator.js';
import * as fileCounter from '../../../../../src/utils/file-counter.js';
import * as workspaceDetector from '../../../../../src/utils/workspace-detector.js';

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('../../../../../src/utils/config-generator.js', () => ({
  generateFrameworkConfig: vi.fn(),
}));

vi.mock('../../../../../src/utils/file-counter.js', () => ({
  countFilesByLanguage: vi.fn(),
}));

vi.mock('../../../../../src/utils/workspace-detector.js', () => ({
  detectWorkspaces: vi.fn(),
}));

describe('contextGenerationNode', () => {
  let mockState: InitializeProjectState;

  const validSynthesis = `
# CLAUDE.md Content

This is the CLAUDE.md content
for the project

---

# project-context/SKILL.md Content

This is the project context content
`;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase3_synthesis',
      temp_dir: '/test/temp',
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    // Mock file system
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { languages: ['typescript'] },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { dependencies: ['react'] },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      if (path.includes('04-data-flows-integrations.json')) {
        return JSON.stringify({
          agent_name: 'data-flows-integrations-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      // Default: return empty JSON object for any other file
      return JSON.stringify({});
    });

    vi.mocked(configGenerator.generateFrameworkConfig).mockReturnValue({
      version: '2.0.0',
      schema_version: '1.0.0',
      framework_version: '2.0.0',
      project_metadata: {},
      analysis_results: {},
      stack_profile: {},
      resource_state: {},
    } as any);

    // Mock file counting utility
    vi.mocked(fileCounter.countFilesByLanguage).mockResolvedValue({
      total_files: 100,
      by_language: [
        { language: 'typescript', count: 80, extensions: ['.ts', '.tsx'], directories: ['src'] },
        { language: 'javascript', count: 20, extensions: ['.js', '.jsx'], directories: ['scripts'] },
      ],
      scanned_directories: 2,
      errors: [],
    });

    // Mock workspace detection utility
    vi.mocked(workspaceDetector.detectWorkspaces).mockResolvedValue({
      is_monorepo: false,
      total_workspaces: 0,
      workspaces: [],
      errors: [],
    });
  });

  it('should throw if synthesis file not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(contextGenerationNode(mockState)).rejects.toThrow(
      'Phase 3 synthesis file not found'
    );
  });

  it('should read synthesis from disk', async () => {
    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('synthesis-raw.md'),
      'utf-8'
    );
  });

  it('should fail if CLAUDE.md content section not found', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return 'Invalid content';
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some(e => e.includes('Could not find CLAUDE.md Content section'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should fail if project-context section not found', async () => {
    const invalidSynthesis = `
# CLAUDE.md Content

Test content

---

# project-context/WRONG.md Content

Wrong content
`;
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return invalidSynthesis;
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some(e => e.includes('Could not find project-context/SKILL.md Content section'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should extract and write CLAUDE.md', async () => {
    await contextGenerationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining('This is the CLAUDE.md content')
    );
  });

  it('should extract and write project-context/SKILL.md', async () => {
    await contextGenerationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('SKILL.md'),
      expect.stringContaining('This is the project context content')
    );
  });

  it('should create .claude directory', async () => {
    await contextGenerationNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude'),
      { recursive: true }
    );
  });

  it('should create project-context directory', async () => {
    await contextGenerationNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('project-context'),
      { recursive: true }
    );
  });

  it('should fail if phase1 outputs directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('phase1-outputs')) return false;
      return true;
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some(e => e.includes('Phase 1 outputs directory not found'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should fail if required Phase 1 files not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('01-structure-architecture.json')) return false;
      return true;
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some(e => e.includes('Required Phase 1 analyzer outputs not found'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should read all phase1 analyzer outputs', async () => {
    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      'utf-8'
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      'utf-8'
    );
  });

  it('should handle missing code-patterns file', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('03-code-patterns-testing.json')) return false;
      return true;
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context).toBeDefined();
  });

  it('should generate framework config', async () => {
    await contextGenerationNode(mockState);

    expect(configGenerator.generateFrameworkConfig).toHaveBeenCalled();
  });

  it('should write framework-config.json', async () => {
    await contextGenerationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('framework-config.json'),
      expect.any(String)
    );
  });

  it('should return phase4_context state', async () => {
    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context).toBeDefined();
    expect(result.phase4_context?.claude_md_written).toBe(true);
    expect(result.phase4_context?.project_context_written).toBe(true);
    expect(result.phase4_context?.framework_config_generated).toBe(true);
  });

  it('should set paths in return state', async () => {
    const result = await contextGenerationNode(mockState);

    expect(result.claude_md_path).toContain('CLAUDE.md');
    expect(result.project_context_path).toContain('SKILL.md');
    expect(result.framework_config_path).toContain('framework-config.json');
  });

  it('should set current_phase', async () => {
    const result = await contextGenerationNode(mockState);

    expect(result.current_phase).toBe('phase4_context');
  });

  it('should handle JSON parse errors', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) return 'invalid json{';
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some(e => e.includes('Context generation failed'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should use default temp_dir if not provided', async () => {
    mockState.temp_dir = undefined;

    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/synthesis-raw.md'),
      'utf-8'
    );
  });

  it('should parse JSON from phase1 files', async () => {
    const result = await contextGenerationNode(mockState);

    // Should successfully parse and use the JSON data
    expect(result.phase4_context).toBeDefined();
  });

  it('should handle workspaces with no type hint (defaults to service)', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['typescript'],
            multi_stack: {
              workspaces: [
                { path: 'unknown-workspace', language: 'typescript', dependencies: [] }
              ]
            }
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.workspaces?.[0].type).toBe('service');
  });

  it('should detect primary language from workspace counts', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['typescript', 'python'],
            multi_stack: {
              workspaces: [
                { path: 'ws1', language: 'typescript', dependencies: [] },
                { path: 'ws2', language: 'typescript', dependencies: [] },
                { path: 'ws3', language: 'python', dependencies: [] }
              ]
            }
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.primary_language).toBe('typescript');
  });

  it('should detect frontend frameworks from workspace dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['typescript'],
            multi_stack: {
              workspaces: [
                { path: 'frontend', language: 'typescript', dependencies: ['react 18.0.0', 'vue 3.0.0'] }
              ]
            }
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.frameworks.frontend).toContain('react');
    expect(result.phase4_context?.stack_profile.frameworks.frontend).toContain('vue');
  });

  it('should detect backend frameworks from workspace dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['javascript'],
            multi_stack: {
              workspaces: [
                { path: 'backend', language: 'javascript', dependencies: ['express 4.0.0', 'fastapi 0.100.0'] }
              ]
            }
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.frameworks.backend).toContain('express');
    expect(result.phase4_context?.stack_profile.frameworks.backend).toContain('fastapi');
  });

  it('should infer workspace types from names', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            languages: ['typescript'],
            multi_stack: {
              workspaces: [
                { path: 'frontend-web', language: 'typescript', dependencies: [] },
                { path: 'backend-api', language: 'typescript', dependencies: [] },
                { path: 'mobile-ios', language: 'swift', dependencies: [] },
                { path: 'lambda-function', language: 'typescript', dependencies: [] },
                { path: 'lib-utils', language: 'typescript', dependencies: [] }
              ]
            }
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.workspaces?.[0].type).toBe('frontend');
    expect(result.phase4_context?.stack_profile.workspaces?.[1].type).toBe('backend');
    expect(result.phase4_context?.stack_profile.workspaces?.[2].type).toBe('mobile');
    expect(result.phase4_context?.stack_profile.workspaces?.[3].type).toBe('service');
    expect(result.phase4_context?.stack_profile.workspaces?.[4].type).toBe('library');
  });

  it('should extract testing frameworks from code-patterns', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { languages: ['typescript'] },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            multi_stack: {
              workspaces: [
                { language: 'typescript', testing_framework: 'vitest' },
                { language: 'python', testing_framework: 'pytest' }
              ]
            }
          },
        });
      }
      // Default: return empty JSON object
      return JSON.stringify({});
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.testing_frameworks).toEqual({
      typescript: ['vitest'],
      python: ['pytest']
    });
  });

  it('should extract testing frameworks from dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: { languages: ['typescript'] },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            dependencies: {
              by_package: {
                'frontend': {
                  dev: { 'vitest': '4.0.0', 'jest': '29.0.0' }
                }
              }
            },
            multi_stack: {
              workspaces: [
                { path: 'frontend', language: 'typescript' }
              ]
            }
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {},
        });
      }
      // Default: return empty JSON object
      return JSON.stringify({});
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.testing_frameworks?.typescript).toContain('vitest');
    expect(result.phase4_context?.stack_profile.testing_frameworks?.typescript).toContain('jest');
  });

  it('should handle JSON parse errors', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('01-structure-architecture.json')) return 'invalid json{';
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors).toBeDefined();
  });
});
