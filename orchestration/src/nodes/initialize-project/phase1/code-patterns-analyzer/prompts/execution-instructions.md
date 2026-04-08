# Code Patterns & Testing Analysis Instructions

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

## Step 1: Identify Testing Frameworks from Dependencies

For each service discovered in Phase 1 (by Structure Analyzer), read its manifest file and extract testing frameworks:

<testing_frameworks>

**JavaScript/TypeScript:**
- Unit/Integration: jest, vitest, mocha, ava, tap
- E2E: playwright, cypress, puppeteer, testcafe
- Component: @testing-library/react, @testing-library/vue

**Python:**
- Unit/Integration: pytest, unittest (built-in), nose2
- E2E: selenium, playwright-python

**Go:**
- Testing: built-in `testing` package (no external dependency needed)
- Advanced: testify, ginkgo, gomega

**Rust:**
- Testing: built-in `cargo test` (no external dependency needed)
- Advanced: mockall, proptest

**Java:**
- Unit: junit, testng
- Integration: spring-boot-starter-test

**Ruby:**
- Unit/Integration: rspec, minitest (built-in)
- E2E: capybara, selenium-webdriver

Testing frameworks appear in devDependencies (JS/TS) or test dependencies sections.

</testing_frameworks>

## Step 2: Find Test Files

Search for test files using multiple patterns based on discovered framework:

<test_patterns>

**Universal Patterns:**
- `**/test/**/*` - test directory
- `**/tests/**/*` - tests directory
- `**/__tests__/**/*` - __tests__ directory (Jest convention)

**Language-Specific Patterns:**
- JavaScript/TypeScript: `**/*.{test,spec}.{js,ts,jsx,tsx,mjs,cjs}`
- Python: `**/test_*.py`, `**/*_test.py`
- Go: `**/*_test.go`
- Rust: `**/tests/**/*.rs` (integration), `src/**/*.rs` (unit tests inline with `#[test]`)
- Java: `**/src/test/**/*.java`
- Ruby: `**/spec/**/*_spec.rb`

Count files matching each pattern to estimate test coverage breadth.

</test_patterns>

## Step 3: Find Test Configuration Files

<test_configs>

**Unit Test Configs:**
- Jest: `jest.config.js`, `jest.config.ts`, `jest.config.mjs`, or `"jest"` section in package.json
- Vitest: `vitest.config.ts`, `vite.config.ts` (with test section)
- Pytest: `pytest.ini`, `pyproject.toml` ([tool.pytest.ini_options]), `setup.cfg`
- Go: No config needed (built-in)
- Rust: `Cargo.toml` ([dev-dependencies])

**Integration Test Configs:**
- Often same as unit test configs with different testMatch patterns
- May have separate config: `jest.e2e.config.mjs`, `vitest.integration.config.ts`

**E2E Test Configs:**
- Playwright: `playwright.config.ts`
- Cypress: `cypress.config.ts`, `cypress.config.js`, `cypress.json`

Read config files to extract:
- File patterns (`testMatch`, `testRegex`)
- Test environment settings
- Coverage thresholds
- Test command configurations

</test_configs>

## Step 4: Analyze API/Interface Patterns

<api_patterns>

**Search for API pattern indicators in source code:**

### REST API Patterns

Search for HTTP framework decorators/annotations:
- **NestJS:** `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete` decorators
- **Express:** `app.get`, `app.post`, `router.get` calls
- **Django:** `def get`, `def post` in views, `path()` in urls.py
- **FastAPI:** `@app.get`, `@app.post` decorators
- **Go Gin:** `router.GET`, `router.POST` methods
- **Rust Axum:** `Router::new().route()` calls
- **Spring Boot:** `@RestController`, `@GetMapping`, `@PostMapping` annotations

### GraphQL Patterns

- **Node:** `@nestjs/graphql`, `apollo-server`, `type-graphql` in dependencies
- **Python:** `graphene`, `ariadne`, `strawberry` in dependencies
- Look for `.graphql` or `.gql` schema files

### gRPC Patterns

- **Node:** `@grpc/grpc-js` in dependencies, `.proto` files
- **Go:** `google.golang.org/grpc` in go.mod
- **Python:** `grpcio` in dependencies
- Look for `*.proto` files in repository

### WebSocket Patterns

- **Node:** `socket.io`, `ws` in dependencies
- **Django:** `channels` in dependencies
- **Go:** `gorilla/websocket` in go.mod
- Look for WebSocket handler code

**Report discovered API patterns:**

```json
"api_patterns": {
  "rest": true,
  "graphql": false,
  "grpc": false,
  "websockets": true
}
```

</api_patterns>

## Step 5: Identify Code Quality Tools

<quality_tools>

**Linters (from dependencies):**
- JavaScript/TypeScript: eslint, tslint (deprecated), @typescript-eslint
- Python: pylint, flake8, ruff
- Go: golangci-lint (used via CI, may not be in go.mod)
- Rust: clippy (built-in with rustup)
- Java: checkstyle, spotbugs, pmd
- Ruby: rubocop

**Formatters (from dependencies):**
- JavaScript/TypeScript: prettier, dprint
- Python: black, yapf, autopep8
- Go: gofmt, goimports (built-in)
- Rust: rustfmt (built-in)
- Java: google-java-format
- Ruby: rubocop (also formats)

**Type Checkers:**
- JavaScript: TypeScript compiler, flow
- Python: mypy, pyright, pyre

**Pre-commit Hooks:**
- Search for: `.husky/`, `.git/hooks/`, `.pre-commit-config.yaml`, `lefthook.yml`
- Check package.json for `husky`, `lint-staged`, `lefthook`

Find configuration files for each tool and note their presence.

</quality_tools>

## Step 6: Detect Documentation Patterns

<documentation_patterns>

**Search for documentation tools and patterns:**

### API Documentation

- **OpenAPI/Swagger:** `swagger.json`, `swagger.yaml`, `openapi.json`, `openapi.yaml` files
- **NestJS Swagger:** `@nestjs/swagger` in dependencies, `@ApiProperty()` decorators
- **FastAPI:** Auto-generates OpenAPI (check dependencies)
- **Spring Boot:** `springdoc-openapi` or `springfox` in dependencies

### Code Documentation

- **JavaScript/TypeScript:** JSDoc comments (`/** */`), TSDoc
- **Python:** Docstrings (triple quotes), Sphinx (`docs/` with `conf.py`)
- **Go:** Godoc comments (`//`)
- **Rust:** Rustdoc comments (`///`), `cargo doc`
- **Java:** Javadoc comments (`/***/`)

### README and Guides

Search for documentation files:
- `README.md`, `README.rst`
- `CONTRIBUTING.md`, `DEVELOPMENT.md`
- `docs/` directory with markdown or reStructuredText
- `*.mdx` files (MDX documentation)

### Static Site Generators

Check dependencies for:
- **VitePress:** `vitepress` in devDependencies
- **Docusaurus:** `@docusaurus/core`
- **MkDocs:** `mkdocs` (Python)
- **GitBook:** `gitbook` directory
- **Sphinx:** `sphinx` (Python)
- **Docsify:** `docsify`

**Report format:**

```json
"documentation": {
  "api_docs": ["swagger", "openapi"],
  "static_site": "vitepress",
  "readme": true,
  "contributing_guide": true
}
```

</documentation_patterns>

## Step 7: Categorize Tests by Type

<test_categorization>

Categorize discovered tests into three types:

**Unit Tests:**
- Test individual functions/methods in isolation
- Usually fast (<1s per test)
- Typically in same directory as source OR in parallel test/ directory
- Patterns: Files with `.test.`, `.spec.`, `test_` prefix

**Integration Tests:**
- Test multiple components working together
- May interact with databases, APIs
- Often in separate `tests/integration/` directory
- May have separate config: `jest.integration.config.js`

**E2E (End-to-End) Tests:**
- Test complete user workflows
- Use browser automation (Playwright, Cypress)
- Usually in `e2e/`, `tests/e2e/`, or `cypress/` directories
- Have dedicated configs: `playwright.config.ts`, `cypress.config.ts`

Report counts for each type if distinguishable from file paths or config.

</test_categorization>

</discovery_process>

<critical_thinking>

## Self-Verification Checklist

1. **Testing framework in dependencies but no test files?** Try multiple search patterns (test/, tests/, __tests__/, *.test.*, *.spec.*)
2. **No testing framework in dependencies?** Valid to report "none" (MVP projects, separate test repo)
3. **API patterns detected?** Check for REST/GraphQL/gRPC/WebSocket indicators
4. **Linter in dependencies but no config?** Check package.json, pyproject.toml for inline config
5. **Formatter in dependencies but no config?** Some use defaults (prettier, black, gofmt)
6. **E2E tests exist but framework unclear?** Read imports in test files (playwright, cypress, selenium)
7. **Documentation tools checked?** Look for Swagger/OpenAPI, static site generators, docs/ directory
8. **Pre-commit hooks detected?** Search for .husky/, .pre-commit-config.yaml, lefthook.yml

## Common Patterns

**Node.js/TypeScript projects typically have:**
- Jest or Vitest for unit tests
- Playwright or Cypress for E2E
- ESLint + Prettier for quality
- Husky for pre-commit hooks

**Python projects typically have:**
- Pytest for testing
- Black + Pylint or Ruff for quality
- pre-commit for hooks

**Go projects typically have:**
- Built-in testing package
- golangci-lint (in CI, not always in go.mod)
- gofmt (built-in, no config)

</critical_thinking>

<output_format>

See shared output format documentation at: `../../../shared/prompts/output-format.md`

## Key Points

- Output raw JSON only (no markdown, no commentary)
- Required field: `findings.services` array with at least 1 service
- Each service must match Agent 01's service IDs
- Optional nested objects: `testing.unit`, `testing.integration`, `testing.e2e`
- Optional field: `needs_verification` array (maximum 5 items)

## Example Output Structure

```json
{
  "agent_name": "code-patterns-testing-analyzer",
  "timestamp": "2026-04-02T10:30:00.000Z",
  "findings": {
    "api_patterns": {
      "rest": true,
      "graphql": false,
      "grpc": false,
      "websockets": true
    },
    "quality_tools": {
      "linter": "eslint",
      "formatter": "prettier",
      "type_checker": "typescript",
      "pre_commit": "husky"
    },
    "documentation": {
      "api_docs": ["swagger", "openapi"],
      "static_site": "none",
      "readme": true,
      "contributing_guide": true
    },
    "services": [
      {
        "id": "backend",
        "testing": {
          "unit": {
            "framework": "Jest 29.7",
            "config_file": "services/backend/jest.config.mjs",
            "file_pattern": ".*\\.(spec|test)\\.ts$",
            "file_count": 13
          },
          "integration": {
            "framework": "Jest 29.7",
            "config_file": "services/backend/jest.e2e.config.mjs",
            "file_pattern": ".e2e-spec.ts$",
            "file_count": 5
          }
        }
      },
      {
        "id": "web-frontend",
        "testing": {
          "e2e": {
            "framework": "Playwright 1.52",
            "config_file": "services/web-frontend/playwright.config.ts",
            "file_pattern": "e2e/**/*.spec.ts",
            "file_count": 7
          }
        }
      }
    ]
  },
  "needs_verification": []
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `../../../shared/prompts/verification-format.md`

Use `needs_verification` for:
- Test coverage policies not in config files
- Testing strategies for specific scenarios
- Performance test requirements
- Load testing configurations managed externally

Do NOT use for:
- Testing frameworks (discoverable from dependencies)
- Test file locations (searchable with glob)
- Linter/formatter presence (in dependencies and configs)
- Pre-commit hook configurations (in repo files)

</verification_guidelines>
