# Plan 21 — Enforce per-service port discovery (output-shape validator, fully stack-agnostic)

**Status:** awaiting confirmation. Do NOT implement until approved.
**Author:** assistant, 2026-05-06
**Triggered by:** Plan 19 (prompt-only port discovery) failed in
the gira run. The agent received the prompt (verified — 6 matches
for port-discovery patterns in the loaded `agent-file.md`), read
all 5 `package.json` files (which contain `vite --host 0.0.0.0
--port 2712` for web-frontend), but did NOT extract any port —
`environment` is `null` for every service. The agent skipped the
section because there was no enforcement signal.

---

## 0. Why deterministic file-parsing is wrong for this framework

**Rejected approach (the one I proposed earlier):** a Phase 4
helper that parses `docker-compose.yml`, `.env*`, `Dockerfile`,
etc. and fills in missing ports.

**Why it's wrong:** the framework runs in 600+ projects across
every shape. Many real projects don't have ANY of those file
types:

- **Firebase Functions / Firebase Hosting** — ports live in
  `firebase.json` `emulators.functions.port`.
- **Serverless Framework** — ports in `serverless.yml`
  `provider.dev.port`.
- **Cloudflare Workers / Wrangler** — `wrangler.toml`
  `[dev] port`.
- **Vercel / Netlify dev** — `vercel.json dev.port`,
  `netlify.toml dev.port`.
- **Bun / Deno** — port in TypeScript / JS source via
  `Bun.serve({ port })` / `Deno.serve({ port })`.
- **Heroku-style** — `Procfile web: gunicorn -b 0.0.0.0:$PORT`
  with port in dyno env.
- **k8s-only deployments (no docker-compose)** — port in
  `Service.spec.ports[]`.
- **Pure cloud (AWS Lambda, GCP Functions, Azure Functions)** —
  no persistent port at all.

Hardcoding any subset of file shapes would silently drop port
discovery on every project that doesn't match. The right path
is to enforce the OUTPUT shape and let the agent search WHATEVER
sources the project actually uses.

---

## A. The fix — output-shape validator + escape hatch

### A.1. Schema extension (additive, no breaking changes)

`orchestration/src/schemas/stack-profile.schema.ts`,
`ServiceEnvironmentSchema` gains two optional fields:

```ts
export const ServiceEnvironmentSchema = z.object({
  // existing fields unchanged
  port: z.number().optional().describe('Port number if found ...'),
  env_file: z.string().optional()...,
  deployment_target: z.string().optional()...,
  docker_image: z.string().optional()...,

  // Plan 21 — explicit opt-out for services that genuinely
  // have no port. Use ONLY when the agent searched and found
  // no port-applicable surface (e.g. AWS Lambda invoked via
  // API Gateway, library packages, build/seed scripts).
  port_applies: z.boolean().optional().describe(
    'Set to false ONLY when the service genuinely has no port ' +
    '(serverless function invoked via event triggers, library ' +
    'package, CLI tool, build step). Omit when a port is set or ' +
    'when the agent has not yet searched.',
  ),
  port_applies_reason: z.string().optional().describe(
    'When port_applies=false, a one-line reason (e.g. "AWS Lambda — ' +
    'invoked via API Gateway, no localhost port", "library — ' +
    'no runtime", "build step — runs and exits"). Required ' +
    'when port_applies=false.',
  ),
  port_search_evidence: z.array(z.string()).optional().describe(
    'When port is omitted AND port_applies=false, list the search ' +
    'attempts that established no port applies (e.g. ["Read ' +
    'firebase.json — no emulators block", "Read serverless.yml — ' +
    'no provider.dev port"]). ≥2 entries required.',
  ),
});
```

These are OPTIONAL — older projects / single-service simple
cases continue to work without them. Only NEW enforcement uses
them.

### A.2. Hard validator at the structure-analyzer Stop hook

`orchestration/src/nodes/initialize-project/phase1/structure-analyzer/hooks/`
gains a new file `validate-port-discovery.ts`. Validator:

For every service in `findings.services[]`:

- If `service.type` is in `{ 'library', 'cli', 'infrastructure',
  'mobile', 'desktop' }` → skip (these never have a server port).
- Else (`backend`, `frontend`, `serverless`, `worker`):
  - If `service.environment.port` is a number → **pass**.
  - Else if `service.environment.port_applies === false` AND
    `service.environment.port_applies_reason` is a non-empty
    string AND `service.environment.port_search_evidence` is
    an array of ≥2 entries → **pass** (legitimate opt-out).
  - Else → **violation**.

Violation → Stop hook rejects with retry feedback:

```
PORT DISCOVERY MISSING

Service `<id>` (type=<type>) has no port info. Search the project
for port-related signals — every project shape has SOMETHING:

  - Container/orchestration: docker-compose.yml, k8s manifests, helm
    charts, Procfile, fly.toml, app.yaml.
  - Cloud-platform configs: firebase.json (emulators.*.port),
    serverless.yml (provider.dev.port), wrangler.toml ([dev] port),
    vercel.json (dev.port), netlify.toml (dev.port).
  - Per-service manifest scripts: package.json (--port N / -p N /
    PORT=N in any script), pyproject.toml [tool.poetry.scripts] /
    Procfile / manage.py runserver, application.{yml,properties}
    (server.port), Cargo.toml or main.rs bind(), config/puma.rb,
    artisan serve --port=N, launchSettings.json applicationUrl,
    config/{dev,prod,runtime}.exs Endpoint http: [port: N].
  - Source code: any language's `listen(N)` / `serve(...port)` /
    `Bun.serve({port})` / `Deno.serve({port})` / `app.run(port=)`.
  - Container exposure: Dockerfile EXPOSE.
  - README "Getting Started" code blocks (`localhost:N`).

Set `services[].environment.port: <integer>` when you find one.

If the service genuinely has NO port (AWS Lambda invoked via API
Gateway, GCP Pub/Sub-only worker, library package), set:

  "environment": {
    "port_applies": false,
    "port_applies_reason": "<one-line reason>",
    "port_search_evidence": [
      "Read X — found no port surface",
      "Glob Y — zero matches",
      ... (≥2 entries)
    ]
  }

Do NOT silently omit port info. Either find it or explicitly
declare it doesn't apply, with the search evidence.
```

The validator only checks the OUTPUT shape — it never opens or
parses any project file. It is therefore fully stack-agnostic:
the agent decides which sources to search; the validator decides
whether the agent has produced a complete answer.

### A.3. Prompt update — keep Plan 19's source list, add the opt-out path

`structure-analyzer/prompts/agent.md` Plan 19 section gets one
more paragraph at the end:

```md
### When NO port applies (serverless / library / build step)

If the service genuinely has no port (AWS Lambda invoked via API
Gateway / Pub-Sub / EventBridge, library package, CLI tool, build
or seed script), set:

```json
"environment": {
  "port_applies": false,
  "port_applies_reason": "<one-line reason>",
  "port_search_evidence": ["<search 1>", "<search 2>"]
}
```

Search at least two distinct sources before declaring `port_applies:
false`. The Stop hook will reject if you opt out without evidence.

### Hard validator (Plan 21)

Services of type `backend`, `frontend`, `serverless`, or `worker`
MUST emit either a `port` number OR the explicit opt-out shape
above. The Stop hook hard-rejects services missing both.
Stack-agnostic — the validator checks output shape only.
```

---

## B. Stack-agnosticism contract (load-bearing)

The validator MUST NOT:

- ❌ Open or parse `docker-compose.yml`
- ❌ Read `.env*` files
- ❌ Look at any specific manifest format
- ❌ Apply default ports (`3000`, `5173`, `8080`, etc.)

The validator MAY:

- ✓ Read the analyzer's output JSON (its only input)
- ✓ Check field shapes against the schema

The retry feedback is a SUGGESTION list of where to look. The
agent picks. Firebase / Cloudflare / Vercel / Bun / Deno /
Lambda / k8s-only / Heroku-style — every shape works because
the agent finds the source the project actually uses, and the
validator checks the agent's RESULT, not the agent's INPUT.

---

## C. Tests

### C.1. Schema tests

- New `port_applies`, `port_applies_reason`, `port_search_evidence`
  fields parse correctly (optional, additive).
- Existing service profiles continue to validate without these
  fields.

### C.2. Validator tests (`validate-port-discovery.test.ts`)

- Service with `type: 'backend'` and `environment.port: 3050` →
  pass.
- Service with `type: 'backend'`, no port, no opt-out → violation.
- Service with `type: 'backend'`, no port, `port_applies: false`,
  reason populated, `port_search_evidence: ["x", "y"]` → pass.
- Service with `type: 'backend'`, no port, `port_applies: false`,
  reason populated, `port_search_evidence: ["x"]` (only 1) →
  violation (insufficient evidence).
- Service with `type: 'backend'`, no port, `port_applies: false`,
  no reason → violation.
- Service with `type: 'library'` (no port required) → pass.
- Service with `type: 'cli'` → pass.
- Service with `type: 'infrastructure'` → pass.
- Service with `type: 'mobile'` → pass.
- Service with `type: 'desktop'` → pass.
- Service with `type: 'worker'`, no port, no opt-out → violation
  (workers with HTTP health checks have ports; agent must verify).
- Service with `type: 'serverless'`, opt-out + evidence → pass
  (the legitimate "AWS Lambda — no port" case).

### C.3. Real-world probe

After the change lands, re-run on gira and confirm:

- `services[].environment.port: 3050` for backend (from
  `.env.development API_PORT=3050` or `docker-compose ports`).
- `services[].environment.port: 2712` for web-frontend (from
  `package.json "vite --port 2712"` or `docker-compose ports`).
- `services[].environment.port: 7080` for keycloak (from
  `.env.development KEYCLOAK_HTTP_PORT` or `docker-compose ports`).
- `seeds-scripts` (CLI) and `shared` (library) skip the check
  → no violation, no port required.

A fresh probe on a Firebase project would expect:
`port: <emulator-port>` for the backend functions service (read
from `firebase.json emulators.functions.port`).

A fresh probe on a Lambda-only project would expect:
`port_applies: false`, reason `"AWS Lambda — invoked via API
Gateway, no localhost port"`, evidence `["Read serverless.yml —
no provider.dev port", "Glob **/*.{yml,yaml,toml} — no port
key found"]`.

---

## D. Rollout

Single commit:

1. Schema additions (A.1) + tests (C.1).
2. Validator implementation (A.2) + tests (C.2).
3. Wire validator into `validate-analyzer-json.hook.ts` (only
   fires for `agent_name === 'structure-architecture-analyzer'`).
4. Prompt update (A.3).
5. Stop-hook retry feedback wired through.

Risk: low. Schema additions are optional. Validator has clear
pass/fail logic. Prompt nudge is consistent with Plan 19.

---

## E. What this plan explicitly does NOT do

- ❌ No filesystem parsing
- ❌ No default-port assignment
- ❌ No Phase 4 helper (Phase 1 owns this end-to-end)
- ❌ No special handling per language family
- ❌ No removal of Plan 19's prompt content (it stays as
  helpful guidance; Plan 21 adds enforcement)

---

## F. Acceptance criteria

After this lands and gira is re-initialised:

- [ ] `framework-config.json::stack_profile.services[]` carries
      `environment.port` for backend / web-frontend / keycloak
      with the actual values.
- [ ] CLAUDE.md `Services & Ports` table lists real port numbers,
      not "verify in X".
- [ ] `services[].type === 'library'` (e.g. `shared`) has no
      port and no opt-out — the validator skips it.

For OTHER projects (the 600+ deployment surface):

- [ ] Firebase project: backend service port comes from
      `firebase.json emulators.*`.
- [ ] Lambda-only project: `port_applies: false` with reason
      and evidence.
- [ ] Cloudflare Workers: port from `wrangler.toml [dev]`.
- [ ] Bun-only project: port from `Bun.serve({port: N})` source.

The framework provides a clear contract; the agent's freedom to
search arbitrary sources stays intact.

---

**Awaiting your confirmation or change requests before I touch
any code.**
