# Tech Stack & Dependencies Analysis Instructions

> **Tool naming.** Bare tool names below (e.g. `list_communities`) are semantic identifiers. The canonical names are listed in the **CODE GRAPH CONTEXT** block in your system prompt — they share the `mcp__code_graph__` prefix and may carry a `_tool` suffix. Always call the catalog name, not a name you find here.

<objective>
Analyze dependencies, databases, infrastructure tools, CI/CD pipelines, and deployment configuration for each service. Provide comprehensive tech stack information to understand the operational requirements.
</objective>

**IMPORTANT: Service Discovery Ownership**

- **Structure Analyzer (Agent 01)** is the SINGLE SOURCE OF TRUTH for service discovery
- DO NOT redeclare services in your output
- REFERENCE services by ID from Structure Analyzer
- Organize findings using service IDs as keys (e.g., `dependencies.by_service.backend`)
- The `services` array field is DEPRECATED - use by_service maps instead

<discovery_process>

## Step 1: Service inventory via graph (do not re-glob manifests)

Call `list_communities` to get the same service set the structure-analyzer discovered. Use community names as service IDs. This eliminates the duplicate `**/package.json` glob that the old workflow ran.

Record the community list. Subsequent steps use community names to scope graph queries per service.

## Step 2: Identify actually-imported SDK libraries via graph

For each key dependency category, use `semantic_search_nodes` to find real import sites rather than trusting package.json declarations:

**Database clients:**

```
semantic_search_nodes({ query: "PostgresClient | MongoClient | Pool | createConnection | DataSource | Prisma", kind: "function", limit: 50 })
```

**ORM initialization:**

```
semantic_search_nodes({ query: "TypeORM | Prisma | Sequelize | SQLAlchemy | GORM | Diesel", kind: "import", limit: 50 })
```

**Cache clients:**

```
semantic_search_nodes({ query: "Redis | Memcached | ioredis | createClient", kind: "import", limit: 30 })
```

**Authentication libraries:**

```
semantic_search_nodes({ query: "passport | jsonwebtoken | jose | auth0 | keycloak", kind: "import", limit: 30 })
```

**Payment / email / monitoring SDKs:**

```
semantic_search_nodes({ query: "Stripe | SendGrid | Sentry | Datadog", kind: "import", limit: 30 })
```

Record results in `graph_queries_used`. Only libraries that appear in actual import sites (not just in package.json) should be treated as confirmed usage.

## Step 3: Find Dependency Manifests and Lock Files (Glob — required for version strings)

For each service identified in Step 1, locate and read its manifest files to extract exact version numbers. The graph confirms usage; manifests provide version pinning details.

<manifest_patterns>

**Package Managers:**

- JavaScript/TypeScript: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb
- Python: pyproject.toml, setup.py, requirements.txt, Pipfile, Pipfile.lock, poetry.lock
- Go: go.mod, go.sum
- Rust: Cargo.toml, Cargo.lock
- Java: pom.xml, build.gradle, build.gradle.kts, gradle.lockfile
- Ruby: Gemfile, Gemfile.lock
- PHP: composer.json, composer.lock
- C#: \*.csproj, packages.lock.json
- Swift: Package.swift, Package.resolved
- Elixir: mix.exs, mix.lock

Read each manifest to extract dependencies and their versions.

**CRITICAL:** For each service, create a comprehensive dependency breakdown:

1. **Production dependencies:** Dependencies required at runtime
2. **Development dependencies:** Dependencies only for development (testing, linting, etc.)
3. **Notable dependencies:** Top 3-5 most important dependencies (frameworks, ORMs, key libraries)
4. **Dependency counts:** Total count of production and dev dependencies

**Report in `findings.dependencies.by_package` object for detailed analysis.**

</manifest_patterns>

## Step 4: Comprehensive Dependency Analysis

<dependency_analysis>

For each service (or root if monorepo), extract and categorize ALL dependencies from the manifests read in Step 3. Cross-reference with the graph import data from Step 2 — mark libraries as "confirmed imported" vs. "declared only" where the graph provided signal.

### JavaScript/TypeScript (package.json)

Read `dependencies` (production) and `devDependencies` (development):

```json
{
  "dependencies": {
    "@nestjs/common": "^11.0.11", // PRODUCTION
    "typeorm": "^0.3.21"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.0.11", // DEVELOPMENT
    "jest": "^29.7.0"
  }
}
```

### Python (pyproject.toml)

Read `[project.dependencies]` (production) and `[project.optional-dependencies.dev]` or `[tool.poetry.group.dev.dependencies]` (development).

### Go (go.mod)

All dependencies in `require` block are typically production (Go doesn't separate dev deps in go.mod).

### Rust (Cargo.toml)

Read `[dependencies]` (production) and `[dev-dependencies]` (development).

**Report format:**

```json
"dependencies": {
  "by_package": {
    "root": {
      "production": {
        "@keycloak/keycloak-admin-client": "^26.1.4",
        "ajv": "^8.18.0"
      },
      "dev": {
        "@commitlint/cli": "^19.8.0",
        "husky": "^9.1.7"
      },
      "notable": ["@keycloak/keycloak-admin-client", "husky"],
      "count": {
        "production": 4,
        "dev": 3
      }
    }
  },
  "conflicts": [],
  "lock_strategy": "strict"
}
```

</dependency_analysis>

## Step 5: Identify Databases from Graph + Manifests

<database_detection>

Combine graph results from Step 2 (actual import sites) with manifest scanning (declared clients):

**SQL Databases:**

- PostgreSQL: pg, psycopg2, asyncpg, node-postgres, pg-promise
- MySQL: mysql, mysql2, mysqlclient, PyMySQL, aiomysql
- SQLite: sqlite3, better-sqlite3, pysqlite3
- SQL Server: mssql, tedious, pymssql, pyodbc

**NoSQL Databases:**

- MongoDB: mongodb, mongoose, pymongo, motor
- Redis: redis, ioredis, redis-py, aioredis
- Elasticsearch: @elastic/elasticsearch, elasticsearch-py
- DynamoDB: aws-sdk, boto3 (with dynamodb imports)

**ORMs indicate database usage:**

- TypeORM, Prisma, Sequelize, Knex (Node)
- SQLAlchemy, Django ORM, Tortoise ORM (Python)
- GORM (Go), Diesel (Rust), Hibernate/JPA (Java), ActiveRecord (Ruby)

For each database client found (prefer graph-confirmed import sites over declared-only entries):

1. Note the database type inferred from client library
2. Record ORM if present
3. Search for migration tool configs (TypeORM migrations, Alembic, Flyway, Liquibase)

</database_detection>

## Step 6: Comprehensive CI/CD Pipeline Analysis (Glob — required)

<cicd_patterns>

CI/CD config is not indexed by the graph. Always use Glob/Read for this step.

Search for CI/CD configuration files:

**GitHub Actions:** `.github/workflows/*.yml`, `.github/workflows/*.yaml`
**GitLab CI:** `.gitlab-ci.yml`
**CircleCI:** `.circleci/config.yml`
**Jenkins:** `Jenkinsfile`, `.jenkins/*.groovy`
**Travis CI:** `.travis.yml`
**Azure Pipelines:** `azure-pipelines.yml`, `.azure/*.yml`
**Bitbucket Pipelines:** `bitbucket-pipelines.yml`
**AWS CodePipeline:** `buildspec.yml`
**Google Cloud Build:** `cloudbuild.yaml`

If NO CI/CD config files found, report `"provider": "none"`.

### Read Pipeline Files to Extract:

1. **Provider:** Which CI/CD system (e.g., "GitHub Actions", "GitLab CI")
2. **Config files:** List all found config file paths
3. **Triggers:** When pipeline runs (push, pull_request, manual, schedule)
4. **Stages:** Pipeline stages (build, test, deploy, lint)
5. **Test commands:** Commands that run tests
6. **Build commands:** Commands that build artifacts
7. **Deploy commands:** Commands that deploy
8. **Environments:** Target environments (development, staging, production)

**Report format:**

```json
"ci_cd": {
  "provider": "GitHub Actions",
  "config_files": [".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
  "triggers": ["push", "pull_request", "workflow_dispatch"],
  "stages": ["lint", "test", "build", "deploy"],
  "test_commands": ["npm test", "npm run test:e2e"],
  "build_commands": ["npm run build"],
  "deploy_commands": ["kubectl apply -f k8s/"],
  "environments": ["development", "staging", "production"]
}
```

</cicd_patterns>

## Step 7: Infrastructure & Deployment Analysis (Glob — required)

<infrastructure_discovery>

Infrastructure config (Dockerfile, docker-compose, k8s manifests) is not indexed by the graph. Always use Glob/Read for this step.

### Infrastructure Detection

**Containerization:**

- Docker: `Dockerfile*`, `docker-compose*.yml`, `.dockerignore`
- Podman: `Containerfile`

**Orchestration:**

- Kubernetes: `k8s/`, `kubernetes/`, `*.yaml` files with `kind: Deployment/Service/Ingress`
- Docker Compose: `docker-compose*.yml`
- Helm: `Chart.yaml`, `values.yaml`, `templates/`

**Infrastructure as Code:**

- Terraform: `*.tf`, `terraform.tfvars`
- Pulumi: `Pulumi.yaml`, `__main__.py|ts|go`
- CloudFormation: `*.template.json`, `*.template.yaml`
- Ansible: `ansible/`, `playbooks/`, `*.ansible.yml`

**Serverless:**

- Serverless Framework: `serverless.yml`
- AWS SAM: `template.yaml` (with `Transform: AWS::Serverless-2016-10-31`)
- Netlify: `netlify.toml`
- Vercel: `vercel.json`

**Report format:**

```json
"infrastructure": ["docker", "docker-compose"],
"deployment": {
  "target": "docker",
  "config_files": [
    "docker-compose.yml",
    "services/backend/Dockerfile.production"
  ],
  "runtime_config": {
    "port": "3050 (backend), 2712 (frontend)",
    "workers": "not specified",
    "memory": "not specified"
  },
  "scaling": {
    "min_replicas": 1,
    "max_replicas": 1,
    "autoscaling": false
  }
}
```

</infrastructure_discovery>

## Step 8: Environment Configuration Discovery (Glob — required)

<environment_analysis>

Environment files are not indexed by the graph. Always use Glob/Read for this step.

**Environment Files:**

- `.env.example`, `.env.sample`, `.env.template`
- `config/`, `env/` directories
- Environment-specific configs: `.env.development`, `.env.production`, `.env.staging`

### Extract from Environment Example Files:

Read `.env.example` or `.env.template` to find **required environment variable names** (NEVER actual values).

**Report format:**

```json
"environment": {
  "required_vars": [
    "DATABASE_URL",
    "REDIS_URL",
    "API_KEY",
    "PORT",
    "NODE_ENV"
  ],
  "environments": ["development", "production", "staging"],
  "config_approach": "dotenv"
}
```

</environment_analysis>

## Step 9: External Services Detection

<external_services>

Use graph results from Step 2 as primary signal (actual import sites). Supplement with manifest scanning for completeness.

**For each detected service, report:**

1. Service name
2. SDK package name and version
3. Whether confirmed via graph import site or declared-only

**Report format:**

```json
"external_services": [
  {
    "service": "Keycloak",
    "sdk": "@keycloak/keycloak-admin-client v26.1.4",
    "config_location": "docker-compose configuration"
  },
  {
    "service": "Sentry",
    "sdk": "@sentry/nestjs v9.30.0 / @sentry/react v9.32.0",
    "config_location": "vite.config.ts, backend dependencies"
  }
]
```

</external_services>

## Step 10: Build Tools Analysis (Glob — required for config details)

<build_tools>

**Identify build tools and their configurations:**

### JavaScript/TypeScript Build Tools

Search dependencies for:

- **Bundlers:** webpack, vite, rollup, parcel, esbuild, turbo
- **Transpilers:** @babel/core, tsc (TypeScript compiler)
- **Task Runners:** gulp, grunt, nx

Read build configuration files (vite.config.ts/js, webpack.config.js, turbo.json) for build-target settings.

### Extract Build Commands from package.json scripts.

**Report format:**

```json
"build_tools": {
  "tool": "vite",
  "config_file": "services/web-frontend/vite.config.ts",
  "lint_command": "eslint --max-warnings=0",
  "format_command": "prettier --write src",
  "test_command": "jest",
  "build_command": "pnpm --filter @org/shared build && tsc -b && vite build"
}
```

</build_tools>

## Step 11: Enhanced Monorepo Analysis

<monorepo_analysis>

**If monorepo detected (from graph architecture overview or community count > 1), provide detailed workspace configuration:**

Read workspace configuration files:

- **JavaScript/TypeScript:** `pnpm-workspace.yaml`, `package.json` workspaces field, `lerna.json`, `nx.json`
- **Python:** Multiple `pyproject.toml` files, `poetry` workspaces
- **Go:** `go.work` file
- **Rust:** `Cargo.toml` `[workspace]` section

**Report format:**

```json
"monorepo": {
  "enabled": true,
  "tool": "pnpm workspaces",
  "workspace_manager": "pnpm",
  "build_all_command": "pnpm -r build",
  "test_all_command": "pnpm -r test"
}
```

</monorepo_analysis>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Called list_communities first?** If yes and got results, service list is in hand without manifest re-glob
2. **graph_queries_used populated?** Every graph tool call must be recorded
3. **Used semantic_search_nodes for database detection?** Graph confirms actual usage vs. declared-only
4. **Found dependency manifests for all services?** Cross-check against Step 1 community list
5. **CI/CD detection attempted?** If no config files found, report `"provider": "none"`
6. **Infrastructure config found?** Check for Dockerfile, docker-compose, k8s configs
7. **Environment variables extracted?** Read .env.example or .env.template for required var names
8. **External services detected?** Graph import search should have surfaced Sentry, Keycloak, Auth0, Stripe, etc.
9. **Build tools identified?** Find vite, webpack, or other bundlers and their config files
10. **Monorepo analysis complete?** If monorepo, provide tool, workspace manager, and commands

## Common Patterns by Ecosystem

**Node.js/TypeScript:**

- Lock file indicates package manager: package-lock.json (npm), yarn.lock (yarn), pnpm-lock.yaml (pnpm)
- Testing: jest, vitest, mocha, cypress, playwright
- Build tools: webpack, vite, rollup, esbuild, turbo

**Python:**

- Package manager from lock file: poetry.lock (Poetry), Pipfile.lock (Pipenv), requirements.txt (pip)
- Testing: pytest, unittest, nose
- ASGI/WSGI servers: uvicorn, gunicorn, hypercorn

**Go:**

- Dependencies in go.mod, versions locked in go.sum
- Testing: built-in `go test`
- Common frameworks: gin, echo, chi, fiber

**Rust:**

- Dependencies in Cargo.toml with [dependencies], locked in Cargo.lock
- Testing: built-in `cargo test`
- Web frameworks: axum, rocket, actix-web

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown, no commentary)
- DEPRECATED field: `findings.services` array (use by_service maps instead)
- Use service IDs as keys in `dependencies.by_service` map (e.g., "backend", "web-frontend")
- Service IDs must match those from Structure Analyzer (Agent 01)
- Optional fields: `findings.monorepo` for monorepo-level config
- Optional field: `needs_verification` array (maximum 5 items)
- Required field: `graph_queries_used` array listing every graph tool call made

## Example Output Structure

```json
{
  "agent_name": "tech-stack-dependencies-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "infrastructure": ["docker", "docker-compose"],
    "dependencies": {
      "by_service": {
        "root": {
          "production": ["@keycloak/keycloak-admin-client", "ajv"],
          "development": ["@commitlint/cli", "husky"],
          "notable": ["@keycloak/keycloak-admin-client", "husky"]
        },
        "backend": {
          "production": ["@nestjs/common", "typeorm", "pg"],
          "development": ["@nestjs/testing", "jest"],
          "notable": ["@nestjs/common", "typeorm", "pg"]
        },
        "web-frontend": {
          "production": ["react", "zustand", "vite"],
          "development": ["@vitejs/plugin-react", "vitest"],
          "notable": ["react", "zustand", "vite"]
        }
      },
      "shared_across_services": ["typescript", "prettier"],
      "notable_versions": {
        "node": "20.10.0",
        "typescript": "5.3.3"
      }
    },
    "ci_cd": {
      "provider": "GitHub Actions",
      "config_files": [".github/workflows/ci.yml"],
      "triggers": ["push", "pull_request"],
      "stages": ["lint", "test", "build", "deploy"],
      "test_commands": ["npm test"],
      "build_commands": ["npm run build"],
      "deploy_commands": ["kubectl apply -f k8s/"],
      "environments": ["development", "production"]
    },
    "deployment": {
      "target": "docker",
      "config_files": ["docker-compose.yml", "services/backend/Dockerfile.production"],
      "runtime_config": {
        "port": "3050 (backend), 2712 (frontend)",
        "workers": "not specified",
        "memory": "not specified"
      },
      "scaling": {
        "min_replicas": 1,
        "max_replicas": 1,
        "autoscaling": false
      }
    },
    "environment": {
      "required_vars": ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "SENTRY_DSN"],
      "environments": ["development", "production"],
      "config_approach": "dotenv"
    },
    "databases": [
      {
        "type": "postgres",
        "orm": "TypeORM",
        "migration_tool": "TypeORM",
        "migration_commands": ["npx typeorm migration:create", "npx typeorm migration:run"]
      }
    ],
    "external_services": [
      {
        "service": "Keycloak",
        "sdk": "@keycloak/keycloak-admin-client v26.1.4",
        "config_location": "docker-compose configuration"
      }
    ],
    "build_tools": {
      "tool": "vite",
      "config_file": "services/web-frontend/vite.config.ts",
      "lint_command": "eslint --max-warnings=0",
      "format_command": "prettier --write src",
      "test_command": "jest",
      "build_command": "tsc -b && vite build"
    },
    "monorepo": {
      "enabled": true,
      "tool": "pnpm workspaces",
      "workspace_manager": "pnpm",
      "build_all_command": "pnpm -r build",
      "test_all_command": "pnpm -r test"
    }
  },
  "graph_queries_used": [
    "list_communities",
    "semantic_search_nodes({ query: 'PostgresClient | Pool | DataSource', kind: 'function', limit: 50 })",
    "semantic_search_nodes({ query: 'Stripe | SendGrid | Sentry', kind: 'import', limit: 30 })"
  ],
  "needs_verification": []
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` for:

- Production credentials and URLs (not in codebase for security)
- External service endpoints not configured in code
- Infrastructure details managed outside repository
- Deployment-specific configuration values

Do NOT use for:

- Dependency versions (readable from manifests)
- Database types (inferable from client libraries and graph import sites)
- CI/CD presence (detectable from config files)
- Infrastructure tools (detectable from Dockerfiles, k8s configs)

</verification_guidelines>

## Token efficiency

Graph queries are O(1) on warm cache (the graph is built once per init). Glob+Read scales with file count. For projects with thousands of files, the difference is 10–100×. Use the graph.
