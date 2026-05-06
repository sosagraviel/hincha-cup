/**
 * Plan 22 — output-shape validator for infrastructure-service port
 * discovery. NEVER opens or parses any project file. Only checks
 * the data-flows-analyzer's output JSON.
 *
 * For every entry in `findings.infrastructure_services[]`, the
 * agent must emit either:
 *   1. `port: <integer>` — a real port discovered in any project
 *      source (docker-compose, Firebase emulators, k8s Service,
 *      wrangler.toml [env] vars, .env files, source code, README),
 *      OR
 *   2. The explicit opt-out:
 *        - `port_applies: false`
 *        - `port_applies_reason: "<one-line>"`
 *        - `port_search_evidence: [..., ...]` (≥2 entries)
 *
 * The validator does NOT classify by `type` ("monitoring" /
 * "database" / "saas") — different projects run different things
 * differently (a project might self-host monitoring, or use a
 * managed Postgres). The agent decides per-entry; the validator
 * just requires the decision to be explicit.
 *
 * Stack-agnostic by construction: only inspects what the agent
 * already produced.
 */

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

    // Path A: a real port was discovered.
    if (typeof svc.port === 'number' && svc.port > 0) continue;

    // Path B: explicit opt-out. All three pieces required.
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
 * Format violations as agent-facing retry feedback. Returns
 * `string[]` so the caller can append directly to its existing
 * error array.
 */
export function formatInfrastructurePortViolations(
  violations: InfrastructurePortViolation[],
): string[] {
  if (violations.length === 0) return [];
  const out: string[] = [
    'INFRASTRUCTURE-SERVICE PORT DISCOVERY MISSING',
    '',
    '🔴 WHAT WENT WRONG:',
    '   One or more entries in `findings.infrastructure_services[]` have no',
    "   `port` and no explicit opt-out. The framework can't document",
    '   "where to reach this service" without that information.',
    '',
    '   The validator never opens project files — you choose the search',
    '   sources. Stack-agnostic: works for docker-compose, Firebase emulators,',
    '   k8s Service ports, Cloudflare Wrangler, Heroku Procfile, fly.toml,',
    '   any vendor cloud / managed deployment, etc.',
    '',
    '🟡 SPECIFIC VIOLATIONS:',
  ];
  for (const v of violations) {
    out.push(`   • [${v.code}] ${v.message}`);
  }
  out.push(
    '',
    '🟢 HOW TO FIX:',
    '',
    '   For LOCAL-RUNTIME services (Postgres, Redis, Keycloak server,',
    '   Mailhog, RabbitMQ, MongoDB, Elasticsearch, etc. that run in your',
    "   project's docker-compose / Firebase emulators / k8s / Procfile /",
    '   any orchestration shape), find the port in whichever orchestration',
    '   file the project uses. Examples:',
    '     - docker-compose.yml:  services.<svc>.ports: ["${X_PORT:-N}:M"] → host port',
    '     - .env files:          *_PORT keys (DB_PORT, REDIS_PORT, KEYCLOAK_HTTP_PORT)',
    '     - Firebase:            firebase.json emulators.firestore.port',
    '     - k8s:                 Service.spec.ports[].port',
    '     - Heroku-style:        Procfile / app.json env',
    '   Set `port: <integer>` on the entry.',
    '',
    '   For SAAS / vendor-hosted services (Sentry, Datadog, Stripe, Auth0,',
    '   Mixpanel, etc. accessed via HTTPS to a vendor URL), declare:',
    '     "port_applies": false,',
    '     "port_applies_reason": "SaaS — accessed via HTTPS to vendor URL, no localhost port",',
    '     "port_search_evidence": [',
    '       "Read package.json — @sentry/* via cloud DSN",',
    '       "Glob docker-compose — no sentry container"',
    '     ]',
    '',
    '   Do NOT classify by `type` field guesses — the SAME type can be',
    '   local in one project and SaaS in another (e.g. self-hosted Sentry',
    '   vs cloud Sentry). Decide per entry based on what THIS project',
    '   actually uses.',
  );
  return out;
}
