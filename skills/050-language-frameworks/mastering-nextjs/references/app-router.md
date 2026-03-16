# App Router Deep Dive

## File Conventions Reference

### Core Files

| File | Route Segment Role | Notes |
|------|--------------------|-------|
| `page.tsx` | Makes segment publicly accessible | Can be `async` RSC |
| `layout.tsx` | Wraps children; persists across navigations | Receives `children: React.ReactNode` |
| `template.tsx` | Like layout but re-mounts on each navigation | Rare — use for animations or per-page init |
| `loading.tsx` | Suspense fallback for the segment | Auto-wraps `page.tsx` in `<Suspense>` |
| `error.tsx` | Error boundary for the segment | Must be `"use client"` |
| `not-found.tsx` | UI shown when `notFound()` is called | Can be RSC |
| `route.ts` | HTTP endpoint (Route Handler) | No UI export |
| `middleware.ts` | Intercepts requests before routing | Runs at the Edge |
| `default.tsx` | Fallback for parallel route slots | Used with `@slot` directories |

### Nesting Rules

- Layouts nest — a child layout wraps inside its parent layout.
- `loading.tsx` and `error.tsx` apply to the segment they are in, not children (unless children don't have their own).
- Multiple `layout.tsx` files create nested shells. Root `app/layout.tsx` must include `<html>` and `<body>`.

```
app/
  layout.tsx          # Root shell — <html><body>
  page.tsx            # Renders at /
  dashboard/
    layout.tsx        # Dashboard shell (sidebar, nav)
    page.tsx          # Renders at /dashboard
    loading.tsx       # Shown while /dashboard page data loads
    error.tsx         # Catches errors in /dashboard
    kpis/
      page.tsx        # Renders at /dashboard/kpis
```

---

## Route Groups `(name)/`

Route groups let you organize routes into logical groups **without affecting the URL**.

```
app/
  (auth)/
    login/page.tsx       # URL: /login
    register/page.tsx    # URL: /register
    layout.tsx           # Layout only for auth pages (centered card)

  (app)/
    layout.tsx           # Layout for authenticated app (sidebar + topbar)
    dashboard/page.tsx   # URL: /dashboard
    settings/page.tsx    # URL: /settings
```

**Common use cases:**
- Different layouts for different areas (marketing vs. app vs. auth)
- Organizing routes by team without URL pollution
- Multiple root layouts (opt some routes out of the global layout)

### Multiple Root Layouts

```
app/
  (marketing)/
    layout.tsx    # Marketing layout
    page.tsx
  (shop)/
    layout.tsx    # Shop layout
    cart/page.tsx
  layout.tsx      # ⚠️ Only if you still want a true root layout
```

If you use route groups at the top level with their own layouts and no top-level `layout.tsx`, each group has an independent root. This means **no shared shell** between groups — useful for completely different apps in one repo.

---

## Parallel Routes `@slot`

Parallel routes render multiple pages simultaneously in the same layout.

```
app/
  layout.tsx          # Receives @team and @analytics slots
  page.tsx
  @team/
    page.tsx          # Rendered in the "team" slot
  @analytics/
    page.tsx          # Rendered in the "analytics" slot
    loading.tsx       # Loading state for this slot only
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  team,
  analytics,
}: {
  children: React.ReactNode;
  team: React.ReactNode;
  analytics: React.ReactNode;
}) {
  return (
    <>
      {children}
      <div className="sidebar">
        {team}
        {analytics}
      </div>
    </>
  );
}
```

**Common use cases:**
- Dashboard with independently loading panels
- Split views (list + detail)
- Modals that co-exist with the underlying page

**`default.tsx`**: Required when a slot has no match for the current URL (prevents a 404). Return `null` to render nothing.

---

## Intercepting Routes `(..)`

Intercept a route to show it in a different context — e.g., a photo in a modal from a feed, but the full page when navigating directly.

```
app/
  feed/
    page.tsx              # Feed page
    (..)photo/[id]/
      page.tsx            # Intercepts /photo/:id when navigating from /feed
  photo/
    [id]/
      page.tsx            # Full photo page (used on direct navigation / refresh)
```

**Conventions:**
| Syntax | Intercepts |
|--------|-----------|
| `(.)` | Same level |
| `(..)` | One level up |
| `(..)(..)` | Two levels up |
| `(...)` | From the `app` root |

**Typical pattern with parallel routes**: Use `@modal` slot + intercepting route to create a "soft navigation modal":

```
app/
  layout.tsx          # Includes @modal slot
  @modal/
    (..)photo/[id]/
      page.tsx        # Modal content
    default.tsx       # null — no modal by default
  photo/
    [id]/
      page.tsx        # Full-page view
```

---

## Middleware

`middleware.ts` at the project root (or `src/middleware.ts`) runs before every matched request.

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth guard example
  const token = request.cookies.get('session')?.value;
  if (pathname.startsWith('/dashboard') && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Add request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
```

**Rules:**
- Middleware runs at the **Edge** — no Node.js APIs.
- Keep it **fast and minimal** — it runs on every request.
- Use `matcher` to narrow the routes it applies to.
- For complex auth, do a lightweight token check in middleware; full session validation in the page/layout RSC.

---

## Dynamic Segments

```
app/
  companies/
    [id]/
      page.tsx          # /companies/:id
    [id]/
      [tab]/
        page.tsx        # /companies/:id/:tab
  [...slug]/
    page.tsx            # Catch-all: /a, /a/b, /a/b/c
  [[...slug]]/
    page.tsx            # Optional catch-all: /, /a, /a/b
```

```tsx
// app/companies/[id]/page.tsx
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CompanyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;
  const company = await fetchCompany(id);
  return <CompanyWidget company={company} tab={tab as string} />;
}
```

> In Next.js 15+, `params` and `searchParams` are **Promises** — always `await` them.

---

## Metadata API

```tsx
// Static metadata
export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'PE portfolio dashboard',
};

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const company = await fetchCompany(id);
  return {
    title: company.name,
    openGraph: { title: company.name, images: [company.logoUrl] },
  };
}
```

Metadata is automatically deduplicated — child `generateMetadata` merges with parent `metadata`.
