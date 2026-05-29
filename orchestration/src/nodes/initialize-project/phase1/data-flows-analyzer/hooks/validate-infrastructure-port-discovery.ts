/**
 * Output-shape validator for infrastructure-service port discovery. Never
 * opens or parses any project file — only checks the data-flows-analyzer's
 * output JSON.
 *
 * For every entry in `findings.infrastructure_services[]`, the agent must
 * emit either:
 *   1. `port: <integer>` — a real port discovered in any project source,
 *      OR
 *   2. The explicit opt-out:
 *        - `port_applies: false`
 *        - `port_applies_reason: "<one-line>"`
 *        - `port_search_evidence: [..., ...]` (≥2 entries)
 *
 * The validator does not classify by `type`. The agent decides per-entry;
 * the validator just requires the decision to be explicit.
 *
 * Stack-agnostic: only inspects what the agent already produced.
 */

import { formatValidationError } from '../../../shared/validation-codes/index.js';

const MIN_SEARCH_EVIDENCE_ENTRIES = 2;

export interface InfrastructurePortViolation {
  /** Infrastructure-service id the violation is for. */
  service_id: string;
  /** Infrastructure-service type, for context in the message. */
  service_type: string;
  /** Stable code so consumers can switch on it. */
  code:
    | 'missing_port_and_no_optout'
    | 'optout_without_reason'
    | 'optout_without_sufficient_evidence';
  /** Human-readable agent-facing message. */
  message: string;
}

/**
 * Run the infrastructure-port validator. Returns violations;
 * empty array = pass.
 */
export function detectInfrastructurePortViolations(data: unknown): InfrastructurePortViolation[] {
  if (!isObject(data)) return [];
  const findings = isObject(data.findings) ? data.findings : {};
  const services = findings.infrastructure_services;
  if (!Array.isArray(services)) return [];

  const violations: InfrastructurePortViolation[] = [];
  for (const svc of services) {
    if (!isObject(svc)) continue;
    const id = typeof svc.id === 'string' ? svc.id : '<unknown>';
    const type = typeof svc.type === 'string' ? svc.type : '';

    if (typeof svc.port === 'number' && svc.port > 0) continue;

    const optout = svc.port_applies === false;
    const reason = typeof svc.port_applies_reason === 'string' ? svc.port_applies_reason : '';
    const evidence: string[] = Array.isArray(svc.port_search_evidence)
      ? (svc.port_search_evidence as unknown[]).filter(
          (e): e is string => typeof e === 'string' && e.length > 0,
        )
      : [];

    if (!optout) {
      violations.push({
        service_id: id,
        service_type: type,
        code: 'missing_port_and_no_optout',
        message:
          `Infrastructure service \`${id}\` (type=${type}) has no \`port\` and no explicit ` +
          `opt-out. Either find the port in any project source (docker-compose / Firebase ` +
          `emulators / k8s Service / wrangler.toml / .env files / source code) and set ` +
          `\`port: <integer>\`, OR — if this service is SaaS / vendor-hosted with no ` +
          `localhost port — set \`port_applies: false\` with \`port_applies_reason\` and ` +
          `\`port_search_evidence\` (≥${MIN_SEARCH_EVIDENCE_ENTRIES} entries).`,
      });
      continue;
    }

    if (reason.length === 0) {
      violations.push({
        service_id: id,
        service_type: type,
        code: 'optout_without_reason',
        message:
          `Infrastructure service \`${id}\` declared \`port_applies: false\` but ` +
          `\`port_applies_reason\` is missing or empty. Add a one-line reason ` +
          `(e.g. "SaaS — accessed via HTTPS to vendor DSN, no localhost port", ` +
          `"managed cloud service — no local emulator").`,
      });
      continue;
    }

    if (evidence.length < MIN_SEARCH_EVIDENCE_ENTRIES) {
      violations.push({
        service_id: id,
        service_type: type,
        code: 'optout_without_sufficient_evidence',
        message:
          `Infrastructure service \`${id}\` declared \`port_applies: false\` with only ` +
          `${evidence.length} entr${evidence.length === 1 ? 'y' : 'ies'} in ` +
          `\`port_search_evidence\`. At least ${MIN_SEARCH_EVIDENCE_ENTRIES} entries ` +
          `required (e.g. "Read package.json — @sentry/* via cloud DSN", "Glob ` +
          `docker-compose — no sentry container").`,
      });
      continue;
    }
  }

  return violations;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Format violations as agent-facing retry feedback — one compressed
 * `VALIDATION_E012_*` line per violation. The long-form repair guidance
 * lives in `formatValidationErrorLong` for debug rendering.
 */
export function formatInfrastructurePortViolations(
  violations: InfrastructurePortViolation[],
): string[] {
  if (violations.length === 0) return [];
  return violations.map((v) =>
    formatValidationError('E012_infrastructure_port_gap', {
      violations: `${v.service_id}: ${v.message}`,
    }),
  );
}
