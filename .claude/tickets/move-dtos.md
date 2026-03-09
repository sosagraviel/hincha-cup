# Consolidate DTOs in Shared Package

**Ticket ID:** DRAFT-20260309-CONSOLIDATE-DTOS
**Type:** Task
**Priority:** Medium
**Status:** Ready for Implementation
**Estimated Effort:** 3-4 days

---

## Summary

Consolidate all Data Transfer Objects (DTOs) from backend and frontend into the `@livonit/shared` package to eliminate duplication, ensure type consistency across services, and establish a single source of truth for API contracts.

## Background

Currently, DTOs are scattered across three locations:
1. `packages/shared/src/dtos/` - Partial DTO definitions with class-validator decorators
2. `services/backend/src/modules/*/presentation/dto/` - Duplicate DTOs extending shared DTOs + NestJS Swagger decorators
3. `services/web-frontend/src/api/types.ts` - Frontend-specific type definitions for entities not in shared

This creates maintenance overhead, potential inconsistencies, and violates DRY principles.

## Problem Statement

**Current Issues:**
- **Duplication**: Backend DTOs extend shared DTOs solely to add Swagger decorators (no longer needed)
- **Fragmentation**: Some DTOs (e.g., `UpdateMemberRoleDto`) only exist in backend
- **Inconsistency**: Frontend response types (ChatRoom, ChatMessage, DmThread) defined separately
- **Maintenance Burden**: Changes require updates in multiple locations

**Impact:**
- Risk of type mismatches between frontend and backend
- Increased cognitive load for developers
- Potential bugs from unsynchronized DTO definitions

## Goals

1. **Single Source of Truth**: All DTOs in `@livonit/shared` package
2. **Remove Duplication**: Delete all backend-specific DTO files
3. **Consistency**: Frontend and backend use identical type definitions
4. **Clean Imports**: Update all references to import from `@livonit/shared`

## Non-Goals

- Changing DTO validation logic or business rules
- Refactoring DTO structure or field names
- Adding new DTOs or fields
- Modifying API endpoints or contracts

## Technical Approach

### 1. Audit and Inventory (Gap Detection Results)

**DTOs Already in Shared:**
- Organization: CreateOrganizationDto, UpdateOrganizationDto, AddOrgMemberDto, UpdateOrgMemberDto
- Project: CreateProjectDto, UpdateProjectDto, AddProjectMemberDto
- Ticket: CreateTicketDto, UpdateTicketDto, MoveTicketDto, ListTicketsQueryDto
- Comment: CreateCommentDto, UpdateCommentDto
- Chat: StartDmDto, SendMessageDto, CreateRoomDto
- User: UserResponseDto, UpdateUserDto
- Pagination: PaginationQueryDto
- Invite: InviteUserDto, InviteUserResponseDto

**DTOs Only in Backend (Need to Move):**
- Organization: `UpdateMemberRoleDto` (update-member-role.dto.ts)
- Any other backend-specific DTOs discovered during implementation

**Response Types Only in Frontend (Need to Move):**
- Chat: ChatRoom, ChatMessage, DmThread
- Any other frontend-specific types

### 2. Migration Strategy

**Phase 1: Move Missing DTOs to Shared**
1. Move backend-only DTOs to appropriate shared directories
2. Remove all Swagger decorators (@ApiProperty, @ApiPropertyOptional)
3. Keep only class-validator decorators (@IsString, @IsNotEmpty, etc.)
4. Update shared package exports

**Phase 2: Move Frontend Response Types**
1. Create response type interfaces in `packages/shared/src/types/`
2. Move ChatRoom, ChatMessage, DmThread definitions
3. Update shared package exports

**Phase 3: Update Backend References**
1. Remove local DTO files in `services/backend/src/modules/*/presentation/dto/`
2. Update controller imports to use `@livonit/shared/dtos`
3. Remove Swagger decorators from controller method signatures
4. Run type checks: `pnpm --filter backend type:check`

**Phase 4: Update Frontend References**
1. Remove DTO re-exports from `services/web-frontend/src/api/types.ts`
2. Update imports to use `@livonit/shared/dtos` or `@livonit/shared/types`
3. Run type checks: `pnpm --filter web-frontend type:check`

**Phase 5: Validation**
1. Run all tests: `pnpm --filter backend test:unit`
2. Build all packages: `pnpm -r build`
3. Verify no TypeScript errors across monorepo
4. Manual smoke test of API endpoints

### 3. File Structure After Migration

```
packages/shared/src/
├── dtos/
│   ├── organization/
│   │   ├── create-organization.dto.ts
│   │   ├── update-organization.dto.ts
│   │   ├── add-org-member.dto.ts
│   │   ├── update-org-member.dto.ts
│   │   ├── update-member-role.dto.ts  ← NEW
│   │   └── index.ts
│   ├── project/...
│   ├── ticket/...
│   ├── comment/...
│   ├── chat/...
│   ├── user/...
│   └── index.ts
├── types/
│   ├── chat/
│   │   ├── chat-room.ts  ← NEW
│   │   ├── chat-message.ts  ← NEW
│   │   ├── dm-thread.ts  ← NEW
│   │   └── index.ts  ← NEW
│   └── index.ts  ← NEW
└── index.ts
```

## Acceptance Criteria

### AC1: All DTOs Consolidated in Shared Package
**Given** the project structure
**When** I search for DTO files
**Then** all DTOs exist only in `packages/shared/src/dtos/`
**And** no DTO files exist in `services/backend/src/modules/*/presentation/dto/`
**And** no DTO type definitions exist in `services/web-frontend/src/api/types.ts`

### AC2: Backend Uses Shared DTOs
**Given** any backend controller file
**When** I check the imports
**Then** all DTO imports reference `@livonit/shared/dtos`
**And** no local `./dto/*` imports exist
**And** no Swagger decorators exist on DTO classes in shared package

### AC3: Frontend Uses Shared Types
**Given** the frontend codebase
**When** I check `services/web-frontend/src/api/types.ts`
**Then** it only re-exports from `@livonit/shared`
**And** no inline type definitions for DTOs or response types exist
**And** all API functions use types from `@livonit/shared`

### AC4: Type Safety Maintained
**Given** the entire codebase
**When** I run `pnpm --filter backend type:check`
**Then** TypeScript compilation succeeds with zero errors
**When** I run `pnpm --filter web-frontend type:check`
**Then** TypeScript compilation succeeds with zero errors

### AC5: Tests Pass
**Given** the backend test suite
**When** I run `pnpm --filter backend test:unit`
**Then** all tests pass with no failures
**And** no import errors occur

### AC6: Build Succeeds
**Given** the entire monorepo
**When** I run `pnpm -r build`
**Then** all packages build successfully
**And** the shared package generates proper type declarations in `dist/`

### AC7: Runtime Validation Works
**Given** a running backend server
**When** I send requests with invalid DTO data
**Then** class-validator decorators properly reject invalid requests
**And** validation behavior is unchanged from before migration

## Implementation Checklist

- [ ] Audit all existing DTOs in backend and frontend
- [ ] Move backend-only DTOs to shared package (remove Swagger decorators)
- [ ] Create types directory in shared for response types
- [ ] Move frontend response types (ChatRoom, ChatMessage, DmThread) to shared
- [ ] Update shared package exports (dtos/index.ts, types/index.ts)
- [ ] Delete all backend DTO files in `services/backend/src/modules/*/presentation/dto/`
- [ ] Update all backend controller imports to use `@livonit/shared/dtos`
- [ ] Update frontend types.ts to only re-export from shared
- [ ] Run type checks: `pnpm --filter backend type:check`
- [ ] Run type checks: `pnpm --filter web-frontend type:check`
- [ ] Run unit tests: `pnpm --filter backend test:unit`
- [ ] Build all packages: `pnpm -r build`
- [ ] Manual smoke test: Create organization, project, ticket via API
- [ ] Verify frontend can still call all API endpoints

## Edge Cases & Considerations

1. **Circular Dependencies**: Ensure DTOs don't import from entities/models (only enums/interfaces)
2. **Validation Decorators**: Some DTOs may have backend-specific validation (e.g., database checks) - keep those in services
3. **Class-Transformer**: Ensure `class-transformer` decorators still work for nested DTOs
4. **Path Aliases**: Verify `@livonit/shared` alias works in both backend tsconfig and frontend tsconfig
5. **Build Order**: Shared package must build before backend/frontend in CI/CD

## Testing Strategy

### Unit Tests
- Verify existing backend unit tests still pass
- No new tests needed (pure refactoring)

### Integration Tests
- Run existing backend integration tests
- Verify DTO validation still rejects invalid payloads

### Manual Testing
1. Start backend: `make up s=backend`
2. Test POST /api/v1/organizations with valid/invalid data
3. Test POST /api/v1/projects with valid/invalid data
4. Test POST /api/v1/tickets with valid/invalid data
5. Verify frontend can create organizations/projects/tickets

## Rollback Plan

If issues arise:
1. Revert commits to shared package
2. Restore deleted backend DTO files from git history
3. Restore frontend types.ts from git history
4. Run `pnpm -r build` to rebuild

## Dependencies & Blockers

**Dependencies:**
- None (self-contained refactoring)

**Potential Blockers:**
- Undocumented DTOs not discoverable via glob/grep
- DTOs with complex validation logic tied to backend services

## Success Metrics

- **Quantitative:**
  - 0 DTO files in `services/backend/src/modules/*/presentation/dto/`
  - 100% of DTO imports from `@livonit/shared`
  - 0 TypeScript errors in backend and frontend
  - All tests passing (currently ~X unit tests)

- **Qualitative:**
  - Developers can find all DTOs in one location
  - Adding new DTOs has clear, single location
  - Frontend-backend type sync is guaranteed

## Out of Scope

- Refactoring DTO validation logic
- Adding new DTOs or fields
- Changing API contracts
- Adding Swagger documentation (removed as per decision)
- Migrating database models or entities

## Notes

- Swagger decorators are being removed entirely (not used for documentation)
- All DTOs moved to shared, even if only one service uses them currently
- Response types for Chat entities need to be created in shared/types
- This is a pure refactoring - no behavioral changes expected

---

**INVEST Validation:**
- ✅ **Independent**: No external dependencies, can be completed standalone
- ✅ **Negotiable**: Approach is flexible, can be done incrementally by module
- ✅ **Valuable**: Reduces technical debt, improves maintainability
- ✅ **Estimable**: Clear scope, 3-4 days based on ~20 DTOs + testing
- ✅ **Small**: Single developer can complete in one sprint
- ✅ **Testable**: Clear acceptance criteria with automated type checks

**Gap Detection Summary:**
- 3 questions asked to engineer
- 0 fields inferred from codebase (explicit decisions needed on Swagger, DTO location, response types)
- All critical decisions documented in ticket
