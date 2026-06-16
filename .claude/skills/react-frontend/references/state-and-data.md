> **Load when:** Designing state management, building data-fetching hooks, optimistic updates, cache invalidation, or deciding between client and server state.

# State Management & Data Layer

## State Categories

### 1. Server State → Dedicated Data-Fetching Library

This is ~80% of app state. Any data that comes from an API belongs in a data-fetching layer with caching, deduplication, and background refresh — not in `useState` or Context.

Popular choices: TanStack Query, SWR, Apollo Client, RTK Query, urql. The patterns below are library-agnostic.

**Query Hook Pattern**:

```tsx
// hooks/queries/orderQueries.ts

// Query keys — hierarchical arrays for fuzzy invalidation
const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...orderKeys.lists(), workspaceId] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  comments: (id: string) => [...orderKeys.detail(id), 'comments'] as const,
};

export function useOrdersQuery(workspaceId: string) {
  // Use your library's query hook
  return useQuery({
    queryKey: orderKeys.list(workspaceId),
    queryFn: () => fetchOrders(workspaceId),
  });
}

export function useCreateOrderMutation(workspaceId: string) {
  const cache = useCacheClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => createOrder(workspaceId, data),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: orderKeys.list(workspaceId) });
    },
  });
}
```

**Key factory benefits**:
- `invalidate(orderKeys.all)` → invalidates ALL order queries
- `invalidate(orderKeys.list(workspaceId))` → invalidates just that workspace's list
- Co-locates query key + query function (they are always coupled)

**Cache configuration guidelines**:

```tsx
// For data that changes rarely (user profile, settings)
{ staleTime: 5 * 60 * 1000 }  // 5 minutes

// For data that changes frequently (board, notifications)
{ staleTime: 30 * 1000 }  // 30 seconds

// For data that should always be fresh
{ staleTime: 0 }  // default — refetch on mount/focus
```

### 2. Form State → Form Library

Form state is managed entirely by the form library internally. Never mirror form fields in `useState`.

See [forms-and-validation.md](forms-and-validation.md) for details.

### 3. UI State → useState (local)

Dialogs, selections, toggles, and other ephemeral UI state belongs in the feature page component:

```tsx
function OrderBoardPage({ workspaceId }: { workspaceId: string }) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // ...
}
```

**Rules**:
- Keep UI state as close to its consumers as possible
- Lift state up only when siblings need to share it
- Never put UI state in the data-fetching cache or in Context

### 4. Auth/Theme State → Context

Global app state that rarely changes:

```tsx
// shared/context/auth.tsx
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  token: string;
  userProfile: UserProfile | null;
}

const AuthContext = createContext<AuthContextType>(/* ... */);
export const useAuth = () => useContext(AuthContext);
```

**Context rules**:
- Split by concern: separate `AuthContext`, `ThemeContext`, `LocaleContext`
- Memoize provider values to prevent unnecessary re-renders
- Use for data that changes infrequently (auth tokens, theme, locale)
- Never for frequently updating values (input text, scroll position)

### 5. Complex Shared Client State → Lightweight External Store (when needed)

If multiple unrelated components need to share rapidly-changing client state, and Context causes too many re-renders, use a lightweight external store (e.g., Zustand, Jotai, Valtio, or similar):

```tsx
// shared/stores/notification-store.ts
interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = createStore<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (n) => set((state) => ({
    notifications: [...state.notifications, n]
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id)
  })),
}));
```

**When to reach for an external store**:
- Multiple unrelated components consume the same rapidly-changing state
- Context re-render performance is measurably impacting UX
- You need fine-grained subscriptions (re-render only on selected slices)

## Optimistic Updates

For mutations where instant UI feedback matters:

```tsx
export function useUpdateOrderMutation(orderId: string, workspaceId: string) {
  const cache = useCacheClient();

  return useMutation({
    mutationFn: (data: UpdateOrderRequest) => updateOrder(orderId, data),

    // Optimistically update the cache
    onMutate: async (newData) => {
      // Cancel outgoing refetches to prevent overwriting optimistic update
      await cache.cancelQueries({ queryKey: orderKeys.detail(orderId) });

      // Snapshot current value for rollback
      const previousOrder = cache.getQueryData(orderKeys.detail(orderId));

      // Optimistically update
      cache.setQueryData(orderKeys.detail(orderId), (old: Order) => ({
        ...old,
        ...newData,
      }));

      return { previousOrder };
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (context?.previousOrder) {
        cache.setQueryData(orderKeys.detail(orderId), context.previousOrder);
      }
    },

    // Always refetch to ensure consistency
    onSettled: () => {
      cache.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      cache.invalidateQueries({ queryKey: orderKeys.list(workspaceId) });
    },
  });
}
```

## Cache Invalidation Strategies

| Scenario | Strategy |
|---------|---------|
| Created an item | Invalidate the list query |
| Updated an item | Invalidate both the item detail AND the list |
| Deleted an item | Invalidate the list, remove the detail from cache |
| Moved an item between lists | Invalidate both source and destination lists |
| Bulk operation | Invalidate at the domain level (`queryKey: domainKeys.all`) |

**Use `onSettled`** (not `onSuccess`) for invalidation — ensures it runs even if the mutation response parsing fails.

## API Client Pattern

```tsx
// api/orders.ts
import { httpClient } from '@/shared/lib/http';
import type { Order, CreateOrderRequest } from './types';

export async function fetchOrders(workspaceId: string): Promise<Order[]> {
  const response = await httpClient.get(`/workspaces/${workspaceId}/orders`);
  return response.data;
}

export async function createOrder(workspaceId: string, data: CreateOrderRequest): Promise<Order> {
  const response = await httpClient.post(`/workspaces/${workspaceId}/orders`, data);
  return response.data;
}
```

**Rules**:
- One file per domain
- Functions are plain async — no hooks, no React
- Consistent naming: `fetch{Domain}`, `create{Domain}`, `update{Domain}`, `delete{Domain}`
- Return typed data (not raw HTTP response)
- No error handling — let the data-fetching library handle retries, let error boundaries catch failures

## Types

```tsx
// api/types.ts — shared across the entire app

// Enums for domain values
export enum OrderStatus { DRAFT = 'DRAFT', PENDING = 'PENDING', PROCESSING = 'PROCESSING', COMPLETED = 'COMPLETED' }
export enum Priority { CRITICAL = 'CRITICAL', HIGH = 'HIGH', MEDIUM = 'MEDIUM', LOW = 'LOW' }

// Response types (what the API returns)
export interface Order {
  id: string;
  title: string;
  description?: string;
  status: OrderStatus;
  priority: Priority;
  assignee?: User;
  createdAt: string;
}

// Request types (what we send to the API)
export interface CreateOrderRequest {
  title: string;
  description?: string;
  status?: OrderStatus;
  priority?: Priority;
}
```

**Naming**: `{Domain}` for response types, `Create{Domain}Request` / `Update{Domain}Request` for mutations.
