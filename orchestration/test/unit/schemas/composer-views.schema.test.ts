/**
 * Plan v4 Phase E — composer-views schema unit tests.
 *
 * Asserts:
 *   - Each view requires `schema_version === 1`, `generated_at`,
 *     `services`, and `present` flags.
 *   - Strict shape: unknown top-level / nested keys are rejected.
 *   - `by_service` records key on free-form strings (no enum); leaf
 *     fields are free-form strings (stack-agnostic).
 *   - Bundle envelope rejects mismatched schema_versions.
 */

import { describe, expect, it } from 'vitest';
import {
  ArchitectureNarrativeViewSchema,
  CodeConventionsViewSchema,
  COMPOSER_VIEWS_SCHEMA_VERSION,
  ComposerViewsBundleSchema,
  MultiFileWorkflowsViewSchema,
  TestingConventionsViewSchema,
} from '../../../src/schemas/composer-views.schema.js';

const baseService = { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' };
const baseSnippet = {
  kind: 'controller-shape',
  language: 'typescript',
  code: 'export class UsersController { ... }',
  source_file: 'services/api/src/users/users.controller.ts',
  source_line: 12,
};

describe('CodeConventionsViewSchema', () => {
  it('accepts a populated view with by_service entries', () => {
    const result = CodeConventionsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [baseService],
      by_service: {
        api: { code_patterns: [baseSnippet], notable: ['uses two-stage Docker build'] },
      },
      enforcement_summary: 'ESLint + Prettier enforced via Husky pre-commit',
      present: { any_service_patterns: true, enforcement_summary: true },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty view (all flags false)', () => {
    const result = CodeConventionsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      by_service: {},
      present: { any_service_patterns: false, enforcement_summary: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects schema_version != 1', () => {
    const result = CodeConventionsViewSchema.safeParse({
      schema_version: 2,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      by_service: {},
      present: { any_service_patterns: false, enforcement_summary: false },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const result = CodeConventionsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      by_service: {},
      present: { any_service_patterns: false, enforcement_summary: false },
      mystery: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts free-form `kind` labels — stack-agnostic', () => {
    const exoticSnippet = { ...baseSnippet, kind: 'monad-stack', language: 'haskell' };
    const result = CodeConventionsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [{ id: 'core', path: 'src/core', type: 'library', language: 'haskell' }],
      by_service: { core: { code_patterns: [exoticSnippet], notable: [] } },
      present: { any_service_patterns: true, enforcement_summary: false },
    });
    expect(result.success).toBe(true);
  });
});

describe('MultiFileWorkflowsViewSchema', () => {
  it('accepts a populated view with by_service request lifecycles', () => {
    const result = MultiFileWorkflowsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [baseService],
      by_service: {
        api: {
          request_lifecycle: [
            { step: 'Receive HTTP request', where: 'services/api/src/main.ts:bootstrap' },
          ],
        },
      },
      present: { any_request_lifecycle: true, event_pipeline: false, auth_flow: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when present flags are missing', () => {
    const result = MultiFileWorkflowsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      by_service: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('TestingConventionsViewSchema', () => {
  it('accepts a populated view with project_level + per-service tests', () => {
    const result = TestingConventionsViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [baseService],
      by_service: {
        api: {
          representative_examples: [
            {
              file: 'services/api/src/users/users.spec.ts',
              name: 'creates a user',
              snippet: { ...baseSnippet, kind: 'test-case' },
            },
          ],
        },
      },
      project_level: { summary: 'Tests favour integration spec files', runners: ['vitest'] },
      present: { any_service_tests: true, project_summary: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('ArchitectureNarrativeViewSchema', () => {
  it('accepts a populated view', () => {
    const result = ArchitectureNarrativeViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [baseService],
      repository_shape_summary: 'Modular monorepo with one TS backend and one TS frontend.',
      architecture_decisions: ['NestJS backend', 'Vite frontend'],
      runtime_versions: { node: '22.0.0' },
      external_services: [{ name: 'Stripe', kind: 'payments' }],
      by_service: { api: { notable: ['uses two-stage Docker build'] } },
      present: {
        repository_shape_summary: true,
        architecture_decisions: true,
        runtime_versions: true,
        external_services: true,
        any_service_notable: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown leaf keys in by_service (strict)', () => {
    const result = ArchitectureNarrativeViewSchema.safeParse({
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      by_service: { api: { notable: [], surprise: 1 } },
      present: {
        repository_shape_summary: false,
        architecture_decisions: false,
        runtime_versions: false,
        external_services: false,
        any_service_notable: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ComposerViewsBundleSchema', () => {
  const emptyView = (kind: 'cc' | 'mw' | 'tc' | 'an'): unknown => {
    if (kind === 'cc') {
      return {
        schema_version: 1,
        generated_at: '2026-05-09T00:00:00.000Z',
        services: [],
        by_service: {},
        present: { any_service_patterns: false, enforcement_summary: false },
      };
    }
    if (kind === 'mw') {
      return {
        schema_version: 1,
        generated_at: '2026-05-09T00:00:00.000Z',
        services: [],
        by_service: {},
        present: { any_request_lifecycle: false, event_pipeline: false, auth_flow: false },
      };
    }
    if (kind === 'tc') {
      return {
        schema_version: 1,
        generated_at: '2026-05-09T00:00:00.000Z',
        services: [],
        by_service: {},
        present: { any_service_tests: false, project_summary: false },
      };
    }
    return {
      schema_version: 1,
      generated_at: '2026-05-09T00:00:00.000Z',
      services: [],
      architecture_decisions: [],
      runtime_versions: {},
      external_services: [],
      by_service: {},
      present: {
        repository_shape_summary: false,
        architecture_decisions: false,
        runtime_versions: false,
        external_services: false,
        any_service_notable: false,
      },
    };
  };

  it('accepts a fully empty bundle', () => {
    const ok = ComposerViewsBundleSchema.safeParse({
      schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
      generated_at: '2026-05-09T00:00:00.000Z',
      code_conventions: emptyView('cc'),
      multi_file_workflows: emptyView('mw'),
      testing_conventions: emptyView('tc'),
      architecture_narrative: emptyView('an'),
      needs_verification: [],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects bundle with mismatched view schema_version', () => {
    const ccBad = { ...(emptyView('cc') as Record<string, unknown>), schema_version: 99 };
    const result = ComposerViewsBundleSchema.safeParse({
      schema_version: COMPOSER_VIEWS_SCHEMA_VERSION,
      generated_at: '2026-05-09T00:00:00.000Z',
      code_conventions: ccBad,
      multi_file_workflows: emptyView('mw'),
      testing_conventions: emptyView('tc'),
      architecture_narrative: emptyView('an'),
      needs_verification: [],
    });
    expect(result.success).toBe(false);
  });
});
