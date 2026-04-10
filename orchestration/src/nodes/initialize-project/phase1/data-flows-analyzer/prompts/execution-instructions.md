# Data Flows & Integrations Analysis Instructions

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

## Step 1: Identify Authentication Patterns

Search for authentication implementation in code:

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

Read auth middleware files to understand full authentication flow.

</auth_detection>

## Step 2: Discover Authorization Patterns

<authorization_patterns>

**Role-Based Access Control (RBAC):**

- Search for: `@Roles`, `hasRole`, `checkPermission`, role decorators
- Look for: role definitions, permission matrices, guard implementations

**Attribute-Based Access Control (ABAC):**

- Search for: policy files, attribute checks, condition-based guards
- Look for: CASL, Casbin, custom policy engines

**Route-Level Guards:**

- NestJS: `@UseGuards(AuthGuard)`, guard implementations
- Express: Middleware like `isAuthenticated`, `requireRole`
- Django: `@login_required`, `@permission_required` decorators
- FastAPI: `Depends(get_current_user)`, security dependencies

Identify which routes require authentication vs. public access.

</authorization_patterns>

## Step 3: Map API Design Patterns

<api_patterns>

**REST APIs:**

- Search for: HTTP method decorators (@Get, @Post, app.get, router.post)
- Patterns: Resource-based URLs, CRUD operations
- Versioning: /api/v1/, /v2/ in routes

**GraphQL:**

- Dependencies: graphql, apollo-server, graphene, gqlgen
- Files: schema.graphql, resolvers, type definitions
- Operations: queries, mutations, subscriptions

**gRPC:**

- Dependencies: @grpc/grpc-js, grpcio, grpc-go
- Files: \*.proto files, generated code
- Patterns: Service definitions, RPC methods

**WebSocket / Real-time:**

- Dependencies: socket.io, ws, websockets, gorilla/websocket
- Patterns: Event handlers, room/namespace management
- Use cases: Chat, notifications, live updates

Document the primary API style and any secondary patterns.

</api_patterns>

## Step 4: Identify External Integrations

<external_integrations>

Search for third-party service integrations:

**Payment Processors:**

- Stripe: stripe dependency, `stripe.charges.create`
- PayPal: paypal-rest-sdk, PayPal API calls
- Square: square dependency

**Email Services:**

- SendGrid: @sendgrid/mail, `sgMail.send`
- Mailgun: mailgun-js, Mailgun API
- AWS SES: aws-sdk with SES, boto3 SES

**Cloud Storage:**

- AWS S3: aws-sdk, boto3, s3 client
- Google Cloud Storage: @google-cloud/storage
- Azure Blob: @azure/storage-blob

**Analytics:**

- Google Analytics: gtag, analytics.js
- Mixpanel: mixpanel dependency
- Segment: @segment/analytics-node

**Authentication Providers:**

- Auth0: auth0 dependency, Auth0 config
- Firebase Auth: firebase-admin, Firebase SDK
- Cognito: aws-sdk with Cognito

**Message Queues / Event Streaming:**

- RabbitMQ: amqplib, pika
- Kafka: kafkajs, confluent-kafka
- Redis Pub/Sub: ioredis with publish/subscribe

**Monitoring / Logging:**

- Sentry: @sentry/node, sentry-sdk
- DataDog: dd-trace, datadog
- New Relic: newrelic

Search for API clients, SDK initialization, and webhook handlers for each integration.

</external_integrations>

## Step 5: Document Data Flow Patterns

<data_flows>

**Request Processing Flow:**

1. Client sends request
2. Middleware chain executes (CORS, auth, validation)
3. Route handler processes request
4. Business logic executes
5. Data layer interaction (database, cache)
6. Response transformation
7. Response sent to client

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

Search for these patterns in code to understand data flow architecture.

</data_flows>

## Step 6: Identify Background Job & Queue Patterns

<background_jobs>

**Job Queue Libraries:**

### Node.js/TypeScript

- **BullMQ:** `bullmq` dependency, queue definitions, worker processors
- **Bull:** `bull` dependency (older version of BullMQ)
- **Agenda:** `agenda` dependency, job scheduling
- **Bee-Queue:** `bee-queue` dependency

### Python

- **Celery:** `celery` dependency, task decorators `@app.task`
- **RQ (Redis Queue):** `rq` dependency, `@job` decorator
- **Dramatiq:** `dramatiq` dependency

### Go

- **Asynq:** `github.com/hibiken/asynq` in go.mod
- **Machinery:** `github.com/RichardKnop/machinery` in go.mod

### Ruby

- **Sidekiq:** `sidekiq` gem, worker classes
- **Resque:** `resque` gem

**Search for:**

1. Queue definitions and configuration
2. Worker/processor files (files with "worker", "job", "processor" in name)
3. Cron/scheduled job configurations
4. Job retry policies and error handling

**Report format:**

```json
"background_jobs": {
  "library": "BullMQ",
  "queues": ["email-queue", "notification-queue", "data-processing"],
  "scheduling": true,
  "retry_policy": "exponential backoff"
}
```

</background_jobs>

## Step 7: Detect Caching Patterns

<caching_patterns>

**Cache Implementations:**

### In-Memory Caching

- **Node:** `node-cache`, `lru-cache`, `memory-cache`
- **Python:** `cachetools`, `functools.lru_cache`
- **Go:** Built-in with `sync.Map` or third-party like `go-cache`

### Distributed Caching

- **Redis:** `ioredis`, `redis`, `redis-py`, `go-redis`
- **Memcached:** `memcached`, `pymemcache`

**Cache Strategies:**

- **Read-through:** Check cache first, load from DB on miss
- **Write-through:** Write to cache and DB simultaneously
- **Write-behind:** Write to cache immediately, DB asynchronously
- **Cache-aside:** Application manually manages cache

**Search for:**

1. Cache client initialization
2. Cache key patterns (look for `cache.get()`, `cache.set()` calls)
3. TTL (Time-To-Live) configurations
4. Cache invalidation strategies

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

## Step 8: Map Inter-Service Communication (Microservices)

<inter_service_communication>

**For microservices architectures, identify how services communicate:**

### Synchronous Communication

- **HTTP/REST:** Direct HTTP calls between services
- **gRPC:** High-performance RPC calls
- **GraphQL:** Federation, schema stitching

### Asynchronous Communication

- **Message Brokers:**
  - **RabbitMQ:** `amqplib`, `pika`, `amqp091-go`
  - **Kafka:** `kafkajs`, `confluent-kafka`, `kafka-go`
  - **AWS SQS:** `@aws-sdk/client-sqs`, `boto3` SQS
  - **Google Pub/Sub:** `@google-cloud/pubsub`
  - **NATS:** `nats`, `nats.py`, `nats.go`

### Service Discovery

- **Consul:** `consul` client libraries
- **Eureka:** `eureka-js-client`, Spring Cloud Eureka
- **etcd:** `etcd3`, `python-etcd`, `go.etcd.io/etcd`
- **Kubernetes:** Service discovery via DNS/env vars

### API Gateway

- **Kong:** Configuration files, plugins
- **AWS API Gateway:** CDK/CloudFormation definitions
- **NGINX:** `nginx.conf` with reverse proxy configs
- **Traefik:** `traefik.yml` configuration

**Search for:**

1. Service-to-service HTTP clients (Axios, Fetch, Requests, net/http)
2. Message producer/consumer code
3. Service registry client initialization
4. Gateway configuration files

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

1. **Auth dependencies found but no implementation?** Search for middleware, guards, decorators
2. **External service SDK but no usage?** Search for client initialization, API calls
3. **GraphQL schema but no resolvers?** Look in separate resolvers directory or files
4. **WebSocket dependency but no handlers?** Search for `io.on`, `socket.on` event handlers
5. **Payment integration unclear?** Check for webhook handlers, confirmation endpoints
6. **Queue library present but no workers?** Search for files with "worker", "job", "processor" in name
7. **Redis in dependencies but purpose unclear?** Check for caching, session storage, or pub/sub patterns
8. **Multiple services but no message broker?** Check if it's truly microservices or modular monolith
9. **API gateway configured?** Look for NGINX, Kong, or cloud gateway configurations

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
      "providers": ["local", "google", "github"]
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
      },
      {
        "service": "MailHog",
        "purpose": "Email testing (development)",
        "sdk": "SMTP (docker-compose)"
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

- Authentication patterns (discoverable from code)
- API design style (REST/GraphQL/gRPC discoverable from routes)
- Integration presence (SDK dependencies visible)
- Data transformation patterns (code analysis)

</verification_guidelines>
