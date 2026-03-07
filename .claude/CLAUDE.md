# Gira - Project Management Platform

Real-time Jira-like project management with chat, Kanban boards, and WebSocket updates.

## Quick Start

```bash
make setup          # Full environment (docker, keycloak, seed)
make up             # Start containers
make logs s=backend # Tail service logs
```

**URLs**: Frontend :2712 | Backend :3050 | Keycloak :7080
**Admin**: admin@gira.com / admin123

## Stack

- **Backend**: NestJS 11, TypeORM, PostgreSQL 16.8, Redis 7, BullMQ, Socket.IO
- **Frontend**: React 19, TanStack Router/Query, Tailwind 4, Radix UI, Zod
- **Auth**: Keycloak 26.x (external), JWT with Redis session cache

## Monorepo Structure

```
packages/shared/     # DTOs, enums, types (import as @livonit/shared)
services/backend/    # NestJS API
services/web-frontend/  # React SPA
services/keycloak/   # Realm config + themes
```

## Path Aliases

**Backend** (`@src/`, `@modules/`, `@libs/`):
```typescript
import { TicketService } from '@modules/ticket/service/ticket.service';
import { NotFoundException } from '@libs/exceptions';
```

**Frontend** (`@/`):
```typescript
import { useTicketQuery } from '@/hooks/queries/ticketQueries';
import { Button } from '@/shared/ui';
```

## Branch Naming

```
feat:<jira-ticket>-<jira-ticket-title>
```

## Key Commands

```bash
# Backend
pnpm --filter ./services/backend test:unit
pnpm --filter ./services/backend test:integration
pnpm --filter ./services/backend typeorm:migration:create -- <name>

# Frontend
pnpm --filter ./services/web-frontend test:e2e

# Docker
make rebuild-packages s=backend  # After shared pkg changes
make recreate s=<service>        # Fresh volumes + rebuild
```

## Backend Module Pattern

Each module follows vertical-slice architecture:

```
modules/<name>/
  database/models/      # TypeORM entities
  database/migrations/  # Module-specific migrations
  repository/           # Data access layer
  service/              # Business logic + event emission
  presentation/         # Controllers + DTOs
  <name>.module.ts
```

**Creating a feature**: service emits events via `EntityEventEmitter`, controller uses guards/decorators.

## Authentication Flow

1. `AuthMiddleware` extracts Bearer token, validates via Keycloak JWKS, caches session in Redis
2. `JwtAuthGuard` enforces token presence
3. Role guards check membership: `OrgMemberGuard`, `ProjectMemberGuard`
4. `@CurrentUser()` extracts user from `request.auth.user`

```typescript
@UseGuards(JwtAuthGuard, OrgMemberGuard)
@OrgRoles('owner', 'admin')
@Patch('organizations/:orgId')
async update(@CurrentUser() user: User) { ... }
```

## Real-Time Events

**Backend emission** (services):
```typescript
await this.events.emit({
  type: EntityChangeType.ENTITY_CREATED,
  entity: 'tickets',
  id: ticket.id,
  data: ticket,
  parentId: projectId,
  parentEntity: 'projects'
});
```

**Frontend subscription** (hooks):
```typescript
// Root layout: useWebSocketSubscription()
// Org routes: useOrgSubscription(orgId)
// Project routes: useChannelSubscription('project', projectId)
```

WebSocket auto-invalidates React Query cache on `entity_change` events.

## Frontend Patterns

**Query keys** follow entity hierarchy:
```typescript
ticketKeys.all       // ['tickets']
ticketKeys.detail(id) // ['tickets', id]
projectKeys.board(id) // ['projects', id, 'board']
```

**Mutations** invalidate related queries:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: projectKeys.board(projectId) });
}
```

**Routes** use TanStack Router file-based routing:
```
routes/_auth.orgs.$orgId.projects.$projectId.tsx
```

## Testing

- **Unit**: Jest with manual mocks in `__mocks__/`
- **Integration**: Supertest against running services
- **E2E**: Playwright for frontend flows

```bash
# Run all
make tests
```

## Exception Handling

Extend `ExceptionBase` for correlation IDs:
```typescript
throw new NotFoundException('Ticket not found');
// Response includes correlationId for log tracing
```

## Request Context

Access request-scoped data anywhere via `RequestContextService`:
```typescript
const requestId = RequestContextService.getRequestId();
```
