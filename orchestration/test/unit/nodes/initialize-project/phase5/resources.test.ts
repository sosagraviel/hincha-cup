import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resourcesNode } from '../../../../../src/nodes/initialize-project/phase5/resources.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';
import * as fs from 'fs';
import * as skillResolver from '../../../../../src/nodes/initialize-project/phase5/skill-resolver.js';
import * as agentGenerator from '../../../../../src/nodes/initialize-project/phase5/agent-generator.js';
import * as mcpConfigService from '../../../../../src/services/framework/mcp-config.service.js';
import * as preflightScriptsService from '../../../../../src/services/framework/preflight-scripts.service.js';

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
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

vi.mock('../../../../../src/nodes/initialize-project/phase5/skill-resolver.js', () => ({
  resolveSkills: vi.fn(),
  copyResolvedSkills: vi.fn(),
}));

vi.mock('../../../../../src/nodes/initialize-project/phase5/agent-generator.js', () => ({
  generateAgents: vi.fn(),
  writeAgents: vi.fn(),
}));

vi.mock('../../../../../src/services/framework/mcp-config.service.js', () => ({
  upsertCodeGraphMcpConfig: vi.fn(),
}));

vi.mock('../../../../../src/services/framework/preflight-scripts.service.js', () => ({
  copyPreflightScripts: vi.fn(),
}));

describe('resourcesNode', () => {
  let mockState: InitializeProjectState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      project_path: '/test/project',
      framework_path: '/test/framework',
      current_phase: 'phase4_context',
      temp_dir: '/test/temp',
      phase1_analysis: { all_completed: false },
      phase1_retry_tracking: {},
      phase4_context: {
        framework_config_generated: true,
        claude_md_written: true,
        conventions_skills_written: true,
        architectural_narrative_written: true,
        timestamp: '2024-01-01T00:00:00Z',
      },
      errors: [],
      warnings: [],
    };

    // Mock existsSync to return true for framework config check
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Mock framework config file read
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'express' },
            },
            {
              id: 'frontend',
              path: 'client',
              type: 'frontend',
              language: 'javascript',
              frameworks: { main: 'react' },
            },
          ],
          is_monorepo: false,
        },
      }),
    );

    // Mock skills resolution
    vi.mocked(skillResolver.resolveSkills).mockReturnValue([
      {
        name: 'typescript-skill',
        path: '/skills/typescript',
        relative_path: 'skills/typescript',
        reason: 'test',
        description: 'test',
      },
      {
        name: 'react-skill',
        path: '/skills/react',
        relative_path: 'skills/react',
        reason: 'test',
        description: 'test',
      },
    ]);

    vi.mocked(skillResolver.copyResolvedSkills).mockReturnValue(5);

    // Mock agent generation
    vi.mocked(agentGenerator.generateAgents).mockReturnValue([
      { name: 'planner', content: 'agent content' },
      { name: 'implementer', content: 'agent content' },
    ] as any);

    vi.mocked(mcpConfigService.upsertCodeGraphMcpConfig).mockReturnValue({
      configPath: '/test/project/.mcp.json',
      changed: true,
      backedUp: false,
    });

    vi.mocked(preflightScriptsService.copyPreflightScripts).mockReturnValue({
      configDir: '.claude',
      scriptsDir: '/test/project/.claude/scripts',
      changed: true,
      files: [
        '/test/project/.claude/scripts/ensure-context.sh',
        '/test/project/.claude/scripts/lib/resolve-paths.sh',
      ],
    });
  });

  it('should throw error if phase4_context not completed', async () => {
    // Mock existsSync to return false for this test
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resourcesNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 4 context generation not completed'))).toBe(
      true,
    );
    expect(result.current_phase).toBe('failed');
  });

  it('should throw error if framework_config_generated is false', async () => {
    // This test is no longer relevant as the code checks file existence, not state flags
    // The actual check happens via existsSync on the framework-config.json file
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await resourcesNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes('Phase 4 context generation not completed'))).toBe(
      true,
    );
    expect(result.current_phase).toBe('failed');
  });

  it('should successfully copy resources', async () => {
    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe('phase5_resources');
    expect(result.errors).toBeUndefined();
  });

  it('should read framework config from disk', async () => {
    await resourcesNode(mockState);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('framework-config.json'),
      'utf-8',
    );
  });

  it('should resolve skills based on stack profile', async () => {
    await resourcesNode(mockState);

    expect(skillResolver.resolveSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.any(Array),
        is_monorepo: false,
      }),
      '/test/framework',
    );
  });

  it('should copy resolved skills', async () => {
    await resourcesNode(mockState);

    expect(skillResolver.copyResolvedSkills).toHaveBeenCalledWith(
      expect.any(Array),
      '/test/project',
    );
  });

  it('should generate agents with correct parameters', async () => {
    await resourcesNode(mockState);

    expect(agentGenerator.generateAgents).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.any(Array),
        is_monorepo: false,
      }),
      expect.any(Array),
      '/test/project',
      expect.stringContaining('agents/templates'),
      '/test/framework',
    );
  });

  it('should write generated agents to disk', async () => {
    await resourcesNode(mockState);

    expect(agentGenerator.writeAgents).toHaveBeenCalledWith(expect.any(Array), '/test/project');
  });

  it('should configure project MCP for native Claude Code sessions', async () => {
    await resourcesNode(mockState);

    expect(mcpConfigService.upsertCodeGraphMcpConfig).toHaveBeenCalledWith({
      projectPath: '/test/project',
      frameworkPath: '/test/framework',
      provider: 'claude',
    });
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });

    const result = await resourcesNode(mockState);

    expect(result.errors).toContain('Resources copying failed: File read error');
    expect(result.current_phase).toBe('failed');
  });

  it('returns only the new error; the LangGraph reducer merges with existing state.errors', async () => {
    // Phase E removed the `[...state.errors, new]` spread that duplicated
    // every error against the concat reducer. Nodes now return only the
    // delta; the reducer joins the lists.
    mockState.errors = ['Previous error'];
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('New error');
    });

    const result = await resourcesNode(mockState);

    expect(result.errors).toEqual(['Resources copying failed: New error']);
  });

  it('should handle missing stack profile in config', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

    const result = await resourcesNode(mockState);

    // Should fail due to missing stack_profile
    expect(result.errors).toBeDefined();
  });

  it('should handle empty skills array', async () => {
    vi.mocked(skillResolver.resolveSkills).mockReturnValue([]);
    vi.mocked(skillResolver.copyResolvedSkills).mockReturnValue(0);

    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe('phase5_resources');
  });

  it('should handle empty agents array', async () => {
    vi.mocked(agentGenerator.generateAgents).mockReturnValue([]);

    const result = await resourcesNode(mockState);

    expect(result.current_phase).toBe('phase5_resources');
  });

  it('should construct correct paths for resources', async () => {
    await resourcesNode(mockState);

    // Check templates path
    expect(agentGenerator.generateAgents).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      '/test/project',
      '/test/framework/agents/templates',
      '/test/framework',
    );
  });

  it('should handle JSON parse errors in framework config', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

    const result = await resourcesNode(mockState);

    expect(result.errors).toBeDefined();
    expect(result.current_phase).toBe('failed');
  });

  it('should return phase5_resources on success', async () => {
    const result = await resourcesNode(mockState);

    expect(result).toEqual({ current_phase: 'phase5_resources' });
  });
});
