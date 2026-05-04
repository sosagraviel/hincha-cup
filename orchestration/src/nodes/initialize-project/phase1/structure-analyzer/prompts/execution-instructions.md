# Structure & Architecture Analysis Instructions

<objective>
Analyze repository structure and identify all services/packages with their languages, frameworks, and architectural patterns. Create a comprehensive map of the codebase structure.
</objective>

<discovery_process>

## Step 1: Find All Manifest Files

Use Glob with these universal manifest patterns (works across all stacks):

```
**/package.json          # JavaScript/TypeScript (npm, yarn, pnpm, bun)
**/pyproject.toml        # Python (Poetry, PDM, Hatch)
**/setup.py              # Python (setuptools)
**/requirements.txt      # Python (pip)
**/Pipfile               # Python (Pipenv)
**/go.mod                # Go
**/Cargo.toml            # Rust
**/pom.xml               # Java (Maven)
**/build.gradle*         # Java/Kotlin (Gradle)
**/Gemfile               # Ruby
**/composer.json         # PHP
**/*.csproj              # C#
**/Package.swift         # Swift
**/mix.exs               # Elixir
**/pubspec.yaml          # Dart/Flutter
```

Each manifest file represents a potential service or package. Read each one to extract metadata.

## Step 2: Detect All Languages in Repository

<multi_language_detection>

**Don't assume a single primary language!** Modern projects often mix multiple languages:

- TypeScript backend + Python ML workers + Go microservices
- JavaScript config files in TypeScript projects
- Shell scripts in any project
- Infrastructure as Code (Terraform, CloudFormation)

**Count files by extension to detect ALL languages:**

Prefer Glob with narrow, service-scoped patterns (e.g. `services/**/*.ts`,
`packages/**/*.py`) over a repo-wide `find`. A raw `find .` will descend into
`node_modules`, `dist`, the framework directory, and every other path listed in
the `<excluded_directories>` block, burning the token budget on one call.

If you do use Bash, you MUST exclude every directory from the
`<excluded_directories>` tag — not just `node_modules` and `.git`. Example
pattern (extend the `-o -name ...` list to cover every excluded dir for this
project):

```bash
find . \
  \( -name node_modules -o -name .git -o -name dist -o -name build \
     -o -name .next -o -name coverage -o -name .venv -o -name venv \
     -o -name .claude -o -name .claude-temp -o -name .claude-backups \
     -o -name .codex  -o -name .codex-temp  -o -name .codex-backups \
     -o -name qubika-agentic-framework -o -name ai-agentic-framework \
  \) -prune -o -type f -print \
  | awk -F. 'NF>1 {print $NF}' | sort | uniq -c | sort -rn | head -30
```

Do not replace `-prune` with a single `grep -v` — that only removes one
pattern and still walks the excluded trees.

**Language identification from extensions:**

- `.ts, .tsx, .mts, .cts` → TypeScript
- `.js, .jsx, .mjs, .cjs` → JavaScript
- `.py` → Python
- `.go` → Go
- `.rs` → Rust
- `.java` → Java
- `.kt, .kts` → Kotlin
- `.rb` → Ruby
- `.php` → PHP
- `.cs` → C#
- `.swift` → Swift
- `.ex, .exs` → Elixir
- `.dart` → Dart
- `.c, .h` → C
- `.cpp, .cc, .cxx, .hpp` → C++
- `.sh, .bash` → Shell

**Report in `findings.languages` array:** All languages with 5+ files (excludes trivial config files).

**Example output:**

```json
"languages": ["typescript", "javascript", "python", "shell"]
```

</multi_language_detection>

## Step 3: Determine Repository Type

<repository_detection>

**Monorepo indicators:**

- JavaScript/TypeScript: `workspaces` field in package.json, lerna.json, pnpm-workspace.yaml, nx.json, turbo.json
- Python: Multiple pyproject.toml/setup.py in subdirectories
- Go: go.work file (Go workspaces)
- Rust: `[workspace]` section in root Cargo.toml
- Java: Parent pom.xml with `<modules>`, or settings.gradle with `include`
- Ruby: Multiple Gemfile files in subdirectories
- PHP: Multiple composer.json files

**Single-service:** One manifest at root, no workspace configuration
**Polyrepo:** Each service in separate repository (rare in codebase analysis)

If monorepo detected, list ALL packages/services with their relative paths.

</repository_detection>

## Step 4: Detect Runtime Versions

<runtime_detection>

**Search for version constraint files across the repository:**

Use Glob to find version files:

```
**/.nvmrc                # Node.js version
**/.node-version         # Node.js version (alternative)
**/package.json          # engines field for Node/npm/pnpm/yarn
**/.python-version       # Python version (pyenv)
**/runtime.txt           # Python version (Heroku, some platforms)
**/.go-version           # Go version
**/go.mod                # Go version (go directive)
**/.ruby-version         # Ruby version
**/.tool-versions        # asdf version manager (multi-runtime)
**/rust-toolchain.toml   # Rust version
**/Cargo.toml            # Rust edition
**/.java-version         # Java version
```

**Extract version information:**

- **Node.js:** Read `.nvmrc` content (e.g., "22.14.0" or ">=22.14.x"), or `package.json` engines field
- **Python:** Read `.python-version` (e.g., "3.11.5"), or pyproject.toml `requires-python` field
- **Go:** Read `go.mod` `go` directive line (e.g., "go 1.21")
- **Rust:** Read `rust-toolchain.toml` or Cargo.toml `edition` field
- **Ruby:** Read `.ruby-version` (e.g., "3.2.2")
- **Java:** Read `.java-version` or pom.xml `java.version`

**Report in `findings.runtimes` object:**

```json
"runtimes": {
  "node": ">=22.14.x",
  "python": "3.11",
  "pnpm": ">=10"
}
```

If multiple version files exist (monorepo with mixed versions), report the most common or aggregate as "varies by service".

</runtime_detection>

## Step 5: Extract Service Information

For each discovered manifest file, read it and extract:

<service_metadata>

**Identity:**

- id: Short identifier (e.g., "api", "web", "worker")
- name: Human-readable name from manifest (if present)
- path: Relative path from repository root to service directory

**Language & Version:**

- Primary language inferred from manifest type
- Version constraints from manifest or version files (.nvmrc, .python-version, .go-version, .ruby-version, runtime.txt)

**Frameworks (from dependencies):**

- Main framework: Express, NestJS, Fastify (Node); Django, Flask, FastAPI (Python); Gin, Echo, Chi (Go); Axum, Rocket, Actix (Rust); Spring Boot (Java); Rails, Sinatra (Ruby)
- ORM/Database: TypeORM, Prisma, Sequelize (Node); SQLAlchemy, Django ORM (Python); GORM (Go); Diesel (Rust); Hibernate, JPA (Java); ActiveRecord (Ruby)

**Service Type (infer from dependencies and structure):**

- backend: HTTP framework dependencies (express, flask, gin, actix-web)
- frontend: UI framework dependencies (react, vue, angular, svelte)
- serverless: Serverless framework, AWS Lambda packages
- worker: Background job libraries (bull, celery, sidekiq)
- library: No server dependencies, reusable modules
- cli: CLI framework dependencies (commander, click, cobra, clap)
- mobile: React Native, Flutter
- desktop: Electron, Tauri

</service_metadata>

## Step 6: Analyze Architecture Patterns

<architecture_analysis>

Examine the source code directory structure (typically `src/`, `lib/`, `app/`, or root-level files).

**Common Patterns to Identify:**

1. **MVC (Model-View-Controller):** Separate directories for models/, views/, controllers/
2. **Vertical Slicing:** Feature-based directories (users/, orders/, payments/)
3. **Hexagonal/Clean:** Core domain separated from adapters (domain/, infrastructure/, application/)
4. **DDD (Domain-Driven Design):** Bounded contexts, aggregates, entities, value objects
5. **Flat:** All files in one directory or minimal nesting

**Let the code structure guide discovery** - don't force a pattern classification if the structure is ambiguous.

</architecture_analysis>

## Step 7: Create Comprehensive File Placement Map

<file_mapping>

**CRITICAL:** Create a concise table (10-20 rows) showing where major code types live in the repository. This is THE MOST IMPORTANT output for developers.

**Discovery approach:**

1. **Start with manifest-driven discovery** (frameworks tell you what patterns to expect)
2. **Search for semantic patterns** based on discovered frameworks
3. **Use glob patterns with file counts** to describe where code types live (e.g., `src/modules/**/*.service.ts` ~12 files)
4. **Group by service/package** if monorepo

**Universal Code Type Patterns:**

Search for these code types using framework-specific patterns:

### Backend Services

| Code Type                       | Search Strategy                               | Example Patterns by Framework                                                                                                                                            |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Database Models/Entities**    | ORM decorators, class definitions with fields | NestJS: `@Entity()`, Django: `models.Model`, Go: struct tags, Rust: `#[derive]`, Rails: `app/models/*.rb` inheriting `ApplicationRecord`                                 |
| **Controllers/Handlers/Routes** | Route decorators, HTTP method handlers        | NestJS: `@Controller()`, Django: `views.py`, Go: `router.Group()`, Rust: `Router::new()`, Rails: `app/controllers/**/*_controller.rb` + `config/routes.rb`               |
| **Services/Business Logic**     | Service classes, business logic               | NestJS: `@Injectable()`, Django: `services.py`, Go: `service/`, Rust: `impl` blocks, Rails: `app/services/**/*.rb` (convention) or `app/models/concerns/`                |
| **DTOs/Request-Response**       | Data transfer objects, validation schemas     | NestJS: `class.*Dto`, Django: `serializers.py`, Go: request/response structs, Rust: Serde derives, Rails: `app/views/**/*.jbuilder` or strong_params in controllers      |
| **Database Migrations**         | Migration files in ORM-specific locations     | TypeORM: `src/**/migrations/*.ts`, Alembic: `alembic/versions/*.py`, GORM: `migrations/*.go`, Rails: `db/migrate/*.rb` + `db/schema.rb`                                  |
| **Guards/Middleware**           | Auth guards, middleware functions             | NestJS: `@Injectable()` guards, Django: `middleware.py`, Go: middleware funcs, Rust: middleware layers, Rails: Rack middleware, `before_action` callbacks in controllers |
| **Config/Environment**          | Config classes, env loaders                   | NestJS: `@nestjs/config`, Django: `settings.py`, Go: viper/env configs, Rust: config crates, Rails: `config/application.rb`, `config/environments/*.rb`                  |

### Frontend Services

| Code Type              | Search Strategy           | Example Patterns by Framework                                                                             |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Feature Components** | Feature-based directories | React: `features/*/components`, Vue: `views/*`, Angular: `app/*/*.component.ts`                           |
| **Atomic Components**  | Design system components  | React: `components/atoms/`, `components/molecules/`, Vue: `components/ui/`, Angular: `shared/components/` |
| **Pages/Views**        | Page-level components     | React: `pages/*.tsx`, Vue: `views/*.vue`, Angular: `app/pages/*.component.ts`                             |
| **API Clients**        | HTTP client services      | React: `api/*.ts`, Vue: `services/api/*.ts`, Angular: `services/*.service.ts`                             |
| **State Management**   | Store/context files       | React: `store/*.ts` or `context/*.tsx`, Vue: `store/*.ts`, Angular: `state/*.ts`                          |
| **Hooks/Composables**  | Custom hooks/composables  | React: `hooks/*.ts`, Vue: `composables/*.ts`, Angular: `shared/hooks/*.ts`                                |
| **Routing**            | Route configuration       | React Router: `routes.tsx`, Vue Router: `router/*.ts`, Angular: `app-routing.module.ts`                   |

### Shared/Library Packages

| Code Type                  | Search Strategy         | Example Patterns                                     |
| -------------------------- | ----------------------- | ---------------------------------------------------- |
| **Shared DTOs**            | Cross-service types     | `shared/dtos/`, `common/types/`, `@org/shared/src/`  |
| **Shared Enums/Constants** | Shared enums, constants | `shared/enums/`, `common/constants/`, `types/enums/` |
| **Shared Utils**           | Utility functions       | `shared/utils/`, `common/helpers/`, `lib/utils/`     |
| **Base Classes**           | Abstract base classes   | `shared/base/`, `common/abstract/`, `lib/base/`      |

### Testing

| Code Type             | Search Strategy              | Example Patterns                                                                                  |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| **Unit Tests**        | Co-located test files        | `**/*.spec.ts`, `**/*.test.py`, `**/*_test.go`, `**/*.spec.js`, `**/*_spec.rb`, `**/*_test.rb`    |
| **Integration Tests** | Integration test directories | `tests/integration/`, `e2e/`, `__tests__/integration/`, `spec/requests/`, `spec/integration/`     |
| **E2E Tests**         | E2E test directories         | `e2e/`, `tests/e2e/`, `playwright/`, `cypress/`, `spec/system/`, `spec/features/`, `test/system/` |
| **Test Fixtures**     | Test data and fixtures       | `tests/fixtures/`, `__fixtures__/`, `testdata/`, `spec/fixtures/`, `test/fixtures/`               |

### Infrastructure/Deployment

| Code Type                        | Search Strategy           | Example Patterns                                             |
| -------------------------------- | ------------------------- | ------------------------------------------------------------ |
| **Docker Configuration**         | Dockerfiles               | `Dockerfile*`, `docker-compose*.yml`, `.dockerignore`        |
| **CI/CD Configuration**          | CI config files           | `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`   |
| **IaC (Infrastructure as Code)** | Terraform, CloudFormation | `terraform/*.tf`, `infrastructure/`, `cloudformation/*.yaml` |

**Output Format - File Placement Table:**

Generate a markdown table with these columns:

- **Package/Service**: Which service this applies to (or "Root" for monorepo-level)
- **File Type**: What kind of code
- **Location Pattern**: Where these files live (glob pattern)
- **File Count**: Approximate number of matching files (e.g., "~12 files")
- **Notes**: Any important context

**Example Table Row:**

```markdown
| services/backend | Database Models | src/modules/_/database/models/_.model.ts | ~8 files | TypeORM entities, vertical slice per module |
```

**CRITICAL REQUIREMENTS:**

1. Target 10-20 rows (concise but comprehensive coverage)
2. Every row must use glob patterns and include approximate file count
3. Group by service/package for monorepos
4. Include BOTH standard locations AND custom/unusual locations discovered
5. Use 1-2 representative example paths ONLY when the pattern alone is ambiguous

**Report in `findings.file_placement` object:**

```json
"file_placement": {
  "table_markdown": "| Package | File Type | Location Pattern | File Count | Notes |\n|---------|-----------|------------------|------------|-------|\n| packages/shared | Shared DTOs | packages/shared/src/dtos/**/*.dto.ts | ~15 files | DTOs used by both frontend and backend |\n| services/backend | Database Models | src/modules/*/database/models/*.model.ts | ~8 files | TypeORM entities, vertical slice per module |\n...",
  "shared_packages": ["packages/shared", "packages/types"],
  "import_conventions": [
    "import { UserDto } from '@org/shared/dtos'",
    "import { Priority } from '@org/shared/enums'"
  ]
}
```

</file_mapping>

## Step 8: Extract Path Aliases

<path_aliases>

**Path aliases** allow imports like `@shared/dto` instead of `../../../shared/dto`. These are critical for understanding import patterns.

**Search for path alias configurations:**

### JavaScript/TypeScript

- Read `**/tsconfig.json` → `compilerOptions.paths` field
- Read `**/jsconfig.json` → `compilerOptions.paths` field
- Read `**/vite.config.*` → `resolve.alias` configuration
- Read `**/webpack.config.*` → `resolve.alias` configuration

### Python

- Read `**/pyproject.toml` → `[tool.setuptools.packages.find]` or custom path configs
- Check for `sys.path` manipulations in `__init__.py` files

### Go

- Read `**/go.mod` → module name (used as import prefix)

### Java

- Read `**/pom.xml` or `**/build.gradle*` → source set configurations

**Example TypeScript config:**

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["packages/shared/src/*"],
      "@/*": ["src/*"]
    }
  }
}
```

**Report in `findings.path_aliases` object:**

```json
"path_aliases": {
  "@shared": "packages/shared/src/index.ts",
  "@shared/*": "packages/shared/src/*",
  "@/*": "src/*"
}
```

</path_aliases>

## Step 9: Analyze Database Layer

<database_layer>

**Identify database technology, ORM, and migration strategy.**

### Database Detection

Look for database client libraries in dependencies:

- **PostgreSQL:** pg, psycopg2, pgx, diesel-postgres
- **MySQL:** mysql2, PyMySQL, go-sql-driver/mysql
- **MongoDB:** mongoose, pymongo, mongo-driver
- **Redis:** ioredis, redis-py, go-redis
- **SQLite:** better-sqlite3, sqlite3
- **DynamoDB:** @aws-sdk/client-dynamodb
- **Elasticsearch:** @elastic/elasticsearch

### ORM Detection

- **TypeORM:** Look for `@Entity()` decorators, DataSource configuration
- **Prisma:** Look for `schema.prisma` file, `@prisma/client` dependency
- **Sequelize:** Look for `define()` calls, Sequelize imports
- **SQLAlchemy:** Look for `declarative_base()`, SQLAlchemy imports
- **Django ORM:** Look for `models.Model` subclasses
- **GORM:** Look for `gorm.Model` embeds
- **Diesel:** Look for `diesel::prelude` imports
- **Hibernate/JPA:** Look for `@Entity` annotations
- **ActiveRecord:** Look for classes inheriting from `ApplicationRecord` (or `ActiveRecord::Base` in legacy Rails)

### Migration Detection

Search for migration commands and directories:

```
# TypeORM
**/src/**/migrations/*.ts
Look for: typeorm migration:create, typeorm migration:run in package.json scripts

# Prisma
**/prisma/migrations/
Look for: prisma migrate in package.json scripts

# Sequelize
**/migrations/*.js
Look for: sequelize db:migrate

# Django
**/migrations/*.py
Look for: python manage.py migrate

# Alembic (Python)
**/alembic/versions/*.py
Look for: alembic upgrade head

# GORM (Go)
Search for: AutoMigrate() calls in code

# Diesel (Rust)
**/migrations/*.sql
Look for: diesel migration run

# Rails (ActiveRecord)
**/db/migrate/*.rb + db/schema.rb (or db/structure.sql)
Look for: bin/rails db:migrate, rake db:migrate
```

**Read package.json (or equivalent) scripts to find migration commands.**

**Report in `findings.database` object:**

```json
"database": {
  "orm": "TypeORM ^0.3.21",
  "type": "postgres",
  "migration_commands": [
    "pnpm typeorm:migration:create",
    "pnpm typeorm:migration:run"
  ]
}
```

</database_layer>

## Step 10: Enhance Services with File Counts

**IMPORTANT: You are the SINGLE SOURCE OF TRUTH for service discovery.**

Other analyzers (Tech Stack, Code Patterns, Data Flows) will reference services by ID.
Ensure each service has a unique, stable ID.

For each service discovered in Step 4, add file count information:

1. **File count:** Total files in service directory (use Bash: `find <path> -type f | wc -l`)
2. **Total LOC (optional):** If time permits, estimate lines of code

**Example command to count files:**

```bash
find services/backend -type f | wc -l
```

**Add file_count to each service in the services array:**

```json
{
  "id": "backend",
  "path": "services/backend",
  "type": "backend",
  "language": "typescript",
  "file_count": 145, // ← Add this
  "frameworks": {
    "main": "NestJS 11",
    "orm": "TypeORM 0.3"
  }
}
```

**NOTE:** Do NOT create separate `packages` or `multi_stack` sections.
All service information belongs in the `services` array.

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

Before outputting results, verify:

1. **Found at least ONE manifest file?** If no, search again with different patterns
2. **Detected ALL languages?** Count files by extension - if project has 10+ .py files, Python should be in languages array
3. **Extracted runtime versions?** Check for .nvmrc, .python-version, go.mod, etc.
4. **File placement table has 10-20 rows?** Each row must use glob patterns with file counts
5. **Found path aliases?** Read tsconfig.json, jsconfig.json, vite.config, webpack.config
6. **Detected database layer?** Check dependencies for pg, psycopg2, mongoose, etc. Find ORM and migration commands
7. **Multi-stack analysis complete?** For monorepos, list ALL workspaces with file counts and dependencies
8. **Dependencies include frontend frameworks?** Must locate frontend source (search by .jsx, .tsx, .vue, .svelte extensions)
9. **Marked as monorepo?** Verify ALL workspaces are listed (cross-check workspace config against found manifests)
10. **Search patterns comprehensive?** Used `**/` for recursive search, not just root-only patterns
11. **Read key files?** Don't just list files - read them to understand structure

## When Discovery Seems Incomplete

If dependencies exist but code isn't found → Search patterns were too narrow. Common fixes:

- Use broader glob patterns: `**/*.{ext1,ext2,ext3}`
- Try multiple pattern variations (different naming conventions)
- Read config files to understand custom directory structures
- Check for source code in non-standard directories (not just `src/`)

## Real Projects Have These Characteristics

- Every project has dependencies (if found 0, search again)
- Frontend deps (react/vue/angular) mean frontend code exists somewhere
- Test frameworks in deps usually mean test files exist (though some projects lack tests)
- Multiple package.json files typically indicate monorepo (check workspace config)

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown code blocks, no commentary)
- First character: `{`, last character: `}`
- Required field: `findings.services` array with at least 1 service
- Each service must have `id`, `path`, `type`, `language` fields
- Optional field: `needs_verification` array (maximum 5 items)

## Example Output Structure

```json
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "services": [
      {
        "id": "shared",
        "path": "packages/shared",
        "type": "library",
        "language": "typescript",
        "language_version": "5.3",
        "file_count": 25,
        "frameworks": {
          "main": "class-transformer"
        },
        "manifest_file": "packages/shared/package.json"
      },
      {
        "id": "backend",
        "path": "services/backend",
        "type": "backend",
        "language": "typescript",
        "language_version": "5.3",
        "file_count": 145,
        "frameworks": {
          "main": "NestJS 11.0.11",
          "orm": "TypeORM 0.3.21"
        },
        "environment": {
          "port": 3000
        },
        "manifest_file": "services/backend/package.json"
      },
      {
        "id": "web-frontend",
        "path": "services/web-frontend",
        "type": "frontend",
        "language": "typescript",
        "language_version": "5.3",
        "file_count": 85,
        "frameworks": {
          "main": "React 19.1.0"
        },
        "environment": {
          "port": 5173
        },
        "manifest_file": "services/web-frontend/package.json"
      }
    ],
    "repository_type": "monorepo",
    "monorepo_layout": {
      "root": ".",
      "workspace_tool": "pnpm workspaces",
      "workspace_paths": ["packages/*", "services/*"]
    },
    "languages": ["typescript", "javascript"],
    "runtimes": {
      "node": ">=22.14.x",
      "pnpm": ">=10"
    },
    "frameworks": {
      "main": "NestJS ^11.0.11",
      "orm": "TypeORM ^0.3.21",
      "testing": "Jest ^29.7.0",
      "ui": "React ^19.1.0"
    },
    "architecture_pattern": "Vertical Slicing",
    "file_placement": {
      "table_markdown": "| Package | File Type | Location Pattern | File Count | Notes |\n|---------|-----------|------------------|------------|-------|\n| packages/shared | Shared DTOs | packages/shared/src/dtos/**/*.dto.ts | ~15 files | DTOs used by both frontend and backend |\n| services/backend | Database Models | src/modules/*/database/models/*.model.ts | ~8 files | TypeORM entities, vertical slice per module |\n...",
      "import_conventions": [
        "import { UserDto } from '@org/shared/dtos'",
        "import { Priority } from '@org/shared/enums'"
      ]
    },
    "path_aliases": {
      "@org/shared": "packages/shared/src/index.ts",
      "@org/shared/*": "packages/shared/src/*",
      "@/*": "src/*"
    },
    "database": {
      "orm": "TypeORM ^0.3.21",
      "type": "postgres",
      "migration_commands": ["pnpm typeorm:migration:create", "pnpm typeorm:migration:run"]
    }
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "What is the complete workflow for running migrations in production?",
      "reason": "Migration commands found but deployment procedures not visible in code"
    }
  ]
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` ONLY when information cannot be determined from code, configs, or manifests after exhaustive searching.

Maximum 5 verification items. Prioritize business decisions and deployment architecture questions over technical details discoverable from code.

</verification_guidelines>
