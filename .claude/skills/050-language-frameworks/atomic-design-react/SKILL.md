---
name: atomic-design-react
description: Enforces atomic design patterns (atoms, molecules, organisms, templates) for React frontends with TypeScript, Tailwind v4, and shadcn/ui
category: language-framework
stacks: [react, typescript]
detection:
  files: [package.json, src/components]
  patterns:
    - "react" in package.json dependencies
    - component directory structure exists
always_copy: false
version: 1.0.0
---

# Atomic Design React Skill

Enforces atomic design patterns for the React frontend. All components must follow the hierarchy below.

## Component Hierarchy

### Atoms (`src/components/atoms/`)
Smallest UI building blocks. No business logic, pure presentational.
- Accept props for variants, sizes, states
- Examples: `Button`, `Input`, `Badge`, `Avatar`, `Checkbox`, `Tooltip`, `Select`
- Each in own directory: `ComponentName/index.tsx`

### Molecules (`src/components/molecules/`)
Compositions of atoms that form functional UI units. May have minimal local state.
- Examples: `SearchInput` (Input + Icon), `UserAvatar` (Avatar + Name), `FormField` (Label + Input + Error), `StatusBadge`, `PriorityBadge`

### Organisms (`src/components/organisms/`)
Complex UI sections composed of molecules and atoms. May connect to context/hooks.
- Examples: `Header`, `Sidebar`, `BoardColumn`, `TicketCard`, `TicketDetailPanel`, `CommentSection`

### Templates (`src/components/templates/`)
Page-level layout structures. Define the skeleton/grid of a page.
- Examples: `DashboardTemplate`, `SettingsTemplate`, `AuthTemplate`

### Pages (`src/routes/` via TanStack Router)
Route components that compose templates with data. Connect to React Query hooks.

## Conventions

- **TypeScript strict mode** — all components typed with proper interfaces
- **Directory structure**: `ComponentName/index.tsx`, optionally `ComponentName.test.tsx`
- **shadcn/ui** as base component library (`src/shared/ui/`)
- **Tailwind CSS 4** for styling (no inline styles, no CSS modules)
- **`cn()` utility** for conditional classes (from `src/lib/utils`)
- **React Query** for all server state (`src/hooks/queries/`, `src/hooks/mutations/`)
- **Zod schemas** for form validation
- **No `any` types**
- **Barrel exports** per atomic level (`index.ts` in each directory)

## File Organization

```
src/
  components/
    atoms/           # Button, Input, Badge, Avatar, etc.
    molecules/       # SearchInput, UserAvatar, FormField, etc.
    organisms/       # Header, BoardColumn, TicketCard, etc.
    templates/       # DashboardTemplate, AuthTemplate
  hooks/
    queries/         # React Query hooks (useOrganizations, useProjects, useTickets)
    mutations/       # React Query mutations
    useAuth.ts
  api/               # API client functions
    organizations.ts
    projects.ts
    tickets.ts
    comments.ts
    users.ts
  context/
    keycloak.tsx     # Auth context
    org.tsx          # Selected organization context
  lib/
    axios.ts         # Simplified API client
    constants.ts
    utils.ts
  routes/            # TanStack Router pages
  shared/ui/         # shadcn/ui components
```

## Component Template

```tsx
import { cn } from '@/lib/utils';

interface ComponentNameProps {
  // typed props
}

export function ComponentName({ ...props }: ComponentNameProps) {
  return (
    <div className={cn('base-classes', props.className)}>
      {/* component content */}
    </div>
  );
}
```
