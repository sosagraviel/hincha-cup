/**
 * Output-shape validator for per-service port discovery. Never opens or
 * parses any project file — only checks the analyzer's output JSON.
 *
 * For each service whose `type` is in `{ backend, frontend, serverless,
 * worker }` the agent must emit either:
 *   1. `environment.port: <integer>` — a real port discovered in any
 *      project source the project actually uses, OR
 *   2. The explicit opt-out:
 *        - `environment.port_applies: false`
 *        - `environment.port_applies_reason: "<one-line>"`
 *        - `environment.port_search_evidence: [..., ...]` (≥2 entries)
 *
 * Service types `library`, `cli`, `infrastructure`, `mobile`, and `desktop`
 * are skipped — they never expose a server port.
 *
 * Stack-agnostic: the validator only reads what the agent already produced.
 */

import { formatValidationError } from '../../../shared/validation-codes/index.js';

const PORT_REQUIRED_TYPES = new Set(['backend', 'frontend', 'serverless', 'worker']);

const MIN_SEARCH_EVIDENCE_ENTRIES = 2;

export interface PortDiscoveryViolation {
  /** Service id the violation is for. */
  service_id: string;
  /** Service type (for context in the feedback message). */
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
 * Run the port-discovery validator. Returns violations; empty
 * array = pass.
 *
 * @param data - The structure analyzer's parsed JSON output.
 * @returns Array of violations (one per failing service).
 */
export function detectPortDiscoveryViolations(data: unknown): PortDiscoveryViolation[] {
  if (!isObject(data)) return [];
  const findings = isObject(data.findings) ? data.findings : {};
  const services = findings.services;
  if (!Array.isArray(services)) return [];

  const violations: PortDiscoveryViolation[] = [];
  for (const svc of services) {
    if (!isObject(svc)) continue;
    const id = typeof svc.id === 'string' ? svc.id : '<unknown>';
    const type = typeof svc.type === 'string' ? svc.type : '';
    if (!PORT_REQUIRED_TYPES.has(type)) continue;

    const env = isObject(svc.environment) ? svc.environment : {};

    if (typeof env.port === 'number' && env.port > 0) continue;

    const optout = env.port_applies === false;
    const reason = typeof env.port_applies_reason === 'string' ? env.port_applies_reason : '';
    const evidence: string[] = Array.isArray(env.port_search_evidence)
      ? (env.port_search_evidence as unknown[]).filter(
          (e): e is string => typeof e === 'string' && e.length > 0,
        )
      : [];

    if (!optout) {
      violations.push({
        service_id: id,
        service_type: type,
        code: 'missing_port_and_no_optout',
        message:
          `Service \`${id}\` (type=${type}) has no \`environment.port\` and no explicit opt-out. ` +
          `Either find the port in any project source (see retry feedback for the suggested ` +
          `search list across cloud platforms / orchestration tools / per-language manifests / ` +
          `source code) and set \`environment.port: <integer>\`, OR — if this service ` +
          `genuinely has no port (event-driven serverless, library, CLI, build step) — ` +
          `set \`environment.port_applies: false\` with \`port_applies_reason\` and ` +
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
          `Service \`${id}\` declared \`port_applies: false\` but \`port_applies_reason\` is ` +
          `missing or empty. Add a one-line reason (e.g. "AWS Lambda — invoked via API ` +
          `Gateway, no localhost port", "library package — no runtime").`,
      });
      continue;
    }

    if (evidence.length < MIN_SEARCH_EVIDENCE_ENTRIES) {
      violations.push({
        service_id: id,
        service_type: type,
        code: 'optout_without_sufficient_evidence',
        message:
          `Service \`${id}\` declared \`port_applies: false\` with only ${evidence.length} ` +
          `entr${evidence.length === 1 ? 'y' : 'ies'} in \`port_search_evidence\`. At least ` +
          `${MIN_SEARCH_EVIDENCE_ENTRIES} entries required, each naming a concrete search ` +
          `that established no port applies (e.g. "Read firebase.json — no emulators block", ` +
          `"Read serverless.yml — no provider.dev port", "Glob **/*.{toml,yml} — no port key").`,
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
 * `VALIDATION_E011_*` line per violation. The long-form repair guidance
 * lives in `formatValidationErrorLong` for debug rendering.
 */
export function formatPortDiscoveryViolations(violations: PortDiscoveryViolation[]): string[] {
  if (violations.length === 0) return [];
  return violations.map((v) =>
    formatValidationError('E011_port_discovery_gap', {
      violations: `${v.service_id} (type=${v.service_type}): ${v.message}`,
    }),
  );
}
