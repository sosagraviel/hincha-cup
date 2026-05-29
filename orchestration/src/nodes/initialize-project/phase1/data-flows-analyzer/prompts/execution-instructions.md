# Data Flows & Integrations Analysis

Auth, authorization, API design, external integrations, background
jobs, caching, inter-service communication, infrastructure services.

**Service IDs come from the structure analyzer** — never redeclare
application services. Use `infrastructure_services` (NOT `services`)
for runtime infra (redis / postgres / queues / etc.). Use
`service_communication` keyed by service id for inter-service flow.

Follow the **Graph navigation discipline** templated into your system
prompt: lean parameters everywhere; respect drill-in caps;
`get_architecture_overview` is **forbidden**.

**Skip community drill-ins.** This analyzer's prescribed flow is
flows + lifecycles + integrations — not module clustering. Do NOT
call `get_community_tool` (even with `include_members: false`). The
community-detection output frequently includes test-descriptor
clusters (`it:should`, `describe:returns`, …) whose bare metadata
alone overflows the per-call token cap. Stay inside `get_flow`,
`list_flows`, `semantic_search_nodes`, and `query_graph` for every
drill-in you need.

## Step 0 — Read inspection FIRST (MANDATORY)

`Read <tempDir>/project-inspection.json`. Three inspection slots are
load-bearing for this analyzer:

| Inspection field                  | Use                                                              |
| --------------------------------- | ---------------------------------------------------------------- |
| `infrastructure_services_hints[]` | `{name, port, source_file}` triples — emit verbatim into         |
|                                   | `findings.infrastructure_services[]` (wrap each with the         |
|                                   | wiki-canonical `service` label + `role`)                         |
| `environment.required_vars[]`     | informs `findings.authentication.providers` when names match     |
|                                   | provider tokens (`KEYCLOAK_*` / `OAUTH_*` / `STRIPE_*` / etc.)   |
| `infrastructure[]`                | informs `findings.deployment.target` (firebase / serverless / …) |

Forbidden Globs (inspection covers them): `**/package.json`,
`**/.env*`, `**/Dockerfile*`, lock files, `**/docker-compose*`,
`**/.github/workflows/*`.

## Step 1 — Cheapest entry point

`get_minimal_context({ task: "Map auth, request lifecycles, persistence, integrations" })`.

## Step 2 — Auth + request lifecycle (flow inventory)

`list_flows({ sort_by: "criticality", limit: 30, detail_level: "minimal" })`.
Pick at most 5 flows whose names match `auth | guard | middleware |
request` or a service entry-point. For each:
`get_flow({ flow_id, include_source: false })`. Set
`include_source: true` for at most 1 flow.

Flow execution path encodes the auth chain (CORS → RateLimiter →
AuthGuard → RolesGuard → Handler, in whatever shape).

Empty-graph fallback: ONE `semantic_search_nodes` per credible auth
scheme — name tokens: `jwt`, `jose`, `oauth`, `oidc`, `passport`,
`keycloak`, `session`, `cookie`, `api-key`, `basic-auth`.

## Step 3 — Authorization

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level:
"minimal" })` with name token `RolesGuard | PermissionsGuard | hasRole
| checkPermission | Policy | Authorize | CASL | Casbin | Pundit |
Cancan`. RBAC if role tokens; ABAC if policy/attribute tokens.

## Step 4 — API design

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level:
"minimal" })` per protocol with name tokens:

- **REST**: Controller / Handler / Route / Endpoint
- **GraphQL**: Resolver / Schema / ObjectType
- **gRPC**: ServiceDefinition / GrpcMethod / RpcService
- **WebSocket**: WebSocketGateway / SubscribeMessage

Report `findings.api_design.{primary, secondary[], patterns, versioning}`
with booleans per protocol.

## Step 5 — External integrations

ONE `semantic_search_nodes({ limit: 15, detail_level: "minimal" })`
per category, single comma-separated name-token query:

- **payments**: stripe / paypal / square / adyen / braintree
- **email**: sendgrid / mailgun / ses / postmark / nodemailer / mailchimp
- **cloud storage**: s3 / gcs / azureblob / cloudinary / cloudflare-r2
- **auth providers**: auth0 / firebase-auth / cognito / keycloak / okta / clerk
- **monitoring**: sentry / datadog / newrelic / honeybadger / rollbar / bugsnag
- **observability**: opentelemetry / prometheus / jaeger / zipkin

For each: `{name, sdk + version, confirmed | declared}`.

## Step 6 — Background jobs

ONE `semantic_search_nodes({ limit: 15, detail_level: "minimal" })`
with name tokens `bullmq | bull | agenda | celery | rq | dramatiq |
huey | asynq | sidekiq | resque | shoryuken | hangfire | quartz |
sneakers`. Report `findings.background_jobs.{library, queues[],
scheduling, retry_policy}`.

## Step 7 — Caching

ONE `semantic_search_nodes({ kind: "Function", limit: 15,
detail_level: "minimal" })` with name tokens `Redis | Memcached |
createClient | cache.get | cache.set | hazelcast | infinispan | apc |
varnish`. Report `findings.caching.{type, client, strategy,
ttl_configured, use_cases[]}`.

## Step 8 — Inter-service communication

For each candidate broker, ONE `query_graph({ pattern: "imports_of",
target: "<broker-package>" })`. Tokens: kafka / amqp / rabbitmq / nats
/ sqs / pubsub / azure-service-bus / pulsar / redis-streams /
activemq.

Report `findings.inter_service_communication.{pattern (monolithic |
modular-monolith | microservices | event-driven), message_broker,
sync_protocol (rest | grpc | graphql | n-a), async_protocol,
service_discovery, api_gateway}`.

## Step 9 — Infrastructure services (use inspection hints)

`inspection.infrastructure_services_hints[]` carries named service →
port triples already extracted from docker-compose + firebase
emulators. **Emit each as a `findings.infrastructure_services[]`
entry** with these fields:

- `id` — verbatim from inspection
- `service` — canonical wiki label (e.g. `inspection.name="postgres"`
  → `service: "PostgreSQL"`; `inspection.name="redis"` →
  `service: "Redis"`; `inspection.name="keycloak"` →
  `service: "Keycloak"`)
- `type` — `database` / `cache+queue` / `identity-provider` /
  `monitoring` / etc.
- `port` — from inspection
- `role` — one-line operator-facing description
- `port_search_evidence` — minimum 2 entries citing the source file
  (use `source_file` from inspection + any cross-reference)

SaaS-only services with no localhost port (Sentry / Datadog / Stripe
production) use the OPT-OUT shape: `{port_applies: false,
port_applies_reason: "SaaS — accessed via HTTPS to vendor DSN, no
localhost port", port_search_evidence: [...≥2 entries...]}`.

The Stop hook hard-rejects entries with neither a `port` nor the
opt-out shape.

## Step 10 — Data transformation

Detect DTO / serializer / validator / mapper patterns from the graph's
class names. Report `findings.data_transformation.{dto_library,
validation, serialization}`.

## Output

Emit the shape below. Optional fields use the `"name?"` suffix — OMIT
the field entirely when no value (do NOT emit `null`). Per-service
maps key by IDs from your AUTHORITATIVE SERVICE LIST.

<<script:critic-block agent=data-flows-integrations-analyzer>>

E012: each `infrastructure_services[]` entry needs either `port` (int)
OR `{ port_applies: false, port_applies_reason: <string>,
port_search_evidence: [<string>,<string>] }`.

## `needs_verification` rules

Only when ALL hold: (a) cannot be determined from code/configs after
exhaustive search, (b) in-scope, (c) business/intent decision.

Hard-rejected: credentials, production endpoints, "managed elsewhere",
auth patterns (discoverable from graph), API design (discoverable),
integration presence (discoverable), data transformation (code analysis).

**Record absence as a finding** (e.g. `webhooks: []`,
`message_broker: "none"`).
