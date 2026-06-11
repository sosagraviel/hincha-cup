import { describe, it, expect } from 'vitest';
import { extractDetectedStack } from '../../../../../../src/nodes/initialize-project/phase5/helpers/stack-detector.js';
import type { StackProfile } from '../../../../../../src/schemas/index.js';

/**
 * extractDetectedStack builds the token set that skill triggers
 * (`trigger_mode: "triggered"`) match against. It reads per-service fields plus
 * a small allowlist of repo-level fields (`infrastructure`,
 * `software_version_control`).
 */

const createMockStackProfile = (overrides: Partial<StackProfile> = {}): StackProfile => ({
  services: [
    {
      id: 'main',
      path: '.',
      type: 'backend',
      language: 'typescript',
      frameworks: { main: 'express' },
    },
  ],
  is_monorepo: false,
  ...overrides,
});

describe('extractDetectedStack', () => {
  it('includes per-service language and frameworks', () => {
    const { normalized, original } = extractDetectedStack(createMockStackProfile());
    expect(normalized.has('typescript')).toBe(true);
    expect(normalized.has('express')).toBe(true);
  });

  it('exposes software_version_control so VCS triggers can fire', () => {
    const { normalized, original } = extractDetectedStack(
      createMockStackProfile({ software_version_control: 'github' }),
    );
    expect(normalized.has('github')).toBe(true);
    expect(original.has('github')).toBe(true);
  });

  it('normalizes azure-devops to azuredevops for trigger matching', () => {
    const { normalized, original } = extractDetectedStack(
      createMockStackProfile({ software_version_control: 'azure-devops' }),
    );
    expect(normalized.has('azuredevops')).toBe(true);
    expect(original.has('azure-devops')).toBe(true);
  });

  it('omits the token when software_version_control is absent', () => {
    const { normalized } = extractDetectedStack(createMockStackProfile());
    expect(normalized.has('github')).toBe(false);
    expect(normalized.has('gitlab')).toBe(false);
  });
});
