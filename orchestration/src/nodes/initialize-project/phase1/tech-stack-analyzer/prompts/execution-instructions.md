# Tech Stack & Dependencies Analysis

Analyze dependencies, databases, infrastructure tools, CI/CD pipelines,
and deployment per service.

**Service IDs come from the structure analyzer** — never redeclare;
key per-service findings under `findings.dependencies.by_service.<id>`.
The legacy `services` array is deprecated.

Follow the **Graph navigation discipline** templated into your system
prompt: lean parameters everywhere; respect drill-in caps;
`get_architecture_overview` is **forbidden** (use `get_minimal_context`

- `list_communities` instead).

## Step 0 — Inspection summary (pre-rendered)

<<script:inspection-summary>>

The above is a Phase 0 summary. The full structured data lives at
`<tempDir>/project-inspection.json` — read it ONLY when this summary
doesn't carry a specific field you need. Copy verbatim where
indicated; do NOT re-glob to derive any of it:

| Inspection field                             | Output field                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `manifests[]`                                | (read for deps in Step 4)                                        |
| `lock_files[].manager`                       | `findings.dependencies.by_service.<svc>.manager`                 |
| `runtime_versions{}`                         | `findings.runtime_versions` (verbatim, drop `tool-versions-raw`) |
| `ci_cd.{provider,config_files}`              | `findings.ci_cd.{provider,config_files}`                         |
| `infrastructure[]`                           | `findings.infrastructure` (verbatim concrete names)              |
| `environment.{required_vars,template_files}` | `findings.environment.{required_vars,template_files}`            |
| `monorepo.{package_manager,workspace_tool}`  | `findings.monorepo`                                              |
| `infrastructure_services_hints[]`            | (used by data-flows; ignore here)                                |

### HARD GLOB BAN

The Stop hook emits `tech_stack_inspection_redundant_glob` (soft
warning) when you Glob any of these — inspection covers them all:

- `**/package.json`, `**/pyproject.toml`, `**/Cargo.toml`, `**/go.mod`,
  `**/Gemfile`, `**/composer.json`, `**/*.csproj`, `**/Package.swift`,
  `**/mix.exs`, `**/build.gradle*`, `**/pom.xml`, `**/pubspec.yaml`
- All lock files (`pnpm-lock.yaml`, `poetry.lock`, etc.)
- `.env*` templates
- `Dockerfile*`, `docker-compose*.{yml,yaml}`
- `.github/workflows/*`, `.gitlab-ci.yml`, etc.
- `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `go.work`
- `.tool-versions`, `.nvmrc`, `.python-version`, `.ruby-version`

Legitimate Globs in this analyzer: graph `semantic_search_nodes`
queries (Steps 1-3) + per-service build-tool config Reads (Step 11).

## Step 1 — Cheapest entry point

`get_minimal_context({ task: "Inventory the tech stack and dependencies" })`.

## Step 2 — Service inventory

Use the **AUTHORITATIVE SERVICE LIST** injected into your prompt — it
is the structure-analyzer's discovered services. Do NOT call
`list_communities` to derive services: graph communities are code-
pattern clusters (`*-it:should`, `*-constructor`, etc.), not services.

## Step 3 — Confirmed-via-import SDKs (graph)

ONE `semantic_search_nodes({ limit: 20, detail_level: "minimal" })`
per credible category, name-token query:

- **databases**: postgres / mysql / sqlite / mssql / mongodb / redis /
  dynamodb / elasticsearch / clickhouse / cassandra / cockroach
- **ORM / data-access**: typeorm / prisma / sequelize / sqlalchemy /
  django / gorm / diesel / hibernate / activerecord
- **auth**: passport / jsonwebtoken / jose / auth0 / keycloak / oauth / oidc
- **payments / email / monitoring**: stripe / sendgrid / mailgun / sentry / datadog / newrelic / paypal / algolia
- **cloud**: aws-sdk / google-cloud / azure

Mark each as `confirmed` (real import) vs `declared` (manifest-only).

## Step 4 — Read per-service manifest

For each service from Step 2: read its dependency manifest (path
comes from the structure analyzer's `service.path`). Read the
lock file alongside if present. Cap: 1 manifest + 1 lock per service.

## Step 5 — Categorise dependencies

For each service, extract:

1. **production** — runtime deps (primary manifest section)
2. **development** — dev/test deps
3. **notable** — top 3-5 frameworks / ORMs / key libraries
4. **count** — `{ production, dev }`

Mark each as `confirmed` (Step 3 import site) or `declared`.
**Report under `findings.dependencies.by_service.<service_id>`.**

## Step 6 — DB + ORM

From Step 3's confirmed candidates: record `type` (engine token),
`orm` (data-access token), `migration_tool` + `migration_commands`
(one config read per service). Defer to structure-analyzer's
`findings.database` when already covered.

## Step 7 — CI/CD pipelines (Glob required — graph cannot answer)

ONE Glob over canonical CI configs, then read each match (cap: 5):

```
{.github/workflows/*.{yml,yaml},.gitlab-ci.yml,.circleci/config.yml,Jenkinsfile,.travis.yml,azure-pipelines.yml,bitbucket-pipelines.yml,buildspec.yml,cloudbuild.yaml}
```

Extract per pipeline: `provider`, `config_files`, `triggers`, `stages`,
`test_commands`, `build_commands`, `deploy_commands`, `environments`.
No match → `"provider": "none"`.

## Step 8 — Infrastructure & deployment (Glob required)

ONE Glob, then read up to 5 matched files:

```
{Dockerfile*,Containerfile,docker-compose*.{yml,yaml},k8s/**/*.{yml,yaml},Chart.yaml,values.yaml,*.tf,Pulumi.yaml,serverless.yml,netlify.toml,vercel.json,template.yaml}
```

`findings.infrastructure` lists CONCRETE tool names operators run
(`docker`, `docker-compose`, `kubernetes`, `helm`, `terraform`,
`pulumi`, `serverless`, `sam`, `netlify`, `vercel`, `nginx`).
Never emit category abstractions.

`findings.deployment.{target, config_files, runtime_config, scaling}`.

## Step 9 — Environment vars (redacted)

ONE Glob over `.env.example` / `.env.sample` / `.env.template`.
Extract variable NAMES ONLY. Report
`findings.environment.{required_vars[], environments[], config_approach}`.

## Step 10 — External services

For each detected service: `{service, sdk, config_location,
confirmed|declared}`. Primary signal: graph import sites from Step 3.

## Step 11 — Build tools (one config read per service)

The structure analyzer recorded each service's build config. Read it
ONCE per service and extract `lint_command`, `format_command`,
`test_command`, `build_command`. Report under
`findings.build_tools.<service_id>` with `tool`, `config_file`.

## Step 12 — Monorepo

If detected (workspace config OR `>1` community), report:

```json
"monorepo": {
  "enabled": true,
  "tool": "<canonical name>",       // "pnpm workspaces", "Nx", "Turborepo", "Maven multi-module", "Cargo workspaces", etc.
  "package_manager": "<bare name>",  // "pnpm", "poetry", "cargo" — NO version
  "workspace_config": "<path>",
  "build_all_command": "...",
  "test_all_command": "..."
}
```

Phase 4 normalises both fields via stack-agnostic helpers — emit
canonical shapes.

## Output

Emit the shape below. Optional fields use the `"name?"` suffix — OMIT
the field entirely when no value (do NOT emit `null`). Enums must use
one of the listed tokens verbatim. Per-service maps key by IDs from
your AUTHORITATIVE SERVICE LIST.

<<script:critic-block agent=tech-stack-dependencies-analyzer>>

## `needs_verification` rules

Only when ALL hold: (a) cannot be determined from code/configs after
exhaustive search, (b) in-scope (affects a generated artefact), (c)
business/intent decision the operator is uniquely positioned to answer.

Hard-rejected by Stop hook: credentials, production state, external
infra "managed elsewhere", dependency versions, DB types,
CI presence, infra tools.

**Record absence as a finding** — when evidence proves "no", emit
the absence in `findings.*` (e.g. `provider: "none"`,
`notable_absent: [...]`). Don't drop info on the floor.
