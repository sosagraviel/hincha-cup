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

Use `needs_verification` for:

- External API credentials and secrets
- Third-party service configuration values
- Webhook secrets and signing keys
- Production environment endpoints

Do NOT use for:

- Authentication patterns (discoverable from graph flows and code)
- API design style (REST/GraphQL/gRPC discoverable from graph class search)
- Integration presence (graph import sites + SDK dependencies)
- Data transformation patterns (code analysis)

</verification_guidelines>

## Token efficiency

Graph queries are O(1) on warm cache (the graph is built once per init). Glob+Read scales with file count. For projects with thousands of files, the difference is 10–100×. Use the graph.
