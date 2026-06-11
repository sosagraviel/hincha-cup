import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigUpdaterService } from '../../../src/services/framework/config-updater.service.js';
import * as syncHelpers from '../../../src/services/framework/sync-helpers.service.js';
import * as mcpConfigService from '../../../src/services/framework/mcp-config.service.js';
import * as normalizer from '../../../src/services/framework/framework-config-normalizer.js';
import {
  syncMcpConfig,
  normalizeFrameworkConfig,
} from '../../../src/scripts/sync-framework-resources.js';

vi.mock('../../../src/services/framework/mcp-config.service.js', () => ({
  upsertCodeGraphMcpConfig: vi.fn(),
}));

vi.mock('../../../src/services/framework/framework-config-normalizer.js', () => ({
  stripVolatileFrameworkConfigFile: vi.fn(),
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

  it('normalizes framework-config.json (strips legacy volatile fields)', () => {
    vi.mocked(normalizer.stripVolatileFrameworkConfigFile).mockReturnValue(true);

    const result = normalizeFrameworkConfig({
      projectPath: '/project',
      frameworkPath: '/framework',
    });

    expect(result.normalized).toBe(true);
    expect(normalizer.stripVolatileFrameworkConfigFile).toHaveBeenCalledWith(
      expect.stringContaining('framework-config.json'),
    );
  });

  it('reports not-normalized when the config is already clean', () => {
    vi.mocked(normalizer.stripVolatileFrameworkConfigFile).mockReturnValue(false);

    const result = normalizeFrameworkConfig({
      projectPath: '/project',
      frameworkPath: '/framework',
    });

    expect(result.normalized).toBe(false);
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
