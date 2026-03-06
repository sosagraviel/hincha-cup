---
name: react-frontend
description: >
  Enterprise React frontend engineering skill covering project architecture, atomic design,
  component composition, state management, data fetching, schema-driven forms, routing,
  performance optimization, testing, and accessibility. Use when asked to create, refactor,
  plan, review, or implement any React frontend code. Covers greenfield projects, existing
  codebase improvements, and architectural decisions. Technology-agnostic patterns that work
  with any router, data layer, or styling solution.
version: 1.1.0
category: frontend-engineering
triggers:
  - react
  - frontend
  - component
  - atomic design
  - organism
  - molecule
  - feature
  - route
  - form
  - state management
  - accessibility
  - performance
  - testing
  - code review
  - refactor frontend
  - project structure
  - websocket
  - real-time
  - real time
  - live updates
  - socket
tags:
  - react
  - typescript
  - atomic-design
  - architecture
  - composition
  - testing
  - accessibility
  - real-time
  - websocket
author: liveonit Engineering
license: MIT
---

# React Frontend Engineering

Enterprise-grade React development standard for teams of any size. This skill guides research, planning, implementation, and review of React frontend projects — regardless of the specific router, data-fetching library, or styling solution used.

## When to Apply

- Creating new React components, features, pages, or entire projects
- Refactoring existing frontend code for better architecture
- Planning frontend tasks or reviewing pull requests
- Deciding where code should live (which folder, which layer)
- Choosing patterns for state, forms, routing, or API integration
- Investigating performance, accessibility, or testing improvements

## Architecture Principles

1. **Feature-driven organization** — Code is grouped by business domain, not technical layer
2. **Atomic component hierarchy** — atoms → molecules → organisms → layouts → features
3. **Composition over configuration** — Use `children` and compound components, not prop-heavy APIs
4. **Generic reusables, domain-specific features** — Shared components know NOTHING about business logic
5. **Thin routes** — Routes are ~15 lines: extract params, render layout + feature page
6. **Schema-driven forms** — Validation schemas are the single source of truth for types AND validation
7. **Dedicated server state management** — API data belongs in a data-fetching layer (cache, dedup, background refresh), never in plain local state or global stores
8. **Co-location** — Keep related code together; extract to shared only when reused by multiple features

## Project Structure (Quick Reference)

```
src/
  api/                    # API client functions + shared types/enums
    types.ts              # Enums, request/response interfaces (shared across app)
    {domain}.ts           # One file per domain (e.g., users.ts, products.ts)

  components/             # GENERIC reusable UI (no business logic)
    atoms/                # Primitive building blocks (FormField, Avatar, Badge)
    molecules/            # Atom compositions (SearchInput, SchemaForm, ConfirmDialog)
    organisms/            # Complex UI sections (DataGrid, FormDialog, DetailPanel)
    layouts/              # Page shells (DashboardLayout, AuthLayout)

  features/               # DOMAIN-SPECIFIC pages and compositions
    {feature}/            # One folder per business domain
      {Feature}Page.tsx   # Page component (owns data fetching, state, renders organisms)
      {Domain}Card.tsx    # Domain-specific card (composes generic organisms)
      schemas.ts          # Validation schemas for this feature's forms
      field-configs.ts    # Form field configurations
      constants.ts        # Feature-specific constants (colors, labels, mappings)
      index.ts            # Public API (barrel export for the feature)

  hooks/                  # Custom hooks
    queries/              # Data-fetching hooks (one file per domain)
      {domain}Queries.ts  # Query + mutation hooks

  routes/                 # Router configuration (file-based or config-based)
    ...                   # Thin route files: layout + feature + params

  shared/                 # Cross-cutting infrastructure
    context/              # React context providers (auth, theme, locale)
    hooks/                # Shared hooks (useDebounce, useMediaQuery)
    lib/                  # Pre-configured libraries (HTTP client, constants, utils)
    ui/                   # Base UI primitives (button, input, dialog, sheet)
```

> **Decision rule**: "Where does this code go?"
>
> - Is it a UI primitive with NO business logic? → `components/{atom|molecule|organism}`
> - Does it know about a specific domain? → `features/{domain}/`
> - Is it an API call? → `api/{domain}.ts`
> - Is it a data-fetching hook? → `hooks/queries/{domain}Queries.ts`
> - Is it a route? → `routes/` (keep it thin)
> - Is it shared infrastructure? → `shared/`

See [project-structure.md](references/project-structure.md) for detailed rules and examples.

## Component Hierarchy (Atomic Design)

| Layer         | Purpose                     | Business Logic                             | Examples                                           |
| ------------- | --------------------------- | ------------------------------------------ | -------------------------------------------------- |
| **Atoms**     | Smallest building blocks    | None                                       | Avatar, FormField, EmptyState, Badge, IconButton   |
| **Molecules** | Atom compositions           | None                                       | SearchInput, SchemaForm, UserAvatar, ConfirmDialog |
| **Organisms** | Complex UI sections         | None — configured via props/children       | DataGrid, CardGrid, FormDialog, DetailPanel        |
| **Layouts**   | Page shells                 | None                                       | DashboardLayout, AuthLayout, SidebarLayout         |
| **Features**  | Domain pages + compositions | YES — owns data fetching, state, mutations | ProductListPage, CreateOrderDialog, UserCard       |

### Critical Rules

- **Atoms, molecules, organisms, and layouts NEVER import from `features/`**
- **Organisms are GENERIC** — they accept `children`, schemas, field configs. They never reference any specific domain
- **Features compose organisms** with domain-specific data, schemas, and components
- **Routes import ONLY from `layouts/` and `features/`** — never from atoms, molecules, or organisms directly

### Composition Pattern

```tsx
// WRONG — organism knows about a specific domain
function CreateOrderDialog() {
  const mutation = useCreateOrder(); // Domain logic inside organism!
  return <Dialog>...</Dialog>;
}

// RIGHT — generic organism + domain feature wrapper
// organisms/FormDialog (generic — knows nothing about orders)
function FormDialog<T>({ schema, fields, onSubmit, ...props }) {
  return (
    <Dialog>
      <SchemaForm schema={schema} fields={fields} onSubmit={onSubmit} />
    </Dialog>
  );
}

// features/orders/CreateOrderDialog (domain-specific wrapper)
function CreateOrderDialog({ open, onOpenChange }) {
  const mutation = useCreateOrder();
  return (
    <FormDialog
      schema={createOrderSchema}
      fields={createOrderFields}
      defaultValues={{ status: 'draft' }}
      onSubmit={data =>
        mutation.mutate(data, { onSuccess: () => onOpenChange(false) })
      }
    />
  );
}
```

See [component-architecture.md](references/component-architecture.md) for the full hierarchy with examples.

## State Management

| State Type                         | Recommended Approach                       | Where It Lives         |
| ---------------------------------- | ------------------------------------------ | ---------------------- |
| **Server data** (API responses)    | Dedicated data-fetching library with cache | `hooks/queries/`       |
| **Form state**                     | Form library with schema validation        | Feature component      |
| **UI state** (dialogs, selections) | `useState` / `useReducer`                  | Feature page component |
| **Auth/theme/locale**              | React Context                              | `shared/context/`      |
| **Complex shared client state**    | Lightweight external store                 | `shared/stores/`       |

**Rule**: If data comes from an API, it belongs in a data-fetching layer with caching and deduplication — not in Context, not in a global store, not in `useState`.

See [state-and-data.md](references/state-and-data.md) for key factories, optimistic updates, and cache invalidation patterns.

## Routing (Thin Routes)

Route files are **orchestrators**, not business logic containers.

```tsx
// CORRECT — thin route (~15 lines)
function ProductRoute() {
  const { productId } = useParams();
  return (
    <DashboardLayout>
      <ProductDetailPage productId={productId} />
    </DashboardLayout>
  );
}
```

**Route responsibilities**: extract params, validate search params, render layout + feature.
**NOT route responsibilities**: data fetching, state management, business logic, complex JSX.

See [routing-patterns.md](references/routing-patterns.md) for loaders, search params, and auth guards.

## API & Data Layer

### API Functions (`api/{domain}.ts`)

```tsx
// Pure async functions — no hooks, no framework code
export async function fetchProducts(categoryId: string): Promise<Product[]> {
  const response = await httpClient.get(`/categories/${categoryId}/products`);
  return response.data;
}
```

### Data-Fetching Hooks (`hooks/queries/{domain}Queries.ts`)

```tsx
// Key factory at the top of each file
export const productKeys = {
  all: ['products'] as const,
  list: (categoryId: string) =>
    [...productKeys.all, 'list', categoryId] as const,
  detail: (id: string) => [...productKeys.all, id] as const
};

export function useProductsQuery(categoryId: string) {
  return useQuery({
    queryKey: productKeys.list(categoryId),
    queryFn: () => fetchProducts(categoryId)
  });
}
```

**Naming**: `use{Domain}Query` / `useCreate{Domain}Mutation`
**Cache keys**: Hierarchical arrays via key factories — enables fuzzy invalidation.

See [state-and-data.md](references/state-and-data.md) for the full pattern.

## Forms (Schema-Driven)

**Three files per form**:

1. **`schemas.ts`** — Validation schema (source of truth for types + validation rules)
2. **`field-configs.ts`** — Field definitions driving UI rendering
3. **Feature component** — Wires schema + fields + mutation into a generic dialog/form organism

```tsx
// schemas.ts
export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required')
});
export type CreateItemFormValues = z.infer<typeof createItemSchema>;

// field-configs.ts
export const createItemFields: FieldConfig<CreateItemFormValues>[] = [
  { name: 'name', label: 'Name', type: 'text', placeholder: 'Enter a name...' },
  { name: 'description', label: 'Description', type: 'textarea' },
  {
    name: 'category',
    label: 'Category',
    type: 'select',
    options: categoryOptions
  }
];
```

See [forms-and-validation.md](references/forms-and-validation.md) for multi-step forms, cross-field validation, and dynamic schemas.

## Quick Reference: Creating New Things

### New Feature

1. Create `src/features/{name}/`
2. Create `{Name}Page.tsx` — page component with data fetching + state
3. Create domain components (cards, badges, dialogs) inside the feature
4. Create `schemas.ts` + `field-configs.ts` if forms are needed
5. Create `index.ts` barrel export
6. Add API functions in `src/api/{name}.ts`
7. Add data-fetching hooks in `src/hooks/queries/{name}Queries.ts`
8. Add thin route in `src/routes/`

### New Reusable Component

1. Determine layer: atom (primitive) → molecule (atom composition) → organism (complex section)
2. Create `src/components/{layer}/{Name}/index.tsx`
3. **Ensure it has ZERO domain imports** — no features, no specific types
4. Export from the layer's `index.ts` barrel
5. Accept `children`, `className`, and generic props — compose at the feature level

### New Form

1. Define validation schema in `features/{domain}/schemas.ts`
2. Define field config in `features/{domain}/field-configs.ts`
3. Create wrapper component that connects schema + fields + mutation to a generic form organism
4. Use `defaultValues` on the form (not defaults in the schema)

## Anti-Patterns

| Anti-Pattern                        | Why It's Wrong                                       | Do This Instead                        |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Domain logic in organisms           | Prevents reuse across features                       | Move to feature wrapper                |
| Fat routes (>20 lines)              | Mixes routing with business logic                    | Extract to feature page component      |
| `useState` for API data             | No caching, deduplication, or background refresh     | Use a data-fetching library            |
| Type assertions (`as`)              | Bypasses type safety                                 | Use type guards or `satisfies`         |
| Manual form state with `useState`   | Reinvents validation, error handling, dirty tracking | Use a form library + schema validation |
| Boolean flags for exclusive states  | Allows impossible states (`isLoading && isError`)    | Use discriminated unions               |
| `any` type                          | Defeats TypeScript entirely                          | Use `unknown` and narrow               |
| Single global error boundary        | One sidebar error crashes the page                   | Nest boundaries per section            |
| Cross-feature imports               | Creates tight coupling                               | Compose at the route/app level         |
| Duplicate schema + TypeScript types | Types drift from validation                          | Infer types from schemas               |

## Real-Time Data (WebSocket + Cache)

For collaborative or multi-user features, combine standard HTTP fetching with WebSocket subscriptions. The data-fetching cache remains the single source of truth — WebSocket events update or invalidate the cache.

**Architecture**: Initial fetch fills the cache. WebSocket events keep it fresh.

```tsx
// 1. Socket Provider at app root (manages connection lifecycle)
<SocketProvider>
  <App />
</SocketProvider>;

// 2. Global subscription hook (mounted once, handles all entity changes)
function RootLayout() {
  useWebSocketSubscription(); // Listens for entity_change events, updates cache
  return <Outlet />;
}

// 3. Feature pages use standard query hooks — cache updates flow automatically
function OrderBoardPage({ workspaceId }) {
  const { data: board } = useBoardQuery(workspaceId); // Auto-refreshed by WS events
  // ...
}
```

**Cache update strategies**:

- **Invalidation** (default): WS event triggers `cache.invalidateQueries()` → background refetch
- **Direct update**: WS event carries full data → `cache.setQueryData()` → instant UI update
- **Hybrid**: Direct update for detail queries, invalidation for list queries

**Key principles**:

- WebSocket is a **cache updater**, not a parallel data layer
- One socket connection per app, not per component
- Backend modules emit domain events via EventEmitter — gateway listens and broadcasts
- Use rooms/namespaces for tenant isolation and targeted delivery

See [real-time-patterns.md](references/real-time-patterns.md) for socket provider, global subscription hooks, message protocol, backend gateway patterns, reconnection resilience, and batching.

## Performance Checklist

- [ ] Code-split routes with `React.lazy` + `Suspense`
- [ ] Virtualize lists with 50+ items
- [ ] Hoist static values (objects, arrays, configs) outside component functions
- [ ] Configure cache/stale time on data-fetching queries to reduce unnecessary refetches
- [ ] Import directly from source (not barrel re-exports) for tree shaking
- [ ] Use `content-visibility: auto` for off-screen sections

See [performance.md](references/performance.md) for React Compiler, memoization guidance, and bundle optimization.

## Testing Strategy

| Level                 | What to Test                                               |
| --------------------- | ---------------------------------------------------------- |
| **Static analysis**   | Type errors, lint violations (TypeScript strict + ESLint)  |
| **Unit tests**        | Pure functions, utilities, complex business logic          |
| **Integration tests** | Component behavior, user interactions (largest investment) |
| **E2E tests**         | Critical user journeys end-to-end                          |

**Rules**: Test behavior, not implementation. Query by role, not by test ID. Simulate real user events.

See [testing-and-quality.md](references/testing-and-quality.md) for patterns, accessibility testing, and error boundaries.

## References

| Topic                                       | File                                                              | When to Load                                  |
| ------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Directory layout and file placement         | [project-structure.md](references/project-structure.md)           | Planning new features or restructuring        |
| Atomic design hierarchy with examples       | [component-architecture.md](references/component-architecture.md) | Creating or reviewing components              |
| Data fetching, caching, state patterns      | [state-and-data.md](references/state-and-data.md)                 | Designing state management or API layer       |
| Schema-driven forms deep dive               | [forms-and-validation.md](references/forms-and-validation.md)     | Building or debugging forms                   |
| Routing patterns and conventions            | [routing-patterns.md](references/routing-patterns.md)             | Creating or refactoring routes                |
| Compound components, generics, children     | [composition-patterns.md](references/composition-patterns.md)     | Designing component APIs                      |
| Code splitting, memoization, virtualization | [performance.md](references/performance.md)                       | Optimizing performance                        |
| Testing, error handling, accessibility      | [testing-and-quality.md](references/testing-and-quality.md)       | Writing tests or handling errors              |
| WebSocket + cache, real-time updates        | [real-time-patterns.md](references/real-time-patterns.md)         | Adding live updates or collaborative features |
