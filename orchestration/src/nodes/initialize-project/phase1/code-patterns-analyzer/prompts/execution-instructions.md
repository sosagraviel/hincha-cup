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

Empty-graph fallback: Glob the language family's canonical test path
(`**/*.spec.{ts,js}` / `**/*_test.go` / `**/test_*.py` /
`**/*Spec.java` / `**/*_spec.rb` / `**/Tests/**/*.cs` etc.). Pick the
right shape from the language the structure-analyzer detected; never
enumerate all.

Do NOT call `find_large_functions({ min_lines: 1 })` — forbidden because it overflows.

## Step 3 — Test config (one Glob, read up to 5)

```
{jest.config.{js,ts,mjs,cjs},vitest.config.{js,ts,mjs},vite.config.{js,ts},playwright.config.{ts,js},cypress.config.{ts,js},pytest.ini,pyproject.toml,phpunit.xml,phpunit.xml.dist,karma.conf.js}
```

Extract per config: `file_patterns`, `environment`, `coverage_thresholds`,
`test_commands`.

## Step 4 — Test count + framework per service

For each service from the structure analyzer's list, set
`findings.testing.<service_id>.{unit, integration, e2e}` =
`{framework, config_file, file_count}`. Pull framework name from
manifest devDependencies via the tech-stack analyzer's
`dependencies.by_service.<id>.notable` AND a quick name-token scan of
testing libs (jest / vitest / mocha / ava / pytest / unittest / nose /
testify / ginkgo / mockall / proptest / junit / testng / rspec /
phpunit / pest / xunit / nunit / scalatest / exunit / playwright /
cypress / selenium).

## Step 5 — quality_tools (framework-owned — SKIP)

Framework post-fills `findings.quality_tools.{linter, formatter,
type_checker, pre_commit}` from manifests deterministically. Do NOT
emit these fields yourself unless you spot a non-canonical tool the
post-fill missed (then it wins).

## Step 6 — API patterns (graph)

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level:
"minimal" })` per protocol with the canonical name token (see
data-flows analyzer's Step 4). Report `findings.api_patterns =
{rest, graphql, grpc, websockets}` as booleans + any other detected
protocols (`mqtt`, `amqp`, `kafka`).

## Step 7 — Code quality signals (graph)

`find_large_functions({ min_lines: 50, kind: "Function", limit: 30 })`.
Surface count + distribution per service in `findings.code_quality.
{large_functions_count, large_functions_threshold_lines: 50}`.

**Floor**: `min_lines: 50`. Never go lower — overflows on big
codebases.

## Step 8 — Documentation (partial — only api_docs + static_site)

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
