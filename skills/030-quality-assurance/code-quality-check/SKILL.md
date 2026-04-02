---
name: code-quality-check
description: Automated code quality verification with linters, type checkers, and test coverage. Use when asked to "check code quality", "run linters", "check tests", "verify coverage", or before creating a PR. Runs language-specific tools (ruff/black/mypy for Python, eslint/prettier/tsc for TypeScript), verifies test coverage meets 80% threshold, and produces detailed quality report.
argument-hint: '[optional: path/to/code]'
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Code Quality Check Skill

Automated code quality verification using linters, type checkers, and test coverage analysis with configurable thresholds.

## Contents

- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Workflow](#workflow)
- [Quality Tools](#quality-tools)
- [Coverage Requirements](#coverage-requirements)
- [Report Format](#report-format)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Purpose

This skill verifies code quality by:

1. **Detecting project language** - Python, TypeScript, JavaScript
2. **Running linters** - Code style and quality checks
3. **Type checking** - Static type verification
4. **Running tests** - Unit, integration, E2E tests
5. **Measuring coverage** - Ensuring minimum 80% test coverage
6. **Generating report** - Detailed quality metrics and pass/fail

**Input:** Codebase path (defaults to current directory)
**Output:** Quality report with metrics and pass/fail status

## When to Use

Activate this skill when:

- After implementing code changes
- Before running security review
- Before creating a pull request
- Asked to "check code quality" or "run tests"
- As part of CI/CD pipeline
- Need to verify coverage thresholds

## Workflow

### Phase 1: Detect Language and Tools

```bash
detect_language_and_tools() {
    echo "Detecting project language and available quality tools..."

    # Python detection
    if [[ -f "pyproject.toml" ]] || [[ -f "setup.py" ]] || [[ -f "requirements.txt" ]]; then
        LANGUAGE="python"

        # Check for quality tools
        LINTER=""
        TYPE_CHECKER=""
        TEST_RUNNER=""
        FORMATTER=""

        if command -v ruff &>/dev/null; then
            LINTER="ruff"
        elif command -v flake8 &>/dev/null; then
            LINTER="flake8"
        fi

        if command -v mypy &>/dev/null; then
            TYPE_CHECKER="mypy"
        fi

        if command -v pytest &>/dev/null; then
            TEST_RUNNER="pytest"
        elif command -v python -m pytest &>/dev/null; then
            TEST_RUNNER="python -m pytest"
        fi

        if command -v black &>/dev/null; then
            FORMATTER="black"
        elif [[ "$LINTER" == "ruff" ]]; then
            FORMATTER="ruff format"
        fi

        echo "Language: Python"
        echo "Linter: $LINTER"
        echo "Type checker: $TYPE_CHECKER"
        echo "Test runner: $TEST_RUNNER"
        echo "Formatter: $FORMATTER"
    fi

    # TypeScript/JavaScript detection
    if [[ -f "package.json" ]]; then
        if [[ -f "tsconfig.json" ]] || grep -q "typescript" package.json; then
            LANGUAGE="typescript"
            TYPE_CHECKER="tsc"
        else
            LANGUAGE="javascript"
            TYPE_CHECKER=""
        fi

        # Check for quality tools
        LINTER=""
        TEST_RUNNER=""
        FORMATTER=""

        if [[ -f "node_modules/.bin/eslint" ]]; then
            LINTER="npx eslint"
        fi

        if grep -q "vitest" package.json; then
            TEST_RUNNER="npx vitest"
        elif grep -q "jest" package.json; then
            TEST_RUNNER="npx jest"
        fi

        if [[ -f "node_modules/.bin/prettier" ]]; then
            FORMATTER="npx prettier"
        fi

        echo "Language: $LANGUAGE"
        echo "Linter: $LINTER"
        echo "Type checker: $TYPE_CHECKER"
        echo "Test runner: $TEST_RUNNER"
        echo "Formatter: $FORMATTER"
    fi

    if [[ -z "$LANGUAGE" ]]; then
        echo "Error: Cannot detect project language"
        return 1
    fi
}

detect_language_and_tools
```

### Phase 2: Install Missing Tools

```bash
install_quality_tools() {
    local lang="$1"

    echo "Checking quality tools installation..."

    if [[ "$lang" == "python" ]]; then
        # Install Python quality tools
        if ! command -v ruff &>/dev/null; then
            echo "Installing ruff..."
            pip install ruff
        fi

        if ! command -v mypy &>/dev/null; then
            echo "Installing mypy..."
            pip install mypy
        fi

        if ! command -v pytest &>/dev/null; then
            echo "Installing pytest with coverage..."
            pip install pytest pytest-cov
        fi

        if ! command -v black &>/dev/null; then
            echo "Installing black..."
            pip install black
        fi
    fi

    if [[ "$lang" == "typescript" ]] || [[ "$lang" == "javascript" ]]; then
        # Check Node.js tools
        if ! command -v npm &>/dev/null; then
            echo "Error: npm not found"
            return 1
        fi

        # Install if missing
        if [[ ! -f "node_modules/.bin/eslint" ]] && ! grep -q "eslint" package.json; then
            echo "Installing eslint..."
            npm install --save-dev eslint
        fi

        if [[ ! -f "node_modules/.bin/prettier" ]] && ! grep -q "prettier" package.json; then
            echo "Installing prettier..."
            npm install --save-dev prettier
        fi

        # TypeScript compiler is part of typescript package
        if [[ "$lang" == "typescript" ]] && ! command -v tsc &>/dev/null; then
            if ! grep -q "typescript" package.json; then
                echo "Installing typescript..."
                npm install --save-dev typescript
            fi
        fi
    fi

    echo "Quality tools ready"
}

install_quality_tools "$LANGUAGE"
```

### Phase 3: Run Linters

#### 3a. Python Linting

```bash
run_python_linting() {
    echo "Running Python linters..."

    local lint_report="/tmp/python_lint_report.json"
    local lint_passed=true

    # 1. Ruff check (linter)
    if [[ "$LINTER" == "ruff" ]]; then
        echo "Running ruff check..."
        ruff check . --output-format json > /tmp/ruff_check.json 2>&1

        # Check exit code
        if [[ $? -ne 0 ]]; then
            lint_passed=false
            ruff_issues=$(jq '. | length' /tmp/ruff_check.json 2>/dev/null || echo "0")
            echo "Ruff found $ruff_issues issues"
        else
            echo "Ruff check: PASSED"
        fi
    fi

    # 2. Ruff format check (formatter)
    if [[ "$FORMATTER" == "ruff format" ]]; then
        echo "Running ruff format check..."
        ruff format --check . > /tmp/ruff_format.txt 2>&1

        if [[ $? -ne 0 ]]; then
            lint_passed=false
            echo "Ruff format: FAILED (files need formatting)"
        else
            echo "Ruff format: PASSED"
        fi
    fi

    # 3. Black check (if using black instead)
    if [[ "$FORMATTER" == "black" ]]; then
        echo "Running black check..."
        black --check . > /tmp/black_check.txt 2>&1

        if [[ $? -ne 0 ]]; then
            lint_passed=false
            echo "Black: FAILED (files need formatting)"
        else
            echo "Black: PASSED"
        fi
    fi

    # Create lint report
    cat > "$lint_report" <<EOF
{
  "language": "python",
  "linter": "$LINTER",
  "formatter": "$FORMATTER",
  "passed": $lint_passed,
  "ruff_check": $(cat /tmp/ruff_check.json 2>/dev/null || echo '[]'),
  "format_check": "$(cat /tmp/ruff_format.txt 2>/dev/null || cat /tmp/black_check.txt 2>/dev/null || echo 'OK')"
}
EOF

    echo "$lint_report"
}
```

#### 3b. TypeScript/JavaScript Linting

```bash
run_typescript_linting() {
    echo "Running TypeScript/JavaScript linters..."

    local lint_report="/tmp/typescript_lint_report.json"
    local lint_passed=true

    # 1. ESLint
    if [[ -n "$LINTER" ]]; then
        echo "Running eslint..."
        $LINTER . --format json --output-file /tmp/eslint_report.json 2>&1 || true

        # Check for errors
        eslint_errors=$(jq '[.[] | .messages[] | select(.severity == 2)] | length' /tmp/eslint_report.json 2>/dev/null || echo "0")
        eslint_warnings=$(jq '[.[] | .messages[] | select(.severity == 1)] | length' /tmp/eslint_report.json 2>/dev/null || echo "0")

        if [[ $eslint_errors -gt 0 ]]; then
            lint_passed=false
            echo "ESLint: FAILED ($eslint_errors errors, $eslint_warnings warnings)"
        else
            echo "ESLint: PASSED ($eslint_warnings warnings)"
        fi
    fi

    # 2. Prettier check
    if [[ -n "$FORMATTER" ]]; then
        echo "Running prettier check..."
        $FORMATTER --check . > /tmp/prettier_check.txt 2>&1

        if [[ $? -ne 0 ]]; then
            lint_passed=false
            unformatted_files=$(cat /tmp/prettier_check.txt | wc -l)
            echo "Prettier: FAILED ($unformatted_files files need formatting)"
        else
            echo "Prettier: PASSED"
        fi
    fi

    # Create lint report
    cat > "$lint_report" <<EOF
{
  "language": "$LANGUAGE",
  "linter": "$LINTER",
  "formatter": "$FORMATTER",
  "passed": $lint_passed,
  "eslint": $(cat /tmp/eslint_report.json 2>/dev/null || echo '[]'),
  "prettier": "$(cat /tmp/prettier_check.txt 2>/dev/null || echo 'OK')"
}
EOF

    echo "$lint_report"
}
```

### Phase 4: Run Type Checking

#### 4a. Python Type Checking

```bash
run_python_type_check() {
    echo "Running Python type checking..."

    local type_report="/tmp/python_type_report.json"
    local type_passed=true

    if [[ -n "$TYPE_CHECKER" ]]; then
        echo "Running mypy..."

        # Run mypy
        mypy . --json-report /tmp/mypy_report 2>&1 || true

        # Check results
        if [[ -f "/tmp/mypy_report/index.txt" ]]; then
            mypy_errors=$(cat /tmp/mypy_report/index.txt | grep "error" | wc -l)

            if [[ $mypy_errors -gt 0 ]]; then
                type_passed=false
                echo "Mypy: FAILED ($mypy_errors type errors)"
            else
                echo "Mypy: PASSED"
            fi
        fi
    else
        echo "Mypy not installed, skipping type check"
    fi

    # Create type check report
    cat > "$type_report" <<EOF
{
  "language": "python",
  "type_checker": "$TYPE_CHECKER",
  "passed": $type_passed,
  "errors": $(cat /tmp/mypy_report/index.txt 2>/dev/null | grep "error" | wc -l || echo "0")
}
EOF

    echo "$type_report"
}
```

#### 4b. TypeScript Type Checking

```bash
run_typescript_type_check() {
    echo "Running TypeScript type checking..."

    local type_report="/tmp/typescript_type_report.json"
    local type_passed=true

    if [[ "$LANGUAGE" == "typescript" ]] && [[ -n "$TYPE_CHECKER" ]]; then
        echo "Running tsc..."

        # Run TypeScript compiler in check mode
        npx tsc --noEmit > /tmp/tsc_output.txt 2>&1

        if [[ $? -ne 0 ]]; then
            type_passed=false
            tsc_errors=$(cat /tmp/tsc_output.txt | grep "error TS" | wc -l)
            echo "tsc: FAILED ($tsc_errors type errors)"
        else
            echo "tsc: PASSED"
        fi
    else
        echo "TypeScript not detected, skipping type check"
        type_passed=true
    fi

    # Create type check report
    cat > "$type_report" <<EOF
{
  "language": "$LANGUAGE",
  "type_checker": "$TYPE_CHECKER",
  "passed": $type_passed,
  "errors": "$(cat /tmp/tsc_output.txt 2>/dev/null || echo 'OK')"
}
EOF

    echo "$type_report"
}
```

### Phase 5: Run Tests with Coverage

#### 5a. Python Tests

```bash
run_python_tests() {
    echo "Running Python tests with coverage..."

    local test_report="/tmp/python_test_report.json"
    local coverage_threshold=80
    local tests_passed=true

    if [[ -n "$TEST_RUNNER" ]]; then
        echo "Running pytest with coverage..."

        # Run pytest with coverage
        $TEST_RUNNER \
            --cov=. \
            --cov-report=json:/tmp/coverage.json \
            --cov-report=term-missing \
            --json-report \
            --json-report-file=/tmp/pytest_report.json \
            -v

        test_exit_code=$?

        # Check if tests passed
        if [[ $test_exit_code -ne 0 ]]; then
            tests_passed=false
            echo "Tests: FAILED"
        else
            echo "Tests: PASSED"
        fi

        # Check coverage
        if [[ -f "/tmp/coverage.json" ]]; then
            coverage=$(jq '.totals.percent_covered' /tmp/coverage.json 2>/dev/null || echo "0")
            coverage_int=${coverage%.*}  # Convert to integer

            echo "Coverage: ${coverage}%"

            if [[ $coverage_int -lt $coverage_threshold ]]; then
                tests_passed=false
                echo "Coverage: FAILED (${coverage}% < ${coverage_threshold}%)"
            else
                echo "Coverage: PASSED (${coverage}% >= ${coverage_threshold}%)"
            fi
        fi
    else
        echo "No test runner found, skipping tests"
        tests_passed=false
    fi

    # Create test report
    cat > "$test_report" <<EOF
{
  "language": "python",
  "test_runner": "$TEST_RUNNER",
  "passed": $tests_passed,
  "coverage": $(cat /tmp/coverage.json 2>/dev/null || echo '{}'),
  "pytest": $(cat /tmp/pytest_report.json 2>/dev/null || echo '{}')
}
EOF

    echo "$test_report"
}
```

#### 5b. TypeScript/JavaScript Tests

```bash
run_typescript_tests() {
    echo "Running TypeScript/JavaScript tests with coverage..."

    local test_report="/tmp/typescript_test_report.json"
    local coverage_threshold=80
    local tests_passed=true

    if [[ -n "$TEST_RUNNER" ]]; then
        echo "Running tests with coverage..."

        # Run tests based on test runner
        if [[ "$TEST_RUNNER" == *"vitest"* ]]; then
            $TEST_RUNNER run --coverage --reporter=json --outputFile=/tmp/test_report.json

        elif [[ "$TEST_RUNNER" == *"jest"* ]]; then
            $TEST_RUNNER --coverage --json --outputFile=/tmp/test_report.json
        fi

        test_exit_code=$?

        # Check if tests passed
        if [[ $test_exit_code -ne 0 ]]; then
            tests_passed=false
            echo "Tests: FAILED"
        else
            echo "Tests: PASSED"
        fi

        # Check coverage (from coverage/coverage-summary.json)
        if [[ -f "coverage/coverage-summary.json" ]]; then
            coverage=$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
            coverage_int=${coverage%.*}

            echo "Coverage: ${coverage}%"

            if [[ $coverage_int -lt $coverage_threshold ]]; then
                tests_passed=false
                echo "Coverage: FAILED (${coverage}% < ${coverage_threshold}%)"
            else
                echo "Coverage: PASSED (${coverage}% >= ${coverage_threshold}%)"
            fi
        fi
    else
        echo "No test runner found, skipping tests"
        tests_passed=false
    fi

    # Create test report
    cat > "$test_report" <<EOF
{
  "language": "$LANGUAGE",
  "test_runner": "$TEST_RUNNER",
  "passed": $tests_passed,
  "coverage": $(cat coverage/coverage-summary.json 2>/dev/null || echo '{}'),
  "tests": $(cat /tmp/test_report.json 2>/dev/null || echo '{}')
}
EOF

    echo "$test_report"
}
```

### Phase 6: Generate Quality Report

```bash
generate_quality_report() {
    local output_file="/tmp/code_quality_report.md"

    echo "Generating comprehensive quality report..."

    # Determine overall pass/fail
    local overall_passed=true

    if [[ "$lint_passed" != "true" ]]; then
        overall_passed=false
    fi

    if [[ "$type_passed" != "true" ]]; then
        overall_passed=false
    fi

    if [[ "$tests_passed" != "true" ]]; then
        overall_passed=false
    fi

    cat > "$output_file" <<EOF
# Code Quality Report

**Generated:** $(date)
**Language:** $LANGUAGE
**Status:** $(if [[ "$overall_passed" == "true" ]]; then echo "PASSED"; else echo "FAILED"; fi)

---

## Summary

| Check | Status | Details |
|-------|--------|---------|
| Linting | $(if [[ "$lint_passed" == "true" ]]; then echo "PASS"; else echo "FAIL"; fi) | $LINTER |
| Formatting | $(if [[ "$lint_passed" == "true" ]]; then echo "PASS"; else echo "FAIL"; fi) | $FORMATTER |
| Type Check | $(if [[ "$type_passed" == "true" ]]; then echo "PASS"; else echo "FAIL"; fi) | $TYPE_CHECKER |
| Tests | $(if [[ "$tests_passed" == "true" ]]; then echo "PASS"; else echo "FAIL"; fi) | $TEST_RUNNER |
| Coverage | $(if [[ $coverage_int -ge $coverage_threshold ]]; then echo "PASS"; else echo "FAIL"; fi) | ${coverage}% (≥${coverage_threshold}% required) |

---

## 1. Linting Results

$(cat "$lint_report" 2>/dev/null | jq -r '.' | head -50)

### Issues Found
$(format_lint_issues)

### Auto-fix Available
\`\`\`bash
# Python
ruff check --fix .
ruff format .

# TypeScript
npx eslint --fix .
npx prettier --write .
\`\`\`

---

## 2. Type Checking Results

$(cat "$type_report" 2>/dev/null | jq -r '.')

### Type Errors
$(format_type_errors)

---

## 3. Test Results

$(cat "$test_report" 2>/dev/null | jq -r '.')

### Test Summary
- **Total:** $(get_total_tests)
- **Passed:** $(get_passed_tests)
- **Failed:** $(get_failed_tests)
- **Skipped:** $(get_skipped_tests)

### Failed Tests
$(list_failed_tests)

---

## 4. Coverage Report

**Overall Coverage:** ${coverage}%

| Metric | Coverage | Required |
|--------|----------|----------|
| Lines | ${coverage}% | ${coverage_threshold}% |
| Statements | $(get_statement_coverage)% | ${coverage_threshold}% |
| Branches | $(get_branch_coverage)% | ${coverage_threshold}% |
| Functions | $(get_function_coverage)% | ${coverage_threshold}% |

### Files Below Threshold
$(list_low_coverage_files)

---

## 5. Quality Score

**Score:** $(calculate_quality_score) / 100

$(generate_score_breakdown)

---

## 6. Recommendations

$(generate_quality_recommendations)

---

## Next Steps

$(if [[ "$overall_passed" == "true" ]]; then
    echo "All quality checks passed!"
    echo "Ready to proceed with:"
    echo "1. Security review: /security-review"
    echo "2. Create PR: /create-pr"
else
    echo "Quality checks failed. Please:"
    echo "1. Fix linting issues: Run auto-fix commands above"
    echo "2. Fix type errors: Review type check output"
    echo "3. Fix failing tests: Run tests locally"
    echo "4. Improve coverage: Add tests for uncovered code"
    echo "5. Re-run quality check: /code-quality-check"
fi)

EOF

    echo "Quality report generated: $output_file"
    cat "$output_file"

    # Return exit code based on overall status
    if [[ "$overall_passed" != "true" ]]; then
        return 1
    fi

    return 0
}
```

## Quality Tools

### Python Tools

| Tool            | Purpose                               | Command          |
| --------------- | ------------------------------------- | ---------------- |
| **ruff**        | Fast linter (replaces flake8, pylint) | `ruff check .`   |
| **ruff format** | Fast formatter (replaces black)       | `ruff format .`  |
| **black**       | Code formatter                        | `black .`        |
| **mypy**        | Static type checker                   | `mypy .`         |
| **pytest**      | Test runner                           | `pytest -v`      |
| **pytest-cov**  | Coverage plugin                       | `pytest --cov=.` |

### TypeScript/JavaScript Tools

| Tool         | Purpose                     | Command                  |
| ------------ | --------------------------- | ------------------------ |
| **eslint**   | Linter                      | `npx eslint .`           |
| **prettier** | Formatter                   | `npx prettier --check .` |
| **tsc**      | TypeScript compiler/checker | `npx tsc --noEmit`       |
| **vitest**   | Test runner (Vite)          | `npx vitest run`         |
| **jest**     | Test runner                 | `npx jest`               |

## Coverage Requirements

### Default Threshold: 80%

```bash
COVERAGE_THRESHOLD=80

# Can be overridden
/code-quality-check --coverage-threshold 90
```

### Coverage Metrics

| Metric         | Description                               |
| -------------- | ----------------------------------------- |
| **Lines**      | Percentage of code lines executed         |
| **Statements** | Percentage of statements executed         |
| **Branches**   | Percentage of conditional branches tested |
| **Functions**  | Percentage of functions called            |

### Coverage Exemptions

```python
# Python: Exclude from coverage
if TYPE_CHECKING:  # pragma: no cover
    from typing import Protocol

def debug_only():  # pragma: no cover
    """Only used in development"""
    pass
```

```typescript
// TypeScript: Istanbul ignore
/* istanbul ignore next */
function debugOnly() {
  // Development only
}
```

## Report Format

### Quality Score Calculation

```bash
calculate_quality_score() {
    local score=100

    # Deduct for linting issues
    if [[ "$lint_passed" != "true" ]]; then
        score=$((score - 20))
    fi

    # Deduct for type errors
    if [[ "$type_passed" != "true" ]]; then
        score=$((score - 20))
    fi

    # Deduct for test failures
    if [[ "$tests_passed" != "true" ]]; then
        score=$((score - 30))
    fi

    # Deduct for low coverage (proportional)
    coverage_gap=$((coverage_threshold - coverage_int))
    if [[ $coverage_gap -gt 0 ]]; then
        score=$((score - coverage_gap))
    fi

    # Minimum score is 0
    if [[ $score -lt 0 ]]; then
        score=0
    fi

    echo "$score"
}
```

## Error Handling

### Tool Not Installed

```bash
if ! command -v ruff &>/dev/null; then
    echo "Warning: ruff not installed"
    echo "Install: pip install ruff"
    echo "Attempting to install..."
    pip install ruff || {
        echo "Installation failed"
        exit 1
    }
fi
```

### Tests Not Found

```bash
if [[ ! -d "tests" ]] && [[ ! -d "test" ]]; then
    echo "Warning: No test directory found"
    echo "Expected: tests/ or test/"
    echo "Skipping test execution"
    tests_passed=false
fi
```

### Coverage Threshold Not Met

```bash
if [[ $coverage_int -lt $coverage_threshold ]]; then
    echo "FAILED: Coverage ${coverage}% < ${coverage_threshold}%"
    echo "Files below threshold:"
    list_low_coverage_files
    echo "Add tests to improve coverage"
    exit 1
fi
```

## Best Practices

### 1. Fix Auto-fixable Issues First

```bash
# Python
ruff check --fix .
ruff format .

# TypeScript
npx eslint --fix .
npx prettier --write .

# Then re-run check
/code-quality-check
```

### 2. Run Incrementally

```bash
# Check just linting
/code-quality-check --lint-only

# Check just tests
/code-quality-check --tests-only

# Full check
/code-quality-check
```

### 3. Use Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.0
    hooks:
      - id: mypy
```

### 4. Configure Coverage

```toml
# pyproject.toml
[tool.coverage.run]
omit = [
    "*/tests/*",
    "*/migrations/*",
    "*/__init__.py"
]

[tool.coverage.report]
fail_under = 80
show_missing = true
```

## Examples

### Example 1: Python Project (All Pass)

**Input:**

```bash
$ /code-quality-check
```

**Output:**

```markdown
# Code Quality Report

Language: Python (FastAPI)
Status: PASSED

## Summary

| Check      | Status     |
| ---------- | ---------- |
| Linting    | PASS       |
| Type Check | PASS       |
| Tests      | PASS       |
| Coverage   | PASS (85%) |

## Quality Score: 100/100

All checks passed!
Ready for security review.
```

### Example 2: TypeScript Project (Coverage Fail)

**Input:**

```bash
$ /code-quality-check
```

**Output:**

```markdown
# Code Quality Report

Language: TypeScript (Next.js)
Status: FAILED

## Summary

| Check      | Status     |
| ---------- | ---------- |
| Linting    | PASS       |
| Type Check | PASS       |
| Tests      | PASS       |
| Coverage   | FAIL (72%) |

## Coverage Report

Overall: 72% (80% required)

Files Below Threshold:

- src/features/oauth/provider.ts (45%)
- src/utils/validation.ts (60%)

## Recommendations

1. Add tests for OAuth provider edge cases
2. Add validation utility tests
3. Target 85% coverage overall

## Quality Score: 88/100
```

## Integration with Workflow

```bash
# Step 1-3: Context, Planning, Implementation
/fetch-ticket-context PROJ-123
/analyze-requirements PROJ-123
/code-implementation PROJ-123

# Step 4: Code quality (THIS SKILL)
/code-quality-check

# If quality fails:
# - Fix linting: ruff check --fix .
# - Fix types: Review mypy output
# - Fix tests: Debug failing tests
# - Add coverage: Write more tests
# - Re-run: /code-quality-check

# Step 5: Security review (only if quality passes)
/security-review

# Step 6: Create PR
/create-pr PROJ-123
```

## Troubleshooting

**Issue: "Linter not found"**

- Install: `pip install ruff` or `npm install --save-dev eslint`
- Check PATH
- Use project-local tools

**Issue: "Tests fail in CI but pass locally"**

- Check environment variables
- Verify dependencies
- Check for race conditions
- Review CI logs

**Issue: "Coverage below threshold"**

- Identify uncovered lines: `pytest --cov-report=html`
- Add tests for uncovered code
- Consider lowering threshold temporarily

**Issue: "Type errors in generated code"**

- Add type annotations
- Use `# type: ignore` sparingly
- Update type stubs

## References

- Python Quality: `.claude/skills/mastering-python-skill/references/foundations/code-quality.md`
- TypeScript Setup: `.claude/skills/mastering-typescript/SKILL.md`
- Testing Guide: `.claude/skills/mastering-python-skill/references/testing/pytest-essentials.md`
