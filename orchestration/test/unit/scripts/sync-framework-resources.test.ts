import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigUpdaterService } from '../../../src/services/framework/config-updater.service.js';
import * as syncHelpers from '../../../src/services/framework/sync-helpers.service.js';
import * as mcpConfigService from '../../../src/services/framework/mcp-config.service.js';
import { syncMcpConfig } from '../../../src/scripts/sync-framework-resources.js';

vi.mock('../../../src/services/framework/mcp-config.service.js', () => ({
  upsertCodeGraphMcpConfig: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('sync-framework-resources script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mcpConfigService.upsertCodeGraphMcpConfig).mockReturnValue({
      configPath: '/project/.mcp.json',
      changed: true,
      backedUp: false,
    });
  });

  it('should have ConfigUpdaterService available', () => {
    // Verify the main service can be instantiated
    // Detailed sync behavior is tested in integration tests
    const service = new ConfigUpdaterService('/project', '/framework');
    expect(service).toBeDefined();
  });

  it('should have sync helpers available', () => {
    // Verify sync helper functions are available
    expect(syncHelpers.updateSingleSkill).toBeDefined();
    expect(syncHelpers.addSingleSkill).toBeDefined();
    expect(syncHelpers.regenerateSingleAgent).toBeDefined();
  });

  it('should sync code graph MCP config', async () => {
    const result = await syncMcpConfig({
      projectPath: '/project',
      frameworkPath: '/framework',
    });

    expect(result.updated).toBe(true);
    expect(mcpConfigService.upsertCodeGraphMcpConfig).toHaveBeenCalledWith({
      projectPath: '/project',
      frameworkPath: '/framework',
      provider: 'claude',
    });
  });
});
