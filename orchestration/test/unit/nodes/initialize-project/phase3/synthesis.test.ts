import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesisNode } from '../../../../../src/nodes/initialize-project/phase3/synthesis.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as agentFactory from '../../../../../src/utils/agent-factory.js';
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

vi.mock('../../../../../src/utils/agent-factory.js', () => ({
  createAgentFromMarkdown: vi.fn(),
}));

vi.mock('../../../../../src/utils/enhanced-retry.js', () => ({
  retryWithEnhancedFeedback: vi.fn(),
  DEFAULT_RETRY_CONFIG: { maxAttempts: 3, timeout: 600000 },
}));

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
      })
    );

    mockAgent = {
      invoke: vi.fn().mockResolvedValue({
        output: 'x'.repeat(600), // Valid synthesis (> 500 chars)
      }),
    };

    vi.mocked(agentFactory.createAgentFromMarkdown).mockResolvedValue(mockAgent);
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockImplementation(
      async (agentInvoke: any, validator: any) => {
        const output = await agentInvoke('');
        const result = validator(output);
        if (!result.valid) throw new Error('Validation failed');
        return output;
      }
    );
  });

  it('should throw error if phase2 consolidation file not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(synthesisNode(mockState)).rejects.toThrow(
      'Phase 2 consolidation file not found'
    );
  });

  it('should read phase2 consolidation from disk', async () => {
    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('phase2-consolidation.json'),
      'utf-8'
    );
  });

  it('should create agent with correct configuration', async () => {
    await synthesisNode(mockState);

    expect(agentFactory.createAgentFromMarkdown).toHaveBeenCalledWith({
      agentName: 'architect-synthesizer',
      agentFile: '05-architect-synthesizer.md',
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      additionalContext: expect.stringContaining('CONSOLIDATED ANALYSIS FROM PHASE 2'),
      timeout: 600000,
      useUltrathink: true,
    });
  });

  it('should include phase2 consolidation in context', async () => {
    await synthesisNode(mockState);

    const createAgentCall = vi.mocked(agentFactory.createAgentFromMarkdown).mock.calls[0][0];
    expect(createAgentCall.additionalContext).toContain('consolidated_findings');
    expect(createAgentCall.additionalContext).toContain('"test": "data"');
  });

  it('should invoke agent with synthesis input', async () => {
    await synthesisNode(mockState);

    expect(mockAgent.invoke).toHaveBeenCalledWith({
      input: 'Synthesize comprehensive results for: /test/project',
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
      }
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe('failed');
  });

  it('should accept synthesis output with 500+ characters', async () => {
    const validOutput = 'x'.repeat(500);
    mockAgent.invoke.mockResolvedValue({ output: validOutput });

    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.validation_passed).toBe(true);
  });

  it('should write synthesis to disk', async () => {
    await synthesisNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('synthesis-raw.md'),
      expect.any(String)
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
      expect.objectContaining({ maxAttempts: 10 })
    );
  });

  it('should handle agent errors gracefully', async () => {
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(
      new Error('Agent creation failed')
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toContain('Synthesis failed: Agent creation failed');
    expect(result.current_phase).toBe('failed');
  });

  it('should preserve existing errors', async () => {
    mockState.errors = ['Previous error'];
    vi.mocked(agentFactory.createAgentFromMarkdown).mockRejectedValue(new Error('New error'));

    const result = await synthesisNode(mockState);

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain('Previous error');
  });

  it('should handle agent output variations', async () => {
    // Test output field
    vi.clearAllMocks();
    mockAgent.invoke.mockResolvedValue({ output: 'x'.repeat(600) });
    let result = await synthesisNode(mockState);
    expect(result.phase3_synthesis).toBeDefined();

    // Test content field
    vi.clearAllMocks();
    mockAgent.invoke.mockResolvedValue({ content: 'x'.repeat(600) });
    result = await synthesisNode(mockState);
    expect(result.phase3_synthesis).toBeDefined();
  });

  it('should use default temp_dir if not provided', async () => {
    mockState.temp_dir = undefined;

    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.claude-temp/initialize-project/phase2-consolidation.json'),
      'utf-8'
    );
  });

  it('should use provided temp_dir', async () => {
    await synthesisNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/test/temp/phase2-consolidation.json'),
      'utf-8'
    );
  });

  it('should handle JSON parse error in consolidation file', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

    // JSON.parse will throw before entering try-catch, so this throws
    await expect(synthesisNode(mockState)).rejects.toThrow();
  });

  it('should include synthesis content in return value', async () => {
    const testContent = 'x'.repeat(1000);
    mockAgent.invoke.mockResolvedValue({ output: testContent });

    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.synthesis_content).toBe(testContent);
  });

  it('should generate ISO timestamp', async () => {
    const result = await synthesisNode(mockState);

    expect(result.phase3_synthesis?.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
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
      }
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toBeDefined();
  });

  it('should handle validation errors', async () => {
    vi.mocked(enhancedRetry.retryWithEnhancedFeedback).mockRejectedValue(
      new Error('Validation failed after retries')
    );

    const result = await synthesisNode(mockState);

    expect(result.errors).toContain('Synthesis failed: Validation failed after retries');
  });

  it('should write synthesis content to correct path', async () => {
    const testContent = 'x'.repeat(600);
    mockAgent.invoke.mockResolvedValue({ output: testContent });

    await synthesisNode(mockState);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/temp/synthesis-raw.md',
      testContent
    );
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
      }
    );

    const result = await synthesisNode(mockState);
    expect(result.errors).toBeDefined();
  });
});
