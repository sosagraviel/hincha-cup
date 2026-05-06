---
name: nextjs
description: >
  Next.js 13+ App Router engineering skill covering RSC vs client component decisions,
  data fetching patterns (fetch cache, Server Actions), Route Handlers as BFF, FSD
  layer mapping to App Router conventions, Tailwind CSS v4 theming, streaming with
  Suspense, and performance optimization. Use when building or reviewing any Next.js
  App Router project. Focuses exclusively on Next.js-specific patterns.
version: 1.0.0
category: frontend-engineering
triggers:
  - next.js
  - nextjs
  - app router
  - server component
  - client component
  - route handler
  - server action
  - layout
  - page
  - middleware
  - next/image
  - metadata api
tags:
  - nextjs
  - react
  - typescript
  - app-router
  - rsc
  - server-actions
  - bff
author: facundoCambra
license: MIT
---

# Next.js App Router Engineering

> **Scope note**: This skill is loaded alongside `react-frontend` and `mastering-typescript` — it focuses exclusively on Next.js-specific patterns and does not repeat React or TypeScript fundamentals.

## When to Apply

- Any Next.js 13+ project using the App Router
- Deciding between RSC and Client Components
- Designing data-fetching strategy (cache, revalidation, Server Actions)
- Structuring Route Handlers as BFF
- Mapping FSD architecture to App Router file conventions
- Optimizing for streaming, static generation, or ISR

---

## App Router File Conventions

| File | Purpose |
|------|---------|
| `page.tsx` | Unique UI for a route segment — makes it publicly accessible |
| `layout.tsx` | Shared UI that wraps children, persists across navigations |
| `loading.tsx` | Instant loading UI using React Suspense |
| `error.tsx` | Error boundary for the segment (`"use client"` required) |
| `not-found.tsx` | UI for `notFound()` calls within the segment |
| `route.ts` | API endpoint (Route Handler / BFF) — no UI |
| `middleware.ts` | Runs before requests — auth guards, redirects, headers |
| `template.tsx` | Like layout but re-mounts on navigation (rare) |

### Route Groups and Special Segments

```
app/
  (marketing)/          # Route group — groups routes without affecting URL
    page.tsx            # Matches /
    about/page.tsx      # Matches /about
  (dashboard)/
    layout.tsx          # Layout only for dashboard routes
    dashboard/page.tsx  # Matches /dashboard
  @modal/               # Parallel route — rendered in a slot
    page.tsx
  (..)photo/[id]/       # Intercepting route
    page.tsx
```

**Route groups** `(name)/` — organize routes without affecting the URL path. Useful for applying different layouts to route subsets.

**Parallel routes** `@slot` — render multiple pages simultaneously in the same layout. Used for modals, split views.

**Intercepting routes** `(..)path` — intercept navigation to show content in a different context (e.g., open a photo in a modal from a feed, but navigate directly to the full page).

---

## Server vs Client Components (RSC Decision Tree)

**Default: Server Component.** Add `"use client"` only when needed.

```
Does the component need...
  └─ useState / useReducer / useEffect?          → "use client"
  └─ Browser APIs (window, document, localStorage)? → "use client"
  └─ Event handlers (onClick, onChange)?         → "use client"
  └─ Client-only libraries?                      → "use client"
  └─ None of the above?                          → Server Component (default)
```

### Key Rules

- **Never import server-only code through a client boundary.** Use the `server-only` package to enforce this.
- **Pass server data to client components via props**, not by importing server modules.
- **Async Server Components** — can `await` directly at the component level. No `useEffect` + `useState` for data fetching.
- **`"use client"` marks a boundary**, not an individual component. All imports below that boundary become client code.

```tsx
// ✅ RSC — fetches data directly
async function KpiDashboard() {
  const kpis = await fetchKpis(); // Server-side fetch
  return <KpiList kpis={kpis} />;
}

// ✅ Client component — only where interactivity is needed
'use client';
function FilterPanel({ onFilterChange }: { onFilterChange: (f: Filter) => void }) {
  const [filter, setFilter] = useState<Filter>({ period: '30d' });
  // ...
}

// ❌ Wrong — fetching in a client component when RSC would work
'use client';
function KpiDashboard() {
  const [kpis, setKpis] = useState([]);
  useEffect(() => { fetchKpis().then(setKpis); }, []);
  // ...
}
```

---

## Data Fetching in RSC

### Fetch Caching Strategies

```tsx
// Static — cached indefinitely (default for fetch in RSC)
const data = await fetch('/api/kpis', { cache: 'force-cache' });

// ISR — revalidate every N seconds
const data = await fetch('/api/kpis', { next: { revalidate: 60 } });

// Dynamic — never cached, always fresh
const data = await fetch('/api/kpis', { cache: 'no-store' });

// Tag-based revalidation — invalidate on demand
const data = await fetch('/api/kpis', { next: { tags: ['kpis'] } });
// In a Server Action or Route Handler:
import { revalidateTag } from 'next/cache';
revalidateTag('kpis');
```

### Parallel Data Fetching

```tsx
// ✅ Parallel — both start simultaneously
async function DashboardPage() {
  const [kpis, insights] = await Promise.all([
    fetchKpis(),
    fetchInsights(),
  ]);
  return <Dashboard kpis={kpis} insights={insights} />;
}

// ❌ Sequential — waterfall, slower
async function DashboardPage() {
  const kpis = await fetchKpis();
  const insights = await fetchInsights(); // Waits for kpis first
  // ...
}
```

### Server Actions (Mutations)

```tsx
// Defined with "use server" directive
async function approveInsight(insightId: string) {
  'use server';
  await db.insights.update({ where: { id: insightId }, data: { status: 'approved' } });
  revalidateTag('insights');
}

// Used directly in RSC
function InsightCard({ insight }: { insight: Insight }) {
  return (
    <form action={approveInsight.bind(null, insight.id)}>
      <button type="submit">Approve</button>
    </form>
  );
}
```

---

## Route Handlers as BFF

All external API calls must go through Route Handlers. Client components never call external APIs directly.

```
src/app/api/
  kpis/
    route.ts          # GET /api/kpis
  insights/
    route.ts          # GET /api/insights
    [id]/
      route.ts        # GET/PATCH /api/insights/:id
  auth/
    [...nextauth]/
      route.ts        # Auth handler
```

### Route Handler Pattern

```ts
// src/app/api/kpis/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { KpiResponse } from '@/entities/kpi/model/types';

export async function GET(request: NextRequest): Promise<NextResponse<KpiResponse>> {
  const { searchParams } = request.nextUrl;
  const period = searchParams.get('period') ?? '30d';

  try {
    const data = await externalKpiService.fetch({ period });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch KPIs' },
      { status: 500 }
    );
  }
}
```

**Rules:**
- Type both `NextRequest` and the `NextResponse` generic.
- Never call external services from `components/`, `features/`, or `entities/` — only through `app/api/`.
- Use `src/shared/api/client.ts` for the fetch wrapper used within Route Handlers.

---

## FSD Layer Mapping

```
src/
  app/              # THIN — Next.js routing only
    (routes)/
      page.tsx      # Composes one widget, passes no business logic
      layout.tsx    # Wraps segment — composes layout widgets
    api/            # Route Handlers (BFF) — no FSD layer imports here
    globals.css     # Design tokens + base styles
    layout.tsx      # Root layout

  widgets/          # Composite, self-contained UI blocks
    kpi-dashboard/
      ui/KpiDashboard.tsx   # RSC — fetches + composes entities
      index.ts

  features/         # User interactions / use-cases
    approve-insight/
      ui/ApproveButton.tsx  # "use client" — needs interactivity
      api/approve-insight-api.ts
      index.ts

  entities/         # Business domain models + UI
    kpi/
      model/types.ts
      api/kpi-api.ts        # Used by widgets/features (not directly by app/)
      ui/KpiCard.tsx        # RSC by default
      index.ts

  shared/           # Domain-agnostic reusables
    api/client.ts   # Base fetch wrapper
    ui/Button.tsx
    constants/
    lib/
    types/
```

### Critical Rules

- `app/page.tsx` files must be **thin** — compose one widget, pass route params. No business logic.
- `app/layout.tsx` wraps the segment — no data fetching beyond what's needed for the shell.
- `app/api/` route handlers are **not FSD layers** — they are BFF endpoints. They may import from `shared/api/` but not from `widgets/`, `features/`, or `entities/`.
- FSD layer boundaries are strictly enforced: `widgets` → `features` → `entities` → `shared`. No upward imports. No cross-slice imports within the same layer.

```tsx
// ✅ Thin page.tsx
export default function DashboardPage() {
  return <KpiDashboard />;
}

// ❌ Fat page.tsx — business logic in the routing layer
export default async function DashboardPage() {
  const kpis = await fetchKpis();
  const insights = await fetchInsights();
  const filtered = kpis.filter(k => k.trend === 'up');
  return (
    <div>
      {filtered.map(k => <KpiCard key={k.id} kpi={k} />)}
      ...
    </div>
  );
}
```

---

## Tailwind CSS v4 Theming

Define **all** design tokens as CSS custom properties using `@theme` in `globals.css`. Never hardcode raw values.

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-brand-primary: oklch(55% 0.2 250);
  --color-surface: oklch(98% 0 0);
  --color-surface-raised: oklch(95% 0 0);
  --color-text-primary: oklch(15% 0 0);
  --radius-card: 0.75rem;
  --radius-button: 0.375rem;
  --shadow-card: 0 1px 3px oklch(0% 0 0 / 10%);
}

/* Dark mode via data attribute — no dark: variants */
[data-theme="dark"] {
  --color-surface: oklch(12% 0 0);
  --color-surface-raised: oklch(18% 0 0);
  --color-text-primary: oklch(95% 0 0);
}

@layer components {
  .card {
    @apply rounded-[--radius-card] bg-surface p-6;
    box-shadow: var(--shadow-card);
  }
  .btn-primary {
    @apply rounded-[--radius-button] bg-brand-primary px-4 py-2 text-white;
  }
}
```

**Rules:**
- Use `[data-theme="dark"]` overrides, not `dark:` Tailwind variants.
- Use `@layer components` for repeated class combinations — avoid long inline class strings.
- Reference tokens with `bg-surface`, `text-brand-primary`, etc. via the Tailwind v4 CSS variable bridge.

---

## Performance: Streaming & Static Generation

### Streaming with Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { KpiDashboard } from '@/widgets/kpi-dashboard';
import { KpiDashboardSkeleton } from '@/widgets/kpi-dashboard';

export default function DashboardPage() {
  return (
    <main>
      <Suspense fallback={<KpiDashboardSkeleton />}>
        <KpiDashboard />  {/* Async RSC — streams in when ready */}
      </Suspense>
    </main>
  );
}
```

`loading.tsx` is a shortcut for wrapping the entire `page.tsx` in a Suspense boundary. Use explicit `<Suspense>` for finer-grained streaming.

### Static vs Dynamic Rendering

| Strategy | When to Use | How |
|----------|------------|-----|
| Static (SSG) | Content rarely changes | `cache: 'force-cache'` or no dynamic APIs |
| ISR | Content changes periodically | `{ next: { revalidate: N } }` or `revalidateTag()` |
| Dynamic (SSR) | Per-request data, auth, cookies | `cache: 'no-store'` or `cookies()`/`headers()` |

```tsx
// Force dynamic rendering for authenticated pages
import { cookies } from 'next/headers';

export default async function ProtectedPage() {
  const session = await getSession(cookies()); // Makes route dynamic automatically
  // ...
}
```

### Images and Fonts

```tsx
import Image from 'next/image';
import { Inter } from 'next/font/google';

// Always use next/image — automatic optimization, lazy loading, prevents CLS
<Image src={chart} alt="KPI trend chart" width={800} height={400} priority />

// next/font eliminates layout shift from web fonts
const inter = Inter({ subsets: ['latin'], display: 'swap' });
```

### `generateStaticParams` for Dynamic Routes

```tsx
// app/companies/[id]/page.tsx
export async function generateStaticParams() {
  const companies = await fetchAllCompanyIds();
  return companies.map(c => ({ id: c.id }));
}
```

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Do This Instead |
|---|---|---|
| `"use client"` at page level | Opts entire page + all children into client bundle | Keep pages as RSC; push `"use client"` to leaf components |
| Client-side data fetching when RSC works | Adds loading states, waterfall, ships data to client | Fetch in RSC with `async/await` |
| Fat `page.tsx` (business logic, data fetching) | Violates FSD thin routing rule | Delegate to widgets |
| Direct external API calls from client components | Exposes API keys, bypasses BFF | Route through `app/api/` handlers |
| Hardcoded design tokens (`bg-[#1a1a2e]`) | Prevents theming, breaks consistency | Define in `@theme`, use token class |
| `useEffect` for data initialization in RSC | RSC doesn't support effects | Use `async/await` directly |
| Importing from `app/api/` in FSD layers | Circular / wrong direction | FSD layers call BFF via HTTP, not by import |
| Skipping `next/image` for images | No optimization, causes CLS | Always use `next/image` |

---

## References

| Topic | File | When to Load |
|-------|------|-------------|
| File conventions, route groups, parallel/intercepting routes | [app-router.md](references/app-router.md) | Creating or structuring routes |
| RSC fetch cache, revalidation, Server Actions, TanStack Query | [data-fetching.md](references/data-fetching.md) | Designing the data layer |
| FSD + App Router mapping, barrel rules, import enforcement | [fsd-architecture.md](references/fsd-architecture.md) | Architecture planning or layer boundary questions |
