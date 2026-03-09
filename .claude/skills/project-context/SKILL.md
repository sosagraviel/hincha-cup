---
name: gira-platform
description: Hybrid project management and real-time chat platform development skill. Guides development within GIRA's Clean Architecture, DDD patterns, and real-time event pipeline.
---

# GIRA Platform Development Skill

You are an expert developer working on GIRA, a hybrid platform combining project management (kanban boards, issue tracking) with real-time chat/communication. This is a TypeScript monorepo using pnpm workspaces.

## Architecture Decision Framework

### When Adding Backend Features

**New Entity/Module**:
1. Create TypeORM entity in `services/backend/src/modules/{module}/database/models/{entity}.model.ts`
2. Create repository in `services/backend/src/modules/{module}/repository/{entity}.repository.ts`
3. Create service in `services/backend/src/modules/{module}/service/{entity}.service.ts`
4. Create DTOs in `services/backend/src/modules/{module}/presentation/dto/`
5. Create controller in `services/backend/src/modules/{module}/presentation/{entity}.controller.ts`
6. Create migration with `pnpm --filter backend typeorm:migration:create {MigrationName}`

**Adding to Existing Module**:
- Follow the existing vertical slice structure
- Add new files alongside existing ones in the appropriate layer
- Import/export through module's index files

**Shared Types**:
- DTOs used across services go in `packages/shared/src/dtos/{domain}/`
- Enums go in `packages/shared/src/enums/`
- Base classes go in `packages/shared/src/base/`

### When Adding Frontend Features

**New Feature**:
1. Create route file in `services/web-frontend/src/routes/` following TanStack Router conventions
2. Create feature folder at `services/web-frontend/src/features/{feature}/`
3. Add page component as `{Feature}Page.tsx`
4. Add query hooks in `services/web-frontend/src/hooks/queries/{feature}Queries.ts`

**New Component**:
- Atoms: `services/web-frontend/src/components/atoms/{ComponentName}.tsx`
- Molecules: `services/web-frontend/src/components/molecules/{ComponentName}.tsx`
- Organisms: `services/web-frontend/src/components/organisms/{ComponentName}.tsx`
- Feature-specific: `services/web-frontend/src/features/{feature}/{ComponentName}.tsx`

### When Adding Real-Time Features

1. Define event type and payload
2. Emit from service using `EntityEventEmitter.emit()`
3. Ensure permission evaluation covers the new entity type in `PermissionEvaluatorService`
4. Add channel subscription in frontend WebSocket hook
5. Handle `entity_change` event with appropriate payload type

## File Placement Rules

### Backend File Placement

| Type | Location | Naming |
|------|----------|--------|
| Entity | `modules/{module}/database/models/` | `{entity}.model.ts` |
| Repository | `modules/{module}/repository/` | `{entity}.repository.ts` |
| Service | `modules/{module}/service/` | `{entity}.service.ts` |
| Controller | `modules/{module}/presentation/` | `{entity}.controller.ts` |
| Module DTO | `modules/{module}/presentation/dto/` | `{action}-{entity}.dto.ts` |
| Migration | `database/migrations/` | `{timestamp}-{MigrationName}.ts` |
| Guard | `modules/auth/guards/` | `{name}.guard.ts` |
| Decorator | `modules/auth/decorators/` | `{name}.decorator.ts` |
| Interceptor | `libs/interceptors/` | `{name}.interceptor.ts` |
| Config | `config/` | `{name}.config.ts` |
| Unit Test | Same directory as source | `{name}.spec.ts` |
| Integration Test | `integration-tests/__tests__/` | `{name}.e2e-spec.ts` |

### Frontend File Placement

| Type | Location | Naming |
|------|----------|--------|
| Route | `routes/` | `_auth.{path}.tsx` or `{path}.tsx` |
| Feature Page | `features/{feature}/` | `{Feature}Page.tsx` |
| Feature Component | `features/{feature}/` | `{ComponentName}.tsx` |
| Atom | `components/atoms/` | `{ComponentName}.tsx` |
| Molecule | `components/molecules/` | `{ComponentName}.tsx` |
| Organism | `components/organisms/` | `{ComponentName}.tsx` |
| Layout | `components/layouts/` | `{LayoutName}.tsx` |
| Custom Hook | `hooks/` | `use{Name}.ts` |
| Query Hook | `hooks/queries/` | `{feature}Queries.ts` |
| Context | `shared/context/` | `{Name}Context.tsx` |
| UI Wrapper | `shared/ui/` | `{ComponentName}.tsx` |

### Shared Package File Placement

| Type | Location | Naming |
|------|----------|--------|
| DTO | `dtos/{domain}/` | `{name}.dto.ts` |
| Enum | `enums/` | `{name}.enum.ts` |
| Base Class | `base/` | `{name}.ts` |
| Utility | `utils/` | `{name}.ts` |

## Code Templates

### Backend Entity Template

```typescript
// services/backend/src/modules/{module}/database/models/{entity}.model.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('{entity_table_name}')
export class {EntityName}Model {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Backend Repository Template

```typescript
// services/backend/src/modules/{module}/repository/{entity}.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { {EntityName}Model } from '../database/models/{entity}.model';

@Injectable()
export class {EntityName}Repository {
  constructor(
    @InjectRepository({EntityName}Model)
    private readonly repository: Repository<{EntityName}Model>,
  ) {}

  async findById(id: string): Promise<{EntityName}Model | null> {
    return this.repository.findOne({ where: { id } });
  }

  async create(data: Partial<{EntityName}Model>): Promise<{EntityName}Model> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
```

### Backend Service Template

```typescript
// services/backend/src/modules/{module}/service/{entity}.service.ts
import { Injectable } from '@nestjs/common';
import { {EntityName}Repository } from '../repository/{entity}.repository';

@Injectable()
export class {EntityName}Service {
  constructor(private readonly repository: {EntityName}Repository) {}

  async findById(id: string) {
    return this.repository.findById(id);
  }
}
```

### Backend Controller Template

```typescript
// services/backend/src/modules/{module}/presentation/{entity}.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { {EntityName}Service } from '../service/{entity}.service';

@Controller('{entity-plural}')
@UseGuards(JwtAuthGuard)
export class {EntityName}Controller {
  constructor(private readonly service: {EntityName}Service) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
```

### Frontend Query Hook Template

```typescript
// services/web-frontend/src/hooks/queries/{feature}Queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

export const {feature}Keys = {
  all: ['{feature}'] as const,
  lists: () => [...{feature}Keys.all, 'list'] as const,
  detail: (id: string) => [...{feature}Keys.all, 'detail', id] as const,
};

export function use{Feature}(id: string) {
  return useQuery({
    queryKey: {feature}Keys.detail(id),
    queryFn: () => api.{feature}.getById(id),
  });
}

export function use{Feature}List() {
  return useQuery({
    queryKey: {feature}Keys.lists(),
    queryFn: () => api.{feature}.getAll(),
  });
}
```

### Frontend Page Component Template

```typescript
// services/web-frontend/src/features/{feature}/{Feature}Page.tsx
import { use{Feature}List } from '@/hooks/queries/{feature}Queries';

export function {Feature}Page() {
  const { data, isLoading, error } = use{Feature}List();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {/* Page content */}
    </div>
  );
}
```

## Authorization Patterns

### Protecting Endpoints

```typescript
// Realm-level roles (from Keycloak JWT)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@Get('admin-only')
async adminEndpoint() {}

// Organization-level roles (from database)
@UseGuards(JwtAuthGuard, OrgMemberGuard)
@OrgRoles('owner', 'admin')
@Get('org/:orgId/settings')
async orgSettings(@Param('orgId') orgId: string) {}

// Project-level roles (from database)
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ProjectRoles('admin', 'member')
@Get('project/:projectId/tickets')
async projectTickets(@Param('projectId') projectId: string) {}
```

## Real-Time Event Pattern

### Emitting Events

```typescript
// In service layer
import { EntityEventEmitter } from '@modules/queue/services/entity-event-emitter';

@Injectable()
export class TicketService {
  constructor(private readonly eventEmitter: EntityEventEmitter) {}

  async createTicket(data: CreateTicketDto) {
    const ticket = await this.repository.create(data);

    this.eventEmitter.emit({
      type: 'ticket',
      action: 'created',
      entityId: ticket.id,
      payload: ticket,
      context: { projectId: ticket.projectId },
    });

    return ticket;
  }
}
```

### Subscribing on Frontend

```typescript
// In React component
import { useWebSocket } from '@/hooks/useWebSocket';

function TicketList({ projectId }: { projectId: string }) {
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe(`project:${projectId}:tickets`, (event) => {
      if (event.type === 'ticket') {
        // Handle ticket event
        queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      }
    });

    return unsubscribe;
  }, [projectId]);
}
```

## Testing Patterns

### Backend Unit Test

```typescript
// services/backend/src/modules/{module}/service/{entity}.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { {EntityName}Service } from './{entity}.service';
import { {EntityName}Repository } from '../repository/{entity}.repository';

describe('{EntityName}Service', () => {
  let service: {EntityName}Service;
  let repository: jest.Mocked<{EntityName}Repository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {EntityName}Service,
        {
          provide: {EntityName}Repository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<{EntityName}Service>({EntityName}Service);
    repository = module.get({EntityName}Repository);
  });

  it('should find entity by id', async () => {
    const mockEntity = { id: '1', name: 'Test' };
    repository.findById.mockResolvedValue(mockEntity);

    const result = await service.findById('1');

    expect(result).toEqual(mockEntity);
    expect(repository.findById).toHaveBeenCalledWith('1');
  });
});
```

### Frontend E2E Test

```typescript
// services/web-frontend/e2e/{feature}.spec.ts
import { test, expect } from '@playwright/test';

test.describe('{Feature}', () => {
  test.beforeEach(async ({ page }) => {
    // Setup authentication
    await page.goto('/');
  });

  test('should display {feature} list', async ({ page }) => {
    await page.goto('/{feature}');
    await expect(page.getByRole('heading', { name: '{Feature}' })).toBeVisible();
  });
});
```

## Common Mistakes to Avoid

1. **Never access TypeORM repositories directly** - Always go through the `*.repository.ts` layer
2. **Don't skip response DTO validation** - All responses are validated; ensure DTOs match return types
3. **Remember AuthMiddleware is silent** - It doesn't reject requests; use guards to enforce auth
4. **Use correlation IDs in error handling** - Include them for distributed tracing
5. **Cache sessions by externalId** - Not by internal user ID
6. **Follow snake_case in DB, camelCase in code** - SnakeNamingStrategy handles conversion
7. **Run lint:check before committing** - Pre-commit hooks enforce max-warnings=0
8. **Use pnpm filter for package-specific commands** - e.g., `pnpm --filter backend test:unit`

## Import Conventions

### Backend Imports Order
1. External packages (`@nestjs/*`, `typeorm`, etc.)
2. Path aliases (`@src/*`, `@modules/*`, `@libs/*`, `@config/*`)
3. Shared package (`@livonit/shared`)
4. Relative imports

### Frontend Imports Order
1. External packages (`react`, `@tanstack/*`, etc.)
2. Path alias (`@/*`)
3. Shared package (`@livonit/shared`)
4. Relative imports
