> **Load when:** Optimizing performance, code splitting, investigating re-renders, or evaluating memoization.

# Performance Optimization

## React Compiler (2025+)

React Compiler (v1.0, stable October 2025) automatically applies memoization at build time. When adopted:

- **Do NOT manually add** `useMemo`, `useCallback`, or `React.memo` to new code
- The compiler analyzes component code and inserts memoization where beneficial
- **Requirement**: Code must follow Rules of React (idempotent rendering, immutable state)
- Use `"use no memo"` directive to opt out specific components if needed
- Existing manual memoization continues to work (backwards compatible)
- Supported in frameworks with Babel/SWC plugin integration

**If React Compiler is NOT yet adopted**, follow the guidelines below.

## Memoization Guidelines (Pre-Compiler)

### When to Use `useMemo`

```tsx
// YES — expensive computation
const sortedItems = useMemo(
  () => items.slice().sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);

// YES — derived object used as dependency elsewhere
const filters = useMemo(
  () => ({ status, priority, assignee }),
  [status, priority, assignee]
);
```

### When NOT to Use `useMemo`

```tsx
// NO — primitive derivation (cheaper than memo overhead)
const fullName = useMemo(() => `${first} ${last}`, [first, last]);
// Just do: const fullName = `${first} ${last}`;

// NO — object used only in render (not a dependency)
const style = useMemo(() => ({ color: 'red' }), []);
// Just hoist: const style = { color: 'red' } as const;
```

### When to Use `useCallback`

```tsx
// YES — callback passed to memoized child
const handleClick = useCallback((id: string) => {
  setSelectedId(id);
}, []);

// YES — callback used in useEffect dependency array
const fetchData = useCallback(async () => {
  const result = await api.fetch(params);
  setData(result);
}, [params]);
```

### When NOT to Use `useCallback`

```tsx
// NO — callback only used in JSX (no memoized child)
const handleClick = useCallback(() => setOpen(true), []);
// Just do: const handleClick = () => setOpen(true);
```

## Code Splitting

### Route-Level Splitting

```tsx
// Using React.lazy for route-level code splitting
const OrderBoardPage = React.lazy(() => import('@/features/orders/OrderBoardPage'));

function OrderRoute() {
  const { orderId } = useParams();
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrderBoardPage orderId={orderId} />
    </Suspense>
  );
}

// Many routers also support lazy routes natively
// (e.g., TanStack Router's createLazyFileRoute, React Router's lazy property)
```

### Heavy Component Splitting

```tsx
// Defer loading for heavy components not needed on initial render
const RichTextEditor = React.lazy(() => import('@/components/RichTextEditor'));
const ChartDashboard = React.lazy(() => import('@/features/analytics/ChartDashboard'));

// Wrap in Suspense at the point of use
{showEditor && (
  <Suspense fallback={<Skeleton className="h-48" />}>
    <RichTextEditor value={content} onChange={setContent} />
  </Suspense>
)}
```

## List Virtualization

For lists with 50+ items, use virtualization (e.g., TanStack Virtual, react-window, react-virtuoso):

```tsx
function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
              width: '100%',
            }}
          >
            <ItemRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Re-render Prevention

### Hoist Static Values

```tsx
// WRONG — creates new object every render
function MyComponent() {
  return <div style={{ display: 'flex', gap: 8 }}>...</div>;
}

// RIGHT — hoist outside component
const containerStyle = { display: 'flex', gap: 8 } as const;
function MyComponent() {
  return <div style={containerStyle}>...</div>;
}

// BETTER — use utility CSS classes (no object at all)
function MyComponent() {
  return <div className="flex gap-2">...</div>;
}
```

### Hoist Default Props

```tsx
// WRONG — creates new array every render
function Select({ options = [] }: SelectProps) { ... }

// RIGHT — hoist default outside
const EMPTY_OPTIONS: SelectOption[] = [];
function Select({ options = EMPTY_OPTIONS }: SelectProps) { ... }
```

### Use Functional setState

```tsx
// WRONG — stale closure risk + unnecessary dependency
const addItem = useCallback((item) => {
  setItems([...items, item]);  // Captures 'items' from closure
}, [items]);

// RIGHT — functional update, no dependency needed
const addItem = useCallback((item: Item) => {
  setItems(prev => [...prev, item]);
}, []);
```

## Data-Fetching Cache Performance

### staleTime

```tsx
// Prevent unnecessary refetches for rarely-changing data
useQuery({
  queryKey: ['user', 'profile'],
  queryFn: fetchProfile,
  staleTime: 10 * 60 * 1000,  // 10 minutes — profile rarely changes
});
```

### Selective Subscriptions

```tsx
// Only re-render when the derived value changes, not the full dataset
const itemCount = useQuery({
  queryKey: ['items'],
  queryFn: fetchItems,
  select: (data) => data.length,  // Component only re-renders when count changes
});
```

> **Note**: The `select` and `staleTime` options shown above use TanStack Query syntax but similar features exist in most data-fetching libraries (SWR, Apollo Client, RTK Query).

## Bundle Size

### Direct Imports

```tsx
// WRONG — imports entire library (barrel file)
import { Plus, Settings, User } from 'lucide-react';

// RIGHT — direct imports (tree-shakeable)
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
```

Note: Some libraries handle tree-shaking correctly from barrels. Profile with your bundler's analysis tool (e.g., `vite-bundle-visualizer`, `webpack-bundle-analyzer`) before optimizing.

### CSS Performance

```tsx
// Use content-visibility for off-screen sections
<div className="content-visibility-auto contain-intrinsic-size-[auto_500px]">
  <ExpensiveSection />
</div>
```

## Measurement Tools

| Tool | Purpose |
|------|---------|
| React DevTools Profiler | Component render times, re-render causes |
| `React.Profiler` component | Programmatic render time measurement |
| Chrome Performance tab | Frame drops, long tasks |
| Bundle analyzer (bundler-specific) | Bundle size analysis |
| Lighthouse | Core Web Vitals (LCP, FID, CLS) |
| `why-did-you-render` | Detect unnecessary re-renders |
