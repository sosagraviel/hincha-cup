import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  stripVolatileFields,
  stripVolatileFrameworkConfigFile,
} from '../../../../src/services/framework/framework-config-normalizer.js';

function tmpConfigPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'config-normalizer-'));
  return join(dir, 'framework-config.json');
}

describe('stripVolatileFields', () => {
  it('removes project_metadata and per-resource last_sync but keeps top-level last_sync', () => {
    const config: Record<string, unknown> = {
      version: '2.0.0',
      project_metadata: {
        project_path: '/Users/dev/projects/app',
        initialization_hash: 'abc123',
        last_analysis: '2026-04-22T00:00:00.000Z',
      },
      stack_profile: { services: [] },
      resource_state: {
        skills: { foo: { managed_by_framework: true, last_sync: '2026-04-22T00:00:00.000Z' } },
        agents: { bar: { managed_by_framework: true, last_sync: '2026-04-22T00:00:00.000Z' } },
        last_sync: '2026-04-22T00:00:00.000Z',
      },
    };

    const changed = stripVolatileFields(config);

    expect(changed).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(config, 'project_metadata')).toBe(false);
    const resourceState = config.resource_state as Record<string, any>;
    // Per-resource timestamps are stripped...
    expect(Object.prototype.hasOwnProperty.call(resourceState.skills.foo, 'last_sync')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(resourceState.agents.bar, 'last_sync')).toBe(false);
    // ...but the top-level sync marker is preserved.
    expect(resourceState.last_sync).toBe('2026-04-22T00:00:00.000Z');
    // Stable fields preserved.
    expect(config.version).toBe('2.0.0');
    expect(config.stack_profile).toEqual({ services: [] });
    expect(resourceState.skills.foo.managed_by_framework).toBe(true);
    expect(resourceState.agents.bar.managed_by_framework).toBe(true);
  });

  it('keeps a top-level-only last_sync (returns false when nothing volatile present)', () => {
    const config: Record<string, unknown> = {
      version: '2.0.0',
      resource_state: { skills: {}, agents: {}, last_sync: '2026-04-22T00:00:00.000Z' },
    };

    expect(stripVolatileFields(config)).toBe(false);
    expect((config.resource_state as Record<string, unknown>).last_sync).toBe(
      '2026-04-22T00:00:00.000Z',
    );
  });

  it('returns false for an already-clean config', () => {
    const config: Record<string, unknown> = {
      version: '2.0.0',
      stack_profile: { services: [] },
      resource_state: { skills: {}, agents: {} },
    };

    expect(stripVolatileFields(config)).toBe(false);
  });

  it('tolerates a missing or malformed resource_state', () => {
    expect(stripVolatileFields({ version: '2.0.0' })).toBe(false);
    expect(stripVolatileFields({ resource_state: 'not-an-object' })).toBe(false);
    expect(stripVolatileFields({ project_metadata: {} })).toBe(true);
  });
});

describe('stripVolatileFrameworkConfigFile', () => {
  it('rewrites a dirty file and is idempotent on the second call', () => {
    const filePath = tmpConfigPath();
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          version: '2.0.0',
          project_metadata: { initialization_hash: 'abc123' },
          stack_profile: { services: [] },
          resource_state: {
            skills: { foo: { managed_by_framework: true, last_sync: '2026-04-22T00:00:00.000Z' } },
            agents: {},
            last_sync: '2026-04-22T00:00:00.000Z',
          },
        },
        null,
        2,
      ),
    );

    expect(stripVolatileFrameworkConfigFile(filePath)).toBe(true);

    const after = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, any>;
    expect(Object.prototype.hasOwnProperty.call(after, 'project_metadata')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(after.resource_state.skills.foo, 'last_sync')).toBe(
      false,
    );
    // Top-level sync marker preserved.
    expect(after.resource_state.last_sync).toBe('2026-04-22T00:00:00.000Z');

    const firstPass = readFileSync(filePath, 'utf-8');
    expect(stripVolatileFrameworkConfigFile(filePath)).toBe(false);
    expect(readFileSync(filePath, 'utf-8')).toBe(firstPass);
  });

  it('leaves a clean file byte-identical', () => {
    const filePath = tmpConfigPath();
    const original = JSON.stringify(
      {
        version: '2.0.0',
        stack_profile: { services: [] },
        resource_state: { skills: {}, agents: {} },
      },
      null,
      2,
    );
    writeFileSync(filePath, original);

    expect(stripVolatileFrameworkConfigFile(filePath)).toBe(false);
    expect(readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('returns false for a missing file or malformed JSON', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'config-normalizer-')), 'nope.json');
    expect(stripVolatileFrameworkConfigFile(missing)).toBe(false);

    const bad = tmpConfigPath();
    writeFileSync(bad, 'not json{');
    expect(stripVolatileFrameworkConfigFile(bad)).toBe(false);
  });
});
