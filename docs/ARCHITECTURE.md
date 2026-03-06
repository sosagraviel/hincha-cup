# Architecture

## Overview

Gira is a full-stack monorepo simulating a Jira-like project management board. It is designed to be cloned as a production-ready starting point for new projects. The architecture follows vertical-slice module organization on the backend and atomic design on the frontend, with Keycloak SSO, Redis session caching, and real-time WebSocket updates via BullMQ.

---

## System Context

```mermaid
graph TD
    User["👤 User (Browser)"]
    FE["React SPA\n(port 2712)"]
    BE["NestJS API\n(port 3050)"]
    DB["PostgreSQL 16\n(port 5432)"]
    Redis["Redis 7\n(port 6379)"]
    KC["Keycloak\n(port 7080)"]
    S3["S3-compatible\nObject Store"]

    User -->|HTTP / WebSocket| FE
    FE -->|REST API calls| BE
    FE -->|OIDC Auth Code Flow| KC
    BE -->|TypeORM queries| DB
    BE -->|Session cache / BullMQ| Redis
    BE -->|JWT introspection| KC
    BE -->|File upload/download| S3
```

---

## Repository Structure

```
gira/
├── packages/
│   ├── liveonit/          # Shared tooling configs (ESLint, Prettier, TS, Jest, commitlint)
│   └── shared/          # Shared DTOs, enums, and utilities (@livonit/shared)
│       └── src/
│           ├── dtos/    # Request/Response DTOs per domain
│           ├── enums/   # TicketStatus, Priority, OrgRole, ProjectRole, UserStatus
│           └── utils/   # Shared utility functions
├── services/
│   ├── backend/         # NestJS REST API
│   ├── web-frontend/    # React SPA (Vite + TanStack Router)
│   ├── keycloak/        # IAM realm config, themes, init scripts
│   └── db/              # DB init scripts (PostgreSQL + Keycloak DB)
├── docs/                # Project documentation
└── seeds/               # Database seed scripts
```

---

## Backend Module Dependencies

```mermaid
graph TD
    App["AppModule"]
    Auth["AuthModule\n(Global)"]
    Redis["RedisModule\n(Global)"]
    Queue["QueueModule\n(Global)"]
    Config["ConfigModule\n(Global)"]
    User["UserModule"]
    Org["OrganizationModule"]
    Project["ProjectModule"]
    Ticket["TicketModule"]
    Chat["ChatModule"]
    Attach["AttachmentModule"]
    Notif["NotificationModule"]
    Invite["InviteModule"]

    App --> Auth
    App --> Redis
    App --> Queue
    App --> Config
    App --> User
    App --> Org
    App --> Project
    App --> Ticket
    App --> Chat
    App --> Attach
    App --> Notif
    App --> Invite

    Ticket --> Queue
    Org --> Queue
    Project --> Queue
    Chat --> Queue
    Notif --> Queue
    User --> Auth
```

Each feature module follows this internal structure:

```
<module>/
├── <module>.module.ts          # NestJS module definition
├── presentation/               # Controllers (HTTP layer)
│   └── dto/                    # Request DTOs (class-validator)
├── service/                    # Business logic
├── repository/                 # Data access (TypeORM queries)
└── database/
    ├── models/                 # TypeORM entities
    └── migrations/             # Schema migrations
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant AuthMiddleware
    participant JwtAuthGuard
    participant OrgMemberGuard
    participant Controller
    participant Service
    participant Repository
    participant DB

    Client->>AuthMiddleware: HTTP Request + Bearer token
    AuthMiddleware->>Redis: Check session cache
    alt Cache hit
        Redis-->>AuthMiddleware: { user, token }
    else Cache miss
        AuthMiddleware->>Keycloak: validateToken(jwt)
        Keycloak-->>AuthMiddleware: Decoded token
        AuthMiddleware->>DB: findOne(User, { externalId })
        DB-->>AuthMiddleware: User entity
        AuthMiddleware->>Redis: setJson(session, ttl)
    end
    AuthMiddleware->>JwtAuthGuard: request.auth = { user, token }
    JwtAuthGuard->>OrgMemberGuard: Verify user authenticated
    OrgMemberGuard->>DB: findOne(OrganizationMember, { userId, orgId })
    DB-->>OrgMemberGuard: Membership (or null → 403)
    OrgMemberGuard->>Controller: request.orgMembership = membership
    Controller->>Service: Call business logic
    Service->>Repository: Query / mutate data
    Repository->>DB: TypeORM query
    DB-->>Repository: Entity
    Repository-->>Service: Entity
    Service-->>Controller: Result
    Controller-->>Client: HTTP Response (transformed DTO)
```

---

## Auth Flow (Keycloak OIDC)

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Keycloak
    participant Backend

    User->>Frontend: Navigate to protected route
    Frontend->>Keycloak: Redirect (Authorization Code Flow)
    Keycloak->>User: Show login page
    User->>Keycloak: Submit credentials
    Keycloak-->>Frontend: Authorization code + redirect
    Frontend->>Keycloak: Exchange code for tokens
    Keycloak-->>Frontend: id_token + access_token + refresh_token
    Frontend->>Backend: API request + Bearer access_token
    Backend->>Keycloak: Validate token (JWKS)
    Backend->>DB: Lookup user by externalId (Keycloak sub)
    Backend-->>Frontend: Response with data
```

### Three-Layer Authorization

| Layer                   | Source                       | Checked by           |
| ----------------------- | ---------------------------- | -------------------- |
| Keycloak realm roles    | JWT `realm_access.roles`     | `RolesGuard`         |
| Organization membership | `organization_members` table | `OrgMemberGuard`     |
| Project membership      | `project_members` table      | `ProjectMemberGuard` |

---

## WebSocket Event Flow

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant Service
    participant EntityEventEmitter
    participant BullMQ
    participant QueueProcessor
    participant PermissionEvaluator
    participant WebSocketGateway

    Controller->>Service: Mutate entity (create/update/delete)
    Service->>EntityEventEmitter: emit({ type, entity, id, data, parentId })
    EntityEventEmitter->>BullMQ: queue.add('process', EntityChangeMessage)
    BullMQ->>QueueProcessor: Process job
    QueueProcessor->>PermissionEvaluator: evaluatePermissions(event)
    PermissionEvaluator->>DB: Query affected users + channels
    DB-->>PermissionEvaluator: DeliveryTarget[]
    QueueProcessor->>WebSocketGateway: Emit event to each user's channels
    WebSocketGateway-->>Client: WebSocket push (e.g. ticket:updated)
```

WebSocket channels follow this naming convention:

| Channel                          | Subscribers         | Events              |
| -------------------------------- | ------------------- | ------------------- |
| `user:{userId}`                  | Individual user     | All personal events |
| `user:{userId}:tickets:assigned` | Assignee only       | Ticket assignments  |
| `project:{projectId}:tickets`    | All project members | Board updates       |
| `project:{projectId}`            | All project members | Project changes     |
| `org:{orgId}`                    | All org members     | Org changes         |

---

## Database Entity Relationships

```mermaid
erDiagram
    User {
        uuid id PK
        string external_id UK "Keycloak sub"
        string email UK
        string full_name
        string profile_picture_url
        string status "active|invited|inactive"
        timestamp created_at
        timestamp updated_at
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        string description
        string logo_url
        timestamp created_at
        timestamp updated_at
    }

    OrganizationMember {
        uuid id PK
        uuid user_id FK
        uuid organization_id FK
        string role "owner|admin|member"
        timestamp created_at
    }

    Project {
        uuid id PK
        uuid organization_id FK
        string name
        string key UK "e.g. PLT"
        string description
        timestamp created_at
        timestamp updated_at
    }

    ProjectMember {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string role "admin|member|viewer"
        timestamp created_at
    }

    Ticket {
        uuid id PK
        uuid project_id FK
        uuid assignee_id FK
        uuid reporter_id FK
        int ticket_number
        string title
        text description
        string status "backlog|todo|in_progress|in_review|done"
        string priority "critical|high|medium|low"
        int order
        timestamp due_date
        timestamp created_at
        timestamp updated_at
    }

    Comment {
        uuid id PK
        uuid ticket_id FK
        uuid author_id FK
        text content
        timestamp created_at
        timestamp updated_at
    }

    User ||--o{ OrganizationMember : "belongs to"
    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ Project : "owns"
    User ||--o{ ProjectMember : "belongs to"
    Project ||--o{ ProjectMember : "has"
    Project ||--o{ Ticket : "contains"
    User ||--o{ Ticket : "assigned"
    User ||--o{ Ticket : "reports"
    Ticket ||--o{ Comment : "has"
    User ||--o{ Comment : "authors"
```

---

## Frontend Architecture

The frontend follows **Atomic Design** principles:

```mermaid
graph TD
    Routes["Routes (TanStack Router\nfile-based)"]
    Templates["Templates\nDashboardTemplate"]
    Organisms["Organisms\nHeader · BoardColumn · TicketDetailPanel\nCreateTicketDialog · ChatSidebar"]
    Molecules["Molecules\nTicketCard · OrgCard · ProjectCard\nSearchInput"]
    Atoms["Atoms\nButton · Input · Badge · Avatar\nPriorityBadge · StatusBadge · EmptyState"]

    Routes --> Templates
    Templates --> Organisms
    Organisms --> Molecules
    Molecules --> Atoms
```

### Data Flow

```mermaid
graph LR
    Route["Route Component"]
    Query["React Query Hook\n(useQuery / useMutation)"]
    API["API Client\n(axios instance)"]
    BE["Backend REST API"]
    WS["WebSocket\n(Socket.IO)"]
    Store["Query Cache\n(auto-invalidated)"]

    Route --> Query
    Query --> API
    API --> BE
    BE --> WS
    WS --> Store
    Store --> Route
```

---

## Key Design Decisions

| Decision          | Choice                                      | Rationale                                           |
| ----------------- | ------------------------------------------- | --------------------------------------------------- |
| Auth              | Keycloak OIDC                               | Single SSO provider; realm isolates each tenant     |
| Session caching   | Redis                                       | Avoid Keycloak round-trip on every request          |
| Real-time         | BullMQ + Socket.IO                          | Decouples mutation from broadcast; horizontal scale |
| ORM               | TypeORM 0.3                                 | Mature, well-typed, migration tooling               |
| Guard pattern     | `BaseMemberGuard` abstract class            | DRY — org + project guards share ~80% logic         |
| Comment ownership | Service-level check (`authorId === userId`) | Keep authorization in one place                     |
| DTO validation    | class-validator + `@livonit/shared` enums   | Single source of truth for valid values             |
| Pagination        | `paginate()` utility, `limit`/`page` params | Consistent across all list endpoints                |
