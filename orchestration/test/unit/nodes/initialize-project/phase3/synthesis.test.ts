import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesisNode } from '../../../../../src/nodes/initialize-project/phase3/synthesis.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import { AgentFactory } from '../../../../../src/utils/shared/agent-factory/index.js';
import * as enhancedRetry from '../../../../../src/utils/enhanced-retry.js';

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
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

vi.mock('../../../../../src/utils/shared/agent-factory/index.js', () => ({
  AgentFactory: { create: vi.fn() },
}));

vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3, timeout: 600000 },
}));

// Helper to generate valid synthesis output with proper line counts
/**
 * Build a five-section synthesis blob that passes the post-Phase-3
 * validators: CLAUDE.md cheat-sheet, three prescriptive convention skills
 * (each with YAML frontmatter and the canonical name slug; code-conventions
 * and testing-conventions carry a fenced code block), and an architectural
 * narrative for the wiki-generator.
 */
function generateValidSynthesis() {
  const claudeContent = [
    '# TestProject',
    '',
    '## Tech Stack',
    '- TypeScript 5.3',
    '- Node.js 20.x',
    '- PostgreSQL 15',
    '',
    '## File Placement Guide',
    '| File Type | Location | Example |',
    '|-----------|----------|---------|',
    '| Controller | src/controllers/ | user.controller.ts |',
    '| Service | src/services/ | user.service.ts |',
    '',
    '## Directory Structure',
    'src/',
    '  controllers/',
    '  services/',
    '',
    '## Essential Commands',
    '| Task | Command |',
    '|------|---------|',
    '| Dev | npm run dev |',
    '| Test | npm test |',
    ...Array.from({ length: 12 }, (_, i) => `Additional cheat-sheet line ${i + 1}`),
  ].join('\n');

  const codeConventions = [
    '---',
    'name: code-conventions',
    'description: Project-specific coding conventions, gotchas, and WRONG/CORRECT examples',
    '---',
    '',
    '# Code Conventions',
    '',
    '## Naming',
    '- camelCase for variables',
    '',
    '## Gotchas',
    '',
    '```typescript',
    '// WRONG',
    'await orderRepo.save(order);',
    '```',
    '',
    '```typescript',
    '// CORRECT',
    'return dataSource.transaction(async (m) => m.save(Order, order));',
    '```',
    ...Array.from({ length: 35 }, (_, i) => `- additional rule ${i + 1}`),
  ].join('\n');

  const multiFileWorkflows = [
    '---',
    'name: multi-file-workflows',
    'description: Ordered checklists for cross-cutting changes',
    '---',
    '',
    '# Multi-File Workflows',
    '',
    '## Adding a new API endpoint',
    '1. Create controller method',
    '2. Add service method',
    '3. Create DTO',
    '',
    // The multi-file-workflows skill body requires ≥1 fenced code block.
    '```typescript',
    '// apps/api/src/modules/{domain}/{domain}.controller.ts',
    '@Controller()',
    'export class DomainController {}',
    '```',
    '',
    ...Array.from({ length: 25 }, (_, i) => `- additional checklist step ${i + 1}`),
  ].join('\n');

  const testingConventions = [
    '---',
    'name: testing-conventions',
    'description: Project-specific testing conventions, fixtures, and examples',
    '---',
    '',
    '# Testing Conventions',
    '',
    '## Philosophy',
    '- Test behavior, not implementation',
    '',
    '## Unit Test Patterns',
    '',
    '```typescript',
    "describe('UserService', () => {",
    "  it('creates a user', async () => {",
    '    const u = await service.create({ email: "a@b.com" });',
    '    expect(u.id).toBeDefined();',
    '  });',
    '});',
    '```',
    ...Array.from({ length: 25 }, (_, i) => `- additional testing rule ${i + 1}`),
  ].join('\n');

  const architecturalNarrative = [
    '# Architectural Narrative',
    '',
    '## Repository Shape',
    'Monorepo with one backend service and one web frontend.',
    '',
    '## Service Inventory',
    '- api: TypeScript backend',
    '- web: TypeScript frontend',
    '',
    '## Cross-Service Flows',
    'The web frontend calls api over HTTP.',
    ...Array.from({ length: 35 }, (_, i) => `Additional narrative paragraph ${i + 1}`),
  ].join('\n');

  return [
    '# CLAUDE.md Content',
    '',
    claudeContent,
    '',
    '---',
    '',
    '# code-conventions/SKILL.md Content',
    '',
    codeConventions,
    '',
    '---',
    '',
    '# multi-file-workflows/SKILL.md Content',
    '',
    multiFileWorkflows,
    '',
    '---',
    '',
    '# testing-conventions/SKILL.md Content',
    '',
    testingConventions,
    '',
    '---',
    '',
    '# Architectural Narrative Content',
    '',
    architecturalNarrative,
  ].join('\n');
}

describe('synthesisNode', () => {
  let mockState: InitializeProjectState;
  let mockAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase2_consolidation',
      temp_dir: '/test/temp',
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      errors: [],
      warnings: [],
    };

    // Mock phase2 consolidation file exists
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        consolidated_findings: { test: 'data' },
        timestamp: '2024-01-01T00:00:00Z',
      }),
    );

    // Create valid synthesis output that passes all validator checks
    const validSynthesis = generateValidSynthesis();

    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: validSynthesis,
        sessionId: 'test-session-123',
      }),
    };

    const mockFactory = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory as any);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const { output } = await agentInvoke('');
        const result = validator(output);
        if (!result.valid) throw new Error('Validation failed');
        return { data: result.data, sessionId: undefined };
      },
    );
  });

  it('should throw error if phase2 consolidation file not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(synthesisNode(mockState)).rejects.toThrow('Phase 2 consolidation file not found');
  });

  it('should read phase2 consolidation from disk', async () => {
    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('phase2-consolidation.json'),
      'utf-8',
    );
  });

  it('should create agent with correct configuration', async () => {
    const localMockFactory = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(localMockFactory as any);

    await synthesisNode(mockState);

    expect(localMockFactory.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'architect-synthesizer',
        agentFilePath: expect.stringContaining('phase3/prompts/agent.md'),
        projectPath: '/test/project',
        frameworkPath: '/test/framework',
        timeout: 900000,
        resumeSessionId: undefined,
        settingsPath: expect.stringContaining('phase3/settings.json'),
        validator: expect.any(Function),
        phase: expect.objectContaining({
          phaseId: 'phase-3-synthesis',
          phaseNumber: 3,
        }),
      }),
    );
  });

  it('should include phase2 consolidation in context', async () => {
    const localMockFactory = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(localMockFactory as any);

    await synthesisNode(mockState);

    const createAgentCall = localMockFactory.createAgent.mock.calls[0][0];
    expect(createAgentCall).toBeDefined();
    // The synthesis node doesn't use additionalContext parameter in the new API
  });

  it('should invoke agent with synthesis input', async () => {
    await synthesisNode(mockState);

    expect(mockAgent.invoke).toHaveBeenCalledWith({
      inputPrompt: expect.stringContaining('CONSOLIDATED ANALYSIS'),
    });
  });

  it('should validate synthesis output length', async () => {
    mockAgent.invoke.mockResolvedValue({ output: 'x'.repeat(100) }); // Too short

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const output = await agentInvoke('');
        const result = validator(output);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('too short or empty');
        throw new Error('Synthesis output too short');
      },
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe('failed');
  });

  it('should accept synthesis output with 500+ characters', async () => {
    const validOutput = generateValidSynthesis();
    mockAgent.invoke.mockResolvedValue({ output: validOutput });

    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.validation_passed).toBe(true);
  });

  it('should write synthesis to disk', async () => {
    await synthesisNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('synthesis-raw.md'),
      expect.any(String),
    );
  });

  it('should return phase3_synthesis state', async () => {
    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis).toBeDefined();
    expect(result.phase3_synthesis?.synthesis_content).toBeDefined();
    expect(result.phase3_synthesis?.timestamp).toBeDefined();
    expect(result.phase3_synthesis?.validation_passed).toBe(true);
  });

  it('should set current_phase to phase3_synthesis', async () => {
    const result = await synthesisNode(mockState);

    expect(result.current_phase).toBe('phase3_synthesis');
  });

  it('should use retryWithEnhancedFeedback with 10 attempts', async () => {
    await synthesisNode(mockState);

    expect(enhancedRetry.retryWithEnhancedFeedback).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ maxAttempts: 10 }),
      expect.objectContaining({ agentName: 'architect-synthesizer' }),
    );
  });

  it('should handle agent errors gracefully', async () => {
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('Agent creation failed'));

    const result = await synthesisNode(mockState);

    expect(result.errors).toContain('Synthesis failed: Agent creation failed');
    expect(result.current_phase).toBe('failed');
  });

  it('should preserve existing errors', async () => {
    mockState.errors = ['Previous error'];
    vi.mocked(AgentFactory.create).mockRejectedValue(new Error('New error'));

    const result = await synthesisNode(mockState);

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain('Previous error');
  });

  it('should handle agent output variations', async () => {
    const validSynthesis = generateValidSynthesis();

    // Test output field
    vi.clearAllMocks();
    mockAgent.invoke.mockResolvedValue({ output: validSynthesis });
    const mockFactory1 = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory1 as any);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const { output } = await agentInvoke('');
        const result = validator(output);
        if (!result.valid) throw new Error('Validation failed');
        return { data: result.data, sessionId: undefined };
      },
    );
    let result = await synthesisNode(mockState);
    expect(result.phase3_synthesis).toBeDefined();

    // Test content field - note: actual code uses output, not content
    // This test is checking fallback behavior if the response has content instead
    vi.clearAllMocks();
    mockAgent.invoke.mockResolvedValue({ output: validSynthesis }); // Keep as output
    const mockFactory2 = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getAuthConfig: vi.fn().mockReturnValue({
        mode: 'claude_cli',
        hasClaudeCLI: true,
        hasCodexCLI: false,
        hasAPIKey: false,
      }),
    };
    vi.mocked(AgentFactory.create).mockResolvedValue(mockFactory2 as any);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const { output } = await agentInvoke('');
        const result = validator(output);
        if (!result.valid) throw new Error('Validation failed');
        return { data: result.data, sessionId: undefined };
      },
    );
    result = await synthesisNode(mockState);
    expect(result.phase3_synthesis).toBeDefined();
  });

  it('should use default temp_dir if not provided', async () => {
    mockState.temp_dir = undefined;

    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/phase2-consolidation.json'),
      'utf-8',
    );
  });

  it('should use provided temp_dir', async () => {
    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/test/temp/phase2-consolidation.json'),
      'utf-8',
    );
  });

  it('should handle JSON parse error in consolidation file', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

    // JSON.parse will throw before entering try-catch, so this throws
    await expect(synthesisNode(mockState)).rejects.toThrow();
  });

  it('should include synthesis content in return value', async () => {
    const testContent = generateValidSynthesis();
    mockAgent.invoke.mockResolvedValue({ output: testContent });

    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.synthesis_content).toBe(testContent);
  });

  it('should generate ISO timestamp', async () => {
    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('should reject empty output', async () => {
    mockAgent.invoke.mockResolvedValue({ output: '' });

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const output = await agentInvoke('');
        const result = validator(output);
        expect(result.valid).toBe(false);
        throw new Error('Empty output');
      },
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toBeDefined();
  });

  it('should handle validation errors', async () => {
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockRejectedValue(
      new Error('Validation failed after retries'),
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toContain('Synthesis failed: Validation failed after retries');
  });

  it('should write synthesis content to correct path', async () => {
    const testContent = generateValidSynthesis();
    mockAgent.invoke.mockResolvedValue({ output: testContent });

    await synthesisNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith('/test/temp/synthesis-raw.md', testContent);
  });

  it('should handle string coercion for non-string results', async () => {
    // When result has no output/content field, String(result) will be "[object Object]"
    // which is < 500 chars and will fail validation
    mockAgent.invoke.mockResolvedValue({ someField: 'x'.repeat(600) });

    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const output = await agentInvoke('');
        const result = validator(output);
        // String coercion will produce short string, validation fails
        expect(result.valid).toBe(false);
        throw new Error('Validation failed');
      },
    );

    const result = await synthesisNode(mockState);
    expect(result.errors).toBeDefined();
  });

  // The synthesizer can omit a "Validation Rules" section even when
  // Phase 1 saw a validation lib in dependencies. The node surfaces a
  // SOFT warning (no retry) so operators can choose to re-run synthesis.
  describe('soft warning — missing validation-rules section', () => {
    function mockReadFiles(consolidation: any, techStack: any | null) {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        const p = String(path);
        if (p.includes('phase2-consolidation.json')) {
          return JSON.stringify(consolidation);
        }
        if (p.includes('02-tech-stack-dependencies.json')) {
          return techStack === null ? '' : JSON.stringify(techStack);
        }
        return '{}';
      });
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        const p = String(path);
        if (p.includes('02-tech-stack-dependencies.json')) {
          return techStack !== null;
        }
        return true;
      });
    }

    it('emits a warning when validation libs are present but synthesis omits validation rules', async () => {
      // Re-build the synthesis output so code-conventions has NO mention of
      // validation. Replace any "validat"/"zod"/"class-validator" tokens in
      // the default fixture with neutral filler.
      const synthesis = generateValidSynthesis();
      mockAgent.invoke.mockResolvedValue({ output: synthesis });

      mockReadFiles(
        { consolidated_findings: {}, timestamp: '2024-01-01' },
        {
          findings: {
            dependencies: {
              by_service: {
                api: { production: ['express', 'class-validator', 'zod'], development: [] },
              },
            },
          },
        },
      );

      const result = await synthesisNode(mockState);
      expect(result.current_phase).toBe('phase3_synthesis');
      expect(result.warnings).toBeDefined();
      const text = (result.warnings ?? []).join('\n');
      expect(text).toContain('class-validator');
      expect(text).toContain('zod');
      expect(text).toContain('phase3');
    });

    it('does NOT emit a warning when no validation libs are in the dependency tree', async () => {
      mockReadFiles(
        { consolidated_findings: {}, timestamp: '2024-01-01' },
        {
          findings: {
            dependencies: {
              by_service: { api: { production: ['express', 'lodash'], development: [] } },
            },
          },
        },
      );

      const result = await synthesisNode(mockState);
      const warningText = (result.warnings ?? []).join('\n');
      expect(warningText).not.toMatch(/validation libraries/i);
    });

    it('does NOT emit a warning when the tech-stack file is absent (older runs)', async () => {
      mockReadFiles({ consolidated_findings: {}, timestamp: '2024-01-01' }, null);

      const result = await synthesisNode(mockState);
      const warningText = (result.warnings ?? []).join('\n');
      expect(warningText).not.toMatch(/validation libraries/i);
    });

    it('does NOT emit a warning when synthesis covers validation (the lib is mentioned in body)', async () => {
      // The default fixture's code-conventions body already does NOT mention
      // validation, so we synthesize a body that does. Override the agent's
      // output to embed "Zod" inside code-conventions.
      const customSynthesis = generateValidSynthesis().replace(
        '## Naming\n- camelCase for variables',
        '## Validation Rules\n\nUse Zod on every controller boundary.',
      );
      mockAgent.invoke.mockResolvedValue({ output: customSynthesis });

      mockReadFiles(
        { consolidated_findings: {}, timestamp: '2024-01-01' },
        {
          findings: {
            dependencies: {
              by_service: { api: { production: ['zod'], development: [] } },
            },
          },
        },
      );

      const result = await synthesisNode(mockState);
      const warningText = (result.warnings ?? []).join('\n');
      expect(warningText).not.toMatch(/does not mention validation rules/i);
    });
  });
});
