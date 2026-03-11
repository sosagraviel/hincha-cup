> **Load when:** Creating or refactoring routes, implementing auth guards, adding search params, or configuring data loading.

# Routing Patterns

## Router-Agnostic Principles

These patterns apply regardless of whether you use file-based routing (TanStack Router, Next.js App Router) or config-based routing (React Router, Wouter). The key principles are:

1. **Routes are thin** — ~15 lines max: extract params, render layout + feature page
2. **Routes are orchestrators** — they wire layouts and features together, not business logic containers
3. **Routes don't own state or data** — delegate to feature page components

## File-Based vs Config-Based Routing

**File-based** (route tree derived from file system):
```
routes/
  __root.tsx         → root layout
  index.tsx          → /
  _auth.tsx          → auth guard (pathless layout)
  _auth.dashboard.tsx     → /dashboard
  _auth.orders.$orderId.tsx → /orders/:orderId
```

**Config-based** (route tree declared in code):
```tsx
const routes = [
  { path: '/', element: <RootLayout />, children: [
    { index: true, element: <HomePage /> },
    { element: <AuthGuard />, children: [
      { path: 'dashboard', element: <DashboardRoute /> },
      { path: 'orders/:orderId', element: <OrderRoute /> },
    ]},
  ]},
];
```

Both approaches follow the same thin-route principle.

## Thin Route Pattern

Every route follows this structure:

```tsx
// Route component — thin orchestrator
function OrderRoute() {
  const { orderId } = useParams();   // Extract route params
  return (
    <DashboardLayout>
      <OrderDetailPage orderId={orderId} />
    </DashboardLayout>
  );
}
```

**Rules for thin routes**:
- Maximum ~15-20 lines
- Import ONLY: route utility, one layout, one feature page
- Extract params via the router's param hook
- Pass params to the feature page component
- No `useState`, no data-fetching hooks, no complex JSX
- No direct imports from atoms, molecules, or organisms

## Root Route / Layout

```tsx
// Root layout wrapping the entire app
function RootLayout() {
  const user = useCurrentUser();
  return (
    <div className="flex h-screen flex-col">
      <Header user={user} />
      <Outlet />   {/* or {children} depending on router */}
    </div>
  );
}
```

The root layout typically:
- Composes global providers (auth, theme, query client)
- Renders persistent chrome (header, navigation)
- Renders the outlet/children for nested routes

## Auth Guard (Pathless Layout)

A layout route that adds authentication behavior without contributing a URL segment:

```tsx
// Auth guard — redirects unauthenticated users
function AuthGuard() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;  // Render child routes if authenticated
}
```

All routes nested under the auth guard automatically require authentication. No URL segment is added.

## Nested Routes with Outlet

When a route has children, use `Outlet` (or `children`) to render nested content:

```tsx
// Parent route: /workspaces/:workspaceId
function WorkspaceRoute() {
  const { workspaceId } = useParams();
  return (
    <DashboardLayout>
      <WorkspacePage workspaceId={workspaceId}>
        <Outlet />  {/* Child routes render here */}
      </WorkspacePage>
    </DashboardLayout>
  );
}
```

The feature page accepts `children` for the outlet:

```tsx
// features/workspaces/WorkspacePage.tsx
interface WorkspacePageProps {
  workspaceId: string;
  children?: React.ReactNode;  // Outlet goes here
}

function WorkspacePage({ workspaceId, children }: WorkspacePageProps) {
  // ... page content
  return (
    <div>
      {/* page content */}
      {children}  {/* Nested route content appears here */}
    </div>
  );
}
```

## Search Params (URL State)

Validate and type search params with a schema:

```tsx
const searchSchema = z.object({
  page: z.number().optional().default(1),
  filter: z.string().optional(),
  sort: z.enum(['name', 'date', 'priority']).optional().default('date'),
});

// In the route component
function ItemListRoute() {
  const searchParams = useValidatedSearchParams(searchSchema);
  const { page, filter, sort } = searchParams;
  // All params are typed and validated
  return <ItemListPage page={page} filter={filter} sort={sort} />;
}
```

Depending on your router, search param validation may be built-in (TanStack Router's `validateSearch`) or require a custom hook wrapping `useSearchParams` + schema parsing.

## Navigation

```tsx
// Programmatic navigation
const navigate = useNavigate();
navigate('/workspaces/123/orders/456');
// Or with typed params (if supported by router):
navigate({ to: '/workspaces/$workspaceId', params: { workspaceId: ws.id } });

// Declarative navigation
<Link to={`/workspaces/${ws.id}`} className="text-blue-600 hover:underline">
  {ws.name}
</Link>
```

**Type-safe routers** (TanStack Router, Next.js) validate params and search at the type level. Mismatched route params cause compile errors. Config-based routers may require manual typing.

## Route-Level Data Loading (Advanced)

Some routers support pre-loading data before the component renders:

```tsx
// Loader runs before component renders
async function orderLoader({ params }) {
  return queryClient.ensureQueryData({
    queryKey: orderKeys.detail(params.orderId),
    queryFn: () => fetchOrder(params.orderId),
  });
}

function OrderRoute() {
  // Data is guaranteed to be in cache — safe to use suspense
  const { data: order } = useSuspenseQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => fetchOrder(orderId),
  });
  // No loading state needed — Suspense boundary handles it
}
```

**When to use loaders**:
- Data required for the entire page to render
- Avoiding loading spinners on navigation
- Prefetching on link hover

**When to skip loaders** (fetch in component):
- Data for a small section of the page
- Data that depends on user interaction (search, filter)
- Optional data (comments, related items)
