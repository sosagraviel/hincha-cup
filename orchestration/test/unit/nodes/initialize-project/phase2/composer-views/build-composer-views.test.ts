/**
 * Plan v4 Phase E — buildComposerViews unit tests.
 *
 * Asserts:
 *   - Empty inputs → all `present.*` flags false; views still validate.
 *   - Phase 1 project-level fields propagate (`enforcement_summary`,
 *     `event_pipeline`, `auth_flow`, `repository_shape_summary`,
 *     `architecture_decisions`, `runtime_versions`, `external_services`).
 *   - Per-service slices populate `by_service[<id>]` for every view that
 *     receives data; services without a slice get NO entry (skipped, not
 *     stubbed).
 *   - `needs_verification` rolls up across analyzers + slices.
 *   - Stack-agnostic: an Erlang slice with exotic `kind` labels round-trips
 *     untouched.
 */

import { describe, expect, it } from 'vitest';
import { buildComposerViews } from '../../../../../../src/nodes/initialize-project/phase2/composer-views/build-composer-views.js';
import type { ServiceDetailSlice } from '../../../../../../src/schemas/service-detail-slice.schema.js';

const generatedAt = '2026-05-09T00:00:00.000Z';

function makeStructure(
  services: Array<{ id: string; path: string; type?: string; language?: string }>,
) {
  return {
    agent_name: 'structure-architecture-analyzer',
    timestamp: generatedAt,
    findings: {
      services,
      repository_shape_summary: 'Two-service TypeScript monorepo (api + web).',
      architecture_decisions: ['NestJS backend', 'Vite frontend'],
    },
  };
}

function makeTechStack() {
  return {
    agent_name: 'tech-stack-dependencies-analyzer',
    timestamp: generatedAt,
    findings: {
      runtime_versions: { node: '22.0.0' },
      external_services: [{ name: 'Stripe', kind: 'payments' }],
    },
  };
}

function makeCodePatterns() {
  return {
    agent_name: 'code-patterns-testing-analyzer',
    timestamp: generatedAt,
    findings: {
      quality_tools: { enforcement_summary: 'ESLint + Prettier + Husky enforced.' },
      testing: { runners: ['vitest'], summary: 'Vitest preferred; integration spec files.' },
    },
  };
}

function makeDataFlows() {
  return {
    agent_name: 'data-flows-integrations-analyzer',
    timestamp: generatedAt,
    findings: {
      event_pipeline: {
        summary: 'Outbox pattern: writes flush to RabbitMQ via cron.',
        examples: [
          {
            kind: 'outbox-flush',
            language: 'typescript',
            code: 'await this.outbox.flush();',
          },
        ],
      },
      auth_flow: {
        summary: 'JWT minted by Keycloak; verified at gateway.',
        examples: [],
      },
    },
  };
}

function makeApiSlice(): ServiceDetailSlice {
  return {
    agent_name: 'service-detail-extractor',
    timestamp: generatedAt,
    service_id: 'api',
    graph_queries_used: [],
    findings: {
      code_patterns: [
        {
          kind: 'controller-shape',
          language: 'typescript',
          code: 'export class UsersController { create() {} }',
          source_file: 'services/api/src/users/users.controller.ts',
          source_line: 12,
        },
      ],
      request_lifecycle: [
        {
          step: 'Receive HTTP request',
          where: 'services/api/src/users/users.controller.ts:UsersController.create',
        },
      ],
      testing: {
        representative_examples: [
          {
            file: 'services/api/src/users/users.spec.ts',
            name: 'creates a user',
            snippet: {
              kind: 'test-case',
              language: 'typescript',
              code: "it('creates a user', async () => { ... })",
              source_file: 'services/api/src/users/users.spec.ts',
              source_line: 8,
            },
          },
        ],
        notes: 'Tests favour integration-style spec files.',
      },
      notable: ['uses two-stage Docker build'],
    },
  };
}

describe('buildComposerViews', () => {
  it('produces all-empty views when no Phase 1 outputs nor slices are supplied', () => {
    const bundle = buildComposerViews({
      structure: undefined,
      techStack: undefined,
      codePatterns: undefined,
      dataFlows: undefined,
      serviceSlices: {},
      generatedAt,
    });
    expect(bundle.code_conventions.present.any_service_patterns).toBe(false);
    expect(bundle.code_conventions.present.enforcement_summary).toBe(false);
    expect(bundle.multi_file_workflows.present.any_request_lifecycle).toBe(false);
    expect(bundle.multi_file_workflows.present.event_pipeline).toBe(false);
    expect(bundle.multi_file_workflows.present.auth_flow).toBe(false);
    expect(bundle.testing_conventions.present.any_service_tests).toBe(false);
    expect(bundle.testing_conventions.present.project_summary).toBe(false);
    expect(bundle.architecture_narrative.present.repository_shape_summary).toBe(false);
    expect(bundle.architecture_narrative.present.runtime_versions).toBe(false);
  });

  it('propagates project-level fields and rolls up service slices', () => {
    const bundle = buildComposerViews({
      structure: makeStructure([
        { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' },
        { id: 'web', path: 'services/web', type: 'frontend', language: 'typescript' },
      ]),
      techStack: makeTechStack(),
      codePatterns: makeCodePatterns(),
      dataFlows: makeDataFlows(),
      serviceSlices: { api: makeApiSlice() }, // web has NO slice
      generatedAt,
    });

    // Code conventions
    expect(bundle.code_conventions.enforcement_summary).toContain('ESLint');
    expect(bundle.code_conventions.present.enforcement_summary).toBe(true);
    expect(bundle.code_conventions.by_service.api).toBeDefined();
    expect(bundle.code_conventions.by_service.api?.code_patterns).toHaveLength(1);
    // web has no slice → no entry
    expect(bundle.code_conventions.by_service.web).toBeUndefined();
    expect(bundle.code_conventions.present.any_service_patterns).toBe(true);

    // Multi-file workflows
    expect(bundle.multi_file_workflows.event_pipeline?.summary).toContain('Outbox');
    expect(bundle.multi_file_workflows.auth_flow?.summary).toContain('JWT');
    expect(bundle.multi_file_workflows.by_service.api?.request_lifecycle).toHaveLength(1);
    expect(bundle.multi_file_workflows.present.any_request_lifecycle).toBe(true);
    expect(bundle.multi_file_workflows.present.event_pipeline).toBe(true);
    expect(bundle.multi_file_workflows.present.auth_flow).toBe(true);

    // Testing conventions
    expect(bundle.testing_conventions.project_level?.summary).toContain('Vitest');
    expect(bundle.testing_conventions.project_level?.runners).toEqual(['vitest']);
    expect(bundle.testing_conventions.by_service.api?.representative_examples).toHaveLength(1);
    expect(bundle.testing_conventions.present.any_service_tests).toBe(true);
    expect(bundle.testing_conventions.present.project_summary).toBe(true);

    // Architecture narrative
    expect(bundle.architecture_narrative.repository_shape_summary).toContain('Two-service');
    expect(bundle.architecture_narrative.architecture_decisions).toEqual([
      'NestJS backend',
      'Vite frontend',
    ]);
    expect(bundle.architecture_narrative.runtime_versions).toEqual({ node: '22.0.0' });
    expect(bundle.architecture_narrative.external_services).toHaveLength(1);
    expect(bundle.architecture_narrative.external_services[0]).toMatchObject({
      name: 'Stripe',
      kind: 'payments',
    });
    expect(bundle.architecture_narrative.by_service.api?.notable).toEqual([
      'uses two-stage Docker build',
    ]);
    expect(bundle.architecture_narrative.present.repository_shape_summary).toBe(true);
    expect(bundle.architecture_narrative.present.runtime_versions).toBe(true);
  });

  it('rolls up needs_verification across analyzers + slices', () => {
    const structure = makeStructure([{ id: 'api', path: 'services/api' }]);
    (structure as Record<string, unknown>).needs_verification = [
      {
        id: 'q1',
        question: 'Is X true?',
        reason: 'cannot tell from code',
        attempted_resolution: ['Read services/api/src/index.ts', 'Grep "X"'],
        impact: 'changes the wiki ARCHITECTURE.md page Strategy section AND the auth skill body.',
      },
    ];
    const slice: ServiceDetailSlice = {
      ...makeApiSlice(),
      needs_verification: [
        {
          id: 'q2',
          question: 'Why Y?',
          reason: 'needs operator confirmation',
          attempted_resolution: ['Read api/src/y.ts', 'Grep "Y"'],
          impact:
            'changes the wiki services/api.md Request Lifecycle section AND the testing skill body.',
        },
      ],
    };

    const bundle = buildComposerViews({
      structure,
      techStack: undefined,
      codePatterns: undefined,
      dataFlows: undefined,
      serviceSlices: { api: slice },
      generatedAt,
    });
    expect(bundle.needs_verification).toHaveLength(2);
    expect(bundle.needs_verification.map((nv) => nv.id).sort()).toEqual(['q1', 'q2']);
  });

  it('preserves stack-agnostic free-form values verbatim', () => {
    const erlangSlice: ServiceDetailSlice = {
      agent_name: 'service-detail-extractor',
      timestamp: generatedAt,
      service_id: 'core',
      graph_queries_used: [],
      findings: {
        code_patterns: [
          {
            kind: 'actor-mailbox',
            language: 'erlang',
            code: 'receive\n  {ping, From} -> From ! pong\nend.',
            source_file: 'apps/core/src/core_actor.erl',
            source_line: 17,
          },
        ],
        notable: ['supervised by `core_sup`'],
      },
    };
    const bundle = buildComposerViews({
      structure: makeStructure([
        { id: 'core', path: 'apps/core', type: 'library', language: 'erlang' },
      ]),
      techStack: undefined,
      codePatterns: undefined,
      dataFlows: undefined,
      serviceSlices: { core: erlangSlice },
      generatedAt,
    });
    const pat = bundle.code_conventions.by_service.core?.code_patterns[0];
    expect(pat?.kind).toBe('actor-mailbox');
    expect(pat?.language).toBe('erlang');
    expect(pat?.code).toContain('receive');
    expect(bundle.architecture_narrative.by_service.core?.notable[0]).toBe(
      'supervised by `core_sup`',
    );
  });

  // Plan v8 Phase C — analyzer-direct fallback. When no Phase 1.5 slice
  // exists, the composer view reads per-service rollups directly from
  // the Phase 1 analyzer outputs (code-patterns + data-flows).
  it('falls back to analyzer-direct by-service rollups when no slices exist', () => {
    const structure = makeStructure([
      { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' },
    ]);

    // code-patterns analyzer emits the by-service rollups inline
    const codePatterns = {
      agent_name: 'code-patterns-testing-analyzer',
      timestamp: generatedAt,
      findings: {
        code_patterns: {
          api: {
            patterns: [
              {
                kind: 'controller-shape',
                language: 'typescript',
                code: 'export class UsersController {}',
                source_file: 'services/api/src/users/users.controller.ts',
                source_line: 4,
              },
            ],
            notable: ['DTO validation via class-validator'],
          },
        },
        testing: {
          api: {
            representative_examples: [
              {
                file: 'services/api/src/users/users.spec.ts',
                name: 'creates a user',
                snippet: {
                  kind: 'test-case',
                  language: 'typescript',
                  code: "it('creates a user', async () => { ... })",
                  source_file: 'services/api/src/users/users.spec.ts',
                  source_line: 6,
                },
              },
            ],
            notes: 'Integration-first spec files.',
          },
        },
      },
    };

    // data-flows analyzer emits per-service request_lifecycle inline
    const dataFlows = {
      agent_name: 'data-flows-integrations-analyzer',
      timestamp: generatedAt,
      findings: {
        request_lifecycle: {
          api: [
            {
              step: 'Receive HTTP request',
              where: 'services/api/src/users/users.controller.ts:UsersController.create',
            },
            {
              step: 'Validate body',
              where: 'services/api/src/users/dto/create-user.dto.ts:CreateUserDto',
            },
          ],
        },
      },
    };

    const bundle = buildComposerViews({
      structure,
      techStack: undefined,
      codePatterns,
      dataFlows,
      serviceSlices: {}, // NO Phase 1.5 slices — the load-bearing case
      generatedAt,
    });

    // code-conventions — code_patterns + notable come from analyzer
    expect(bundle.code_conventions.by_service.api?.code_patterns).toHaveLength(1);
    expect(bundle.code_conventions.by_service.api?.code_patterns[0].kind).toBe('controller-shape');
    expect(bundle.code_conventions.by_service.api?.notable[0]).toBe(
      'DTO validation via class-validator',
    );
    expect(bundle.code_conventions.present.any_service_patterns).toBe(true);

    // testing-conventions — examples + notes come from analyzer
    expect(bundle.testing_conventions.by_service.api?.representative_examples).toHaveLength(1);
    expect(bundle.testing_conventions.by_service.api?.notes).toBe('Integration-first spec files.');
    expect(bundle.testing_conventions.present.any_service_tests).toBe(true);

    // multi-file-workflows — request_lifecycle comes from analyzer
    expect(bundle.multi_file_workflows.by_service.api?.request_lifecycle).toHaveLength(2);
    expect(bundle.multi_file_workflows.by_service.api?.request_lifecycle[0].step).toBe(
      'Receive HTTP request',
    );
    expect(bundle.multi_file_workflows.present.any_request_lifecycle).toBe(true);
  });

  // Plan v9 — deterministic-derivation fallback. Even when neither slices
  // nor analyzer-direct rollups are present, the composer-view builder
  // populates `present.*` from the language-config registry × the
  // project-inspection JSON.
  it('falls back to deterministic derivation when slices + analyzer outputs are empty', () => {
    const structure = makeStructure([
      { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' },
    ]);
    // Clear analyzer-direct rollups so deterministic derivation is the only
    // source the composer can fall back to.
    structure.findings.repository_shape_summary = undefined as any;
    structure.findings.architecture_decisions = [];
    const inspection = {
      generated_at: '2026-05-12T00:00:00Z',
      schema_version: '1',
      repository_type: 'monorepo',
      monorepo: { workspace_tool: 'pnpm workspaces', workspace_paths: ['services/*'] },
      runtime_versions: { node: '22.5.1' },
      manifests: [
        {
          kind: 'package.json',
          path: 'services/api/package.json',
          raw: {
            dependencies: {
              '@nestjs/jwt': '^11',
              bullmq: '^5',
              stripe: '^14',
              '@sentry/node': '^7',
            },
            devDependencies: {
              eslint: '^9',
              prettier: '^3',
              typescript: '^5',
              vitest: '^4',
              husky: '^9',
            },
          },
        },
      ],
      infrastructure: [],
      port_candidates: {},
    } as any;
    const bundle = buildComposerViews({
      structure,
      techStack: undefined,
      codePatterns: undefined,
      dataFlows: undefined,
      serviceSlices: {},
      generatedAt,
      inspection,
      projectPath: '/nonexistent',
      fileCounts: [{ language: 'typescript', count: 100 }],
    });

    // multi-file-workflows: event_pipeline derived from bullmq, auth_flow from @nestjs/jwt
    expect(bundle.multi_file_workflows.event_pipeline?.summary).toMatch(/task-queue.*BullMQ/);
    expect(bundle.multi_file_workflows.present.event_pipeline).toBe(true);
    expect(bundle.multi_file_workflows.present.event_pipeline_source).toBe('deterministic');
    expect(bundle.multi_file_workflows.auth_flow?.summary).toMatch(/JWT-bearer/);
    expect(bundle.multi_file_workflows.present.auth_flow).toBe(true);
    expect(bundle.multi_file_workflows.present.auth_flow_source).toBe('deterministic');

    // code-conventions: enforcement_summary derived from eslint+prettier+typescript+husky
    expect(bundle.code_conventions.enforcement_summary).toMatch(/eslint \+ prettier \+ typescript/);
    expect(bundle.code_conventions.present.enforcement_summary).toBe(true);
    expect(bundle.code_conventions.present.enforcement_summary_source).toBe('deterministic');

    // testing-conventions: runners derived from vitest, summary templated
    expect(bundle.testing_conventions.project_level?.runners).toContain('vitest');
    expect(bundle.testing_conventions.project_level?.summary).toMatch(/vitest/i);
    expect(bundle.testing_conventions.present.project_summary).toBe(true);
    expect(bundle.testing_conventions.present.project_summary_source).toBe('deterministic');

    // architecture-narrative: shape summary + runtimes + external services
    expect(bundle.architecture_narrative.repository_shape_summary).toMatch(
      /pnpm workspaces monorepo/,
    );
    expect(bundle.architecture_narrative.present.repository_shape_summary_source).toBe(
      'deterministic',
    );
    expect(bundle.architecture_narrative.runtime_versions.node).toBe('22.5.1');
    expect(bundle.architecture_narrative.present.runtime_versions_source).toBe('deterministic');
    const externalNames = bundle.architecture_narrative.external_services.map((e) => e.name);
    expect(externalNames).toContain('Stripe');
    expect(externalNames).toContain('Sentry');
    expect(bundle.architecture_narrative.present.external_services_source).toBe('deterministic');
  });
});
