# Data Fetching Deep Dive

## RSC `fetch` Caching

Next.js extends the native `fetch` API with caching semantics. All fetch calls within RSC are automatically deduplicated within a single render pass.

### Cache Options

```ts
// 1. Static — cached indefinitely (build-time or first request)
//    Equivalent to Next.js 12 getStaticProps
const data = await fetch('https://api.example.com/kpis', {
  cache: 'force-cache',
});

// 2. ISR — revalidate every N seconds after first request
//    Equivalent to getStaticProps with revalidate
const data = await fetch('https://api.example.com/kpis', {
  next: { revalidate: 60 },
});

// 3. Dynamic — no cache, fresh on every request
//    Equivalent to getServerSideProps
const data = await fetch('https://api.example.com/kpis', {
  cache: 'no-store',
});

// 4. Tag-based ISR — revalidate on demand via revalidateTag()
const data = await fetch('https://api.example.com/kpis', {
  next: { tags: ['kpis', 'portfolio-123'] },
});
```

### On-Demand Revalidation

```ts
// In a Server Action or Route Handler
import { revalidateTag, revalidatePath } from 'next/cache';

// Invalidate all fetches tagged with 'kpis'
revalidateTag('kpis');

// Invalidate a specific path's full-route cache
revalidatePath('/dashboard');
revalidatePath('/companies/[id]', 'page'); // specific dynamic segment
```

### Route-Level Caching Overrides

```ts
// Force entire route to be dynamic (disables all caching)
export const dynamic = 'force-dynamic';

// Force entire route to be static
export const dynamic = 'force-static';

// Revalidation interval for the entire route
export const revalidate = 3600; // 1 hour

// Set runtime
export const runtime = 'edge'; // or 'nodejs' (default)
```

---

## Server Actions

Server Actions are async functions that run on the server, callable from both RSC and Client Components.

### Defining Server Actions

```ts
// Option 1: Inline in a Server Component (single directive)
async function DashboardPage() {
  async function refreshKpis() {
    'use server';
    revalidateTag('kpis');
  }
  return <form action={refreshKpis}><button>Refresh</button></form>;
}

// Option 2: Separate file (module-level directive)
// src/features/approve-insight/api/approve-insight-api.ts
'use server';

import { revalidateTag } from 'next/cache';

export async function approveInsight(insightId: string): Promise<void> {
  await db.insights.update({
    where: { id: insightId },
    data: { status: 'approved', approvedAt: new Date() },
  });
  revalidateTag('insights');
}

export async function rejectInsight(insightId: string, reason: string): Promise<void> {
  await db.insights.update({
    where: { id: insightId },
    data: { status: 'rejected', rejectionReason: reason },
  });
  revalidateTag('insights');
}
```

### Calling Server Actions from Client Components

```tsx
'use client';

import { useTransition } from 'react';
import { approveInsight } from '@/features/approve-insight';

export function ApproveButton({ insightId }: { insightId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      await approveInsight(insightId);
    });
  }

  return (
    <button onClick={handleApprove} disabled={isPending}>
      {isPending ? 'Approving...' : 'Approve'}
    </button>
  );
}
```

### Form Actions (Progressive Enhancement)

Server Actions work with HTML forms — they function without JavaScript:

```tsx
// Works even with JS disabled
async function InsightCard({ insight }: { insight: Insight }) {
  const approveWithId = approveInsight.bind(null, insight.id);
  return (
    <article>
      <h2>{insight.title}</h2>
      <form action={approveWithId}>
        <button type="submit">Approve</button>
      </form>
    </article>
  );
}
```

### Server Action with `useActionState`

```tsx
'use client';

import { useActionState } from 'react';
import { createInsight } from '@/features/create-insight';

type State = { error?: string; success?: boolean };

export function CreateInsightForm() {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    createInsight,
    {}
  );

  return (
    <form action={formAction}>
      <input name="title" required />
      {state.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  );
}
```

---

## TanStack Query Integration with RSC

Use RSC to prefetch data on the server and hydrate the TanStack Query cache on the client — eliminates loading spinners for initial data while keeping client-side caching.

### Setup: QueryClient Factory

```ts
// src/shared/lib/query-client.ts
import { QueryClient, isServer } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient(); // Always new on server
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient(); // Singleton on client
  }
  return browserQueryClient;
}
```

### Providers Wrapper

```tsx
// src/shared/ui/Providers.tsx
'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Prefetch Pattern in RSC

```tsx
// src/widgets/kpi-dashboard/ui/KpiDashboard.tsx (RSC)
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';
import { fetchKpis } from '@/entities/kpi/api/kpi-api';
import { KPI_QUERY_KEYS } from '@/entities/kpi/model/constants';
import { KpiList } from '@/entities/kpi/ui/KpiList';

export async function KpiDashboard() {
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: KPI_QUERY_KEYS.list(),
    queryFn: fetchKpis,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KpiList />
    </HydrationBoundary>
  );
}
```

```tsx
// src/entities/kpi/ui/KpiList.tsx (Client Component)
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchKpis } from '@/entities/kpi/api/kpi-api';
import { KPI_QUERY_KEYS } from '@/entities/kpi/model/constants';

export function KpiList() {
  const { data: kpis } = useQuery({
    queryKey: KPI_QUERY_KEYS.list(),
    queryFn: fetchKpis,
    // Data is already in cache from RSC prefetch — no loading state on first render
  });

  return (
    <ul>
      {kpis?.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
    </ul>
  );
}
```

### Query Key Constants

```ts
// src/entities/kpi/model/constants.ts
export const KPI_QUERY_KEYS = {
  all: ['kpis'] as const,
  list: (filters?: KpiFilters) => [...KPI_QUERY_KEYS.all, 'list', filters] as const,
  detail: (id: string) => [...KPI_QUERY_KEYS.all, 'detail', id] as const,
};
```

---

## Optimistic Updates

```tsx
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approveInsight } from '@/features/approve-insight';
import { INSIGHT_QUERY_KEYS } from '@/entities/insight/model/constants';

export function useApproveInsightMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (insightId: string) => approveInsight(insightId),
    onMutate: async (insightId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: INSIGHT_QUERY_KEYS.all });

      // Snapshot previous value
      const previous = queryClient.getQueryData(INSIGHT_QUERY_KEYS.list());

      // Optimistically update
      queryClient.setQueryData(INSIGHT_QUERY_KEYS.list(), (old: Insight[]) =>
        old?.map(insight =>
          insight.id === insightId
            ? { ...insight, status: 'approved' }
            : insight
        )
      );

      return { previous };
    },
    onError: (_err, _insightId, context) => {
      // Roll back on error
      if (context?.previous) {
        queryClient.setQueryData(INSIGHT_QUERY_KEYS.list(), context.previous);
      }
    },
    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: INSIGHT_QUERY_KEYS.all });
    },
  });
}
```

---

## When to Use Each Pattern

| Scenario | Pattern |
|----------|---------|
| Data needed at page load, no interactivity required | RSC `async/await` with `fetch` |
| Data needed at page load, interactive after (filtering, sorting) | RSC prefetch + TanStack Query hydration |
| Mutation triggered by user | Server Action via `useTransition` or `useActionState` |
| Mutation with optimistic UI | TanStack Query `useMutation` with `onMutate` |
| Real-time data after initial load | TanStack Query + WebSocket cache updater |
| Third-party client-only SDK | Client Component with `useQuery` (no RSC prefetch) |
