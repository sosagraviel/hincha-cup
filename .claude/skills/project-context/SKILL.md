---
description: Multi-step flows and hard-to-discover patterns for Gira project management system
globs:
  - services/backend/src/**/*.ts
  - services/web-frontend/src/**/*.ts
  - packages/shared/src/**/*.ts
alwaysApply: false
---

# Gira Critical Flows

## Real-Time Event Pipeline (MANDATORY)

Every mutation that modifies entities MUST emit events for real-time sync. Failure to do this breaks real-time updates.

### Three-Stage Pipeline

```
Stage 1: Service emits event
  TicketService.createTicket() -> EntityEventEmitter.emit()

Stage 2: Permission evaluation (BullMQ)
  EntityEventProcessor -> PermissionEvaluatorService.evaluatePermissions()
  -> Creates DeliveryTarget[] with user + channels

Stage 3: WebSocket delivery (BullMQ)
  DeliveryProcessor -> Socket.IO broadcast to user channels
  -> Deduplication via Redis
```

### Implementation Pattern

```typescript
// In any service that mutates entities:
@Injectable()
export class TicketService {
  constructor(private readonly events: EntityEventEmitter) {}

  async createTicket(...): Promise<Ticket> {
    const ticket = await this.ticketRepository.create({...});

    // REQUIRED: Emit event for real-time delivery
    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'tickets',
      id: ticket.id,
      data: ticket as unknown as Record<string, unknown>,
      parentId: projectId,
      parentEntity: 'projects'
    });

    return ticket;
  }
}
```

### Entity Types for Permission Routing

- `tickets` -> Project members, assignee, reporter
- `projects` -> Project members
- `organizations` -> Org members
- `chat` -> Room/group/DM participants

## Authentication Flow

### Request Lifecycle

```
1. RequestContextMiddleware (AsyncLocalStorage) - sets correlation ID
2. AuthMiddleware - JWT validation + Redis cache
3. ContextInterceptor - correlation ID propagation
4. Guards (stacked): JwtAuthGuard -> RolesGuard -> OrgMemberGuard/ProjectMemberGuard
5. TransformAndValidateResponseInterceptor - validates response DTOs
6. GlobalExceptionsFilter - catches all errors, reports to Sentry
```

### Redis Session Cache

```typescript
// Cache key pattern: session:{keycloakSubjectId}
// TTL: token.exp - 120s (refreshes before expiry)
const cached = await redis.getJson<{ user: User; token: DecodedToken }>(`session:${externalId}`);
```

### Guard Composition

```typescript
// Stack guards - they execute in order, all must pass
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@Get('projects/:projectId/tickets')
async listTickets() {}

// With role requirements
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
async adminOnly() {}
```

## Response DTO Validation

Responses extending `BaseResponseDto` are validated on the way out. Validation failure throws 500.

```typescript
// Response DTOs must extend BaseResponseDto
export class TicketResponseDto extends BaseResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  title: string;
}

// Interceptor validates automatically - no manual call needed
// Missing/invalid properties = 500 Internal Server Error
```

## WebSocket Room Subscriptions

### Channel Naming Convention

```
user:{userId}                     - Personal user channel
user:{userId}:tickets:assigned    - Assigned tickets notifications
org:{orgId}                       - Organization-wide updates
project:{projectId}               - Project updates
project:{projectId}:tickets       - Project ticket updates
chat:room:{roomId}                - Chat room messages
chat:group:{groupId}              - Chat group messages
chat:dm:{dmThreadId}              - Direct message thread
```

### Frontend Subscription Pattern

```typescript
// In org layout route
export function useOrgSubscription(orgId: string) {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || !orgId) return;
    socket.emit('join_org', { orgId });
    return () => socket.emit('leave_org', { orgId });
  }, [socket, isConnected, orgId]);
}
```

## TanStack Query Key Factories

Query keys MUST use factories for proper cache invalidation.

```typescript
// Define key factories
export const ticketKeys = {
  all: ['tickets'] as const,
  detail: (ticketId: string) => [...ticketKeys.all, ticketId] as const
};

export const projectKeys = {
  all: ['projects'] as const,
  board: (projectId: string) => [...projectKeys.all, projectId, 'board'] as const,
  tickets: (projectId: string) => [...projectKeys.all, projectId, 'tickets'] as const
};

// Use in mutations for invalidation
useMutation({
  mutationFn: (data) => createTicket(projectId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: projectKeys.board(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.tickets(projectId) });
  }
});
```

## Correlation ID Flow

Every request gets a unique correlation ID via AsyncLocalStorage for tracing.

```typescript
// Access anywhere in request lifecycle
const ctx = RequestContextService.getContext();
const correlationId = ctx?.requestId;

// Automatically attached to exceptions
export class ExceptionBase extends HttpException {
  constructor(...) {
    const ctx = RequestContextService.getContext();
    this.correlationId = ctx?.requestId || nanoid(6);
  }
}
```

## Module Creation Checklist

When creating a new backend module:

1. Create module structure:
   - `database/models/<entity>.model.ts` - TypeORM entity
   - `repository/<entity>.repository.ts` - Data access
   - `service/<entity>.service.ts` - Business logic
   - `presentation/<entity>.controller.ts` - REST endpoints
   - `presentation/dto/` - Request/response DTOs
   - `<feature>.module.ts` - Module definition

2. Import QueueModule if mutations need real-time sync
3. Inject EntityEventEmitter in service
4. Call `this.events.emit()` after every create/update/delete
5. Register module in `app.module.ts`
6. Add permission evaluation case in `PermissionEvaluatorService`

## Gotchas

1. **Entity events are mandatory** - Without `events.emit()`, real-time updates break silently
2. **Response validation is strict** - Missing DTO properties throw 500, not silent failure
3. **Repository returns instances** - No query builder chaining, use dedicated repository methods
4. **Guard order matters** - JwtAuthGuard must come before role/member guards
5. **Query keys must use factories** - Literal arrays break cache invalidation patterns
6. **WebSocket auth mirrors HTTP** - Same JWT validation, user attached to `socket.data.user`
