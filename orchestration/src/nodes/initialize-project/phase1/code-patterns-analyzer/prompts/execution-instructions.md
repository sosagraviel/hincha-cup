# Code Patterns & Testing Analysis Instructions

> **Tool naming.** Bare tool names below (e.g. `find_large_functions`) are semantic identifiers. The canonical names are listed in the **CODE GRAPH CONTEXT** block in your system prompt — they share the `mcp__code_graph__` prefix and may carry a `_tool` suffix. Always call the catalog name, not a name you find here.

<objective>
Analyze testing strategies, code quality tools, and development practices for each service. Identify test frameworks, categorize tests, and document quality tooling.
</objective>

**IMPORTANT: Service Discovery Ownership**

- **Structure Analyzer (Agent 01)** is the SINGLE SOURCE OF TRUTH for service discovery
- DO NOT redeclare services in your output
- REFERENCE services by ID from Structure Analyzer
- Organize findings using service IDs as keys (e.g., `testing.backend.unit`)
- The `services` array field is DEPRECATED - use maps with service ID keys instead
- DO NOT create `frameworks.testing` field - framework info belongs in `testing.*.framework` only

<discovery_process>

> **Graph use.** All graph tool calls below MUST follow the **Graph navigation discipline** templated into your CODE GRAPH CONTEXT block (lean parameters, drill-in caps, forbidden tools). Specialise _which_ lean tools you call for each question; never override the defaults.

## Step 0: Cheap orientation via graph

Call `get_minimal_context` with `task: "Survey testing approach, code-quality signals, and recurring patterns"`. The response (~100 tokens) gives you top communities, top flows, and suggested next tools — use it before any other graph call.

## Step 1: Testing Frameworks from Dependencies

The tech-stack analyzer's `dependencies.by_service` already lists each service's libraries. Look for testing frameworks by name token within the dev-dependency section: `jest`, `vitest`, `mocha`, `ava`, `tap`, `pytest`, `unittest`, `nose`, `testify`, `ginkgo`, `gomega`, `mockall`, `proptest`, `junit`, `testng`, `spring-boot-starter-test`, `rspec`, `minitest`, `phpunit`, `pest`, `xunit`, `nunit`, `mstest`, `scalatest`, `specs2`, `exunit`. E2E: `playwright`, `cypress`, `puppeteer`, `selenium`, `capybara`, `testcafe`. Record per service.

## Step 2: Find Test Files via graph

Call `semantic_search_nodes({ kind: "Test", limit: 20, detail_level: "minimal" })` (the graph indexes test nodes natively). For test → source linkage, call `query_graph({ pattern: "tests_for", target: "<community>", detail_level: "minimal" })` per service, capped at top 3 communities.

**Only when the graph returns 0 Test nodes** (true empty-graph fallback): use Glob with the language family's canonical test path. Common shapes are language-tied (`**/*.spec.{ts,js}`, `**/*_test.go`, `**/test_*.py`, `**/*Spec.java`, `**/*_spec.rb`, `**/Tests/**/*.cs`, …). Use the structure analyzer's detected language to pick the right shape — never enumerate all of them. Do NOT call `find_large_functions({ min_lines: 1 })` — it returns every function and overflows.

## Step 3: Test Configuration (one Glob, then read)

ONE Glob over canonical test-config filenames, then read each match (cap: 5):

```
{jest.config.{js,ts,mjs,cjs},vitest.config.{js,ts,mjs},vite.config.{js,ts},playwright.config.{ts,js},cypress.config.{ts,js},cypress.json,pytest.ini,pyproject.toml,setup.cfg,phpunit.xml,phpunit.xml.dist,rspec,karma.conf.js,nightwatch.conf.js}
```

Extract per-config: file patterns, environment settings, coverage thresholds, test commands.

## Step 4: API/Interface Patterns via graph

ONE `semantic_search_nodes({ kind: "Class", limit: 15, detail_level: "minimal" })` per protocol you want to confirm, with the appropriate name token:

- **REST**: `Controller | Handler | Route | Endpoint`
- **GraphQL**: `Resolver | Schema | ObjectType`
- **gRPC**: `ServiceDefinition | GrpcMethod | RpcService`
- **WebSocket**: `WebSocketGateway | SubscribeMessage`

**Report `findings.api_patterns`** as `{ rest, graphql, grpc, websockets }` booleans, plus any other detected protocols (`mqtt`, `amqp`, `kafka`).

## Step 5: Code Quality Tools (manifest + one config-file glob)

The tech-stack analyzer's `dependencies.by_service` already lists installed tools. Recognise quality tools by name token:

- **linters**: eslint / tslint / pylint / flake8 / ruff / golangci-lint / clippy / checkstyle / spotbugs / pmd / rubocop / phpstan / phpcs / detekt / scalafmt / credo
- **formatters**: prettier / dprint / black / yapf / autopep8 / gofmt / goimports / rustfmt / google-java-format / rubocop / php-cs-fixer / ktlint / scalafmt / mix-format
- **type checkers**: tsc / flow / mypy / pyright / pyre / sorbet (Ruby) / psalm (PHP)
- **pre-commit**: husky / lint-staged / lefthook / pre-commit (Python) / overcommit / git-hooks-go

ONE Glob over typical config locations: `{.eslintrc*,.prettierrc*,.flake8,.pylintrc,pyproject.toml,clippy.toml,tsconfig.json,.husky/*,.pre-commit-config.yaml,lefthook.yml,phpstan.neon,.rubocop.yml,checkstyle.xml,detekt.yml}`. Note presence; read only when extracting non-default settings.

## Step 6: Code Quality via graph

Call `find_large_functions({ min_lines: 50, kind: "Function", limit: 30 })` to surface functions that are candidates for complexity review. This is a quality signal the graph provides directly. Do NOT lower `min_lines` below 50 — smaller thresholds risk overflowing the result on large codebases.

Record the count and distribution of large functions per service in `findings.code_quality`.

## Step 7: Documentation Patterns (Glob — required)

ONE Glob over: `{swagger.{json,yaml},openapi.{json,yaml},README*,CONTRIBUTING*,DEVELOPMENT*,docs/**/{*.md,*.rst,*.adoc}}`. Plus one tech-stack lookup for static-site generators (`vitepress`, `docusaurus`, `mkdocs`, `sphinx`, `jekyll`, `hugo`, `astro`, `nextra`, `vuepress`). API-doc generators (`@nestjs/swagger`, `fastapi`, `springdoc-openapi`, `swashbuckle`, `flask-swagger`) emit OpenAPI from code; surface presence in `findings.documentation.api_docs`.

**Report**: `findings.documentation` with `api_docs[]`, `static_site`, `readme`, `contributing_guide`.

## Step 8: Categorise Tests by Type

Use the graph's `tests_for` edges from Step 2 as primary signal. Categorise:

- **unit** — same package as source, fast.
- **integration** — DB / API / cross-component; often in a parallel `tests/integration` shape.
- **e2e** — browser/automation; recognised by playwright/cypress/selenium imports OR a dedicated config file (Step 3).

Counts per category go in `testing.<service_id>.{unit,integration,e2e}.file_count`.

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Called `get_minimal_context` first?** It must be the first graph call. If you skipped it, you almost certainly over-pulled later.
2. **Used lean parameters everywhere?** All `semantic_search_nodes` with `limit: 15-20` MAX and `detail_level: "minimal"`; `find_large_functions` with `min_lines: 50` minimum (never `min_lines: 1`). (The discipline already forbids `get_architecture_overview` — see §3 of the navigation discipline.)
3. **Called semantic_search_nodes for test discovery?** Graph results should be primary test file inventory.
4. **Called query_graph with tests_for pattern?** Test → source linkage from graph edges, capped at top 3 communities.
5. **Called semantic_search_nodes for API patterns?** Controller/Resolver/Service class detection via graph.
6. **Testing framework in dependencies but no test files?** Check if graph returned results; if not, try Glob fallback patterns
7. **No testing framework in dependencies?** Valid to report "none" (MVP projects, separate test repo)
8. **Linter in dependencies but no config?** Check package.json, pyproject.toml for inline config
9. **Documentation tools checked?** Look for Swagger/OpenAPI, static site generators, docs/ directory
10. **Pre-commit hooks detected?** Search for .husky/, .pre-commit-config.yaml, lefthook.yml

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown, no commentary)
- Required field: `findings.services` array with at least 1 service
- Each service must match Agent 01's service IDs
- Optional nested objects: `testing.unit`, `testing.integration`, `testing.e2e`
- Optional field: `needs_verification` array (maximum 3 items)
- Required field: `graph_queries_used` — set to `[]`. The framework derives the real list from your transcript.

## Example Output Shape (language-neutral skeleton)

```json
{
  "agent_name": "code-patterns-testing-analyzer",
  "timestamp": "<ISO-8601>",
  "findings": {
    "api_patterns": { "rest": false, "graphql": false, "grpc": false, "websockets": false },
    "quality_tools": {
      "linter": "<tool>",
      "formatter": "<tool>",
      "type_checker": "<tool>",
      "pre_commit": "<tool>"
    },
    "code_quality": { "large_functions_count": 0, "large_functions_threshold_lines": 50 },
    "documentation": {
      "api_docs": ["<format>"],
      "static_site": "<tool|none>",
      "readme": false,
      "contributing_guide": false
    },
    "testing": {
      "<service-id>": {
        "unit": {
          "framework": "<framework>",
          "config_file": "<path>",
          "file_pattern": "<regex>",
          "file_count": 0
        },
        "integration": {
          "framework": "<framework>",
          "config_file": "<path>",
          "file_pattern": "<regex>",
          "file_count": 0
        },
        "e2e": {
          "framework": "<framework>",
          "config_file": "<path>",
          "file_pattern": "<regex>",
          "file_count": 0
        }
      }
    }
  },
  "graph_queries_used": [],
  "needs_verification": []
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` ONLY when ALL hold:

1. The fact cannot be determined from code/configs/manifests after exhaustive searching.
2. The answer is IN SCOPE — it changes a concrete generated artefact (wiki page / skill body / finding). Production state and externally-managed infrastructure are NOT in scope.
3. The question is a business / intent decision the operator is uniquely positioned to answer (intentional-vs-accidental gap, deprecation policy, etc.).

Do NOT use for any of these (the Stop hook hard-rejects them):

- ❌ "Load testing configurations managed externally" / production-only state — out-of-scope.
- ❌ Coverage threshold ENFORCEMENT (Read the jest/pytest config; if no `coverageThreshold` block exists, report that as a finding — do NOT ask the operator whether one is enforced).
- ❌ Husky / git-hook contents (Read each `.husky/*` file; the contents ARE the answer).
- ❌ Testing frameworks (discoverable from dependencies).
- ❌ Test file locations (graph + Glob fallback).
- ❌ Linter / formatter presence (in dependencies and configs).

</verification_guidelines>

## Token efficiency

Graph queries are O(1) on warm cache (the graph is built once per init). Glob+Read scales with file count. For projects with thousands of files, the difference is 10–100×. Use the graph.
