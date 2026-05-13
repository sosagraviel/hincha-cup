# Structure & Architecture Analysis

Map every service / package: id, path, type, language, framework,
entry points, file count. You are the **SINGLE SOURCE OF TRUTH for
service discovery** — downstream analyzers reference services by id.

Follow the **Graph navigation discipline** templated into your system
prompt: lean parameters everywhere; respect drill-in caps;
`get_architecture_overview` is **forbidden** (overflows). Use the
combination `get_minimal_context` + `list_communities` +
`get_hub_nodes` + `get_bridge_nodes` instead — information-equivalent
and bounded.

## Step 0 — Read inspection FIRST (MANDATORY)

`Read <tempDir>/project-inspection.json`. Copy fields verbatim per
this mapping; never re-glob:

| Inspection field               | Output schema field                                            |
| ------------------------------ | -------------------------------------------------------------- |
| `repository_type`              | `findings.repository_type`                                     |
| `monorepo.workspace_paths[]`   | `findings.monorepo_layout.workspace_paths[]`                   |
| `monorepo.workspace_tool`      | `findings.monorepo_layout.workspace_tool`                      |
| `runtime_versions{}`           | `findings.runtimes`                                            |
| `ci_cd.config_files[]`         | `findings.automation.ci_hints[]` (`{file, commands: []}`)      |
| `infrastructure[]`             | may add `{type: infrastructure}` services for self-hosted ones |
| `documentation.readme_paths[]` | trigger README run-section extraction below                    |
| `manifests[].path`             | (informs per-service `manifest_file`)                          |

Forbidden Globs (inspection covers them): `**/package.json`,
`**/pyproject.toml`, `**/Cargo.toml`, `**/go.mod`, `**/Gemfile`,
`**/composer.json`, `**/*.csproj`, `**/.env*`, `**/Dockerfile*`,
`**/.github/workflows/*`, `**/pnpm-workspace.yaml`, `**/lerna.json`,
`**/nx.json`, `**/turbo.json`, `**/.nvmrc`, `**/.python-version`,
`**/.ruby-version`.

## Step 1 — Cheapest entry point

`get_minimal_context({ task: "Map service boundaries and architectural shape" })`.
~100 tokens; returns the graph map.

## Step 2 — Service inventory

**Primary**: derive one service per entry in inspection `manifests[].path`
(service id = the directory name containing the manifest). Works on
every shape (monorepo / polyrepo / single-service).

> **Stop-hook completeness contract:** every manifest-bearing
> directory in `inspection.manifests[]` (including mobile signals like
> `AndroidManifest.xml`, `Package.swift`, `*.xcodeproj`, `Podfile`,
> `Info.plist`) MUST end up in `findings.services[]` OR be cited
> verbatim in a `needs_verification[]` item explaining why it is not a
> separate service. The validator globs the project tree and rejects
> the output otherwise (`VALIDATION_E016_missing_service_paths`).

**Graph augmentation** (when available):
`list_communities({ detail_level: "minimal", min_size: 10, sort_by: "size" })`.
SKIP communities whose names match code-pattern clusters (`*-it:should`,
`*-test:*`, `*-constructor`, `*-handle`, `*-upsert`, generic noun roots
like `exceptions`/`helpers`/`utils`) — those are not services. Drill in
with `get_community({ include_members: false })` on ≤ 3 non-pattern
communities to enrich `dominant_language` and entry points.

### Per-service `entry_points` (1–3 paths)

The graph is language-agnostic. Pick the cheapest path:

1. **Small community (≤ 30 members):** `get_community({ include_members: true })`
   and pick the top 1–3 file nodes by inbound edges. Sentinel
   filenames the graph may surface: `main.*`, `index.*`, `app.*`,
   `server.*`, `program.*`, `bootstrap.*`, `start.*`, `__init__.*`,
   `Application.*`, `Startup.*` — but always prefer inbound-edge count
   over name.
2. **Medium (30–200):** `query_graph_tool({ pattern: "file_summary",
target: <community>, detail_level: "minimal" })` → top 1–3 by
   inbound edges.
3. **Large (> 200) or graph empty:** `semantic_search_nodes_tool({
kind: "File", limit: 20 })` filtered to the service path.
4. **Last resort:** `entry_points: []` + a `needs_verification` item
   naming the service. Do NOT fabricate filenames.

## Step 3 — Topology via hubs + bridges

`get_hub_nodes({ top_n: 10 })` + `get_bridge_nodes({ top_n: 10 })`.

**MANDATORY** output: `findings.architecture.coupling = {hubs: [...],
bridges: [...]}` — each entry `{qualified_name, kind, score}`. Aim
3+ per list; if the graph genuinely has fewer (tiny project), emit
what's available + `needs_verification` item — do NOT fabricate.

## Step 4 — Languages

Aggregate community language tags from Step 2 into `findings.languages`
(each language with ≥ 5 files). On empty graph: fall back to service-
scoped Globs by extension — parser-canonical names only (`typescript`,
`python`, `go`, `java`, `kotlin`, `ruby`, `php`, `csharp`, `swift`,
`elixir`, `rust`, `dart`, `c`, `cpp`, `shell`). Never raw-`find .`.

## Step 5 — Repository type

Already in inspection. Copy verbatim.

## Step 6 — Per-service metadata

For each service from Step 2, record:

- `id` — community name (stable across runs)
- `name` — from manifest, optional
- `path` — relative to repo root
- `type` — `backend` / `frontend` / `serverless` / `worker` / `library`
  / `cli` / `mobile` / `desktop` / `infrastructure` — infer from
  community shape + manifest dependency names
- `language` + `language_version`
- `frameworks.main` — primary framework name + version (e.g.
  `"NestJS 11.0.11"`). Stack-agnostic — discover from manifest deps.
- `manifest_file` — relative path
- `entry_points` — from §Step 2 procedure
- `file_count` — from community size

Service-type inference signals (stack-agnostic, name-token shape):

- backend: HTTP framework deps (express / fastify / nestjs / fastapi /
  flask / gin / spring / etc.)
- frontend: UI framework deps (react / vue / svelte / angular / solid /
  preact / qwik)
- serverless: deploy via firebase-functions / aws-lambda / cloudflare-
  workers / vercel-functions
- worker: queue libs (bullmq / celery / sidekiq / asynq)
- library: no server/UI/queue deps
- cli: cli framework deps (commander / clap / cobra / typer / click)

## Step 7 — Architecture pattern

Hubs + community shapes already describe top-level pattern. Set
`findings.architecture_pattern` to one of: `MVC` / `Vertical Slicing` /
`Hexagonal` / `DDD` / `Flat` / `Microservices` / `Modular Monolith`.

## Step 8 — File placement table

`query_graph({ pattern: "files_in", target: "<community>",
detail_level: "minimal" })` per top-5 service. Build a 10-20 row
markdown table with columns: `Package/Service | File Type |
Location Pattern | File Count | Notes`. Report
`findings.file_placement.{table_markdown, shared_packages,
import_conventions}`.

## Step 9 — Path aliases (graph cannot answer)

Read ONE build config per service (tsconfig / jsconfig / pyproject /
go.mod / pom.xml / build.gradle / Cargo.toml / composer.json /
\*.csproj / build.sbt / mix.exs / pubspec.yaml). Plus ONE bundler
config when present (vite / webpack / esbuild / rollup / parcel).
Cap: 2 reads per service. Skip services without aliases.

Report `findings.path_aliases` as `{alias → resolved_path}`. Empty
object when none.

## Step 10 — Database layer

- Engine: `semantic_search_nodes` per credible token (postgres / mysql
  / mongodb / redis / sqlite / dynamodb / clickhouse / cassandra / cockroach).
- ORM / data-access: from graph class names + manifest dep tokens
  (typeorm / prisma / sequelize / sqlalchemy / django / gorm / diesel
  / hibernate / activerecord / mongoose / mikro-orm / etc.).
- Migration commands: ONE read of the build-tool's script section per
  service.

Report `findings.database.{type, orm, migration_commands[]}`.

## Step 11 — README run-section extraction

When inspection lists README paths, Read each (cap: 3) and extract
"Getting Started" / "Quick start" / "Run locally" / "Development" /
similar sections. Surface relevant commands into `findings.automation.
readme_run_sections[]` — see Output section for shape.

## Output

Emit the shape below. Optional fields use the `"name?"` suffix — OMIT
the field entirely when no value (do NOT emit `null`). Enums must use
one of the listed tokens verbatim.

```jsonc
<<script:schema-skeleton agent=structure-architecture-analyzer>>
```

Stop-hook extras beyond the Zod schema:

- E011: each `backend|frontend|serverless|worker` service needs either
  `environment.port` (int) OR `environment.{ port_applies: false,
port_applies_reason: <string>, port_search_evidence: [<string>,<string>] }`.
- E010: each `automation` bucket whose source file exists at project
  root (Makefile / Justfile / Taskfile.\* / scripts/setup-style script /
  .devcontainer.json / README run-section heading) MUST be populated.

## `needs_verification` rules

Only when ALL hold: (a) cannot be determined from code/configs/manifests
after exhaustive search, (b) in-scope (affects a generated artefact),
(c) business/intent decision the operator is uniquely positioned to
answer.

Hard-rejected by Stop hook: credentials, production state, external
infra "managed elsewhere", dependency versions, DB types, CI
presence, infra tools, service-name questions answerable from manifest.

**Record absence as a finding** — when evidence proves "no", emit the
absence (e.g. `entry_points: []` + needs_verification item ONLY when
graph genuinely returned nothing). Don't drop info on the floor.
