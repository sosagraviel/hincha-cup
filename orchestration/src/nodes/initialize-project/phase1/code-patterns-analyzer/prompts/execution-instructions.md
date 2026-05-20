# Code Patterns & Testing Analysis

Testing frameworks (per service), API patterns (project-level), code
quality tools, documentation, large-function signals.

**Service IDs come from the structure analyzer** — never redeclare;
key per-service findings under `testing.<service_id>`. Legacy
`services` array is deprecated. DO NOT create `frameworks.testing` —
framework info goes under `testing.<service_id>.framework` only.

Follow the **Graph navigation discipline** templated into your system
prompt: lean parameters everywhere; respect drill-in caps;
`get_architecture_overview` is **forbidden**.

## Step 0 — Read inspection FIRST (MANDATORY)

`Read <tempDir>/project-inspection.json`. Inspection covers
`manifests[]`, `lock_files[]`, `runtime_versions{}`, `ci_cd?`,
`infrastructure[]`, `environment?`, `documentation?`. Do NOT re-glob
those — the inspection has them.

Forbidden Globs (inspection covers them, framework post-fills the
rest): `**/package.json`, `**/.env*`, `**/Dockerfile*`,
`**/.github/workflows/*`, lock files, `.eslintrc*`, `.prettierrc*`,
`tsconfig.json`, `.husky/*`, `.pre-commit-config.yaml`, `lefthook.yml`,
`**/README*`, `**/CONTRIBUTING*`.

## Step 1 — Cheapest entry point

`get_minimal_context({ task: "Survey testing, quality signals, patterns" })`.

## Step 2 — Find test files (graph)

`semantic_search_nodes({ kind: "Test", limit: 20, detail_level:
"minimal" })`. For test → source linkage: `query_graph({ pattern:
"tests_for", target: "<service-id>", detail_level: "minimal" })` per
top-3 services — `<service-id>` comes from your AUTHORITATIVE SERVICE
LIST, not from `list_communities` (community names are code-pattern
clusters, not services).

If the graph returns no Test nodes for a service, that service has no
discoverable tests — surface it via `needs_verification` and move on.
Do NOT Glob the filesystem to search harder; empty is the honest
answer and the graph already indexed every test file in the project.

Do NOT call `find_large_functions({ min_lines: 1 })` — forbidden because it overflows.

## Step 3 — Test framework per service (manifest-derived, NO new search)

The test framework for a service is whichever testing dependency its
manifest declares. `inspection.manifests[]` (read at Step 0) has every
service's `dependencies` + `devDependencies` already parsed. Walk it
once per service, scanning for the cross-language test-runner token
vocabulary below. The matching token IS the framework name; the
manifest path IS the `config_file`. Do NOT open separate runner-config
files (`jest.config.*`, `pytest.ini`, `phpunit.xml`, etc.) — the
manifest names the runner.

Cross-language test-runner token vocabulary (a service may use one or
several; emit each under the appropriate tier):

- **Unit / component**: jest / vitest / mocha / ava / tap / jasmine /
  karma / pytest / unittest / nose / testify / ginkgo / mockall /
  proptest / junit / testng / rspec / phpunit / pest / xunit / nunit /
  scalatest / exunit / xctest / quick / kotest / spek.
- **Integration**: supertest / testcontainers / pytest-django /
  mockmvc / nestjs-testing.
- **End-to-end**: playwright / @playwright/test / cypress / webdriverio
  / selenium / detox / espresso / appium.

## Step 4 — Bucket tests per service (single graph pass + Step 3 manifest)

Bucket Step 2's `semantic_search_nodes({ kind: "Test" })` results
per service by prefix-matching each result's `file_path` against the
`path` of each service in your AUTHORITATIVE SERVICE LIST. One pass
populates every service's testing presence.

For each service, set `findings.testing.<service_id>.<tier>.{framework,
config_file}` using the runner token Step 3 found. Tier mapping is
principle-based: unit/component runners → `unit`; integration runners →
`integration`; end-to-end runners → `e2e`. `config_file` defaults to
the manifest path the framework was discovered in.

`file_count` is **optional in the schema** — emit it only when the
graph bucketing in this step gave you the count for free. Do NOT Glob
or Read to derive it.

`representative_examples` is optional. When the graph returned ≥1 Test
node for a service, you MAY emit up to the schema cap from those
results using each node's `file_path` + `name` (and `code` excerpt if
the graph exposed it). If a code excerpt is needed and the graph result
didn't include one, perform AT MOST ONE targeted `Read` per service at
the Test node's `file_path` with a small line-range. **No Globs of test
directories.** The schema asks for _enough_, not for _best_.

## Step 5 — quality_tools (framework-owned — SKIP)

Framework post-fills `findings.quality_tools.{linter, formatter,
type_checker, pre_commit}` from manifests deterministically. Do NOT
emit these fields yourself unless you spot a non-canonical tool the
post-fill missed (then it wins).

## Step 6 — Code patterns per service (graph-first, ONE query per service)

The agent.md HARD RULE requires that for every service whose `type` is
`backend` / `frontend` / `serverless` / `worker`, your output contains
either ≥ 1 entry under `findings.code_patterns.<service-id>.patterns[]`
OR a single `needs_verification` for that service. This step defines
how to satisfy that requirement WITHOUT enumerating per-service source
files.

For each such service, issue ONE `semantic_search_nodes` query scoped
to the service's `path` (from your AUTHORITATIVE SERVICE LIST). Use a
representative-pattern query token (e.g. the service's main framework
name surfaced by Step 0's inspection — `controller`, `repository`,
`handler`, `middleware`, `model`, etc.) with `kind: "Class"` or
`kind: "Function"`, `limit: 5`, and `detail_level: "standard"`. The
`standard` detail level returns code excerpts plus `file_path` +
`source_line` — exactly the citation triple
`CodeSnippetWithCitationSchema` requires.

If the graph response includes inline code excerpts: emit one
`patterns[]` entry per service using the snippet, file_path, line, and
the matching `family` token from the universal pattern catalog used
project-wide.

If the graph response carries only metadata (no `code` excerpt):
perform AT MOST ONE targeted `Read` per service at the returned
`file_path` with a small line-range around the symbol's known line.
One Read per service is the maximum.

If the graph returns nothing distinctive for a service after ONE
query, emit a single `needs_verification` entry for that service
explaining the empty result. **Do NOT Glob source directories to
search harder.** The graph already indexes every class, function, and
symbol in the project — when it returns nothing, the honest answer is
"no distinctive pattern at this query"; further filesystem enumeration
will not produce a better citation.

## Step 7 — API patterns (graph)

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level:
"minimal" })` per protocol with the canonical name token (see
data-flows analyzer's Step 4). Report `findings.api_patterns =
{rest, graphql, grpc, websockets}` as booleans + any other detected
protocols (`mqtt`, `amqp`, `kafka`).

## Step 8 — Code quality signals (graph)

`find_large_functions({ min_lines: 50, kind: "Function", limit: 30 })`.
Surface count + distribution per service in `findings.code_quality.
{large_functions_count, large_functions_threshold_lines: 50}`.

**Floor**: `min_lines: 50`. Never go lower — overflows on big
codebases.

## Step 9 — Documentation (partial — only api_docs + static_site)

- `findings.documentation.readme` + `.contributing_guide` are
  framework-owned (post-fill reads `inspection.documentation`).
- You own `findings.documentation.api_docs[]` (OpenAPI / Swagger files
  - API-doc generators like `@nestjs/swagger`, `fastapi`,
    `springdoc-openapi`, `swashbuckle`, `flask-swagger`) and
    `findings.documentation.static_site` (vitepress / docusaurus /
    mkdocs / sphinx / jekyll / hugo / astro / nextra / vuepress).

Detect via name-token scan of dependencies; ONE Glob over OpenAPI
files (`{swagger.{json,yaml},openapi.{json,yaml}}`) only if no
generator was found.

## Output

Emit the shape below. Optional fields use the `"name?"` suffix — OMIT
the field entirely when no value (do NOT emit `null`). Per-service
maps key by IDs from your AUTHORITATIVE SERVICE LIST.

<<script:critic-block agent=code-patterns-testing-analyzer>>

## `needs_verification` rules

Only when ALL hold: (a) cannot be determined from code/configs after
exhaustive search, (b) in-scope, (c) business/intent decision.

Hard-rejected: coverage threshold enforcement (Read the jest/pytest
config — `coverageThreshold` block presence is the answer), husky
hook contents (Read them — contents ARE the answer), testing
frameworks (in dependencies), test locations (graph + Glob fallback),
linter/formatter presence (post-fill handles).

**Record absence as a finding** (e.g. `coverage_threshold:
"not_enforced"`, `linter: "none"`).
