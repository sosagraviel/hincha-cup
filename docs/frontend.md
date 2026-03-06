# Frontend

React 19 SPA served by Vite 6. Uses TanStack Router for file-based routing, shadcn/ui for components, TanStack React Query for server state, and Socket.IO for real-time updates. Auth is handled entirely through Keycloak OIDC.

---

## Commands

```bash
pnpm --filter ./services/web-frontend start:dev   # Vite dev server — http://localhost:2712
pnpm --filter ./services/web-frontend build       # Production build (tsc + vite)
pnpm --filter ./services/web-frontend type:check  # TypeScript
pnpm --filter ./services/web-frontend lint:check  # ESLint (0 warnings)
pnpm --filter ./services/web-frontend test:e2e    # Playwright E2E (requires full stack)
```

---

## Folder Structure

```text
src/
├── api/                     # Axios API client functions + TypeScript types
├── components/
│   ├── atoms/               # Avatar, DateDisplay, EmptyState, FormField, IconButton, Typography
│   ├── molecules/           # ConfirmDialog, SchemaForm, SearchInput, UserAvatar
│   ├── organisms/           # BoardColumn, CardGrid, DetailPanel, FormDialog, Header
│   └── layouts/             # DashboardLayout (page layout structure)
├── context/
│   └── organization/        # Organization context provider
├── features/
│   └── tickets/
│       └── constants.ts     # Shared priority/status color maps and labels
├── hooks/
│   └── queries/             # React Query hooks (queries and mutations)
├── routes/                  # TanStack Router file-based routes
├── shared/
│   ├── context/
│   │   ├── keycloak.tsx     # Keycloak auth context + provider
│   │   ├── socket/          # Socket.IO context + provider
│   │   └── theme-provider.tsx  # Theme context (light/dark mode)
│   ├── hooks/               # Shared custom hooks
│   ├── lib/                 # axios instance, cn(), constants
│   ├── types/               # Shared TypeScript types
│   └── ui/                  # shadcn/ui base components (copied, not installed)
└── main.tsx
```

Path alias: `@/*` → `src/*`

---

## Routing

Routes are file-based using [TanStack Router](https://tanstack.com/router). Each file in `src/routes/` exports a `Route` object:

```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/organizations')({
  component: OrganizationsPage,
});
```

The root layout (`__root.tsx`) mounts auth, query client, and WebSocket providers, and bootstraps the global `useWebSocketSubscription()` hook.

---

## Component Architecture

The frontend follows [Atomic Design](https://atomicdesign.bradfrost.com):

| Layer | Examples | Rule |
| --- | --- | --- |
| **Atoms** | `Avatar`, `FormField`, `Typography`, `IconButton` | No business logic, no data access |
| **Molecules** | `ConfirmDialog`, `SchemaForm`, `SearchInput`, `UserAvatar` | Composed atoms, light interaction |
| **Organisms** | `BoardColumn`, `CardGrid`, `DetailPanel`, `FormDialog`, `Header` | Full UI sections, may fetch data |
| **Layouts** | `DashboardLayout` | Page layout structure, receives content as children |
| **Routes** | `board.tsx`, `projects.tsx`, `organizations.tsx` | Wires data + layouts, TanStack Router |

Each component lives in its own directory: `ComponentName/index.tsx`.

---

## Data Fetching

All server state goes through [TanStack React Query](https://tanstack.com/query). API calls are defined in `src/api/` and wrapped in typed hooks under `src/hooks/`:

```typescript
// src/hooks/queries/useOrganizations.ts
export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.organizations.list(),
  });
}
```

WebSocket events automatically invalidate the relevant query cache via `useWebSocketSubscription()` — no manual cache manipulation needed.

---

## Authentication

Auth is provided by Keycloak OIDC (Authorization Code Flow). `KeycloakContext` in `src/shared/context/keycloak/` exposes the typed Keycloak instance and current user. Protected routes redirect to the Keycloak login page automatically.

---

## Real-Time Updates

Socket.IO is wrapped in `SocketContext`. Two hooks handle subscriptions:

| Hook | Usage | Lifecycle |
| --- | --- | --- |
| `useWebSocketSubscription()` | Mount once at root; handles all `entity_change` events | App-wide |
| `useChannelSubscription(type, id)` | Join/leave a specific channel | Component mount/unmount |

See [Real-Time System Guide](realtime-system.md) for the full channel and event reference.

---

## Design System

- **Style**: Swiss × Clean — stroke-based containers (`zinc-200` borders), `blue-600` accent, Inter font
- **Utilities**: Tailwind CSS 4 classes only — no inline styles, no CSS modules
- **Conditional classes**: `cn()` from `@/shared/lib/utils`
- **Color scale**: `zinc-*` throughout; do not use `var(--gray-*)` CSS variables in components
- **Status/Priority maps**: centralized in `src/features/tickets/constants.ts` — do not duplicate inline

---

## E2E Tests

Playwright tests live in `e2e/`. The full stack must be running (`make up`):

```bash
pnpm --filter ./services/web-frontend test:e2e
```

| Spec | What it covers |
| --- | --- |
| `auth.spec.ts` | Login flow, redirects, logout |
| `home.spec.ts` | Homepage and navigation |
| `navigation.spec.ts` | Overall app navigation patterns |
| `organizations.spec.ts` | Organization selector, member list |
| `projects.spec.ts` | Project list, project creation |
| `board.spec.ts` | Kanban board, ticket creation, ticket detail |
| `chat.spec.ts` | Real-time chat, DMs, rooms |

Use `data-testid` attributes for all selectors. Shared login helpers live in `e2e/helpers/auth.ts`.

---

## Further Reading

- [Architecture Overview](architecture.md) — frontend data-flow diagrams and atomic design
- [Contributing Guide](contributing.md) — code conventions, styling rules, component guidelines
- [Real-Time System Guide](realtime-system.md) — WebSocket hooks, channels, and chat patterns
- [Authentication](authentication.md) — Keycloak OIDC flow and token lifecycle
