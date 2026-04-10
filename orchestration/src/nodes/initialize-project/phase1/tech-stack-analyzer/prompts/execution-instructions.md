# Tech Stack & Dependencies Analysis Instructions

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

## Step 1: Find Dependency Manifests and Lock Files

For each service discovered in Phase 1 (by Structure Analyzer), locate and read its dependency files:

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

## Step 2: Comprehensive Dependency Analysis

<dependency_analysis>

For each service (or root if monorepo), extract and categorize ALL dependencies:

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

Read `[project.dependencies]` (production) and `[project.optional-dependencies.dev]` or `[tool.poetry.group.dev.dependencies]` (development):

```toml
[project.dependencies]
fastapi = "^0.109.0"  # PRODUCTION
sqlalchemy = "^2.0.25"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0.0"  # DEVELOPMENT
black = "^24.1.0"
```

### Go (go.mod)

All dependencies in `require` block are typically production (Go doesn't separate dev deps in go.mod):

```go
require (
    github.com/gin-gonic/gin v1.9.1
    gorm.io/gorm v1.25.5
)
```

### Rust (Cargo.toml)

Read `[dependencies]` (production) and `[dev-dependencies]` (development):

```toml
[dependencies]
axum = "0.7"  # PRODUCTION
tokio = "1.35"

[dev-dependencies]
cargo-test = "0.1"  # DEVELOPMENT
```

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
    },
    "services/backend": {
      "production": {...},
      "dev": {...},
      "notable": [...],
      "count": {...}
    }
  },
  "conflicts": [],  // Version conflicts across services (if any)
  "lock_strategy": "strict"  // "strict" if lock files present, "loose" if not
}
```

</dependency_analysis>

## Step 3: Identify Databases from Dependencies

<database_detection>

Search for database client libraries in dependencies:

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

For each database client found:

1. Note the database type inferred from client library
2. Record ORM if present
3. Search for migration tool configs (TypeORM migrations, Alembic, Flyway, Liquibase)

</database_detection>

## Step 4: Comprehensive CI/CD Pipeline Analysis

<cicd_patterns>

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
5. **Test commands:** Commands that run tests (e.g., `npm test`, `pytest`, `go test`)
6. **Build commands:** Commands that build artifacts (e.g., `npm run build`, `go build`)
7. **Deploy commands:** Commands that deploy (e.g., `kubectl apply`, `docker push`)
8. **Environments:** Target environments (development, staging, production)

**Example GitHub Actions workflow extraction:**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm install
      - run: npm test # TEST COMMAND
      - run: npm run build # BUILD COMMAND
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: kubectl apply -f k8s/ # DEPLOY COMMAND
    environment: production # ENVIRONMENT
```

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

If CI/CD not detected:

```json
"ci_cd": {
  "provider": "none",
  "config_files": [],
  "triggers": [],
  "stages": [],
  "test_commands": [],
  "build_commands": [],
  "deploy_commands": [],
  "environments": []
}
```

</cicd_patterns>

## Step 5: Infrastructure & Deployment Analysis

<infrastructure_discovery>

### Infrastructure Detection

Search for infrastructure configuration files:

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

### Deployment Configuration Analysis

Read Docker Compose / Kubernetes / Serverless configs to extract:

1. **Deployment target:** "docker", "kubernetes", "serverless", "platform" (Vercel/Netlify)
2. **Config files:** List ALL deployment-related files found
3. **Runtime config:**
   - Ports exposed (from docker-compose ports, Dockerfile EXPOSE, k8s Service)
   - Worker/replica counts (from docker-compose scale, k8s replicas)
   - Memory limits (from docker-compose mem_limit, k8s resources)
4. **Scaling config:**
   - Min/max replicas (from HorizontalPodAutoscaler, docker swarm, serverless auto-scaling)
   - Autoscaling enabled or manual scaling

**Example Docker Compose extraction:**

```yaml
# docker-compose.yml
services:
  backend:
    build: ./services/backend
    ports:
      - '3050:3050' # PORT
    environment:
      - NODE_ENV=production
  frontend:
    build: ./services/web-frontend
    ports:
      - '2712:2712' # PORT
```

**Report format:**

```json
"infrastructure": ["docker", "docker-compose"],
"deployment": {
  "target": "docker",
  "config_files": [
    "docker-compose.yml",
    "docker-compose.production.yml",
    "services/backend/Dockerfile.development",
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

## Step 6: Environment Configuration Discovery

<environment_analysis>

Search for environment configuration patterns:

**Environment Files:**

- `.env.example`, `.env.sample`, `.env.template`
- `config/`, `env/` directories
- Environment-specific configs: `.env.development`, `.env.production`, `.env.staging`

**Configuration Management:**

- dotenv usage in dependencies
- Config libraries (node-config, python-decouple, viper for Go)
- Environment variable references in code (`process.env`, `os.getenv`, `os.Getenv`)

### Extract from Environment Example Files:

Read `.env.example` or `.env.template` to find **required environment variable names** (NEVER actual values):

```bash
# .env.example
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
```

Extract variable names: `DATABASE_URL`, `REDIS_URL`, `API_KEY`, `PORT`, `NODE_ENV`

### Detect Environment Types:

From file names and CI/CD configs, identify which environments exist:

- `.env.development` → "development"
- `.env.production` → "production"
- `.env.staging` → "staging"
- `.env.test` → "test"

**Report format:**

```json
"environment": {
  "required_vars": [
    "DATABASE_URL",
    "REDIS_URL",
    "API_KEY",
    "PORT",
    "NODE_ENV",
    "JWT_SECRET"
  ],
  "environments": ["development", "production", "staging"],
  "config_approach": "dotenv"  // or "env-vars", "config-files", "secrets-manager"
}
```

</environment_analysis>

## Step 7: External Services Detection

<external_services>

**Identify external service integrations from SDKs in dependencies:**

### Authentication & Identity

- **Keycloak:** `@keycloak/keycloak-admin-client`, `keycloak-js`
- **Auth0:** `@auth0/auth0-react`, `auth0`
- **Firebase Auth:** `firebase`, `@angular/fire`
- **AWS Cognito:** `@aws-sdk/client-cognito-identity`
- **OAuth providers:** `passport-google-oauth20`, `passport-github2`

### Monitoring & Error Tracking

- **Sentry:** `@sentry/node`, `@sentry/react`, `@sentry/nestjs`
- **Datadog:** `dd-trace`, `@datadog/browser-rum`
- **New Relic:** `newrelic`
- **LogRocket:** `logrocket`

### Payment Processing

- **Stripe:** `stripe`, `@stripe/stripe-js`
- **PayPal:** `@paypal/checkout-server-sdk`

### Email Services

- **SendGrid:** `@sendgrid/mail`
- **Mailgun:** `mailgun-js`
- **AWS SES:** `@aws-sdk/client-ses`
- **MailHog:** (dev tool, found in docker-compose)

### Cloud Services

- **AWS SDK:** `@aws-sdk/*`, `boto3`, `aws-sdk-go-v2`
- **Google Cloud:** `@google-cloud/*`, `google-cloud-*`
- **Azure:** `@azure/*`

### Search & Analytics

- **Algolia:** `algoliasearch`
- **Elasticsearch:** `@elastic/elasticsearch`

**For each detected service, report:**

1. Service name
2. SDK package name and version
3. Config location (e.g., "dependencies", "docker-compose", "env variables")

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
  },
  {
    "service": "Google OAuth",
    "sdk": "passport-google-oauth20 v2.0.0",
    "config_location": "backend dependencies"
  }
]
```

</external_services>

## Step 8: Build Tools Analysis

<build_tools>

**Identify build tools and their configurations:**

### JavaScript/TypeScript Build Tools

Search dependencies for:

- **Bundlers:** webpack, vite, rollup, parcel, esbuild, turbo
- **Transpilers:** @babel/core, tsc (TypeScript compiler)
- **Task Runners:** gulp, grunt, nx

Read build configuration files:

- `vite.config.ts/js`
- `webpack.config.js`
- `rollup.config.js`
- `turbo.json`

### Extract Build Commands from package.json scripts:

```json
{
  "scripts": {
    "lint": "eslint --max-warnings=0", // LINT COMMAND
    "format": "prettier --write src", // FORMAT COMMAND
    "test": "jest", // TEST COMMAND
    "build": "tsc -b && vite build" // BUILD COMMAND
  }
}
```

### Other Ecosystems

- **Python:** `setup.py`, `pyproject.toml` build-system, `tox.ini`
- **Go:** Built-in `go build`, `Makefile`
- **Rust:** Built-in `cargo build`
- **Java:** Maven (`pom.xml`), Gradle (`build.gradle`)

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

## Step 9: Enhanced Monorepo Analysis

<monorepo_analysis>

**If monorepo detected, provide detailed workspace configuration:**

### Read Workspace Configuration:

- **JavaScript/TypeScript:** `pnpm-workspace.yaml`, `package.json` workspaces field, `lerna.json`, `nx.json`
- **Python:** Multiple `pyproject.toml` files, `poetry` workspaces
- **Go:** `go.work` file
- **Rust:** `Cargo.toml` `[workspace]` section

### Extract:

1. **Enabled:** true/false
2. **Tool:** Which monorepo tool ("pnpm workspaces", "npm workspaces", "yarn workspaces", "lerna", "nx", "turborepo", "go workspaces", "cargo workspaces")
3. **Workspace manager:** Package manager used
4. **Build all command:** Command to build all packages (from root package.json scripts or turbo.json)
5. **Test all command:** Command to test all packages

**Example for pnpm monorepo:**

Read `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'services/*'
  - 'seeds/*'
```

Read root `package.json` scripts:

```json
{
  "scripts": {
    "build:all": "pnpm -r build",
    "test:all": "pnpm -r test"
  }
}
```

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

If not a monorepo:

```json
"monorepo": {
  "enabled": false,
  "tool": "none",
  "workspace_manager": "npm",
  "build_all_command": "not specified",
  "test_all_command": "not specified"
}
```

</monorepo_analysis>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Found dependency manifests for all services?** Cross-check against Phase 1 service list
2. **Comprehensive dependency breakdown complete?** Each service should have production/dev/notable/count fields
3. **Database clients found but no database type?** Infer from client library name (pg = PostgreSQL, mongodb = MongoDB)
4. **ORM present but no explicit database client?** ORM implies database (TypeORM often uses PostgreSQL)
5. **CI/CD detection attempted?** If no config files found, report `"provider": "none"` (don't leave empty)
6. **CI/CD commands extracted?** Test, build, and deploy commands from pipeline config
7. **Infrastructure config found?** Check for Dockerfile, docker-compose, k8s configs
8. **Deployment target identified?** Should be "docker", "kubernetes", "serverless", or "platform"
9. **Environment variables extracted?** Read .env.example or .env.template for required var names
10. **External services detected?** Check dependencies for Sentry, Keycloak, Auth0, Stripe, etc.
11. **Build tools identified?** Find vite, webpack, or other bundlers and their config files
12. **Build commands extracted?** Lint, format, test, build commands from package.json scripts
13. **Monorepo analysis complete?** If monorepo, provide tool, workspace manager, and commands
14. **Docker in dependencies but no Dockerfile?** Search more broadly (might be in subdirectories)

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
      "config_files": [
        "docker-compose.yml",
        "docker-compose.production.yml",
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
      },
      {
        "type": "redis",
        "orm": "ioredis",
        "migration_tool": "none",
        "migration_commands": []
      }
    ],
    "external_services": [
      {
        "service": "Keycloak",
        "sdk": "@keycloak/keycloak-admin-client v26.1.4",
        "config_location": "docker-compose configuration"
      },
      {
        "service": "Sentry",
        "sdk": "@sentry/nestjs v9.30.0",
        "config_location": "backend dependencies"
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
- Database types (inferable from client libraries)
- CI/CD presence (detectable from config files)
- Infrastructure tools (detectable from Dockerfiles, k8s configs)

</verification_guidelines>
