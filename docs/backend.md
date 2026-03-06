# Backend

NestJS 11 REST API with TypeORM 0.3, PostgreSQL 16, and Redis. Organized by vertical-slice feature modules. Auth is handled through Keycloak JWT validation with Redis session caching and a three-layer RBAC guard system.

API available at <http://localhost:3050/api/v1> · Swagger UI at <http://localhost:3050/api/v1/docs>

---

## Commands

```bash
pnpm --filter ./services/backend start:dev        # Watch mode (hot reload)
pnpm --filter ./services/backend test:unit        # Unit tests (Jest)
pnpm --filter ./services/backend test:integration # Integration tests (supertest, needs DB)
pnpm --filter ./services/backend lint:check       # ESLint (0 warnings enforced)
pnpm --filter ./services/backend type:check       # TypeScript
pnpm --filter ./services/backend format:check     # Prettier

# Single test file
pnpm --filter ./services/backend test:unit -- ticket.service.spec.ts
pnpm --filter ./services/backend test:integration -- organization.e2e-spec.ts
```

---

## Module Overview

Each module is a vertical slice with its own controller, service, repository, entities, and migrations. Modules communicate through the `QueueModule` (BullMQ) — never by direct import.

| Module | Responsibility |
| --- | --- |
| `auth` | JWT middleware, session caching, Keycloak validation, guards, decorators |
| `user` | User profile — get and update current user |
| `organization` | Organizations and organization membership (owner/admin/member) |
| `project` | Projects and project membership (admin/member/viewer) |
| `ticket` | Kanban tickets, board view, ticket ordering, and **comments** |
| `chat` | Group rooms, DM threads, real-time messages, read receipts |
| `websocket` | WebSocket gateway, real-time event broadcasting via Socket.IO |
| `queue` | BullMQ setup, `EntityEventEmitter`, `PermissionEvaluatorService` |
| `redis` | Redis connection, session caching, typed get/set/del helpers |

Each module's internal layout:

```text
<module>/
├── <module>.module.ts
├── presentation/
│   ├── <module>.controller.ts
│   └── dto/                    # class-validator request DTOs
├── service/
│   └── <module>.service.ts
├── repository/
│   └── <module>.repository.ts
└── database/
    ├── models/                 # TypeORM entities (*.model.ts)
    └── migrations/
```

---

## API Endpoints

| Resource | Method | Path |
| --- | --- | --- |
| **Users** | | |
| Current user | `GET` | `/api/v1/users/me` |
| Current user | `PATCH` | `/api/v1/users/me` |
| **Organizations** | | |
| Organizations | `GET / POST` | `/api/v1/organizations` |
| Organization | `GET / PATCH` | `/api/v1/organizations/:id` |
| Org members | `POST / PATCH / DELETE` | `/api/v1/organizations/:id/members/:userId?` |
| **Projects** | | |
| Projects | `GET / POST` | `/api/v1/organizations/:orgId/projects` |
| Project | `GET / PATCH` | `/api/v1/projects/:id` |
| Project members | `POST / DELETE` | `/api/v1/projects/:id/members/:userId?` |
| **Tickets** | | |
| Board view | `GET` | `/api/v1/projects/:projectId/board` |
| Tickets | `GET / POST` | `/api/v1/projects/:projectId/tickets` |
| Ticket | `GET / PATCH / DELETE` | `/api/v1/tickets/:id` |
| Ticket status | `PATCH` | `/api/v1/tickets/:id/status` |
| **Comments** | | |
| Comments | `POST` | `/api/v1/tickets/:ticketId/comments` |
| Comment | `PATCH / DELETE` | `/api/v1/comments/:id` |
| **Chat** | | |
| Rooms | `GET / POST` | `/api/v1/chat/rooms` |
| Room | `GET` | `/api/v1/chat/rooms/:id` |
| Room messages | `GET` | `/api/v1/chat/rooms/:id/messages` |
| Message | `POST / DELETE` | `/api/v1/chat/messages/:id?` |
| Mark as read | `POST` | `/api/v1/chat/messages/:id/read` |
| DM threads | `GET / POST` | `/api/v1/chat/dms` |
| DM messages | `GET` | `/api/v1/chat/dms/:id/messages` |

Full interactive documentation: <http://localhost:3050/api/v1/docs>

---

## Auth System

Requests flow through three layers in order:

```text
HTTP request
  → AuthMiddleware      checks Redis cache, validates JWT with Keycloak
  → JwtAuthGuard        verifies request.auth is populated
  → OrgMemberGuard      checks organization_members table (scoped to :orgId route param)
  → ProjectMemberGuard  checks project_members table (scoped to :projectId)
  → RolesGuard          checks Keycloak realm roles from JWT
```

Decorators used on controllers:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')                         // Keycloak realm role

@UseGuards(JwtAuthGuard, OrgMemberGuard)
@OrgRoles('owner', 'admin')                   // Organization membership role

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ProjectRoles('admin', 'member')              // Project membership role
```

---

## Path Aliases

| Alias | Resolves to |
| --- | --- |
| `@src/*` | `src/*` |
| `@modules/*` | `src/modules/*` |
| `@config/*` | `src/configs/*` |
| `@libs/*` | `src/libs/*` |

---

## Database Migrations

```bash
# Create a new migration
pnpm --filter ./services/backend typeorm:migration:create -- DescriptionOfChange

# Create a new seed
pnpm --filter ./services/backend typeorm:seed:create -- SeedName
```

Migrations and seeds run automatically on startup when `DB_MIGRATIONS_RUN=true`.

---

## Real-Time Events

Mutations emit an `EntityChangeMessage` to the BullMQ queue. The queue processor evaluates which users are allowed to receive the event and pushes it via Socket.IO:

```typescript
const message: EntityChangeMessage = {
  messageId: randomUUID(),
  type: EntityChangeType.ENTITY_UPDATED,
  entity: 'tickets',
  id: ticket.id,
  data: ticket as unknown as Record<string, unknown>,
  timestamp: new Date().toISOString(),
};
await this.entityEventsQueue.add('process', message);
```

See [Real-Time System Guide](realtime-system.md) for channel names and event types.

---

## Further Reading

- [Architecture Overview](architecture.md) — system diagrams, module dependencies
- [Contributing Guide](contributing.md) — adding a new module, conventions, testing guide
- [Real-Time System Guide](realtime-system.md) — WebSocket usage, architecture, chat patterns
- [Backend Deep Dive](backend-deep-dive.md) — complete request lifecycle, auth, queue system, DB indexes
