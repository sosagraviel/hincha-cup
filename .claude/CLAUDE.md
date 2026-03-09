# GIRA - AI Agentic Framework

## Project Overview

GIRA is a hybrid platform combining project management (kanban boards, issue tracking) with real-time chat/communication. The project is a TypeScript monorepo using pnpm workspaces, currently in active development (not yet deployed).

## Repository Structure

```
/
├── packages/
│   └── shared/              # Cross-cutting DTOs, enums, base classes, utils
├── services/
│   ├── backend/             # NestJS REST API + WebSocket server
│   ├── web-frontend/        # React SPA with Vite
│   └── keycloak/            # Keycloak auth server setup
└── seeds/scripts/           # Database seeding utilities
```

## Tech Stack

- **Language**: TypeScript 5.8.2
- **Runtime**: Node.js >=22.14.x
- **Package Manager**: pnpm 10.2.1
- **Backend**: NestJS 11.0.11, TypeORM 0.3.21, Socket.io 4.8.1
- **Frontend**: React 19.1.0, Vite 6.3.5, TanStack Router 1.120.5, TanStack React Query 5.77.2
- **Database**: PostgreSQL 16.8
- **Cache/Queue**: Redis 7, ioredis 5.9.2, BullMQ 5.0.0
- **Auth**: Keycloak 26.1.4, passport-jwt 4.0.1
- **Testing**: Jest 29.7.0 (backend), Playwright 1.52.0 (frontend)

## Essential Commands

### Development
```bash
make setup                              # Full dev environment setup
make up s=<service>                     # Start specific service(s)
make down                               # Stop all containers
make seed                               # Seed demo data
```

### Backend (services/backend)
```bash
pnpm --filter backend start:dev         # Dev server with watch (port 3050)
pnpm --filter backend build             # Production build
pnpm --filter backend test:unit         # Run unit tests
pnpm --filter backend test:integration  # Run integration tests
pnpm --filter backend lint:check        # ESLint (max-warnings=0)
pnpm --filter backend format            # Prettier format
pnpm --filter backend type:check        # TypeScript type check
```

### Frontend (services/web-frontend)
```bash
pnpm --filter web-frontend start:dev    # Vite dev server (port 2712)
pnpm --filter web-frontend build        # Production build
pnpm --filter web-frontend test:e2e     # Playwright E2E tests
```

### Database Migrations
```bash
pnpm --filter backend typeorm:migration:create [name]  # Create new migration
# Set DB_MIGRATIONS_RUN=true for auto-run
```

## Architecture

### Backend: Clean Architecture with DDD (Vertical Slicing)

9 modules: auth, user, organization, project, ticket, chat, queue, websocket, redis

Each module follows this structure:
```
modules/{module}/
├── database/
│   ├── models/           # TypeORM entities (*.model.ts)
│   └── migrations/       # Module-specific migrations
├── repository/           # Data access layer (*.repository.ts)
├── service/              # Business logic (*.service.ts)
└── presentation/
    ├── dto/              # Request/response DTOs (*.dto.ts)
    └── *.controller.ts   # HTTP endpoints
```

### Frontend: Feature-based with Atomic Design

```
services/web-frontend/src/
├── routes/               # TanStack Router (file-based: _auth.orgs.$orgId.tsx)
├── features/{feature}/   # Feature pages and components
├── components/
│   ├── atoms/            # Basic UI elements
│   ├── molecules/        # Composed components
│   ├── organisms/        # Complex components
│   └── layouts/          # Page layouts
├── hooks/
│   ├── use*.ts           # Custom hooks
│   └── queries/          # TanStack Query hooks (*Queries.ts)
├── shared/
│   ├── ui/               # Radix UI wrappers
│   └── context/          # React context providers
└── api/                  # API client
```

## Path Aliases

**Backend**:
- `@src/*` -> `src/*`
- `@modules/*` -> `src/modules/*`
- `@config/*` -> `src/configs/*`
- `@libs/*` -> `src/libs/*`
- `@livonit/shared` -> shared package

**Frontend**:
- `@/*` -> `./src/*`
- `@livonit/shared` -> shared package

## Request Lifecycle

1. **RequestContextMiddleware** - AsyncLocalStorage context
2. **ContextInterceptor** - Assigns correlation ID (nanoid)
3. **AuthMiddleware** - Token extraction, Redis cache check, Keycloak JWKS validation
4. **Guards** (if declared): JwtAuthGuard, RolesGuard, OrgMemberGuard, ProjectMemberGuard
5. **Handler Execution**
6. **TransformAndValidateResponseInterceptor** - Response DTO validation
7. **GlobalExceptionFilter** - Error handling with correlation ID

**Important**: AuthMiddleware passes through silently without token; guards enforce authentication.

## Authorization (3-Tier RBAC)

1. **Realm Roles** (Keycloak JWT): `@Roles()` + `RolesGuard`
2. **Organization Roles** (DB): `@OrgRoles()` + `OrgMemberGuard`
3. **Project Roles** (DB): `@ProjectRoles()` + `ProjectMemberGuard`

## Real-Time Events (2-Stage BullMQ Pipeline)

1. Service calls `EntityEventEmitter.emit()` -> BullMQ `entity-events` queue
2. `EntityEventProcessor` evaluates permissions, creates delivery targets -> `delivery` queue
3. `DeliveryProcessor` deduplicates (Redis), checks presence, broadcasts to channels

**Channel patterns**: `user:{userId}`, `org:{orgId}`, `project:{projectId}`, `chat:room:{roomId}`, etc.

## Code Conventions

- **Commits**: Conventional commits (feat, fix, docs, refactor, test, etc.)
- **Files**: kebab-case for files, PascalCase for components/classes
- **Database**: snake_case columns (auto-converted via SnakeNamingStrategy)
- **Linting**: ESLint with max-warnings=0
- **Formatting**: Prettier (80 char, single quotes, no trailing commas)

## Services & Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Backend | 3050 |
| Frontend | 2712 |
| Keycloak | 7080 (HTTP), 7443 (HTTPS) |
| Mailhog | 1025 (SMTP), 8025 (Web UI) |

## Key Patterns

- **Correlation IDs**: Every request/response includes correlation ID for distributed tracing
- **Session Caching**: Cached by Keycloak `sub` (externalId), not internal user ID
- **Response Validation**: DTOs validated on both input and output
- **Custom Repositories**: All data access through `*.repository.ts` files, never direct TypeORM
