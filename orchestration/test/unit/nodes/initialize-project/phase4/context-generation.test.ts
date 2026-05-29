import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextGenerationNode } from '../../../../../src/nodes/initialize-project/phase4/context-generation.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as configGenerator from '../../../../../src/nodes/initialize-project/phase4/config-generator.js';
import * as fileCounter from '../../../../../src/nodes/initialize-project/phase4/file-counter.js';
import * as workspaceDetector from '../../../../../src/nodes/initialize-project/phase4/workspace-detector.js';

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

vi.mock('../../../../../src/nodes/initialize-project/phase4/config-generator.js', () => ({
  generateFrameworkConfig: vi.fn(),
}));

vi.mock('../../../../../src/nodes/initialize-project/phase4/file-counter.js', () => ({
  countFilesByLanguage: vi.fn(),
}));

vi.mock('../../../../../src/nodes/initialize-project/phase4/workspace-detector.js', () => ({
  detectWorkspaces: vi.fn(),
}));

describe('contextGenerationNode', () => {
  let mockState: InitializeProjectState;

  // Minimal valid five-section synthesis blob. context-generation does not
  // run the line-count validator (that's a Phase 3 concern), it only invokes
  // the extractor — so each body just needs to satisfy the extractor's
  // section-bounding rules. The content matches the contract documented in
  // synthesis-instructions.md.
  const validSynthesis = `# CLAUDE.md Content

# TestProject

cheat-sheet body

---

# code-conventions/SKILL.md Content

---
name: code-conventions
description: Project-specific coding conventions
---

# Code Conventions

rule body

---

# multi-file-workflows/SKILL.md Content

---
name: multi-file-workflows
description: Cross-cutting checklists
---

# Multi-File Workflows

checklist body

---

# testing-conventions/SKILL.md Content

---
name: testing-conventions
description: Project-specific testing conventions
---

# Testing Conventions

test rule body

---

# Architectural Narrative Content

# Architectural Narrative

descriptive prose for the wiki-generator
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
          findings: {
            services: [
              {
                id: 'backend',
                path: 'src',
                type: 'backend',
                language: 'typescript',
                frameworks: { main: 'NestJS 11' },
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'backend',
                package_manager: 'npm',
              },
            ],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'backend',
              },
            ],
          },
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
        {
          language: 'typescript',
          count: 80,
          extensions: ['.ts', '.tsx'],
          directories: ['src'],
        },
        {
          language: 'javascript',
          count: 20,
          extensions: ['.js', '.jsx'],
          directories: ['scripts'],
        },
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
      'Phase 3 synthesis file not found',
    );
  });

  it('should read synthesis from disk', async () => {
    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('synthesis-raw.md'),
      'utf-8',
    );
  });

  it('should fail if CLAUDE.md content section not found', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return 'Invalid content';
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some((e) => e.includes('Could not find required sections'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should fail if any required convention-skill section is missing', async () => {
    const invalidSynthesis = `# CLAUDE.md Content

# TestProject

cheat-sheet body

---

# code-conventions/WRONG.md Content

Wrong content
`;
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return invalidSynthesis;
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some((e) => e.includes('Could not find required sections'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should extract and write CLAUDE.md', async () => {
    await contextGenerationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining('cheat-sheet body'),
    );
  });

  it('should extract and write the three prescriptive convention skills', async () => {
    await contextGenerationNode(mockState);

    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    const findCallMatching = (regex: RegExp): unknown[] | undefined =>
      calls.find(([path]) => regex.test(String(path)));
    expect(findCallMatching(/code-conventions\/SKILL\.md/)).toBeDefined();
    expect(findCallMatching(/multi-file-workflows\/SKILL\.md/)).toBeDefined();
    expect(findCallMatching(/testing-conventions\/SKILL\.md/)).toBeDefined();
  });

  it('should persist the architectural narrative to <tempDir>/architectural-narrative.md', async () => {
    await contextGenerationNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('architectural-narrative.md'),
      expect.stringContaining('descriptive prose for the wiki-generator'),
      'utf-8',
    );
  });

  it('should create .claude directory', async () => {
    await contextGenerationNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude'), {
      recursive: true,
    });
  });

  it('should create the convention-skill directories', async () => {
    await contextGenerationNode(mockState);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('code-conventions'), {
      recursive: true,
    });
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('multi-file-workflows'), {
      recursive: true,
    });
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('testing-conventions'), {
      recursive: true,
    });
  });

  it('should fail if phase1 outputs directory not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('phase1-outputs')) return false;
      return true;
    });

    const result = await contextGenerationNode(mockState);

    expect(result.errors?.some((e) => e.includes('Phase 1 outputs directory not found'))).toBe(
      true,
    );
    expect(result.current_phase).toBe('failed');
  });

  it('should fail if required Phase 1 files not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('01-structure-architecture.json')) return false;
      return true;
    });

    const result = await contextGenerationNode(mockState);

    expect(
      result.errors?.some((e) => e.includes('Required Phase 1 analyzer outputs not found')),
    ).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should read all phase1 analyzer outputs', async () => {
    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('01-structure-architecture.json'),
      'utf-8',
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('02-tech-stack-dependencies.json'),
      'utf-8',
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
      expect.any(String),
    );
  });

  it('should return phase4_context state', async () => {
    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context).toBeDefined();
    expect(result.phase4_context?.claude_md_written).toBe(true);
    expect(result.phase4_context?.conventions_skills_written).toBe(true);
    expect(result.phase4_context?.architectural_narrative_written).toBe(true);
    expect(result.phase4_context?.framework_config_generated).toBe(true);
  });

  it('should set paths in return state', async () => {
    const result = await contextGenerationNode(mockState);

    expect(result.claude_md_path).toContain('CLAUDE.md');
    expect(result.code_conventions_path).toContain('code-conventions/SKILL.md');
    expect(result.multi_file_workflows_path).toContain('multi-file-workflows/SKILL.md');
    expect(result.testing_conventions_path).toContain('testing-conventions/SKILL.md');
    expect(result.architectural_narrative_path).toContain('architectural-narrative.md');
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

    expect(result.errors?.some((e) => e.includes('Context generation failed'))).toBe(true);
    expect(result.current_phase).toBe('failed');
  });

  it('should use default temp_dir if not provided', async () => {
    mockState.temp_dir = undefined;

    await contextGenerationNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/synthesis-raw.md'),
      'utf-8',
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
            services: [
              {
                id: 'unknown-workspace',
                path: 'unknown-workspace',
                type: 'backend',
                language: 'typescript',
                frameworks: {},
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'unknown-workspace',
              },
            ],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'unknown-workspace',
              },
            ],
          },
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.services?.[0].type).toBe('backend');
  });

  it('should detect primary language from workspace counts', async () => {
    // Override file count mock to only include languages that have services
    // This prevents fallback service creation for JavaScript (which has 20 files in global mock)
    vi.mocked(fileCounter.countFilesByLanguage).mockResolvedValue({
      total_files: 85,
      by_language: [
        {
          language: 'typescript',
          count: 80,
          extensions: ['.ts', '.tsx'],
          directories: ['ws1', 'ws2'],
        },
        {
          language: 'python',
          count: 5,
          extensions: ['.py'],
          directories: ['ws3'],
        },
      ],
      scanned_directories: 3,
      errors: [],
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'ws1',
                path: 'ws1',
                type: 'backend',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'ws2',
                path: 'ws2',
                type: 'frontend',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'ws3',
                path: 'ws3',
                type: 'backend',
                language: 'python',
                frameworks: {},
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [{ id: 'ws1' }, { id: 'ws2' }, { id: 'ws3' }],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [{ id: 'ws1' }, { id: 'ws2' }, { id: 'ws3' }],
          },
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    // With the service-centric model, there's no primary_language at top level
    // Each service has its own language
    expect(result.phase4_context?.stack_profile.services?.length).toBe(3);
    expect(result.phase4_context?.stack_profile.services?.[0].language).toBe('typescript');
    expect(result.phase4_context?.stack_profile.services?.[1].language).toBe('typescript');
    expect(result.phase4_context?.stack_profile.services?.[2].language).toBe('python');
  });

  it('should detect frontend frameworks from workspace dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'frontend',
                path: 'frontend',
                type: 'frontend',
                language: 'typescript',
                frameworks: {
                  main: 'React 18.0.0',
                },
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'frontend',
              },
            ],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'frontend',
              },
            ],
          },
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    // With service-centric model, frameworks are per-service
    expect(result.phase4_context?.stack_profile.services?.[0].frameworks.main).toBe('React 18.0.0');
  });

  it('should detect backend frameworks from workspace dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'backend',
                path: 'backend',
                type: 'backend',
                language: 'javascript',
                frameworks: {
                  main: 'Express 4.0.0',
                },
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'backend',
              },
            ],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'backend',
              },
            ],
          },
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    // With service-centric model, frameworks are per-service
    expect(result.phase4_context?.stack_profile.services?.[0].frameworks.main).toBe(
      'Express 4.0.0',
    );
  });

  it('should infer workspace types from names', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'frontend-web',
                path: 'frontend-web',
                type: 'frontend',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'backend-api',
                path: 'backend-api',
                type: 'backend',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'mobile-ios',
                path: 'mobile-ios',
                type: 'mobile',
                language: 'swift',
                frameworks: {},
              },
              {
                id: 'lambda-function',
                path: 'lambda-function',
                type: 'serverless',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'lib-utils',
                path: 'lib-utils',
                type: 'library',
                language: 'typescript',
                frameworks: {},
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              { id: 'frontend-web' },
              { id: 'backend-api' },
              { id: 'mobile-ios' },
              { id: 'lambda-function' },
              { id: 'lib-utils' },
            ],
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              { id: 'frontend-web' },
              { id: 'backend-api' },
              { id: 'mobile-ios' },
              { id: 'lambda-function' },
              { id: 'lib-utils' },
            ],
          },
        });
      }
      return JSON.stringify({ findings: {} });
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.services?.[0].type).toBe('frontend');
    expect(result.phase4_context?.stack_profile.services?.[1].type).toBe('backend');
    expect(result.phase4_context?.stack_profile.services?.[2].type).toBe('mobile');
    expect(result.phase4_context?.stack_profile.services?.[3].type).toBe('serverless');
    expect(result.phase4_context?.stack_profile.services?.[4].type).toBe('library');
  });

  it('should extract testing frameworks from code-patterns', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'ts-service',
                path: 'ts-service',
                type: 'backend',
                language: 'typescript',
                frameworks: {},
              },
              {
                id: 'py-service',
                path: 'py-service',
                type: 'backend',
                language: 'python',
                frameworks: {},
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            dependencies: {
              by_service: {
                'ts-service': { production: [], development: [] },
                'py-service': { production: [], development: [] },
              },
            },
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            testing: {
              'ts-service': {
                unit: {
                  framework: 'vitest',
                  config_file: 'vitest.config.ts',
                },
              },
              'py-service': {
                unit: {
                  framework: 'pytest',
                  config_file: 'pytest.ini',
                },
              },
            },
          },
        });
      }
      // Default: return empty JSON object
      return JSON.stringify({});
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.services?.[0].frameworks.testing).toBe('vitest');
    expect(result.phase4_context?.stack_profile.services?.[1].frameworks.testing).toBe('pytest');
  });

  it('should extract testing frameworks from dependencies', async () => {
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('synthesis-raw.md')) return validSynthesis;
      if (path.includes('01-structure-architecture.json')) {
        return JSON.stringify({
          agent_name: 'structure-architecture-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            services: [
              {
                id: 'frontend',
                path: 'frontend',
                type: 'frontend',
                language: 'typescript',
                frameworks: {},
              },
            ],
          },
        });
      }
      if (path.includes('02-tech-stack-dependencies.json')) {
        return JSON.stringify({
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            dependencies: {
              by_service: {
                frontend: { production: [], development: [] },
              },
            },
          },
        });
      }
      if (path.includes('03-code-patterns-testing.json')) {
        return JSON.stringify({
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: '2024-01-01T00:00:00Z',
          findings: {
            testing: {
              frontend: {
                unit: {
                  framework: 'vitest',
                  config_file: 'vitest.config.ts',
                },
              },
            },
          },
        });
      }
      // Default: return empty JSON object
      return JSON.stringify({});
    });

    const result = await contextGenerationNode(mockState);

    expect(result.phase4_context?.stack_profile.services?.[0].frameworks.testing).toBe('vitest');
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
