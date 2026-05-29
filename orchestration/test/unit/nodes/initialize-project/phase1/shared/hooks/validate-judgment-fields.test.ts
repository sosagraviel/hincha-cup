/**
 * Judgment-field validator unit tests.
 *
 * Pure-function tests against `detectMissingJudgmentFields()`. The
 * loader (`loadServiceTypeMap`) is filesystem-bound and covered by
 * Stop-hook integration tests; here we pass the type map directly.
 */

import { describe, expect, it } from 'vitest';
import {
  detectMissingJudgmentFields,
  formatJudgmentFieldViolations,
} from '../../../../../../../src/nodes/initialize-project/phase1/shared/hooks/validate-judgment-fields.js';

describe('detectMissingJudgmentFields — code-patterns analyzer', () => {
  it('flags backend service with empty code_patterns + tests', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
      findings: { code_patterns: {}, testing: {} },
    };
    const violations = detectMissingJudgmentFields(data, { api: 'backend' });
    const fields = violations.map((v) => v.field).sort();
    expect(fields).toEqual(['code_patterns', 'representative_examples']);
    expect(violations[0].service_id).toBe('api');
    expect(violations[0].service_type).toBe('backend');
  });

  it('does NOT flag library services (conditional rule skips them)', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
      findings: { code_patterns: {}, testing: {} },
    };
    const violations = detectMissingJudgmentFields(data, { core: 'library' });
    expect(violations).toEqual([]);
  });

  it('does NOT flag infrastructure / desktop / mobile services', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
      findings: { code_patterns: {}, testing: {} },
    };
    const violations = detectMissingJudgmentFields(data, {
      redis: 'infrastructure',
      tray: 'desktop',
      'android-app': 'mobile',
    });
    expect(violations).toEqual([]);
  });

  it('passes when backend service has populated fields', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
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
          },
        },
        testing: {
          api: {
            representative_examples: [
              {
                file: 'services/api/src/users/users.spec.ts',
                snippet: {
                  kind: 'test-case',
                  language: 'typescript',
                  code: "it('creates a user', async () => { ... })",
                  source_file: 'services/api/src/users/users.spec.ts',
                  source_line: 6,
                },
              },
            ],
          },
        },
      },
    };
    const violations = detectMissingJudgmentFields(data, { api: 'backend' });
    expect(violations).toEqual([]);
  });

  it('flags each typed service independently', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
      findings: {
        code_patterns: {
          api: {
            patterns: [{ kind: 'x', language: 'ts', code: 'x', source_file: 'a', source_line: 1 }],
          },
        },
        testing: {},
      },
    };
    const violations = detectMissingJudgmentFields(data, {
      api: 'backend',
      web: 'frontend',
    });
    // api has code_patterns but missing testing; web has both missing.
    const fields = violations.map((v) => `${v.service_id}.${v.field}`).sort();
    expect(fields).toEqual([
      'api.representative_examples',
      'web.code_patterns',
      'web.representative_examples',
    ]);
  });
});

describe('detectMissingJudgmentFields — data-flows analyzer', () => {
  it('flags backend service with empty request_lifecycle', () => {
    const data = {
      agent_name: 'data-flows-integrations-analyzer',
      findings: { request_lifecycle: {} },
    };
    const violations = detectMissingJudgmentFields(data, { api: 'backend' });
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe('request_lifecycle');
  });

  it('does NOT flag frontend services (no request lifecycle expected)', () => {
    const data = {
      agent_name: 'data-flows-integrations-analyzer',
      findings: { request_lifecycle: {} },
    };
    const violations = detectMissingJudgmentFields(data, { web: 'frontend' });
    expect(violations).toEqual([]);
  });

  it('flags worker + serverless services', () => {
    const data = {
      agent_name: 'data-flows-integrations-analyzer',
      findings: { request_lifecycle: {} },
    };
    const violations = detectMissingJudgmentFields(data, {
      'job-runner': 'worker',
      'image-resize': 'serverless',
    });
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.service_id).sort()).toEqual(['image-resize', 'job-runner']);
  });

  it('passes when request_lifecycle is populated', () => {
    const data = {
      agent_name: 'data-flows-integrations-analyzer',
      findings: {
        request_lifecycle: {
          api: [{ step: 'Receive request', where: 'src/main.ts:bootstrap' }],
        },
      },
    };
    const violations = detectMissingJudgmentFields(data, { api: 'backend' });
    expect(violations).toEqual([]);
  });
});

describe('detectMissingJudgmentFields — guards', () => {
  it('returns [] when the type map is empty (single-analyzer replay)', () => {
    const data = {
      agent_name: 'code-patterns-testing-analyzer',
      findings: { code_patterns: {}, testing: {} },
    };
    const violations = detectMissingJudgmentFields(data, {});
    expect(violations).toEqual([]);
  });

  it('returns [] for analyzers outside the contract (structure / tech-stack)', () => {
    const data = {
      agent_name: 'structure-architecture-analyzer',
      findings: { services: [] },
    };
    const violations = detectMissingJudgmentFields(data, { api: 'backend' });
    expect(violations).toEqual([]);
  });
});

describe('formatJudgmentFieldViolations', () => {
  it('emits one VALIDATION_E068 line per violation', () => {
    const lines = formatJudgmentFieldViolations([
      {
        service_id: 'api',
        service_type: 'backend',
        field: 'code_patterns',
        field_path: 'code_patterns.api.patterns',
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('VALIDATION_E068_missing_judgment_field_for_service');
    expect(lines[0]).toContain('code_patterns');
    expect(lines[0]).toContain('api');
    expect(lines[0]).toContain('backend');
  });
});
