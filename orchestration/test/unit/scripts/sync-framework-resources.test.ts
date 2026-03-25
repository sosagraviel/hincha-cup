import { describe, it, expect } from 'vitest';
import { ConfigUpdaterService } from '../../../src/services/framework/config-updater.service.js';
import * as syncHelpers from '../../../src/services/framework/sync-helpers.service.js';

describe('sync-framework-resources script', () => {
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
});
