# Data Flows & Integrations Analysis Instructions

> **Tool naming.** Bare tool names below (e.g. `list_flows`) are semantic identifiers. The canonical names are listed in the **CODE GRAPH CONTEXT** block in your system prompt — they share the `mcp__code_graph__` prefix and may carry a `_tool` suffix. Always call the catalog name, not a name you find here.

<objective>
Analyze authentication, authorization, API design patterns, external integrations, and data flow patterns. Document how the application handles requests, integrates with external services, and manages data transformations.
</objective>

**IMPORTANT: Infrastructure Services Focus**

- **Structure Analyzer (Agent 01)** is the SINGLE SOURCE OF TRUTH for application service discovery
- DO NOT list application services (backend, frontend, mobile) in your output
- Focus ONLY on INFRASTRUCTURE services (redis, postgres, message queues, email servers, etc.)
- Use `infrastructure_services` field (NOT `services`) to avoid confusion
- Use `service_communication` map with service IDs as keys to document application service interactions
- Reference application services by ID from Structure Analyzer when documenting communication patterns

<discovery_process>

> **Graph use.** All graph tool calls below MUST follow the **Graph navigation discipline** templated into your CODE GRAPH CONTEXT block (lean parameters, drill-in caps, forbidden tools). Specialise _which_ lean tools you call for each question; never override the defaults.

## Mandatory first step — read the project inspection

```text
Read <tempDir>/project-inspection.json
```

The inspection carries pre-parsed manifests, lock files, runtime versions, CI / infra / env templates. Do NOT re-Glob `**/package.json`, `**/.env*`, `**/Dockerfile*`, `**/.github/workflows/*`, lock files, or workspace configs — every one is in the inspection. Re-globbing trips a `tech_stack_inspection_redundant_glob` soft warning and burns your tool-call budget.

## Step 0: Cheap orientation via graph

Call `get_minimal_context` with `task: "Map auth, request lifecycles, persistence, and external integrations"`. The response (~100 tokens) gives you top flows and suggested next tools — use it before any other graph call.

## Step 1: Auth + request lifecycle via flow inventory

Call `list_flows({ sort_by: "criticality", limit: 30, detail_level: "minimal" })`. Pick at most 5 flows by name token (`auth`, `guard`, `middleware`, `request`, or service entry-point name). For each picked flow call `get_flow({ flow_id, include_source: false })` to retrieve the middleware/guard execution order. Set `include_source: true` for at most ONE flow.

The flow execution path encodes the auth chain (CORS → RateLimiter → AuthGuard → RolesGuard → Handler, in whatever shape the codebase uses) — no grep needed.

**Only when list_flows returns 0 flows** (true empty-graph fallback): use one `semantic_search_nodes` per credible auth scheme — name tokens: `jwt`, `jose`, `oauth`, `oidc`, `passport`, `keycloak`, `session`, `cookie`, `api-key`, `basic-auth`. Adapt query to language family the structure analyzer detected.

## Step 2: Authorization Patterns via graph

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level: "minimal" })` with name token `RolesGuard | PermissionsGuard | hasRole | checkPermission | Policy | Authorize | CASL | Casbin | Pundit | Cancan`. Categorise as RBAC (role tokens) or ABAC (policy / attribute / condition tokens) based on discovered class names.

## Step 3: API Design Patterns via graph

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level: "minimal" })` per protocol with the name token from §C.2.3 (REST: Controller/Handler/Route; GraphQL: Resolver/Schema; gRPC: ServiceDefinition; WebSocket: WebSocketGateway/SubscribeMessage). Report `findings.api_design.{primary, secondary[], patterns}` with booleans per protocol.

## Step 4: External Integrations via graph

ONE `semantic_search_nodes({ limit: 15, detail_level: "minimal" })` per credible category, each with a single comma-separated name-token query:

- **payments**: stripe / paypal / square / adyen / braintree
- **email**: sendgrid / mailgun / ses / postmark / nodemailer / mailchimp
- **cloud storage**: s3 / gcs / azureblob / cloudinary / cloudflare-r2
- **auth providers**: auth0 / firebase-auth / cognito / keycloak / okta / clerk
- **monitoring**: sentry / datadog / newrelic / honeybadger / rollbar / bugsnag
- **observability**: opentelemetry / prometheus / jaeger / zipkin

For each detected integration: name + SDK package + confirmed (graph import site) / declared (manifest only).

## Step 5: Document Data Flow Patterns

<data_flows>

Use flow data from Step 1 to populate the request processing description. The `get_flow` response already encodes:

- Middleware chain execution order
- Route handler identification
- Guard/interceptor positions

Supplement with data transformation patterns only when flow data is insufficient:

**Data Transformation Patterns:**

- DTOs (Data Transfer Objects): Request/response shaping
- Serializers: Convert models to JSON (Django REST, Marshmallow)
- Mappers: Transform between layers (entity → DTO → response)
- Validators: Input validation (class-validator, Joi, Pydantic)

**State Management (Frontend):**

- Redux: actions, reducers, store configuration
- MobX: observable stores
- Zustand: store definitions
- Context API: React context providers

</data_flows>

## Step 6: Background Jobs & Queues via graph

ONE `semantic_search_nodes({ limit: 15, detail_level: "minimal" })` with name tokens covering common queue libraries across stacks: `bullmq | bull | agenda | celery | rq | dramatiq | huey | asynq | sidekiq | resque | shoryuken | hangfire | quartz | sneakers`. Report `findings.background_jobs` with `library`, `queues[]`, `scheduling` (boolean), `retry_policy`.

## Step 7: Caching Patterns via graph

ONE `semantic_search_nodes({ kind: "Function", limit: 15, detail_level: "minimal" })` with name tokens: `Redis | Memcached | createClient | cache.get | cache.set | hazelcast | infinispan | apc | varnish`. Report `findings.caching` with `type`, `client`, `strategy` (cache-aside / read-through / write-through / write-behind), `ttl_configured`, `use_cases[]`.

## Step 8: Inter-Service Communication via graph

For each candidate broker, ONE `query_graph({ pattern: "imports_of", target: "<broker-package>" })` call. Common brokers across stacks: kafka / amqp (RabbitMQ) / nats / sqs / pubsub / azure-service-bus / pulsar / redis-streams / activemq.

Report `findings.inter_service_communication` with `pattern` (monolithic / modular-monolith / microservices / event-driven), `message_broker`, `sync_protocol` (rest / grpc / graphql / n-a), `async_protocol`, `service_discovery`, `api_gateway`.

## Step 9: Infrastructure-services port discovery (Plan 22 — load-bearing)

For every entry you emit in `findings.infrastructure_services[]` (Postgres, Redis, Keycloak server, Mailhog, RabbitMQ, MongoDB, Elasticsearch, vendor SaaS like Sentry / Datadog, etc.), populate either:

1. `port: <integer>` — the port the operator hits to reach this service. Search whichever orchestration / config shape the project actually uses:
   - **docker-compose** / **compose.yaml** / **podman-compose**: `services.<svc>.ports: ["${X_PORT:-N}:M"]` — host side wins. Resolve `${VAR:-default}` against `.env*` files at repo root.
   - **`.env*` files**: `*_PORT` keys (`DB_PORT`, `REDIS_PORT`, `KEYCLOAK_HTTP_PORT`, `MAILHOG_PORT`, …).
   - **Firebase**: `firebase.json` `emulators.{firestore,functions,auth,…}.port`.
   - **k8s manifests**: `Service.spec.ports[].port` for the matching workload.
   - **Helm**: `values.yaml` per-service port keys.
   - **Cloudflare Workers**: `wrangler.toml` `[env.<svc>] ...`.
   - **Heroku-style**: `Procfile` / `app.json env`.
   - **Pure source code**: any language's `listen(N)` / `serve({port})` / `bind("0.0.0.0:N")` — for self-hosted runtimes spawned in code.
   - **README "Getting Started"** code blocks (`localhost:N`).

2. The explicit opt-out for SaaS / vendor-hosted services that have no localhost port:
   ```json
   {
     "id": "sentry",
     "type": "monitoring",
     "port_applies": false,
     "port_applies_reason": "SaaS — accessed via HTTPS to vendor DSN, no localhost port",
     "port_search_evidence": [
       "Read package.json — @sentry/* via cloud DSN",
       "Glob docker-compose.yml — no sentry container"
     ]
   }
   ```
   `port_search_evidence` requires ≥2 entries. Do NOT classify by `type` alone — the SAME service might be self-hosted in one project (port required) and SaaS in another (opt-out). Decide per entry based on what THIS project actually uses.

### Hard validator — the Stop hook enforces this

The data-flows-analyzer Stop hook hard-rejects entries in `findings.infrastructure_services[]` that have neither `port` nor the explicit opt-out shape. Stack-agnostic — the validator checks output shape only; never opens project files. You decide which sources to search.

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Called `get_minimal_context` first?** It must be the first graph call.
2. **Used lean parameters everywhere?** `list_flows` with `detail_level: "minimal"`, all `semantic_search_nodes` with `limit: 15` MAX and `detail_level: "minimal"`, `get_flow` with `include_source: false` (only one drill-in with source allowed). (The discipline already forbids `get_architecture_overview` — see §3 of the navigation discipline.)
3. **Called list_flows then drilled into ≤5 flows?** Flow data should drive auth middleware order before any grep.
4. **Called semantic_search_nodes for all external SDK categories?** Graph import sites are primary signal.
5. **Auth dependencies found but no flow data?** Fall back to middleware/guard file reads with citation
6. **External service SDK but no import sites from graph?** Fall back to manifest scanning with citation
7. **Queue library present but no graph import results?** Search for files with "worker", "job", "processor" in name
8. **Redis in dependencies but purpose unclear?** Graph cache.get/cache.set sites should clarify usage
9. **Multiple services but no message broker?** Check if it's truly microservices or modular monolith

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown, no commentary)
- Field `findings` can contain any relevant integration/data flow information
- Schema allows passthrough fields for flexibility
- Optional field: `needs_verification` array (maximum 3 items)
- Required field: `graph_queries_used` — set to `[]`. The framework derives the real list from your transcript.

## Example Output Structure

```json
{
  "agent_name": "data-flows-integrations-analyzer",
  "timestamp": "<ISO-8601>",
  "findings": {
    "authentication": {
      "type": "<JWT|OAuth|OIDC|Session|API-Key|Basic>",
      "libraries": ["<library>"],
      "middleware": "<relative-path>",
      "providers": ["<provider>"],
      "flow_id": "<flow-id>"
    },
    "authorization": {
      "type": "<RBAC|ABAC>",
      "implementation": "<short-description>",
      "roles": ["<role>"]
    },
    "api_design": {
      "primary": "<REST|GraphQL|gRPC|WebSocket>",
      "secondary": ["<protocol>"],
      "versioning": "<none|URL|header>",
      "patterns": { "rest": false, "graphql": false, "grpc": false, "websockets": false }
    },
    "external_integrations": [
      { "service": "<name>", "purpose": "<purpose>", "sdk": "<package + version>" }
    ],
    "background_jobs": {
      "library": "<library>",
      "queues": ["<queue>"],
      "scheduling": false,
      "retry_policy": "<policy>"
    },
    "caching": {
      "type": "<engine>",
      "client": "<client + version>",
      "strategy": "<strategy>",
      "ttl_configured": false,
      "use_cases": ["<use-case>"]
    },
    "inter_service_communication": {
      "pattern": "<monolithic|modular-monolith|microservices|event-driven>",
      "message_broker": "<broker|none>",
      "sync_protocol": "<rest|grpc|graphql|n-a>",
      "async_protocol": "<protocol|n-a>"
    },
    "data_transformation": {
      "dto_library": "<library>",
      "validation": "<framework>",
      "serialization": "<approach>"
    }
  },
  "graph_queries_used": [],
  "needs_verification": []
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` ONLY when ALL hold:

1. The fact cannot be determined from code/configs/manifests after exhaustive searching.
2. The answer is IN SCOPE — it changes a concrete generated artefact (wiki page / skill body / finding). Production state, secrets, and infrastructure managed outside the repo are NOT in scope.
3. The question is a business / intent decision the operator is uniquely positioned to answer.

Do NOT use for any of these (the Stop hook hard-rejects them):

- ❌ Credentials, secrets, tokens, DSN, passwords, signing keys, API keys — always external by design.
- ❌ "Is X set correctly in production?" / production endpoints / production-grade infrastructure — production state is out-of-scope.
- ❌ Anything "managed outside this repository" / "by another team" / in a "vendor portal" / "external system" — cannot be verified by reading this repo.
- ❌ Authentication patterns (discoverable from graph flows and code).
- ❌ API design style (REST/GraphQL/gRPC discoverable from graph class search).
- ❌ Integration presence (graph import sites + SDK dependencies).
- ❌ Data transformation patterns (code analysis).

### Record absence as a finding — never drop info on the floor

When evidence proves a fact (positive OR negative), record it in the right `findings.<sub-field>` BEFORE deciding whether to ask. The Stop hook hard-rejects yes/no questions whose evidence proves "no" (`found_no_evidence_yesno`); the right move is to record the absence as a finding and drop the question, NOT drop the item silently. Facts go in `findings.*`; only intent / business decisions go in `needs_verification`.

Generic shapes (stack-agnostic):

- AR `Grep X — zero matches` → omit X from the relevant list, or add a `notable_absent` entry / `webhooks: []`.
- AR `Read <file> — no <pattern> found` → record the observation on the matching service's `service_communication` / `infrastructure_services` slice (or in `notes:`).
- AR `Glob X — contents not read` → finish the search and record what each file does.

</verification_guidelines>

## Token efficiency

Graph queries are O(1) on warm cache (the graph is built once per init). Glob+Read scales with file count. For projects with thousands of files, the difference is 10–100×. Use the graph.
