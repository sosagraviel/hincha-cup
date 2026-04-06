# Data Flows & Integrations Analysis Instructions

<objective>
Analyze authentication, authorization, API design patterns, external integrations, and data flow patterns. Document how the application handles requests, integrates with external services, and manages data transformations.
</objective>

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
- Files: *.proto files, generated code
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

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Auth dependencies found but no implementation?** Search for middleware, guards, decorators
2. **External service SDK but no usage?** Search for client initialization, API calls
3. **GraphQL schema but no resolvers?** Look in separate resolvers directory or files
4. **WebSocket dependency but no handlers?** Search for `io.on`, `socket.on` event handlers
5. **Payment integration unclear?** Check for webhook handlers, confirmation endpoints

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
      "type": "JWT",
      "library": "jsonwebtoken",
      "middleware": "src/middleware/auth.ts"
    },
    "api_design": {
      "primary": "REST",
      "versioning": "URL-based (/api/v1/)"
    },
    "external_integrations": [
      {
        "service": "Stripe",
        "purpose": "Payment processing",
        "sdk": "stripe 14.10"
      },
      {
        "service": "SendGrid",
        "purpose": "Email delivery",
        "sdk": "@sendgrid/mail 8.1"
      }
    ]
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "What is the Stripe webhook secret for production?",
      "reason": "Webhook signature verification code found but secret not in codebase"
    }
  ]
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
