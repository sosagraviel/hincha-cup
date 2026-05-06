/**
 * Plan 21 §A.2 — output-shape validator for per-service port
 * discovery. NEVER opens or parses any project file. Only checks
 * the analyzer's output JSON.
 *
 * The agent must, for each service whose `type` is in
 * `{ backend, frontend, serverless, worker }`, emit either:
 *   1. `environment.port: <integer>` — a real port discovered in
 *      any project source (docker-compose, Firebase emulators,
 *      wrangler.toml, k8s Service, package.json scripts, source
 *      code `Bun.serve({port})` / `Deno.serve({port})`,
 *      `application.yml server.port`, Procfile, README, ANY
 *      shape the project actually uses), OR
 *   2. The explicit opt-out:
 *        - `environment.port_applies: false`
 *        - `environment.port_applies_reason: "<one-line>"`
 *        - `environment.port_search_evidence: [..., ...]` (≥2 entries)
 *
 * Service types `library`, `cli`, `infrastructure`, `mobile`, and
 * `desktop` are skipped — they never expose a server port.
 *
 * Stack-agnostic by construction: the validator only reads what
 * the agent already produced. The agent's freedom to search any
 * project source is preserved.
 */

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

    // Path A: a real port was discovered.
    if (typeof env.port === 'number' && env.port > 0) continue;

    // Path B: explicit opt-out. All three pieces required.
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

    // Opt-out is set; verify reason + evidence shape.
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
 * Format violations as agent-facing retry feedback. Returns
 * `string[]` so the caller can append directly to its existing
 * error array.
 */
export function formatPortDiscoveryViolations(violations: PortDiscoveryViolation[]): string[] {
  if (violations.length === 0) return [];
  const out: string[] = [
    'PORT DISCOVERY MISSING',
    '',
    '🔴 WHAT WENT WRONG:',
    '   One or more services in `findings.services[]` have no `environment.port`',
    '   and no explicit opt-out. The framework can\'t document "how to run this',
    '   service" without that information. Stack-agnostic enforcement: the',
    '   validator never opens project files — you choose the search sources.',
    '',
    '🟡 SPECIFIC VIOLATIONS:',
  ];
  for (const v of violations) {
    out.push(`   • [${v.code}] ${v.message}`);
  }
  out.push(
    '',
    '🟢 HOW TO FIX — search the project for port-related signals:',
    '',
    '   Every project shape has SOMETHING. Look across these source families;',
    '   pick whichever ones the project actually uses (do NOT assume any',
    '   specific shape — the framework runs on Firebase, Lambda, Cloudflare,',
    '   Vercel, Bun, Deno, k8s, Heroku, traditional VMs, monorepos, polyrepos,',
    '   serverless, etc.):',
    '',
    '   - Container / orchestration: docker-compose.yml, Dockerfile EXPOSE,',
    '     k8s Service.spec.ports, helm values.yaml, fly.toml, app.yaml,',
    '     Procfile (`web: gunicorn -b 0.0.0.0:$PORT`).',
    '   - Cloud-platform configs: firebase.json (emulators.*.port),',
    '     serverless.yml (provider.dev.port), wrangler.toml ([dev] port),',
    '     vercel.json (dev.port), netlify.toml (dev.port).',
    '   - Per-service manifest scripts: package.json (--port N / -p N /',
    '     PORT=N anywhere in scripts), pyproject.toml [tool.poetry.scripts] /',
    '     manage.py runserver, application.{yml,properties} (server.port),',
    '     Cargo.toml or main.rs bind(), config/puma.rb, artisan serve --port,',
    '     launchSettings.json applicationUrl, config/{dev,prod,runtime}.exs',
    '     Endpoint http: [port: N].',
    "   - Source code: any language's `listen(N)` / `serve({port})` /",
    '     `Bun.serve({port})` / `Deno.serve({port})` / `app.run(port=N)`.',
    '   - .env* files at repo root or per-service: `*PORT` / `*_PORT` keys.',
    '   - README "Getting Started" code blocks (e.g. `localhost:N`).',
    '',
    '   When you find one, set:',
    '     "environment": { "port": <integer> }',
    '',
    '   When the service genuinely has NO port (event-triggered Lambda',
    '   with no API Gateway, library package, CLI tool, build/seed script),',
    '   set the explicit opt-out instead — DO NOT silently omit:',
    '     "environment": {',
    '       "port_applies": false,',
    '       "port_applies_reason": "<one-line reason>",',
    '       "port_search_evidence": [',
    '         "<concrete search 1 — e.g. Read serverless.yml — no provider.dev>",',
    '         "<concrete search 2 — e.g. Glob **/*.{toml,yml} — no port key found>"',
    '       ]',
    '     }',
    '',
    '   Service types `library`, `cli`, `infrastructure`, `mobile`, and',
    '   `desktop` are exempt — the validator skips them.',
  );
  return out;
}
