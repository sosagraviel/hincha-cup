# @livonit/shared

Shared DTOs, enums, base types, and utilities imported by both the backend (`services/backend`) and frontend (`services/web-frontend`). Published as a workspace package — no install step needed within the monorepo.

---

## Usage

```typescript
import { TicketStatus, Priority, OrgRole } from '@livonit/shared';
import { DTOs } from '@livonit/shared';

const dto: DTOs.Ticket.CreateTicketDto = { ... };
```

---

## Enums

| Enum | Values |
| --- | --- |
| `TicketStatus` | `backlog` · `todo` · `in_progress` · `in_review` · `done` |
| `Priority` | `critical` · `high` · `medium` · `low` |
| `OrgRole` | `owner` · `admin` · `member` |
| `ProjectRole` | `admin` · `member` · `viewer` |
| `UserStatus` | `active` · `invited` · `inactive` |
| `EntityChangeType` | `ENTITY_CREATED` · `ENTITY_UPDATED` · `ENTITY_DELETED` |

---

## DTOs

DTOs are grouped by domain under `DTOs.*` and validated with `class-validator` + `class-transformer`.

| Domain | DTOs |
| --- | --- |
| `DTOs.User` | `UpdateUserDto`, `UserResponseDto` |
| `DTOs.Organization` | `CreateOrganizationDto`, `UpdateOrganizationDto`, `AddOrgMemberDto`, `UpdateOrgMemberDto` |
| `DTOs.Project` | `CreateProjectDto`, `UpdateProjectDto`, `AddProjectMemberDto` |
| `DTOs.Ticket` | `CreateTicketDto`, `UpdateTicketDto`, `MoveTicketDto` |
| `DTOs.Comment` | `CreateCommentDto`, `UpdateCommentDto` |
| `DTOs.Invite` | `InviteUserDto`, `InviteUserResponseDto` |
| `DTOs.Pagination` | `PaginationQueryDto` |

---

## Base Types

| Export | Description |
| --- | --- |
| `BaseResponseDto` | Base class for response DTOs |
| `PaginatedResponseBase` | Wrapper for paginated list responses |
| `PaginatedQueryRequestDto` | Base class for `page` / `limit` query params |
| `ApiErrorResponse` | Standard error response shape |
| `AggregationTypes` | Shared type helpers |

---

## Build

```bash
pnpm --filter @livonit/shared build   # Compile TypeScript → dist/

# In watch mode (for local development with hot rebuild)
pnpm --filter @livonit/shared dev
```

The package must be built before services start. `make rebuild-packages` handles this automatically in Docker.
