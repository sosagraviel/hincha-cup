> **Load when:** Planning new features, restructuring code, deciding where files should go, or creating a project from scratch.

# Project Structure

## Directory Layout

```
src/
  api/                          # API client layer
  │  types.ts                   # Shared enums + request/response interfaces
  │  {domain}.ts                # One file per business domain (e.g., orders.ts, users.ts)
  │
  components/                   # GENERIC reusable UI hierarchy
  │  atoms/                     # Primitive building blocks
  │  │  Avatar/index.tsx
  │  │  EmptyState/index.tsx
  │  │  FormField/index.tsx
  │  │  Typography/index.tsx
  │  │  DateDisplay/index.tsx
  │  │  IconButton/index.tsx
  │  │  index.ts                # Barrel export for atoms
  │  │
  │  molecules/                 # Atom compositions
  │  │  SchemaForm/index.tsx
  │  │  SearchInput/index.tsx
  │  │  UserAvatar/index.tsx
  │  │  ConfirmDialog/index.tsx
  │  │  index.ts
  │  │
  │  organisms/                 # Complex UI sections
  │  │  Header/index.tsx
  │  │  BoardColumn/index.tsx
  │  │  CardGrid/index.tsx
  │  │  FormDialog/index.tsx
  │  │  DetailPanel/index.tsx
  │  │  index.ts
  │  │
  │  layouts/                   # Page shells
  │     DashboardLayout/index.tsx
  │     AuthLayout/index.tsx
  │     index.ts
  │
  features/                     # Domain-specific (one folder per business domain)
  │  {domain}/
  │  │  {Domain}Page.tsx        # Page component (owns data fetching + state)
  │  │  {Domain}Card.tsx        # Domain-specific card
  │  │  Create{Domain}Dialog.tsx # Wraps FormDialog with domain schema
  │  │  {Domain}DetailView.tsx  # Wraps DetailPanel with domain data
  │  │  schemas.ts              # Validation schemas
  │  │  field-configs.ts        # Form field configurations
  │  │  constants.ts            # Colors, labels, mappings
  │  │  index.ts                # Public API (barrel export)
  │
  hooks/
  │  queries/                   # Data-fetching hooks (one file per domain)
  │  │  {domain}Queries.ts      # Query + mutation hooks with key factories
  │  {contextConsumer}.ts       # Context consumer hooks
  │
  routes/                       # Router configuration (file-based or config-based)
  │  (route files)              # Thin files: layout + feature + params
  │
  shared/
     context/                   # Auth, theme, locale providers
     hooks/                     # Cross-cutting hooks (useDebounce, useMediaQuery)
     lib/                       # HTTP client, constants, utilities (cn, formatDate)
     ui/                        # Base UI primitives (button, input, dialog, select)
```

## Placement Decision Tree

```
Is it an API call?
  YES → api/{domain}.ts

Is it a data-fetching hook (query/mutation)?
  YES → hooks/queries/{domain}Queries.ts

Is it a React context provider?
  YES → shared/context/{name}/

Is it a shared utility (cn, formatDate, etc.)?
  YES → shared/lib/utils.ts (or a dedicated file if large)

Is it a UI component?
  Does it have domain-specific knowledge?
    YES → features/{domain}/{Component}.tsx
    NO → components/{atom|molecule|organism}/{Component}/index.tsx

Is it a page-level component?
  YES → features/{domain}/{Domain}Page.tsx

Is it a route?
  YES → routes/ (thin file: layout + feature + params)
```

## File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Component | PascalCase | `OrderCard.tsx`, `FormDialog/index.tsx` |
| Hook | camelCase with `use` prefix | `useOrdersQuery.ts` |
| Schema | camelCase with `Schema` suffix | `createOrderSchema` in `schemas.ts` |
| Type | PascalCase | `CreateOrderFormValues` |
| Constant | camelCase or UPPER_SNAKE | `statusColors`, `API_URL` |
| API function | camelCase verb prefix | `fetchOrders`, `createOrder` |
| Test file | matches source + `.test.ts` | `utils.test.ts` |

## Barrel Export Rules

Each layer has an `index.ts` that exports its public API:

```tsx
// components/atoms/index.ts
export { Avatar } from './Avatar';
export { EmptyState } from './EmptyState';
export { FormField } from './FormField';

// features/{domain}/index.ts
export { OrderListPage } from './OrderListPage';
export { CreateOrderDialog } from './CreateOrderDialog';
// ... only what other modules need
```

**Rules**:
- Features export ONLY what routes need (page components)
- Components export everything at each layer level
- Never re-export internal implementation details
- Import directly from the component file when within the same layer

## Import Order

```tsx
// 1. React and framework
import { useState } from 'react';

// 2. External packages (router, validation, icons, etc.)
import { z } from 'zod';
import { Plus } from 'lucide-react';

// 3. Internal shared (path aliases)
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

// 4. Internal components/features
import { CardGrid } from '@/components/organisms/CardGrid';
import { useOrdersQuery } from '@/hooks/queries/orderQueries';

// 5. Relative imports (same feature)
import { OrderCard } from './OrderCard';
import { createOrderSchema } from './schemas';
```

## Dependency Rules

```
shared/ui     →  (no internal deps)
atoms         →  shared/ui, shared/lib
molecules     →  atoms, shared/ui, shared/lib
organisms     →  atoms, molecules, shared/ui, shared/lib
layouts       →  shared/ui, shared/lib
features      →  ALL of the above + api/ + hooks/
routes        →  layouts, features (NOTHING else)
```

**NEVER**: atoms/molecules/organisms → features (would create domain coupling)
**NEVER**: features → features (would create cross-domain coupling)
**NEVER**: routes → atoms/molecules/organisms (use features as the composition layer)

## Greenfield Setup Checklist

When creating a new React project from scratch:

1. Initialize with your preferred build tool + React + TypeScript
2. Configure path aliases (`@/*` → `src/*`) in `tsconfig.json` + build config
3. Install core dependencies:
   - A **router** (file-based or config-based)
   - A **data-fetching library** with caching (server state management)
   - A **form library** with schema-based validation
   - A **styling solution** (utility-first CSS, CSS-in-JS, or CSS modules)
   - A **UI primitive library** or design system
4. Create directory structure (copy from layout above)
5. Set up shared infrastructure:
   - `shared/lib/utils.ts` (class merging utility, date formatting, etc.)
   - `shared/context/` (auth provider, theme provider)
   - `shared/ui/` (base UI primitives)
6. Create root route/layout with provider composition
7. Create first feature as a reference implementation
8. Configure linting (strict, zero warnings) + formatting
9. Configure testing framework + component testing library
