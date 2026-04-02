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

## Step 2: Determine Repository Type

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

## Step 3: Extract Service Information

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

## Step 4: Analyze Architecture Patterns

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

## Step 5: Create File Placement Map

<file_mapping>

Create a comprehensive map showing where each type of code lives in the repository. This helps developers know where to find existing code and where to place new code.

**Discovery approach:**

1. Start with manifest-driven discovery (frameworks tell you what patterns to expect)
2. Search for semantic patterns based on discovered frameworks:
   - If NestJS: Look for @Controller, @Injectable, @Module decorators
   - If Django: Look for models.py, views.py, urls.py in app directories
   - If Go+Gin: Look for router.Group, gin.Context usage
   - If Rust+Axum: Look for Router, Handler definitions

3. Use framework knowledge to find specific file types:
   - **Entities/Models:** Files with database decorators, ORM imports, schema definitions
   - **Controllers/Handlers:** Files with route definitions, HTTP method handlers
   - **Services:** Business logic files with injected dependencies
   - **DTOs/Schemas:** Data transfer objects, request/response types
   - **Tests:** Files importing test frameworks (jest, pytest, testing library)

**Example discoveries by framework:**

- **NestJS project:** Controllers in `src/**/*.controller.ts`, Services in `src/**/*.service.ts`, Entities in `src/**/*.entity.ts`
- **Django project:** Models in `*/models.py`, Views in `*/views.py`, Serializers in `*/serializers.py`
- **Go project:** Handlers in `*/handler/*.go`, Services in `*/service/*.go`, Models in `*/model/*.go`

Report actual paths found, not generic patterns.

</file_mapping>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

Before outputting results, verify:

1. **Found at least ONE manifest file?** If no, search again with different patterns
2. **Dependencies include frontend frameworks?** Must locate frontend source (search by .jsx, .tsx, .vue, .svelte extensions)
3. **Marked as monorepo?** Verify ALL workspaces are listed (cross-check workspace config against found manifests)
4. **Search patterns comprehensive?** Used `**/` for recursive search, not just root-only patterns
5. **Read key files?** Don't just list files - read them to understand structure

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

See shared output format documentation at: `agents/shared/output-format.md`

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
        "id": "api",
        "name": "Backend API Service",
        "path": "apps/api",
        "type": "backend",
        "language": "typescript",
        "language_version": "5.3",
        "frameworks": {
          "main": "NestJS 10.3",
          "orm": "TypeORM 0.3"
        },
        "manifest_file": "apps/api/package.json"
      }
    ],
    "repository_type": "monorepo",
    "monorepo_layout": {
      "root": ".",
      "packages": ["packages/shared", "packages/types"],
      "services": ["apps/api", "apps/web"]
    }
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "Is the authentication service deployed separately from the main API?",
      "reason": "Found auth module in API but unclear if it's a separate deployment"
    }
  ]
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `agents/shared/verification-format.md`

Use `needs_verification` ONLY when information cannot be determined from code, configs, or manifests after exhaustive searching.

Maximum 5 verification items. Prioritize business decisions and deployment architecture questions over technical details discoverable from code.

</verification_guidelines>
