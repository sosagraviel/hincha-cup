# Tech Stack & Dependencies Analysis Instructions

<objective>
Analyze dependencies, databases, infrastructure tools, CI/CD pipelines, and deployment configuration for each service. Provide comprehensive tech stack information to understand the operational requirements.
</objective>

<discovery_process>

## Step 1: Find Dependency Manifests and Lock Files

For each service discovered in Phase 1, locate and read its dependency files:

<manifest_patterns>

**Package Managers:**
- JavaScript/TypeScript: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb
- Python: pyproject.toml, setup.py, requirements.txt, Pipfile, Pipfile.lock, poetry.lock
- Go: go.mod, go.sum
- Rust: Cargo.toml, Cargo.lock
- Java: pom.xml, build.gradle, build.gradle.kts, gradle.lockfile
- Ruby: Gemfile, Gemfile.lock
- PHP: composer.json, composer.lock
- C#: *.csproj, packages.lock.json
- Swift: Package.swift, Package.resolved
- Elixir: mix.exs, mix.lock

Read each manifest to extract dependencies and their versions.

</manifest_patterns>

## Step 2: Identify Databases from Dependencies

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

## Step 3: Find CI/CD Pipeline Configurations

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

Read pipeline files to identify:
- Build steps and commands
- Test execution
- Deployment targets
- Environment variables (names only, not values)

</cicd_patterns>

## Step 4: Discover Infrastructure Configuration

<infrastructure_discovery>

**Containerization:**
- Docker: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
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

Read configuration files to understand deployment architecture.

</infrastructure_discovery>

## Step 5: Environment Configuration Discovery

<environment_analysis>

Search for environment configuration patterns:

**Environment Files:**
- `.env.example`, `.env.sample`, `.env.template`
- `config/`, `env/` directories
- Environment-specific configs: `.env.development`, `.env.production`

**Configuration Management:**
- dotenv usage in dependencies
- Config libraries (node-config, python-decouple, viper for Go)
- Environment variable references in code (`process.env`, `os.getenv`, `os.Getenv`)

Report environment variable names found in example files (never actual values).

</environment_analysis>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Found dependency manifests for all services?** Cross-check against Phase 1 service list
2. **Database clients found but no database type?** Infer from client library name (pg = PostgreSQL, mongodb = MongoDB)
3. **ORM present but no explicit database client?** ORM implies database (TypeORM often uses PostgreSQL)
4. **CI/CD suggested by repo but no config?** Check for external CI (Travis, CircleCI) or monorepo shared pipelines
5. **Docker in dependencies but no Dockerfile?** Search more broadly (might be in subdirectories)

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
- Required field: `findings.services` array with at least 1 service
- Each service matches Agent 01's service IDs
- Optional fields: `findings.monorepo` for monorepo-level config
- Optional field: `needs_verification` array (maximum 5 items)

## Example Output Structure

```json
{
  "agent_name": "tech-stack-dependencies-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "services": [
      {
        "id": "api",
        "package_manager": "pnpm",
        "manifest_file": "apps/api/package.json",
        "databases": [
          {
            "type": "postgresql",
            "client_library": "pg 8.11",
            "orm": "TypeORM 0.3.20",
            "migration_tool": "TypeORM migrations"
          },
          {
            "type": "redis",
            "client_library": "ioredis 5.3"
          }
        ]
      }
    ],
    "monorepo": {
      "package_manager": "pnpm",
      "workspace_manager": "pnpm workspaces"
    }
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "What is the production Redis instance URL?",
      "reason": "Redis client configured but connection URL not in codebase"
    }
  ]
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
