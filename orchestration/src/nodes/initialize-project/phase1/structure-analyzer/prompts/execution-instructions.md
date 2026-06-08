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

Forbidden Globs **and Reads** (inspection covers them — re-reading
the file content costs ~20–40 s per Sonnet turn for no new signal):
`**/package.json`, `**/pyproject.toml`, `**/Cargo.toml`, `**/go.mod`,
`**/Gemfile`, `**/composer.json`, `**/*.csproj`, `**/.env*`,
`**/Dockerfile*`, `**/.github/workflows/*`, `**/pnpm-workspace.yaml`,
`**/lerna.json`, `**/nx.json`, `**/turbo.json`, `**/.nvmrc`,
`**/.python-version`, `**/.ruby-version`. Inspection's
`monorepo.{package_manager, workspace_tool, workspace_config}`,
`ci_cd.config_files[]`, `infrastructure[]`, and
`documentation.readme_paths[]` carry the paths verbatim.

**Performance — batch independent file Reads in a single response.**
When you need to read several files Sonnet supports parallel tool_use
blocks: emit them in ONE assistant turn instead of one per turn. Each
turn costs ~20–40 s of model processing; batching cuts wall-clock
linearly. Same for paginating one large file — use a single Read with
an adequate range, not multiple paginated Reads.

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
- `service_is_real` — **JUDGMENT FLAG, apply to EVERY candidate**.
  Default is TRUE (omit the field). Set to **false** ONLY when the
  service's parsed manifest from `inspection.manifests[]` matches a
  non-service pattern below. This costs NO new tool calls — every
  manifest is already parsed in inspection.
  1. **Shared tooling/config package** — manifest's `dependencies` (and
     often `peerDependencies`) are ALL tooling: linters, formatters,
     test runners, build tools, language presets. The package's purpose
     is to export a config object that OTHER services consume as a
     devDependencies entry. Detect via the manifest-deps shape, not the
     package name. Stack-agnostic examples: shared `eslint-config-*` /
     `prettier-config-*` / `jest-preset-*` / `tsconfig-*` /
     `stylelint-config-*` (JS/TS); shared `rubocop-config-*` /
     `standardrb-config-*` (Ruby); shared `checkstyle-config-*` /
     `spotbugs-config-*` (Java); shared `ruff-config-*` /
     `black-config-*` (Python). Setup-tool packages with no domain
     logic (`commitlint-config-*`, `syncpack`, `husky-config-*`,
     `lint-staged-config-*`) match the same shape.
  2. **Migration-only / fixture-only / generated-only directory** —
     manifest exists but the directory's contents are only SQL
     migrations, test fixtures, mocks, or framework-generated code.
     The graph shows no production-source nodes.

  When set to false, downstream composer-views drop the entry so the
  synthesizer and per-service wiki pages never document non-services.
  **Set conservatively** — when in doubt, OMIT (default TRUE). False is
  a strong claim and a wrong false silently removes a real service.

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

## Step 8 — File placement patterns (per service, grounded)

For each real service, emit `services[].file_placement_patterns` — the
**grounded baseline** the Phase 3 synthesizer elaborates into the CLAUDE.md
File Placement Guide. The synthesizer is closed-book and cannot Read the tree,
so if you do not capture a placement here it will not exist downstream.

Per service:

1. `query_graph({ pattern: "files_in", target: "<community>",
detail_level: "minimal" })` to list the service's real files. On empty
   graph: service-scoped `Glob` by the service's language extensions.
2. Group the observed files into artefact kinds the way THIS service is
   actually laid out (e.g. `model`, `schema/DTO`, `service`, `REST router`,
   `migration`, `unit test`). Derive kinds from what you see, not from a
   generic framework template.
3. Emit 4–10 entries per service, each:
   - `type` — artefact kind (`"SQLAlchemy model"`, `"unit test"`, …)
   - `location` — real repo-relative pattern, one `{placeholder}` for the
     varying segment (`"src/entities/{domain}/model.py"`)
   - `example` — a concrete path that ACTUALLY EXISTS and matches `location`
     (`"src/entities/project/model.py"`)

Every `example` MUST be a path you observed. Never invent a generic
convention; if you cannot ground a kind, omit it. Fewer real rows beat more
fabricated ones.

## Step 9 — Path aliases (graph cannot answer)

Most services have NO path aliases. Default: emit empty
`findings.path_aliases: {}` and skip this step entirely.

ONLY when the project's primary language is one of (`typescript`,
`javascript`) and you have a strong reason to believe aliases exist
(e.g. inspection's `manifests[]` for the TypeScript service shows a
`baseUrl` or `paths` hint), perform AT MOST ONE Read of that
service's `tsconfig.json` / `jsconfig.json`. **No per-service
fan-out** — alias resolution does not change downstream behavior in
the framework's generated artifacts; spending more than one focused
Read on this step is wasted wall-clock.

Report `findings.path_aliases` as `{alias → resolved_path}`. Empty
object when none — the default.

## Step 10 — Database layer

- Engine: `semantic_search_nodes` per credible token (postgres / mysql
  / mongodb / redis / sqlite / dynamodb / clickhouse / cassandra / cockroach).
- ORM / data-access: from graph class names + manifest dep tokens
  (typeorm / prisma / sequelize / sqlalchemy / django / gorm / diesel
  / hibernate / activerecord / mongoose / mikro-orm / etc.). Manifest
  dep tokens are already in `inspection.manifests[].dependencies` —
  scan them rather than re-reading manifests.
- Migration commands: derive from the SAME manifest scripts you
  already saw in inspection (`db:migrate`, `migration:run`,
  `prisma migrate`, `alembic upgrade`, etc.). **No new Reads** — if
  inspection's manifest didn't capture scripts, emit empty
  `migration_commands: []` and move on.

Report `findings.database.{type, orm, migration_commands[]}`.

## Step 11 — README run-section extraction (top-level README only)

Read AT MOST ONE README — the project's top-level README (the first
entry in `inspection.documentation.readme_paths[]`, which is the
shortest path / closest to repo root). Per-service READMEs are noise
for the structure analyzer's output; the per-service wiki pages
generate from analyzer findings, not from READMEs.

Extract "Getting Started" / "Quick start" / "Run locally" /
"Development" / similar sections. Surface relevant commands into
`findings.automation.readme_run_sections[]` — see Output section
for shape. When the top-level README has no such section, emit an
empty `readme_run_sections[]` — do NOT fan out to per-service READMEs
to find more commands.

## Output

Emit the shape below. Optional fields use the `"name?"` suffix — OMIT
the field entirely when no value (do NOT emit `null`). Enums must use
one of the listed tokens verbatim.

<<script:critic-block agent=structure-architecture-analyzer>>

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
