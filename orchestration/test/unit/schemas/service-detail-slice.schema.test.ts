/**
 * Unit tests for `service-detail-slice.schema.ts`.
 *
 * Covers:
 *   - `ServiceDetailSliceSchema` accepts a minimal slice and a
 *     fully-attributed slice; rejects unknown top-level keys (strict).
 *   - `service_id` is required + non-empty; `agent_name` is locked to
 *     the `service-detail-extractor` literal.
 *   - `code_patterns` cap (≤ 12), `request_lifecycle` cap (≤ 10),
 *     `representative_examples` cap (≤ 5), `notable` cap (≤ 8).
 *   - `RequestLifecycleStepSchema` enforces `step` ≤ 120 / `where` ≤ 200
 *     and the canonical `path:symbol` shape for `where`.
 *   - `TestingExampleSchema` requires `file` + `snippet`, and the
 *     snippet carries `source_file` + `source_line` citations.
 *   - `code_patterns[]` snippets require citations.
 *   - `ServiceDetailIndexSchema` strict shape + count sanity.
 */

import { describe, expect, it } from 'vitest';
import {
  RequestLifecycleStepSchema,
  ServiceDetailIndexSchema,
  ServiceDetailSliceSchema,
  TestingExampleSchema,
  REQUEST_LIFECYCLE_WHERE_REGEX,
} from '../../../src/schemas/service-detail-slice.schema.js';

const baseSnippet = {
  kind: 'controller-shape',
  language: 'typescript',
  code: 'export class UsersController { create(@Body() dto: CreateUserDto) { return this.svc.create(dto); } }',
  source_file: 'services/api/src/users/users.controller.ts',
  source_line: 12,
};

describe('ServiceDetailSliceSchema', () => {
  it('accepts a minimal slice', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: { code_patterns: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a fully-attributed slice', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      graph_queries_used: ['mcp__code_graph__semantic_search_nodes_tool'],
      graph_overflow_count: 0,
      graph_overflow_tools: [],
      soft_warning: [],
      needs_verification: [],
      findings: {
        code_patterns: [baseSnippet],
        request_lifecycle: [
          {
            step: 'Receive HTTP request',
            where: 'services/api/src/users/users.controller.ts:UsersController.create',
            note: 'Express-routed via NestJS @Controller decorator',
          },
        ],
        testing: {
          representative_examples: [
            {
              file: 'services/api/src/users/users.controller.spec.ts',
              name: 'creates a user',
              snippet: { ...baseSnippet, kind: 'test-case' },
            },
          ],
          notes: 'Tests favour integration-style spec files over unit mocks.',
        },
        notable: [
          'Uses two-stage Docker build with `node:22-slim` → `gcr.io/distroless/nodejs22-debian12`.',
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects when agent_name is not the literal', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'something-else',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: { code_patterns: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty service_id', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: '',
      findings: { code_patterns: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects code_patterns exceeding the 12-entry cap', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: {
        code_patterns: Array.from({ length: 13 }, () => baseSnippet),
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: { code_patterns: [] },
      mystery_field: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown findings keys (strict)', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: { code_patterns: [], surprise: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('caps request_lifecycle at 10 steps', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: {
        code_patterns: [],
        request_lifecycle: Array.from({ length: 11 }, (_, i) => ({
          step: `Step ${i}`,
          where: `services/api/src/handler-${i}.ts:fn${i}`,
        })),
      },
    });
    expect(result.success).toBe(false);
  });

  it('caps notable at 8 bullets', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      agent_name: 'service-detail-extractor',
      timestamp: '2026-05-09T00:00:00.000Z',
      service_id: 'api',
      findings: {
        code_patterns: [],
        notable: Array.from({ length: 9 }, () => 'bullet'),
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ServiceDetailSliceSchema.code_patterns — citations required', () => {
  const base = {
    agent_name: 'service-detail-extractor' as const,
    timestamp: '2026-05-12T00:00:00.000Z',
    service_id: 'api',
    graph_queries_used: [],
  };

  it('accepts patterns with citations', () => {
    const ok = ServiceDetailSliceSchema.safeParse({
      ...base,
      findings: {
        code_patterns: [
          {
            kind: 'controller-shape',
            language: 'typescript',
            code: 'export class UsersController {}',
            source_file: 'services/api/src/users/users.controller.ts',
            source_line: 4,
          },
        ],
      },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects patterns missing citations', () => {
    const result = ServiceDetailSliceSchema.safeParse({
      ...base,
      findings: {
        code_patterns: [
          {
            kind: 'controller-shape',
            language: 'typescript',
            code: 'export class UsersController {}',
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty patterns array (library / CLI services)', () => {
    const ok = ServiceDetailSliceSchema.safeParse({
      ...base,
      findings: { code_patterns: [] },
    });
    expect(ok.success).toBe(true);
  });
});

describe('RequestLifecycleStepSchema', () => {
  it('accepts a path:symbol shape', () => {
    const ok = RequestLifecycleStepSchema.safeParse({
      step: 'Receive HTTP request',
      where: 'services/api/src/users/users.controller.ts:UsersController.create',
    });
    expect(ok.success).toBe(true);
  });

  it('accepts dotted module paths (Python / Java)', () => {
    const ok = RequestLifecycleStepSchema.safeParse({
      step: 'Validate body',
      where: 'app/api/users.py:UsersResource.post',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a bare path with no symbol', () => {
    const result = RequestLifecycleStepSchema.safeParse({
      step: 'Validate body',
      where: 'services/api/src/users/dto/create-user.dto.ts',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bare symbol with no path', () => {
    const result = RequestLifecycleStepSchema.safeParse({
      step: 'Persist row',
      where: 'UsersRepository.save',
    });
    expect(result.success).toBe(false);
  });

  it('rejects step longer than 120 chars', () => {
    const result = RequestLifecycleStepSchema.safeParse({
      step: 'a'.repeat(121),
      where: 'src/x.ts:y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects where longer than 200 chars', () => {
    const result = RequestLifecycleStepSchema.safeParse({
      step: 'Receive request',
      where: 'a'.repeat(201) + ':fn',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = RequestLifecycleStepSchema.safeParse({
      step: 'Receive request',
      where: 'src/x.ts:y',
      mystery: true,
    });
    expect(result.success).toBe(false);
  });

  it('exports the canonical regex for reuse', () => {
    expect(REQUEST_LIFECYCLE_WHERE_REGEX.test('a/b.ts:Foo.bar')).toBe(true);
    expect(REQUEST_LIFECYCLE_WHERE_REGEX.test('a/b.ts')).toBe(false);
  });
});

describe('TestingExampleSchema', () => {
  it('accepts a fully-cited example', () => {
    const ok = TestingExampleSchema.safeParse({
      file: 'services/api/src/users/users.spec.ts',
      name: 'creates a user',
      snippet: {
        kind: 'test-case',
        language: 'typescript',
        code: "it('creates a user', async () => { ... })",
        source_file: 'services/api/src/users/users.spec.ts',
        source_line: 8,
      },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a snippet without a citation', () => {
    const result = TestingExampleSchema.safeParse({
      file: 'services/api/src/users/users.spec.ts',
      snippet: {
        kind: 'test-case',
        language: 'typescript',
        code: "it('creates a user', async () => { ... })",
      },
    });
    expect(result.success).toBe(false);
  });

  it('requires file + snippet', () => {
    const ok = TestingExampleSchema.safeParse({
      file: 'services/api/src/x.spec.ts',
      snippet: { ...baseSnippet, kind: 'test-case' },
    });
    expect(ok.success).toBe(true);

    const missingSnippet = TestingExampleSchema.safeParse({
      file: 'services/api/src/x.spec.ts',
    });
    expect(missingSnippet.success).toBe(false);
  });

  it('rejects empty file', () => {
    const result = TestingExampleSchema.safeParse({
      file: '',
      snippet: { ...baseSnippet, kind: 'test-case' },
    });
    expect(result.success).toBe(false);
  });
});

describe('ServiceDetailIndexSchema', () => {
  it('accepts a complete index', () => {
    const ok = ServiceDetailIndexSchema.safeParse({
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 3,
      services_completed: 3,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {
        api: 'service-details/api.json',
        web: 'service-details/web.json',
        keycloak: 'service-details/keycloak.json',
      },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects negative counts', () => {
    const result = ServiceDetailIndexSchema.safeParse({
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 1,
      services_completed: -1,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const result = ServiceDetailIndexSchema.safeParse({
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 0,
      services_completed: 0,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {},
      mystery: 1,
    });
    expect(result.success).toBe(false);
  });
});
