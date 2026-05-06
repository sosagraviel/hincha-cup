import { describe, expect, it } from 'vitest';
import {
  detectInfrastructurePortViolations,
  formatInfrastructurePortViolations,
} from '../../../../../../src/nodes/initialize-project/phase1/data-flows-analyzer/hooks/validate-infrastructure-port-discovery.js';

/**
 * Plan 22 — output-shape validator for infrastructure_services
 * port discovery. Stack-agnostic: never opens any project file.
 *
 * Every entry in `findings.infrastructure_services[]` must carry
 * either `port: <integer>` or the explicit opt-out (port_applies +
 * reason + ≥2 evidence entries). The validator does NOT classify
 * by `type` — the SAME service might be self-hosted in one project
 * (port required) and SaaS in another (opt-out).
 */

function infra(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: 'svc', type: 'database', ...overrides };
}

function withInfra(infrastructure_services: unknown[]): unknown {
  return { findings: { infrastructure_services } };
}

describe('detectInfrastructurePortViolations — pass paths', () => {
  it('passes when port is a positive integer', () => {
    expect(
      detectInfrastructurePortViolations(withInfra([infra({ id: 'postgres', port: 5432 })])),
    ).toEqual([]);
  });

  it('passes with the explicit opt-out (SaaS shape)', () => {
    expect(
      detectInfrastructurePortViolations(
        withInfra([
          infra({
            id: 'sentry',
            type: 'monitoring',
            port_applies: false,
            port_applies_reason: 'SaaS — accessed via HTTPS to vendor DSN, no localhost port',
            port_search_evidence: [
              'Read package.json — @sentry/* via cloud DSN',
              'Glob docker-compose — no sentry container',
            ],
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it('passes a mixed-shape gira-like payload', () => {
    expect(
      detectInfrastructurePortViolations(
        withInfra([
          infra({ id: 'postgresql', type: 'database', port: 5432 }),
          infra({ id: 'redis', type: 'cache+queue', port: 6379 }),
          infra({ id: 'keycloak', type: 'identity-provider', port: 7080 }),
          infra({
            id: 'sentry',
            type: 'monitoring',
            port_applies: false,
            port_applies_reason: 'SaaS — HTTPS to cloud DSN, no localhost port',
            port_search_evidence: [
              'Read backend dependencies — @sentry/nestjs cloud DSN',
              'Glob docker-compose — no sentry container',
            ],
          }),
        ]),
      ),
    ).toEqual([]);
  });
});

describe('detectInfrastructurePortViolations — violation paths', () => {
  it('fires when port is missing and no opt-out', () => {
    const v = detectInfrastructurePortViolations(
      withInfra([infra({ id: 'postgres', type: 'database' })]),
    );
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('missing_port_and_no_optout');
    expect(v[0].service_id).toBe('postgres');
  });

  it('fires on opt-out without reason', () => {
    const v = detectInfrastructurePortViolations(
      withInfra([
        infra({
          id: 'sentry',
          port_applies: false,
          port_search_evidence: ['Read pkg', 'Glob compose'],
        }),
      ]),
    );
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('optout_without_reason');
  });

  it('fires on opt-out with only 1 evidence entry', () => {
    const v = detectInfrastructurePortViolations(
      withInfra([
        infra({
          id: 'sentry',
          port_applies: false,
          port_applies_reason: 'SaaS — HTTPS only',
          port_search_evidence: ['Read package.json'],
        }),
      ]),
    );
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('optout_without_sufficient_evidence');
  });

  it('fires on opt-out with empty evidence array', () => {
    const v = detectInfrastructurePortViolations(
      withInfra([
        infra({
          id: 'datadog',
          port_applies: false,
          port_applies_reason: 'SaaS — HTTPS only',
          port_search_evidence: [],
        }),
      ]),
    );
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('optout_without_sufficient_evidence');
  });

  it('treats port: 0 as missing (not a real port)', () => {
    const v = detectInfrastructurePortViolations(withInfra([infra({ id: 'postgres', port: 0 })]));
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('missing_port_and_no_optout');
  });

  it('reports each failing entry independently', () => {
    const v = detectInfrastructurePortViolations(
      withInfra([
        infra({ id: 'postgres', port: 5432 }),
        infra({ id: 'redis' }),
        infra({ id: 'mailhog' }),
      ]),
    );
    expect(v).toHaveLength(2);
    expect(v.map((x) => x.service_id).sort()).toEqual(['mailhog', 'redis']);
  });

  it('does not classify by type — `monitoring` self-hosted requires port', () => {
    // A self-hosted monitoring service (e.g. Grafana running in
    // docker-compose) has a port. The validator does NOT auto-exempt
    // by type — the agent decides per entry.
    const v = detectInfrastructurePortViolations(
      withInfra([infra({ id: 'grafana', type: 'monitoring' })]),
    );
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe('missing_port_and_no_optout');
  });
});

describe('detectInfrastructurePortViolations — defensive shapes', () => {
  it('returns empty on non-object input', () => {
    expect(detectInfrastructurePortViolations(undefined)).toEqual([]);
    expect(detectInfrastructurePortViolations(null)).toEqual([]);
    expect(detectInfrastructurePortViolations(42)).toEqual([]);
  });

  it('returns empty when findings.infrastructure_services is missing or non-array', () => {
    expect(detectInfrastructurePortViolations({ findings: {} })).toEqual([]);
    expect(
      detectInfrastructurePortViolations({ findings: { infrastructure_services: null } }),
    ).toEqual([]);
    expect(
      detectInfrastructurePortViolations({ findings: { infrastructure_services: 'oops' } }),
    ).toEqual([]);
  });

  it('skips non-object entries', () => {
    expect(
      detectInfrastructurePortViolations(
        withInfra([null, 'not-an-object', 42, infra({ port: 5432 })]),
      ),
    ).toEqual([]);
  });
});

describe('formatInfrastructurePortViolations', () => {
  it('returns empty array on no violations', () => {
    expect(formatInfrastructurePortViolations([])).toEqual([]);
  });

  it('emits actionable retry feedback citing stack-agnostic sources + opt-out shape', () => {
    const lines = formatInfrastructurePortViolations([
      {
        service_id: 'postgres',
        service_type: 'database',
        code: 'missing_port_and_no_optout',
        message: 'Service postgres has no port.',
      },
    ]);
    const joined = lines.join('\n');
    expect(joined).toMatch(/INFRASTRUCTURE-SERVICE PORT DISCOVERY MISSING/);
    expect(joined).toContain('postgres');
    expect(joined).toMatch(/docker-compose|Firebase|k8s|wrangler/);
    expect(joined).toMatch(/SaaS/);
    expect(joined).toMatch(/port_applies/);
    expect(joined).toMatch(/port_search_evidence/);
    expect(joined).toMatch(/HOW TO FIX/);
  });
});
