---
name: project-context
description: Hard-to-discover architectural flows, auth patterns, and real-time event handling for Gira
user-invokable: true
disable-model-invocation: false
---

# Project Context: Gira

## Three-Tier Authorization Architecture

Gira implements three levels of role-based access control that cannot be discovered from file structure alone:

### Level 1: Realm Roles (Keycloak)
- Managed in Keycloak, synced at token validation
- `@Roles('super_admin')` with `RolesGuard`
- Used for system-wide admin operations

### Level 2: Organization Roles
- Stored in `organization_members.role`
- `@OrgRoles('owner', 'admin')` with `OrgMemberGuard`
- Guard extracts `:orgId` from route params, attaches membership to `request.orgMembership`

### Level 3: Project Roles
- Stored in `project_members.role`
- `@ProjectRoles('admin')` with `ProjectMemberGuard`
- Attaches membership to `request.projectMembership`

**Critical**: Guards execute in decorator order. Always place `JwtAuthGuard` first:
```typescript
@UseGuards(JwtAuthGuard, OrgMemberGuard, ProjectMemberGuard)
```

## Redis Session Caching Strategy

`AuthMiddleware` implements a cache-first authentication pattern:

1. Decode token unsafely to extract `sub` (Keycloak user ID)
2. Check Redis for `session:{sub}` key
3. If cached: use stored user + token, skip JWKS validation
4. If miss: validate via JWKS, fetch user from DB, cache with TTL = token.exp - 120s

**Implication**: User permission changes don't take effect until session expires or token refreshes.

## Event Pipeline: Service to Browser

Entity mutations flow through a multi-stage pipeline:

```
Service.method()
    |
    v
EntityEventEmitter.emit()  --> BullMQ queue
    |
    v
DeliveryProcessor.process()  --> Permission evaluation
    |
    v
EventsGateway.handleEntityChanged()  --> Socket.IO room broadcast
    |
    v
useWebSocketSubscription()  --> React Query cache update
```

**Room naming convention**:
- `org:{orgId}` - Organization-wide events
- `project:{projectId}` - Project events
- `project:{projectId}:tickets` - Ticket-specific events
- `chat:room:{roomId}`, `chat:group:{groupId}`, `chat:dm:{dmThreadId}`
- `user:{userId}`, `user:{userId}:tickets:assigned`

## WebSocket Connection Lifecycle

Frontend `SocketProvider` manages connection state:

1. **Connect**: On `isAuthenticated` change to true (not token change)
2. **Token refresh**: Updates `socket.io.opts.auth` without reconnect
3. **Disconnect**: Only on logout or `isAuthenticated` false
4. **Reconnection**: Built-in with exponential backoff + jitter

**Recovery patterns** in `useWebSocketSubscription`:
- Disconnected >30s: invalidate all active queries on reconnect
- Tab hidden→visible: invalidate all active queries
- Network offline→online: invalidate all active queries

## Shared Package Consumption

`@livonit/shared` must be built before backend/frontend:
```bash
pnpm --filter @livonit/shared build
```

The package exports DTOs, enums, and response types used by both services. When modifying shared types:
1. Update `packages/shared/src/`
2. Run `make rebuild-packages s=backend` or `s=frontend`

## TypeORM Migration Strategy

Migrations are co-located with modules:
```
modules/chat/database/migrations/1740000000000-CreateChatRoomsTable.ts
```

Create new migrations:
```bash
pnpm --filter ./services/backend typeorm:migration:create -- AddFeatureX
```

Migrations auto-run on backend startup in development.

## Frontend Query Cache Synchronization

WebSocket events directly manipulate React Query cache:

- `ENTITY_CREATED`: Invalidate list queries (unknown ordering)
- `ENTITY_UPDATED`: `setQueryData` for detail, invalidate lists
- `ENTITY_DELETED`: `removeQueries` for detail, invalidate lists

Parent entity invalidation (e.g., board when ticket changes) uses `parentId`/`parentEntity` fields.

## RequestContext Pattern

`AsyncLocalStorage`-based context available throughout request lifecycle:

```typescript
// Set in ContextInterceptor
RequestContextService.setRequestId(nanoid(6));

// Access anywhere (services, repositories, exception constructors)
const id = RequestContextService.getRequestId();
```

Used for log correlation and exception tracking. Falls back to nanoid if accessed outside request context.

## Keycloak Integration Points

- **Backend**: `keycloak.utils.ts` for token validation via JWKS
- **Backend**: `keycloak-admin.service.ts` for admin operations (user creation)
- **Frontend**: `keycloak-js` client, initialized in `shared/lib/keycloak.ts`
- **Realm config**: `services/keycloak/realms/gira-realm.json`

Token refresh handled by keycloak-js; backend trusts Keycloak's token validation.

## Component Architecture (Frontend)

Atomic design with feature organization:
```
components/
  atoms/       # Button, Avatar, Typography
  molecules/   # SearchInput, UserAvatar, SchemaForm
  organisms/   # BoardColumn, DetailPanel, Header
  layouts/     # DashboardLayout

features/      # Feature-specific components
  tickets/     # Ticket forms, cards, board
  chat/        # Chat UI components
```

UI primitives use Radix UI + class-variance-authority for variants.
