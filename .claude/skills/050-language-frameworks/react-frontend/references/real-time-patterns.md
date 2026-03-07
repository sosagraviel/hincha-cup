> **Load when:** Adding real-time updates, integrating WebSockets with data-fetching cache, designing event-driven UI, or building collaborative features.

# Real-Time Data Patterns

## Architecture Overview

Real-time updates combine two complementary systems:

1. **Initial fetch** — Standard HTTP request (REST/GraphQL) fills the cache on mount
2. **Live subscription** — WebSocket connection receives change events and keeps the cache fresh

The data-fetching cache (TanStack Query, SWR, Apollo Client, etc.) remains the **single source of truth** for the UI. WebSocket events are **cache updaters**, not a parallel data layer.

```
┌──────────────────────────────────────────────────────┐
│  Feature Page                                         │
│  ┌──────────────────┐  ┌───────────────────────────┐ │
│  │  useOrdersQuery() │  │  useWebSocket()           │ │
│  │  (initial fetch)  │  │  (live subscription)      │ │
│  └────────┬─────────┘  └────────────┬──────────────┘ │
│           │                          │                │
│           ▼                          ▼                │
│  ┌───────────────────────────────────────────────────┐│
│  │             Data-Fetching Cache                    ││
│  │  (single source of truth for all server data)     ││
│  └───────────────────────────────────────────────────┘│
│           │                                           │
│           ▼                                           │
│  ┌───────────────────────────────────────────────────┐│
│  │                    UI Render                       ││
│  └───────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## Cache Update Strategies

**CRITICAL**: The whole point of WebSocket is to **avoid refetching**. Direct cache updates are the primary pattern. Only refetch when truly needed for data consistency.

### Strategy 1: Direct Cache Update (PRIMARY PATTERN)

The server sends the full updated entity. The client writes it directly into the cache — **no HTTP request**.

```tsx
// Server sends: { type: 'ENTITY_UPDATED', entity: 'order', id: '123', data: { ... } }
// Client does:
cache.setQueryData(['orders', '123'], (old: any) =>
  old ? { ...old, ...message.data } : message.data
);
```

**Pros**: Instant UI update with zero network latency, scales to thousands of concurrent users.
**Cons**: Server must push full payloads; requires careful cache key management.

### Strategy 2: Invalidation (FALLBACK FOR COMPLEX LISTS)

For operations that affect ordering/filtering (e.g., reordering a board, complex list mutations), invalidate the list query to trigger a background refetch.

```tsx
// Server sends: { type: 'ENTITY_CREATED', entity: 'order', id: '123' }
// Client does:
cache.invalidateQueries({
  queryKey: ['orders'],
  exact: false,
  refetchType: 'active', // Only refetch queries currently in use
});
```

**Pros**: Handles complex list logic (sorting, filtering, pagination).
**Cons**: Extra HTTP round-trip — defeats WebSocket purpose if overused.

### Hybrid Approach (RECOMMENDED)

```tsx
function handleEntityChange(cache: QueryClient, message: WebSocketMessage) {
  switch (message.type) {
    case 'ENTITY_CREATED':
      // For creates: invalidate list queries (ordering unknown)
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active',
      });
      break;

    case 'ENTITY_UPDATED':
      // Direct update for detail queries (instant feedback)
      if (message.data) {
        cache.setQueryData([message.entity, message.id], (old: any) =>
          old ? { ...old, ...message.data } : message.data
        );
      }
      // Invalidate list queries ONLY if they're active (e.g., board view is open)
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active',
      });
      break;

    case 'ENTITY_DELETED':
      // Remove from detail cache
      cache.removeQueries({ queryKey: [message.entity, message.id] });
      // Invalidate list queries
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active',
      });
      break;
  }
}
```

### staleTime Configuration

When WebSocket events drive cache freshness, increase `staleTime` to prevent redundant background refetches:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // With WebSocket: data stays fresh until an event invalidates it
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Don't use Infinity — we still want fallback refetches on reconnection
    },
  },
});
```

## Message Protocol

### Shared Message Schema

Define this in a shared package so both backend and frontend use the same types:

```tsx
// packages/shared/src/dtos/websocket/

interface WebSocketMessage {
  /** Unique message ID for deduplication */
  messageId: string;

  /** Operation type */
  type: 'ENTITY_CREATED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED';

  /** Entity/resource type (maps to query key prefix) */
  entity: string;

  /** Specific entity ID */
  id: string;

  /** Full or partial entity data (REQUIRED for ENTITY_UPDATED/CREATED) */
  data?: Record<string, unknown>;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Parent entity context for nested invalidation (e.g. projectId for tickets) */
  parentId?: string;

  /** Parent entity type (e.g. 'projects' when entity is 'tickets') */
  parentEntity?: string;
}
```

**Design decisions:**
- `entity` maps directly to query key prefixes (e.g., `'orders'` → `['orders']`)
- `data` should be present for updates/creates to enable direct cache writes
- `messageId` enables deduplication after reconnection replays

## Frontend Architecture

### Socket Provider (App-Level)

**CRITICAL**: Do NOT reconnect when the auth token refreshes. The socket connection should persist across token rotations.

```tsx
// shared/context/socket/socket-context.tsx
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { token, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  // Connect once when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out — disconnect
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // User is authenticated but socket doesn't exist — connect
    if (!socketRef.current && token) {
      const newSocket = io(SOCKET_URL, {
        auth: { authorization: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5, // Jitter to prevent thundering herd
      });

      newSocket.on('connect', () => setIsConnected(true));
      newSocket.on('disconnect', () => setIsConnected(false));

      socketRef.current = newSocket;
      setSocket(newSocket);
    }

    return () => {
      // Only disconnect on unmount, not on token change
    };
  }, [isAuthenticated]); // ONLY depend on isAuthenticated, NOT token

  // Update auth token WITHOUT reconnecting
  useEffect(() => {
    if (socketRef.current && token && isAuthenticated) {
      // Update the auth header for future reconnections
      socketRef.current.io.opts.auth = { authorization: `Bearer ${token}` };
    }
  }, [token, isAuthenticated]);

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
```

### Refetch on Recovery Events

**CRITICAL**: Refetch everything when the client may have missed WebSocket messages:

```tsx
// hooks/useWebSocketSubscription.ts
export function useWebSocketSubscription() {
  const { socket, isConnected } = useSocket();
  const cache = useQueryClient();
  const lastDisconnectTime = useRef<number>(0);

  // Refetch everything after extended disconnection
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      lastDisconnectTime.current = Date.now();
    };

    const handleReconnect = () => {
      const disconnectDuration = Date.now() - lastDisconnectTime.current;

      // Disconnected > 30 seconds: refetch all active queries
      if (disconnectDuration > 30 * 1000) {
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
    };
  }, [socket, cache]);

  // Refetch on browser wake from sleep
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // Tab became visible — refetch to catch any missed updates
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cache, isConnected]);

  // Refetch on network reconnection
  useEffect(() => {
    const handleOnline = () => {
      if (isConnected) {
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [cache, isConnected]);

  // Handle WebSocket messages (NORMAL OPERATION — NO REFETCH)
  useEffect(() => {
    if (!socket) return;

    const handleEntityChange = (message: WebSocketMessage) => {
      handleEntityChangeHelper(cache, message);
    };

    socket.on('entity_change', handleEntityChange);

    return () => {
      socket.off('entity_change', handleEntityChange);
    };
  }, [socket, cache]);
}

// Mount in the root layout:
function RootLayout() {
  useWebSocketSubscription();
  return <Outlet />;
}
```

### Per-Entity Subscription (Optional Enhancement)

When the backend supports rooms/channels, pages can subscribe to specific entities to reduce noise:

```tsx
// hooks/useEntitySubscription.ts
export function useEntitySubscription(
  entity: string,
  options?: { id?: string; enabled?: boolean }
) {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || options?.enabled === false) return;

    // Tell server to join this entity's room
    socket.emit('subscribe', { entity, id: options?.id });

    return () => {
      socket.emit('unsubscribe', { entity, id: options?.id });
    };
  }, [socket, isConnected, entity, options?.id, options?.enabled]);
}

// Usage in a feature page:
function OrderBoardPage({ workspaceId }: Props) {
  useEntitySubscription('orders', { enabled: true });

  const { data: board } = useBoardQuery(workspaceId);
  // ...
}
```

### Client-Side Batching

When many entities update simultaneously (e.g., bulk reorder), debounce invalidations to prevent UI thrashing:

```tsx
// hooks/useBatchedInvalidation.ts
export function useBatchedInvalidation(debounceMs = 100) {
  const cache = useQueryClient();
  const pending = useRef(new Set<string>());
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(() => {
    for (const entity of pending.current) {
      cache.invalidateQueries({ queryKey: [entity], refetchType: 'active' });
    }
    pending.current.clear();
  }, [cache]);

  const invalidate = useCallback((entity: string) => {
    pending.current.add(entity);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(flush, debounceMs);
  }, [flush, debounceMs]);

  return invalidate;
}
```

## Backend Architecture

### Gateway Pattern

The WebSocket gateway is a **thin transport layer**. Business modules never interact with sockets directly — they emit domain events via `EventEmitter2`, and the gateway listens and broadcasts.

```
Service (e.g., OrderService)
  │
  │  eventEmitter.emit('entity.changed', { ... })
  │
  ▼
EventsGateway  @OnEvent('entity.changed')
  │
  │  server.to(`org:${orgId}`).emit('entity_change', message)
  │
  ▼
Connected Clients (via Socket.IO rooms)
```

### Gateway Implementation

```tsx
@WebSocketGateway({ cors: { origin: '*' } })
@Injectable()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const { orgId, user } = client.data;
    if (!orgId) { client.disconnect(); return; }

    // Join organization room (all entity changes for this org)
    client.join(`org:${orgId}`);
    // Join user room (targeted notifications)
    client.join(`user:${user.id}`);
  }

  handleDisconnect(client: Socket) {
    // Socket.IO handles room cleanup automatically
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, data: { entity: string; id?: string }) {
    const room = data.id ? `${data.entity}:${data.id}` : data.entity;
    client.join(room);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, data: { entity: string; id?: string }) {
    const room = data.id ? `${data.entity}:${data.id}` : data.entity;
    client.leave(room);
  }

  @OnEvent('entity.changed')
  handleEntityChanged(payload: InternalEntityChangePayload) {
    const message: WebSocketMessage = {
      messageId: randomUUID(),
      type: payload.type,
      entity: payload.entity,
      id: payload.id,
      data: payload.data,
      parentId: payload.parentId,
      parentEntity: payload.parentEntity,
      timestamp: new Date().toISOString(),
    };
    this.server.to(`org:${payload.orgId}`).emit('entity_change', message);
  }
}
```

### Service Integration (Decoupled via Events)

Services emit domain events. They don't know about WebSockets:

```tsx
// In any service (orders, tickets, projects, etc.)
@Injectable()
export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async updateOrder(orgId: string, id: string, dto: UpdateOrderDto) {
    const order = await this.repository.update(id, dto);

    // Emit domain event — gateway picks it up
    this.eventEmitter.emit('entity.changed', {
      orgId,
      type: 'ENTITY_UPDATED',
      entity: 'orders',
      id,
      data: order,
    });

    return order;
  }
}
```

### Authentication (Socket.IO Adapter)

Extend the IoAdapter to validate JWT tokens on WebSocket connections:

```tsx
export class AuthenticatedSocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: any): Server {
    const server = super.createIOServer(port, options);

    server.use(async (socket, next) => {
      const { authorization } = socket.handshake.auth;
      const token = authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      try {
        const decoded = await validateToken(token);
        const user = await findUserByExternalId(decoded.sub);
        socket.data.user = user;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    return server;
  }
}
```

## Resilience Patterns

### Reconnection with Jitter

Socket.IO handles reconnection automatically. Configure with jitter to prevent thundering herd:

```tsx
const socket = io(url, {
  reconnection: true,
  reconnectionDelay: 1000,       // Start with 1s
  reconnectionDelayMax: 30000,   // Cap at 30s
  randomizationFactor: 0.5,      // ±50% jitter
});
```

### Deduplication

After reconnection, the server may replay messages. Use `messageId` to prevent double-processing:

```tsx
const processedMessages = new Set<string>();

function handleMessage(message: WebSocketMessage) {
  if (processedMessages.has(message.messageId)) return;
  processedMessages.add(message.messageId);

  // Limit set size to prevent memory leak
  if (processedMessages.size > 1000) {
    const entries = [...processedMessages];
    processedMessages.clear();
    entries.slice(-500).forEach(id => processedMessages.add(id));
  }

  // Process message...
}
```

## File Organization

```
Frontend:
  shared/context/socket/
    socket-context.tsx          # SocketProvider + useSocket hook
  hooks/
    useWebSocketSubscription.ts # Global subscription (mounted at root)
    useEntitySubscription.ts    # Per-entity subscription (optional)
    useBatchedInvalidation.ts   # Debounced cache invalidation

Backend:
  modules/websocket/
    websocket.module.ts         # Module definition
    websocket.gateway.ts        # Gateway (connection mgmt, rooms, broadcasting)
    websocket.adapter.ts        # JWT authentication adapter
    websocket.types.ts          # Internal event payload types
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Do This Instead |
|-------------|---------------|-----------------|
| **Reconnect on token refresh** | Auth tokens rotate every 60-90s, causing constant disconnections | Update `socket.io.opts.auth` without disconnecting |
| **Invalidate queries on every WS message** | Defeats the purpose of WebSocket — causes constant HTTP requests | Use direct cache updates (setQueryData) as primary pattern |
| **No refetch on reconnect** | Client misses messages during disconnection | Invalidate all active queries after extended disconnect |
| Separate state for WebSocket data | Two sources of truth, data drift | Use WebSocket to update the data-fetching cache |
| `useState` for WebSocket messages | No caching, no dedup, no background refresh | Invalidate/update the query cache |
| Direct socket access in components | Tight coupling, hard to test | Use the socket context + global handler |
| Business logic in the gateway | Couples transport to domain | Emit events from services, listen in gateway |
| Per-component socket connections | Resource waste, connection explosion | One connection per app, room-based routing |
| No jitter on reconnection | Thundering herd on server recovery | Use `randomizationFactor` in socket config |

## Decision Matrix: When to Refetch vs When to Use WebSocket

| Event | Action | Why |
|-------|--------|-----|
| **WebSocket message arrives** | Direct cache update (`setQueryData`) | Instant UI update, zero latency |
| **WebSocket disconnects** | Do nothing | Socket.IO will reconnect automatically |
| **WebSocket reconnects (< 30s)** | Do nothing | Messages likely buffered, no missed events |
| **WebSocket reconnects (> 30s)** | Refetch all active queries | Likely missed messages during long disconnect |
| **Tab visibility changes (hidden → visible)** | Refetch all active queries | May have missed events while tab was suspended |
| **Network offline → online** | Refetch all active queries | Catch up on missed events |
| **Browser wakes from sleep** | Refetch all active queries (via visibility change) | Long suspend period |
| **User navigates to page** | Initial HTTP fetch only | First load, cache is empty |
