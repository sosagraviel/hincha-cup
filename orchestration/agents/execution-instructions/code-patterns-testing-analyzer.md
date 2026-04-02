# Code Patterns & Testing Analysis Instructions

<objective>
Analyze testing strategies, code quality tools, and development practices for each service. Identify test frameworks, categorize tests, and document quality tooling.
</objective>

<discovery_process>

## Step 1: Identify Testing Frameworks from Dependencies

For each service discovered in Phase 1, read its manifest file and extract testing frameworks:

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

## Step 4: Identify Code Quality Tools

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

## Step 5: Categorize Tests by Type

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
3. **Linter in dependencies but no config?** Check package.json, pyproject.toml for inline config
4. **Formatter in dependencies but no config?** Some use defaults (prettier, black, gofmt)
5. **E2E tests exist but framework unclear?** Read imports in test files (playwright, cypress, selenium)

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

See shared output format documentation at: `agents/shared/output-format.md`

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
    "services": [
      {
        "id": "api",
        "frameworks": {
          "testing": "Jest"
        },
        "testing": {
          "unit": {
            "framework": "Jest 29.7",
            "config_file": "apps/api/jest.config.js",
            "file_pattern": "**/*.spec.ts",
            "file_count": 45
          },
          "e2e": {
            "framework": "Playwright 1.40",
            "config_file": "apps/api/playwright.config.ts",
            "file_pattern": "e2e/**/*.spec.ts",
            "file_count": 12
          }
        }
      }
    ]
  },
  "needs_verification": [
    {
      "id": "v1",
      "question": "What is the minimum required test coverage percentage?",
      "reason": "Coverage thresholds not configured in test configs"
    }
  ]
}
```

</output_format>

<verification_guidelines>

See shared verification format documentation at: `agents/shared/verification-format.md`

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
