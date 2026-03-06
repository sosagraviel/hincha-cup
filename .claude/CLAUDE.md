# Gira - CLAUDE.md

## Project Overview

Jira-like project management with real-time updates and real-time chat. PNPM monorepo with NestJS backend, React frontend, PostgreSQL, Redis, and Keycloak authentication.

## Quick Reference

```bash
# Development
make setup          # Full dev environment setup
make up             # Start all containers
make down           # Stop containers
make logs s=backend # View service logs
make tests          # Run all tests

# Individual services
pnpm --filter ./services/backend start:dev
pnpm --filter ./services/web-frontend start:dev
pnpm --filter @livonit/shared build

# Testing
pnpm --filter ./services/backend test:unit
pnpm --filter ./services/backend test:integration
pnpm --filter ./services/web-frontend test:e2e

# Code quality
pnpm --filter ./services/backend lint:check
pnpm --filter ./services/backend format:check
pnpm --filter ./services/backend type:check
```

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js | >= 22.14.x |
| Package Manager | pnpm | 10.2.1 |
| Backend | NestJS | 11.0.11 |
| Frontend | React + Vite | 19.1.0 / 6.3.5 |
| Database | PostgreSQL | 16.8 |
| Cache/Queue | Redis + BullMQ | 7 / 5.0.0 |
| ORM | TypeORM | 0.3.21 |
| Auth | Keycloak | 26.1.3 |
| Routing | TanStack Router | 1.120.5 |
| State | TanStack Query | 5.77.2 |
| WebSocket | Socket.IO | 4.8.1 |
| Styling | Tailwind CSS | 4.1.7 |
| TypeScript | TypeScript | 5.8.2-5.8.3 |

## Architecture

**Monorepo Structure**: `services/*`, `packages/*`, `seeds/*`

**Backend** (Clean Architecture):
- `modules/<feature>/database/models/` - TypeORM entities
- `modules/<feature>/repository/` - Data access layer
- `modules/<feature>/service/` - Business logic
- `modules/<feature>/presentation/` - Controllers + DTOs
- `modules/<feature>/<feature>.module.ts` - Module definition

**Frontend** (Feature-based):
- `features/<domain>/` - Domain components (Page, Card, Dialog)
- `hooks/queries/` - TanStack Query hooks
- `api/` - API client functions
- `routes/` - TanStack Router file-based routes
- `components/atoms|molecules|organisms/` - Atomic design

**Shared Package** (`@livonit/shared`):
- DTOs, enums, base classes shared between frontend/backend
- Import: `import { EntityChangeType } from '@livonit/shared'`

## File Placement Guide

| Type | Location |
|------|----------|
| Backend entity | `services/backend/src/modules/<feature>/database/models/<entity>.model.ts` |
| Backend repository | `services/backend/src/modules/<feature>/repository/<entity>.repository.ts` |
| Backend service | `services/backend/src/modules/<feature>/service/<entity>.service.ts` |
| Backend controller | `services/backend/src/modules/<feature>/presentation/<entity>.controller.ts` |
| Backend DTO | `services/backend/src/modules/<feature>/presentation/dto/<action>-<entity>.dto.ts` |
| Backend module | `services/backend/src/modules/<feature>/<feature>.module.ts` |
| Backend guard | `services/backend/src/modules/auth/guards/<name>.guard.ts` |
| Backend middleware | `services/backend/src/libs/context/` or `modules/auth/middleware/` |
| Backend interceptor | `services/backend/src/libs/interceptors/<name>.interceptor.ts` |
| Backend exception | `services/backend/src/libs/exceptions/` |
| Frontend feature page | `services/web-frontend/src/features/<domain>/<Domain>Page.tsx` |
| Frontend feature component | `services/web-frontend/src/features/<domain>/<Component>.tsx` |
| Frontend query hook | `services/web-frontend/src/hooks/queries/<entity>Queries.ts` |
| Frontend API client | `services/web-frontend/src/api/<entity>.ts` |
| Frontend route | `services/web-frontend/src/routes/_auth.<path>.tsx` |
| Frontend atom | `services/web-frontend/src/components/atoms/<Name>/index.tsx` |
| Frontend molecule | `services/web-frontend/src/components/molecules/<Name>/index.tsx` |
| Frontend organism | `services/web-frontend/src/components/organisms/<Name>/index.tsx` |
| Shared DTO | `packages/shared/src/dtos/<entity>/<action>-<entity>.dto.ts` |
| Shared enum | `packages/shared/src/enums/<name>.enum.ts` |
| Migration | `services/backend/src/migrations/<timestamp>-<name>.ts` |
| Seed | `services/backend/src/seeds/<timestamp>-<name>.ts` |

## Path Aliases

**Backend** (`services/backend/tsconfig.json`):
- `@src/*` -> `src/*`
- `@modules/*` -> `src/modules/*`
- `@config/*` -> `src/configs/*`
- `@libs/*` -> `src/libs/*`
- `@livonit/shared` -> `packages/shared/src/index.ts`

**Frontend** (`services/web-frontend/tsconfig.app.json`):
- `@/*` -> `src/*`
- `@livonit/shared` -> `packages/shared/src/index.ts`

## Conventions

### Naming
- Backend: `<Feature>Module`, `<Feature>Controller`, `<Feature>Service`, `<Feature>Repository`
- DTOs: `<action>-<entity>.dto.ts` (create-ticket.dto.ts, update-ticket.dto.ts)
- Frontend hooks: `use<Entity><Action>Query` / `use<Entity><Action>Mutation`
- Database: snake_case columns (SnakeNamingStrategy auto-converts)

### Code Style
- ESLint `--max-warnings=0`
- Prettier: single quotes, no trailing commas
- TypeScript strict mode
- JSDoc on public methods

### Git
- Branch: `feat:<jira-ticket>-<jira-ticket-title>`
- Commits: Conventional commits (commitlint + Commitizen)
- Pre-commit: lint, type-check, format

## Testing

```bash
# Backend unit tests
pnpm --filter ./services/backend test:unit

# Backend integration tests (requires running DB)
pnpm --filter ./services/backend test:integration

# Frontend E2E (Playwright)
pnpm --filter ./services/web-frontend test:e2e
```

## Environment

- `.env.development` - Local development
- `.env.testing` - Test environment
- Validation via `@config/validate-config.ts`

## Services (Docker)

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache + Queue |
| Backend | 3050 | API |
| Frontend | 2712 | Web UI |
| Keycloak | 7080 | Auth |
| MailHog | 8025 | Email testing |
