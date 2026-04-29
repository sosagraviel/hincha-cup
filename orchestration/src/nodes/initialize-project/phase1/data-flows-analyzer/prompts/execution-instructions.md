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

> **Graph use.** All graph tool calls below MUST follow the **Graph navigation discipline** templated into your CODE GRAPH CONTEXT block: lean parameters, drill-in caps, no calls to `get_architecture_overview_tool`. Specialise _which_ lean tools you call for each question; never override the defaults.

## Step 0: Cheap orientation via graph

Call `get_minimal_context` with `task: "Map auth, request lifecycles, persistence, and external integrations"`. The response (~100 tokens) gives you top flows and suggested next tools — use it before any other graph call.

## Step 1: Auth middleware order and request lifecycle via graph

Call `list_flows` with `{ sort_by: "criticality", limit: 30, detail_level: "minimal" }`. Pick **at most 5** flows by name (those containing "auth", "guard", "middleware", "request", or matching the entry-point of a service). For each picked flow call `get_flow({ flow_id, include_source: false })` to retrieve the execution path with middleware/guard nodes in order. Only set `include_source: true` for the **single** flow whose source you genuinely need to read (cap: 1).

This gives you the auth middleware chain (e.g., `CORS → RateLimiter → JwtGuard → RolesGuard → Handler`) directly, without grepping for JWT/OAuth/session patterns across files.

> **Forbidden:** `get_architecture_overview` — its response cannot be bounded and overflows. Flow data alone (`list_flows` + selective `get_flow`) covers what this analyzer needs.

**Only when list_flows returns empty** — fall back to the file-based approach below:

<auth_detection>

**JWT (JSON Web Tokens):**

- Dependencies: jsonwebtoken, jose, jwt-decode, pyjwt, golang-jwt
- Search patterns: `jwt.sign`, `jwt.verify`, `JWT.encode`, `jwt.NewWithClaims`
- Config files: Look for JWT_SECRET, TOKEN_EXPIRY in env examples

**OAuth 2.0 / OpenID Connect:**

- Dependencies: passport, next-auth, authlib, oauth2, oidc-client
- Search patterns: `passport.use`, `OAuth2Strategy`, `authorize_url`, `token_url`
- Config: CLIENT_ID, CLIENT_SECRET, REDIRECT_URI in env examples

**Session-based:**

- Dependencies: express-session, flask-session, gorilla/sessions
- Search patterns: `session.save`, `request.session`, `c.Session`
- Config: SESSION_SECRET in env examples

**API Keys:**

- Search for: `X-API-Key`, `Authorization: Bearer`, API key validation middleware
- Common patterns: Custom headers, query parameters, bearer tokens

</auth_detection>

## Step 2: Discover Authorization Patterns via graph

Use graph flows from Step 1 to identify guard nodes that enforce roles or permissions (e.g., `RolesGuard`, `PermissionsGuard`, `@Roles`, `policy_check`).

Supplement with:

```
semantic_search_nodes({ query: "RolesGuard | PermissionsGuard | hasRole | checkPermission | CASL | Casbin", kind: "Class", limit: 15, detail_level: "minimal" })
```

<authorization_patterns>

**Role-Based Access Control (RBAC):**

- Search for: `@Roles`, `hasRole`, `checkPermission`, role decorators
- Look for: role definitions, permission matrices, guard implementations

**Attribute-Based Access Control (ABAC):**

- Search for: policy files, attribute checks, condition-based guards
- Look for: CASL, Casbin, custom policy engines

</authorization_patterns>

## Step 3: Map API Design Patterns via graph

Call `semantic_search_nodes({ query: "Controller | Resolver | Router | handler", kind: "Class", limit: 15, detail_level: "minimal" })` to surface API boundary classes. Use the results to determine REST vs. GraphQL vs. gRPC.

<api_patterns>

**REST APIs:**

- Controller/router class names signal REST; check for `@Get`, `@Post` annotations on the returned nodes

**GraphQL:**

- `Resolver` class names signal GraphQL; look for `ObjectType`, `Query`, `Mutation` in graph results

**gRPC:**

- `ServiceDefinition` or `GrpcMethod` class names signal gRPC

**WebSocket / Real-time:**

- `WebSocketGateway`, `SubscribeMessage`, `io.on` in graph results

Document the primary API style and any secondary patterns.

</api_patterns>

## Step 4: Identify External Integrations via graph

Use `semantic_search_nodes` for actual import sites. Do NOT grep package.json — the graph only returns libraries that are actually imported in code.

**Payment processors:**

```
semantic_search_nodes({ query: "Stripe | PayPal | Square", limit: 15, detail_level: "minimal" })
```

**Email services:**

```
semantic_search_nodes({ query: "SendGrid | Mailgun | SES | nodemailer", limit: 15, detail_level: "minimal" })
```

**Cloud storage:**

```
semantic_search_nodes({ query: "S3 | GCS | AzureBlob | storage", limit: 15, detail_level: "minimal" })
```

**Auth providers:**

```
semantic_search_nodes({ query: "Auth0 | Firebase | Cognito | Keycloak", limit: 15, detail_level: "minimal" })
```

**Monitoring:**

```
semantic_search_nodes({ query: "Sentry | Datadog | NewRelic", limit: 15, detail_level: "minimal" })
```

**Only when ALL graph import queries return empty** — fall back to scanning dependency manifests for SDK package names.

<external_integrations>

**For each detected service, report:**

1. Service name
2. SDK package name and version (from manifest cross-reference)
3. Whether confirmed via graph import site or declared-only

</external_integrations>

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

## Step 6: Identify Background Job & Queue Patterns via graph

Call:

```
semantic_search_nodes({ query: "BullMQ | Bull | Celery | Sidekiq | Asynq | Dramatiq | RQ", limit: 15, detail_level: "minimal" })
```

If the graph returns import sites, use those for queue and worker identification.

**Only when graph returns empty** — fall back to:

<background_jobs>

**Job Queue Libraries:**

### Node.js/TypeScript

- **BullMQ:** `bullmq` dependency, queue definitions, worker processors
- **Bull:** `bull` dependency (older version of BullMQ)
- **Agenda:** `agenda` dependency, job scheduling

### Python

- **Celery:** `celery` dependency, task decorators `@app.task`
- **RQ (Redis Queue):** `rq` dependency, `@job` decorator

### Go

- **Asynq:** `github.com/hibiken/asynq` in go.mod

### Ruby

- **Sidekiq:** `sidekiq` gem, worker classes

</background_jobs>

**Report format:**

```json
"background_jobs": {
  "library": "BullMQ",
  "queues": ["email-queue", "notification-queue", "data-processing"],
  "scheduling": true,
  "retry_policy": "exponential backoff"
}
```

## Step 7: Detect Caching Patterns via graph

Call:

```
semantic_search_nodes({ query: "Redis | Memcached | ioredis | createClient | cache.get | cache.set", kind: "Function", limit: 15, detail_level: "minimal" })
```

Graph results give you actual cache initialization and usage sites. For cache strategy specifics (read-through / write-behind TTL logic), read the specific handler files the graph identified.

<caching_patterns>

**Cache Strategies:**

- **Read-through:** Check cache first, load from DB on miss
- **Write-through:** Write to cache and DB simultaneously
- **Write-behind:** Write to cache immediately, DB asynchronously
- **Cache-aside:** Application manually manages cache

**Report format:**

```json
"caching": {
  "type": "redis",
  "client": "ioredis 5.9",
  "strategy": "cache-aside",
  "ttl_configured": true,
  "use_cases": ["session storage", "API response caching", "rate limiting"]
}
```

</caching_patterns>

## Step 8: Map Inter-Service Communication via graph

Call:

```
query_graph({ pattern: "imports_of", target: "<broker>" })
```

for known message broker packages (kafkajs, amqplib, nats, @aws-sdk/client-sqs, @google-cloud/pubsub). The edge list shows which modules import the broker, revealing which services communicate through it.

<inter_service_communication>

**For microservices architectures, identify how services communicate:**

### Synchronous Communication

- **HTTP/REST:** Direct HTTP calls between services (Axios, Fetch, node-fetch)
- **gRPC:** High-performance RPC calls
- **GraphQL:** Federation, schema stitching

### Asynchronous Communication

- **Message Brokers:** RabbitMQ (amqplib), Kafka (kafkajs), AWS SQS, Google Pub/Sub, NATS

### Service Discovery

- **Consul, Eureka, etcd, Kubernetes DNS**

**Report format:**

```json
"inter_service_communication": {
  "pattern": "event-driven",
  "message_broker": "RabbitMQ",
  "sync_protocol": "REST",
  "async_protocol": "AMQP",
  "service_discovery": "kubernetes-dns",
  "api_gateway": "nginx"
}
```

If single service (not microservices):

```json
"inter_service_communication": {
  "pattern": "monolithic",
  "message_broker": "none",
  "sync_protocol": "n/a",
  "async_protocol": "n/a"
}
```

</inter_service_communication>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Called `get_minimal_context` first?** It must be the first graph call.
2. **Used lean parameters everywhere?** `list_flows` with `detail_level: "minimal"`, all `semantic_search_nodes` with `limit: 15` MAX and `detail_level: "minimal"`, `get_flow` with `include_source: false` (only one drill-in with source allowed). No calls to `get_architecture_overview` (forbidden — overflows).
3. **Called list_flows then drilled into ≤5 flows?** Flow data should drive auth middleware order before any grep.
4. **Called semantic_search_nodes for all external SDK categories?** Graph import sites are primary signal.
5. **graph_queries_used left empty?** Set the field to `[]` in your output. The framework records actual `mcp__code_graph__*` tool calls from your transcript and overwrites this field — your value is discarded unconditionally.
6. **Auth dependencies found but no flow data?** Fall back to middleware/guard file reads with citation
7. **External service SDK but no import sites from graph?** Fall back to manifest scanning with citation
8. **Queue library present but no graph import results?** Search for files with "worker", "job", "processor" in name
9. **Redis in dependencies but purpose unclear?** Graph cache.get/cache.set sites should clarify usage
10. **Multiple services but no message broker?** Check if it's truly microservices or modular monolith

## Common Integration Patterns

**Node.js/TypeScript typically integrates:**

- Stripe for payments
- SendGrid for email
- AWS S3 for storage
- Auth0 or Firebase for authentication

**Python typically integrates:**

- Stripe or PayPal for payments
- SendGrid or AWS SES for email
- boto3 for AWS services
- OAuth libraries for social auth

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown, no commentary)
- Field `findings` can contain any relevant integration/data flow information
- Schema allows passthrough fields for flexibility
- Optional field: `needs_verification` array (maximum 5 items)
- Required field: `graph_queries_used` — set to `[]`. The framework derives the real list from your transcript.

## Example Output Structure

```json
{
  "agent_name": "data-flows-integrations-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "authentication": {
      "type": "JWT + OAuth2",
      "libraries": ["passport-jwt", "passport-google-oauth20"],
      "middleware": "src/modules/auth/guards/",
      "providers": ["local", "google", "github"],
      "flow_id": "request-auth-flow"
    },
    "authorization": {
      "type": "RBAC",
      "implementation": "NestJS Guards + Custom Decorators",
      "roles": ["admin", "user", "moderator"]
    },
    "api_design": {
      "primary": "REST",
      "secondary": ["WebSocket"],
      "versioning": "none",
      "patterns": {
        "rest": true,
        "graphql": false,
        "grpc": false,
        "websockets": true
      }
    },
    "external_integrations": [
      {
        "service": "Keycloak",
        "purpose": "Identity and Access Management",
        "sdk": "@keycloak/keycloak-admin-client 26.1.4"
      },
      {
        "service": "Sentry",
        "purpose": "Error tracking and monitoring",
        "sdk": "@sentry/nestjs 9.30.0"
      }
    ],
    "background_jobs": {
      "library": "BullMQ",
      "queues": ["email-notifications", "data-processing"],
      "scheduling": true,
      "retry_policy": "configurable per queue"
    },
    "caching": {
      "type": "redis",
      "client": "ioredis 5.9.2",
      "strategy": "cache-aside",
      "ttl_configured": true,
      "use_cases": ["session storage", "rate limiting", "temporary data"]
    },
    "inter_service_communication": {
      "pattern": "monolithic with internal modules",
      "message_broker": "none",
      "sync_protocol": "internal method calls",
      "async_protocol": "BullMQ for background jobs"
    },
    "data_transformation": {
      "dto_library": "class-validator + class-transformer",
      "validation": "NestJS ValidationPipe",
      "serialization": "class-transformer decorators"
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
