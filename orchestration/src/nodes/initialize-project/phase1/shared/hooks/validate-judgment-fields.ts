/**
 * Groundedness contract: every backend / frontend / serverless / worker
 * service must have populated judgment fields. The Zod schema enforces that
 * *when* a snippet is emitted it carries a citation; this validator enforces
 * that the snippet *is* emitted for service types that should always have one.
 *
 * Per-analyzer expectations:
 *   - `code-patterns-testing-analyzer`:
 *     - `findings.code_patterns.<svc>.patterns` ≥ 1 for
 *       backend / frontend / serverless / worker.
 *     - `findings.testing.<svc>.representative_examples` ≥ 1 same.
 *   - `data-flows-integrations-analyzer`:
 *     - `findings.request_lifecycle.<svc>` ≥ 1 for
 *       backend / serverless / worker.
 *
 * The structure-architecture-analyzer is the authoritative source of truth
 * for `type`. The validator reads its persisted output and maps
 * service-id → type. Empty/missing structure output ⇒ skip.
 *
 * Stack-agnostic: the validator never inspects code or framework names —
 * only schema-level field shapes.
 */

import fs from 'fs';
import path from 'path';
import {
  formatValidationError,
  type ValidationCodeKey,
} from '../../../shared/validation-codes/index.js';

export interface JudgmentFieldViolation {
  service_id: string;
  service_type: string;
  field: 'code_patterns' | 'representative_examples' | 'request_lifecycle';
  field_path: string;
}

const SERVICE_TYPES_WITH_PATTERNS = new Set(['backend', 'frontend', 'serverless', 'worker']);
const SERVICE_TYPES_WITH_TESTS = new Set(['backend', 'frontend', 'serverless', 'worker']);
const SERVICE_TYPES_WITH_LIFECYCLE = new Set(['backend', 'serverless', 'worker']);

interface ServiceTypeMap {
  [serviceId: string]: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Resolve the candidate `<tempDir>` directories where Phase 1 outputs
 * may live. Mirrors the loader in `validate-analyzer-json.hook.ts`.
 */
function candidateTempDirs(cwd: string | undefined): string[] {
  const root = cwd && cwd.length > 0 ? cwd : process.cwd();
  return [
    path.join(root, '.claude-temp', 'initialize-project'),
    path.join(root, '.codex-temp', 'initialize-project'),
  ];
}

/**
 * Load `{ service_id → service_type }` from the persisted
 * structure-architecture-analyzer output. Returns an empty map when
 * the file is missing or the shape is unexpected — callers treat
 * empty as "no enforcement possible, skip".
 */
export function loadServiceTypeMap(cwd: string | undefined): ServiceTypeMap {
  for (const tempDir of candidateTempDirs(cwd)) {
    const outputPath = path.join(tempDir, 'phase1-outputs', '01-structure-architecture.json');
    if (!fs.existsSync(outputPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as unknown;
      if (!isObject(parsed)) continue;
      const findings = (parsed as Record<string, unknown>).findings;
      if (!isObject(findings)) continue;
      const services = (findings as Record<string, unknown>).services;
      if (!Array.isArray(services)) continue;
      const map: ServiceTypeMap = {};
      for (const svc of services) {
        if (isObject(svc) && typeof svc.id === 'string' && typeof svc.type === 'string') {
          map[svc.id.trim()] = svc.type.trim();
        }
      }
      if (Object.keys(map).length > 0) return map;
    } catch {
      continue;
    }
  }
  return {};
}

/**
 * Inspect the parsed analyzer output for missing per-service judgment
 * fields. Pure function — caller decides whether to load the type map
 * deterministically or pass one in (tests pass in fixture maps).
 */
export function detectMissingJudgmentFields(
  data: unknown,
  serviceTypes: ServiceTypeMap,
): JudgmentFieldViolation[] {
  if (!isObject(data)) return [];
  const agentName = typeof data.agent_name === 'string' ? data.agent_name : '';
  if (Object.keys(serviceTypes).length === 0) return [];

  const findings = isObject(data.findings) ? (data.findings as Record<string, unknown>) : {};
  const violations: JudgmentFieldViolation[] = [];

  if (agentName === 'code-patterns-testing-analyzer') {
    const codePatternsByService = isObject(findings.code_patterns)
      ? (findings.code_patterns as Record<string, unknown>)
      : {};
    const testingByService = isObject(findings.testing)
      ? (findings.testing as Record<string, unknown>)
      : {};

    for (const [id, type] of Object.entries(serviceTypes)) {
      if (SERVICE_TYPES_WITH_PATTERNS.has(type)) {
        const entry = codePatternsByService[id];
        const patterns =
          isObject(entry) && Array.isArray((entry as Record<string, unknown>).patterns)
            ? ((entry as Record<string, unknown>).patterns as unknown[])
            : [];
        if (patterns.length === 0) {
          violations.push({
            service_id: id,
            service_type: type,
            field: 'code_patterns',
            field_path: `code_patterns.${id}.patterns`,
          });
        }
      }
      if (SERVICE_TYPES_WITH_TESTS.has(type)) {
        const entry = testingByService[id];
        const examples =
          isObject(entry) &&
          Array.isArray((entry as Record<string, unknown>).representative_examples)
            ? ((entry as Record<string, unknown>).representative_examples as unknown[])
            : [];
        if (examples.length === 0) {
          violations.push({
            service_id: id,
            service_type: type,
            field: 'representative_examples',
            field_path: `testing.${id}.representative_examples`,
          });
        }
      }
    }
  } else if (agentName === 'data-flows-integrations-analyzer') {
    const requestLifecycleByService = isObject(findings.request_lifecycle)
      ? (findings.request_lifecycle as Record<string, unknown>)
      : {};

    for (const [id, type] of Object.entries(serviceTypes)) {
      if (!SERVICE_TYPES_WITH_LIFECYCLE.has(type)) continue;
      const steps = requestLifecycleByService[id];
      const arr = Array.isArray(steps) ? (steps as unknown[]) : [];
      if (arr.length === 0) {
        violations.push({
          service_id: id,
          service_type: type,
          field: 'request_lifecycle',
          field_path: `request_lifecycle.${id}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Render each violation as a single `VALIDATION_E068_*` line for the
 * Stop hook. The retry feedback is one line per missing field so the
 * agent can address them in parallel.
 */
export function formatJudgmentFieldViolations(violations: JudgmentFieldViolation[]): string[] {
  const code: ValidationCodeKey = 'E068_missing_judgment_field_for_service';
  return violations.map((v) =>
    formatValidationError(code, {
      field: v.field,
      service_id: v.service_id,
      service_type: v.service_type,
      field_path: v.field_path,
    }),
  );
}
