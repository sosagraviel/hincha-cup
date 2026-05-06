# FSD + Next.js App Router Architecture

## Overview

Feature-Sliced Design (FSD) maps cleanly onto Next.js App Router. The key insight: `app/` is the **routing layer**, not an FSD layer — it sits above widgets and delegates everything to FSD slices.

```
src/
  app/              # Next.js routing — NOT an FSD layer
  widgets/          # FSD: Composite, self-contained UI blocks
  features/         # FSD: User interactions / use-cases
  entities/         # FSD: Business domain models + UI
  shared/           # FSD: Domain-agnostic reusables
```

---

## Layer Responsibilities

### `app/` — Thin Routing Layer

`app/` owns Next.js file conventions only. It does **not** implement business logic, data fetching, or domain UI.

**Allowed in `app/`:**
- `page.tsx` — composes one or two widgets, passes route params
- `layout.tsx` — wraps segment in shell widgets (nav, sidebar)
- `loading.tsx` — skeleton/spinner shown while page data loads
- `error.tsx` — error boundary (must be `"use client"`)
- `not-found.tsx` — 404 UI
- `route.ts` — BFF endpoint (imports only from `shared/api/`)
- `globals.css` — design tokens and base styles
- `middleware.ts` — auth guards, redirects (no FSD imports)

**Not allowed in `app/`:**
- Business logic
- Data fetching beyond passing params to widgets
- Direct imports from `entities/` or `features/` in `page.tsx` (except via widget composition)
- Multiple widgets composed inline in `page.tsx` with glue logic

```tsx
// ✅ Correct app/dashboard/page.tsx
import { KpiDashboard } from '@/widgets/kpi-dashboard';

export default function DashboardPage() {
  return <KpiDashboard />;
}

// ✅ Correct — passing route params is acceptable
import { CompanyDetailWidget } from '@/widgets/company-detail';

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetailWidget companyId={id} />;
}

// ❌ Wrong — business logic in page.tsx
export default async function DashboardPage() {
  const kpis = await fetchKpis();
  const topKpis = kpis.filter(k => k.trend === 'up').slice(0, 5);
  return (
    <div>
      <h1>Dashboard</h1>
      {topKpis.map(k => <KpiCard key={k.id} kpi={k} />)}
    </div>
  );
}
```

### `widgets/` — Composite UI Blocks

Widgets are self-contained sections of the page. They:
- Own their own data fetching (RSC `async/await`)
- Compose features and entities
- Are opaque — `page.tsx` just renders them

```
src/widgets/
  kpi-dashboard/
    ui/
      KpiDashboard.tsx      # RSC — fetches KPIs, renders KpiList + filters
      KpiDashboardSkeleton.tsx
    index.ts                # Exports: { KpiDashboard, KpiDashboardSkeleton }

  insight-panel/
    ui/
      InsightPanel.tsx
    index.ts
```

```tsx
// src/widgets/kpi-dashboard/ui/KpiDashboard.tsx
import { fetchKpis } from '@/entities/kpi/api/kpi-api';
import { KpiCard } from '@/entities/kpi/ui/KpiCard';
import { FilterKpis } from '@/features/filter-kpis';

export async function KpiDashboard() {
  const kpis = await fetchKpis();
  return (
    <section>
      <FilterKpis />
      <div className="kpi-grid">
        {kpis.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
      </div>
    </section>
  );
}
```

### `features/` — User Interactions

Features implement specific user actions. They:
- Are triggered by user intent (approve, filter, send, create)
- May be RSC or Client Components depending on interactivity
- Own their Server Actions or API call functions

```
src/features/
  approve-insight/
    ui/
      ApproveButton.tsx     # "use client" — needs onClick, pending state
    api/
      approve-insight-api.ts  # Server Action file ('use server')
    index.ts                # Exports: { ApproveButton }

  filter-kpis/
    ui/
      FilterPanel.tsx       # "use client" — controlled form
    model/
      constants.ts          # Filter options, default values
    index.ts
```

### `entities/` — Domain Models

Entities define the business domain vocabulary. They:
- Own their type definitions (`model/types.ts`)
- Own their API fetching functions (`api/`)
- Provide domain-specific UI (`ui/`) — usually pure display components

```
src/entities/
  kpi/
    model/
      types.ts              # KpiData, KpiTrend, KpiPeriod types
      constants.ts          # KPI_QUERY_KEYS, TREND_LABELS
    api/
      kpi-api.ts            # fetchKpis(), fetchKpiById()
    ui/
      KpiCard.tsx           # Displays a single KPI (RSC)
      KpiSparkline.tsx      # Trend chart component
    index.ts                # Exports: { KpiCard, KpiSparkline, KpiData, fetchKpis }

  insight/
    model/
      types.ts
    api/
      insight-api.ts
    ui/
      InsightCard.tsx
    index.ts
```

### `shared/` — Domain-Agnostic Infrastructure

`shared/ui/` is where **atomic design** lives within FSD. Atoms, molecules, and organisms are all domain-agnostic UI primitives — the FSD layers above (`entities/`, `features/`, `widgets/`) consume them.

```
src/shared/
  api/
    client.ts             # Base fetch wrapper (used by entity api/ and Route Handlers)
  ui/
    atoms/                # Primitive building blocks — Button, Badge, Avatar, Input
    molecules/            # Atom compositions — SearchInput, FormField, ConfirmDialog
    organisms/            # Complex generic sections — DataTable, FormDialog
  lib/
    format.ts             # Date, number, currency formatters
    cn.ts                 # Class name utility
  config/
    env.ts                # Type-safe env var access
  constants/
    routes.ts             # ROUTES object for navigation
  types/
    api.ts                # ApiResponse<T>, PaginatedResponse<T>
```

---

## Import Rules

### Layer Order (allowed imports flow downward only)

```
app/ → widgets/ → features/ → entities/ → shared/
```

No upward imports. No cross-slice imports within the same layer.

```ts
// ✅ entities/kpi/ui/KpiCard.tsx
import { KpiData } from '@/entities/kpi/model/types'; // Same slice — OK
import { formatPercent } from '@/shared/lib/format';  // Downward — OK

// ✅ features/filter-kpis/ui/FilterPanel.tsx
import { KpiPeriod } from '@/entities/kpi';           // Downward via barrel — OK
import { Button } from '@/shared/ui/Button';          // Downward — OK

// ❌ entities/kpi/ui/KpiCard.tsx
import { FilterPanel } from '@/features/filter-kpis'; // Upward — WRONG

// ❌ features/filter-kpis/ui/FilterPanel.tsx
import { ApproveButton } from '@/features/approve-insight'; // Same layer cross-slice — WRONG
```

### Barrel Export Rules

Each FSD slice has exactly one `index.ts` that defines its public API.

```ts
// src/entities/kpi/index.ts — ONLY export what consumers need
export type { KpiData, KpiTrend } from './model/types';
export { KpiCard } from './ui/KpiCard';
export { KpiSparkline } from './ui/KpiSparkline';
export { fetchKpis, fetchKpiById } from './api/kpi-api';
// Do NOT export internal implementation details
```

**No nested barrel files.** Do not create `ui/index.ts` inside a slice. The slice's root `index.ts` is the only barrel.

### Path Alias

Always use `@/*` (maps to `src/*`). Never use relative `../../` paths across layers.

```ts
// ✅
import { KpiCard } from '@/entities/kpi';
import { Button } from '@/shared/ui/Button';

// ❌
import { KpiCard } from '../../../entities/kpi';
```

---

## Route Handler + FSD

Route Handlers in `app/api/` are BFF endpoints. They are **not FSD layers** and do not follow FSD import rules strictly, but they should:

- Import only from `shared/api/` for the HTTP client
- Call external services (database, third-party APIs) directly or via a service layer
- Not import from `widgets/`, `features/`, or `entities/`

```ts
// src/app/api/kpis/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { apiClient } from '@/shared/api/client'; // OK
import type { KpiData } from '@/entities/kpi/model/types'; // Type-only import — OK

export async function GET(request: NextRequest): Promise<NextResponse<{ data: KpiData[] }>> {
  const data = await apiClient.get<KpiData[]>('/external/kpis');
  return NextResponse.json({ data });
}
```

Client-side code calls `fetch('/api/kpis')` — it never imports from `app/api/` directly.

---

## FSD Checklist for New Features

1. **Identify the slice type**: Is it a user interaction (feature), a domain model (entity), or a composite section (widget)?
2. **Create the slice directory** with `model/`, `api/`, `ui/`, `index.ts` as needed.
3. **Define types first** in `model/types.ts`.
4. **Write the API function** in `api/{name}-api.ts` — pure async functions, no hooks.
5. **Build UI components** — default to RSC; add `"use client"` only for interactivity.
6. **Expose public API** via `index.ts` — minimal exports.
7. **Wire into `app/`** via a widget or directly in `page.tsx` if it's a full-page widget.
8. **Verify layer boundaries**: no upward imports, no cross-slice imports.
