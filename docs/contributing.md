# Contributing

Thank you for contributing to this gira. This document covers setup, development workflow, conventions, and how to add new modules.

---

## Prerequisites

| Tool | Required version |
|------|-----------------|
| Node.js | >= 22.14.x |
| pnpm | 10.x |
| Docker + Docker Compose | any recent version |
| Make | any |

---

## Initial Setup

```bash
# 1. Clone and install all workspace packages
pnpm install

# 2. Copy environment files
cp .env.development.example .env.development
cp .env.testing.example .env.testing

# 3. Start Docker services, configure Keycloak, and seed the DB
make setup
```

The `make setup` command runs: `make up` → Keycloak init → DB migrations → demo seed data.

### Environment Variables

The main variables to configure in `.env.development`:

| Variable | Purpose |
|----------|---------|
| `API_PORT` | NestJS port (default `3050`) |
| `API_PREFIX` | URL prefix (default `api/v1`) |
| `DB_*` | PostgreSQL connection |
| `REDIS_*` | Redis connection |
| `KEYCLOAK_*` | Keycloak realm/client config |
| `AWS_*` | S3-compatible storage |

---

## Day-to-Day Development

### Starting services

```bash
make up                        # Start all Docker services
make up s=backend              # Start only the backend
make logs s=backend            # Tail service logs
make sh s=backend              # Open a shell in a container
make rebuild-packages s=backend  # Rebuild @livonit/* packages and restart
```

### Running the backend in watch mode

```bash
pnpm --filter ./services/backend start:dev
```

### Running the frontend in watch mode

```bash
pnpm --filter ./services/web-frontend start:dev
```

---

## Testing

### Backend unit tests

```bash
# All unit tests
pnpm --filter ./services/backend test:unit

# Single test file
pnpm --filter ./services/backend test:unit -- organization.service.spec.ts
```

### Backend integration tests

Integration tests spin up a real database and Keycloak; ensure `make up` is running first.

```bash
# All integration tests
pnpm --filter ./services/backend test:integration

# Single test file
pnpm --filter ./services/backend test:integration -- organization.e2e-spec.ts
```

### Frontend E2E tests (Playwright)

```bash
# Requires the full stack running (make up)
pnpm --filter ./services/web-frontend test:e2e
```

### Writing tests

- **Unit tests** (`*.spec.ts`) live next to the source file they test.
  - Mock repositories and services with `jest.fn()` — no database required.
  - Use `getRepositoryToken(Entity)` from `@nestjs/typeorm` to mock TypeORM repositories.
- **Integration tests** (`*.e2e-spec.ts`) live in `services/backend/src/integration-tests/__tests__/`.
  - Use `supertest` against the running NestJS app.
  - Discover seeded IDs at runtime via API calls — never hard-code UUIDs.
  - Cover happy paths **and** error paths (400, 403, 404, 409).
- **E2E tests** live in `services/web-frontend/e2e/`.
  - Use `data-testid` attributes for selectors.
  - Share login helpers from `e2e/helpers/auth.ts`.

---

## Code Conventions

### Commit messages

Conventional Commits are enforced via `commitlint`:

```
feat(module): short description
fix(module): short description
refactor(module): short description
test(module): short description
docs: short description
```

### Naming

| Context | Convention |
|---------|-----------|
| TypeScript files/classes | camelCase / PascalCase |
| Database columns | snake_case (via `SnakeNamingStrategy`) |
| TypeORM entity files | `*.model.ts` |
| Test files | `*.spec.ts` (unit), `*.e2e-spec.ts` (integration) |
| DTOs | `*RequestDto`, `*ResponseDto` |

### Import ordering (ESLint enforced)

1. Node built-ins
2. External packages (`@nestjs/*`, `typeorm`, etc.)
3. Workspace packages (`@livonit/*`)
4. Internal path aliases (`@modules/*`, `@libs/*`, `@src/*`)
5. Relative imports

### Styling (frontend)

- Tailwind CSS 4 utility classes **only** — no inline styles or CSS modules.
- Use `cn()` from `@/shared/lib/utils` for conditional class merging.
- Follow the zinc-* color scale; accent is `blue-600`.
- Each component lives in its own directory: `ComponentName/index.tsx`.

---

## Adding a New Backend Module

Follow this checklist to add a fully-wired NestJS feature module:

### 1. Scaffold the module structure

```
src/modules/<name>/
├── <name>.module.ts
├── presentation/
│   ├── <name>.controller.ts
│   └── dto/
│       ├── create-<name>.dto.ts
│       └── update-<name>.dto.ts
├── service/
│   └── <name>.service.ts
├── repository/
│   └── <name>.repository.ts
└── database/
    ├── models/
    │   └── <name>.model.ts
    └── migrations/
```

### 2. Create the TypeORM entity (`*.model.ts`)

```typescript
@Entity('<table_name>')
export class MyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ... columns

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 3. Create a migration

```bash
pnpm --filter ./services/backend typeorm:migration:create -- CreateMyEntityTable
```

Then fill in the generated `up.sql` / `down.sql` files.

### 4. Create the repository

Inject the TypeORM `Repository<MyEntity>` using `@InjectRepository(MyEntity)`:

```typescript
@Injectable()
export class MyRepository {
  constructor(
    @InjectRepository(MyEntity)
    private readonly repo: Repository<MyEntity>
  ) {}
}
```

### 5. Create the service

- Inject the repository (never inject `DataSource` directly).
- Add JSDoc with `@param`, `@returns`, `@throws` for every public method.
- Emit `EntityChangeType` events via `EntityEventEmitter` for real-time updates.

### 6. Create the controller

- Add `@ApiTags('MyModule')`, `@ApiBearerAuth()`, `@ApiOperation()`, and `@ApiOkResponse()` / `@ApiCreatedResponse()` decorators.
- All body parameters must use class-validator DTOs with `@ApiProperty()` decorators.

### 7. Register the module

In `<name>.module.ts`:

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MyEntity])],
  controllers: [MyController],
  providers: [MyService, MyRepository],
  exports: [MyService],
})
export class MyModule {}
```

Import `MyModule` in `app.module.ts`.

### 8. Write tests

- Unit test: `<name>.service.spec.ts` — mock the repository, cover happy paths and exceptions.
- Integration test: `<name>.e2e-spec.ts` — cover create, read, update, delete, and error paths.

---

## API Documentation

Swagger UI is available at `http://localhost:3050/api/v1/docs` when the backend is running. The spec is auto-generated from controller and DTO decorators.

---

## Database Migrations

```bash
# Create a new migration (from services/backend)
pnpm --filter ./services/backend typeorm:migration:create -- DescriptionOfChange

# Create a new seed
pnpm --filter ./services/backend typeorm:seed:create -- SeedName
```

Migrations and seeds run automatically on startup (`DB_MIGRATIONS_RUN=true`).

---

## Useful Links

- [NestJS docs](https://docs.nestjs.com)
- [TypeORM docs](https://typeorm.io)
- [TanStack Router docs](https://tanstack.com/router)
- [shadcn/ui docs](https://ui.shadcn.com)
- [Playwright docs](https://playwright.dev)
- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api)
