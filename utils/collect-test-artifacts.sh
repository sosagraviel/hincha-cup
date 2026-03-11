#!/bin/bash

# Test Artifact Collection Script
# Collects E2E videos, screenshots, integration test results, coverage reports
# Usage: ./collect-test-artifacts.sh JIRA-KEY [--frontend|--backend|--both]

set -euo pipefail

JIRA_KEY="${1:-}"
TYPE="${2:---both}"  # frontend, backend, or both

if [[ -z "$JIRA_KEY" ]]; then
    echo "Usage: $0 JIRA-KEY [--frontend|--backend|--both]"
    exit 1
fi

ARTIFACTS_DIR=".claude/artifacts/${JIRA_KEY}"
mkdir -p "$ARTIFACTS_DIR"/{videos,screenshots,reports,traces}

echo "Collecting test artifacts for ${JIRA_KEY}..."

# =============================================================================
# E2E Test Artifacts (Frontend)
# =============================================================================

collect_e2e_artifacts() {
    echo "Collecting E2E test artifacts..."

    # 1. Test Videos (all tests)
    if [[ -d "test-results" ]]; then
        echo "  → Collecting test videos..."
        find test-results -name "*.webm" -exec cp {} "$ARTIFACTS_DIR/videos/" \; 2>/dev/null || true
        video_count=$(ls -1 "$ARTIFACTS_DIR/videos"/*.webm 2>/dev/null | wc -l | tr -d ' ')
        echo "    ✓ Collected $video_count test videos"
    fi

    # 2. Screenshots (failures only)
    if [[ -d "test-results" ]]; then
        echo "  → Collecting failure screenshots..."
        find test-results -name "*-failed-*.png" -exec cp {} "$ARTIFACTS_DIR/screenshots/" \; 2>/dev/null || true
        screenshot_count=$(ls -1 "$ARTIFACTS_DIR/screenshots"/*.png 2>/dev/null | wc -l | tr -d ' ')
        echo "    ✓ Collected $screenshot_count failure screenshots"
    fi

    # 3. Trace files (for debugging)
    if [[ -d "test-results" ]]; then
        echo "  → Collecting Playwright traces..."
        find test-results -name "*.zip" -exec cp {} "$ARTIFACTS_DIR/traces/" \; 2>/dev/null || true
        trace_count=$(ls -1 "$ARTIFACTS_DIR/traces"/*.zip 2>/dev/null | wc -l | tr -d ' ')
        echo "    ✓ Collected $trace_count trace files"
    fi

    # 4. HTML Report
    if [[ -d "playwright-report" ]]; then
        echo "  → Collecting E2E HTML report..."
        mkdir -p "$ARTIFACTS_DIR/reports/e2e"
        cp -r playwright-report/* "$ARTIFACTS_DIR/reports/e2e/" 2>/dev/null || true
        echo "    ✓ Collected E2E HTML report"
    fi

    # 5. Extract E2E Metrics from JSON Results
    echo "  → Extracting E2E test metrics..."
    if [[ -f "test-results/e2e-results.json" ]] || [[ -f "playwright-report/results.json" ]]; then
        # Try Playwright JSON first
        e2e_json=""
        if [[ -f "test-results/e2e-results.json" ]]; then
            e2e_json="test-results/e2e-results.json"
        elif [[ -f "playwright-report/results.json" ]]; then
            e2e_json="playwright-report/results.json"
        fi

        if [[ -n "$e2e_json" ]]; then
            # Extract test counts
            total_tests=$(jq '[.suites[].specs[]] | length' "$e2e_json" 2>/dev/null || echo "0")
            passed_tests=$(jq '[.suites[].specs[] | select(.ok == true)] | length' "$e2e_json" 2>/dev/null || echo "0")
            failed_tests=$(jq '[.suites[].specs[] | select(.ok == false)] | length' "$e2e_json" 2>/dev/null || echo "0")
            flaky_tests=$(jq '[.suites[].specs[] | select(.tests[].results[] | .status == "flaky")] | length' "$e2e_json" 2>/dev/null || echo "0")

            # Extract duration
            duration_ms=$(jq '[.suites[].specs[].tests[].results[].duration] | add' "$e2e_json" 2>/dev/null || echo "0")

            # Save E2E metrics
            cat > "$ARTIFACTS_DIR/reports/e2e-metrics.json" <<EOF
{
  "total": $total_tests,
  "passed": $passed_tests,
  "failed": $failed_tests,
  "flaky": $flaky_tests,
  "duration_ms": $duration_ms,
  "pass_rate": $(echo "scale=2; $passed_tests * 100 / $total_tests" | bc 2>/dev/null || echo "0"),
  "videos_collected": $video_count,
  "screenshots_collected": $screenshot_count,
  "traces_collected": $trace_count
}
EOF

            echo "    ✓ E2E Metrics: Total: $total_tests | Passed: $passed_tests | Failed: $failed_tests | Flaky: $flaky_tests | Duration: ${duration_ms}ms"

            # Extract flaky test details
            if [[ $flaky_tests -gt 0 ]]; then
                echo "    ⚠️  Found $flaky_tests flaky test(s)"
                jq -r '[.suites[].specs[] | select(.tests[].results[] | .status == "flaky") | .title] | .[]' "$e2e_json" 2>/dev/null | while read -r test_title; do
                    echo "       - $test_title"
                done

                # Save flaky test list
                jq '[.suites[].specs[] | select(.tests[].results[] | .status == "flaky") | .title]' "$e2e_json" > "$ARTIFACTS_DIR/reports/flaky-tests.json"
            fi
        fi
    else
        echo "    ⚠️  No E2E results JSON found, metrics unavailable"
    fi
}

# =============================================================================
# UI Screenshots (Before/After Comparison)
# =============================================================================

collect_ui_screenshots() {
    echo "Collecting UI screenshots (before/after)..."

    # Get list of changed routes/pages from git diff
    changed_files=$(git diff --name-only HEAD~1 HEAD | grep -E '\.(tsx?|jsx?)$' | head -10)

    if [[ -z "$changed_files" ]]; then
        echo "  → No UI files changed, skipping screenshots"
        return
    fi

    echo "  → Capturing screenshots for changed pages..."

    # Start dev server in background
    if command -v pnpm &>/dev/null; then
        pnpm run dev &>/dev/null &
        DEV_PID=$!
    elif command -v npm &>/dev/null; then
        npm run dev &>/dev/null &
        DEV_PID=$!
    else
        echo "    ⚠️  No package manager found, skipping UI screenshots"
        return
    fi

    # Wait for server to start
    sleep 10

    # Capture screenshots of key pages
    # (This would ideally parse routes from changed files)
    for route in "/" "/login" "/dashboard"; do
        npx playwright screenshot "http://localhost:3000${route}" \
            "$ARTIFACTS_DIR/screenshots/ui-after-${route//\//-}.png" 2>/dev/null || true
    done

    # Kill dev server
    kill $DEV_PID 2>/dev/null || true

    ui_screenshot_count=$(ls -1 "$ARTIFACTS_DIR/screenshots"/ui-*.png 2>/dev/null | wc -l | tr -d ' ')
    echo "    ✓ Captured $ui_screenshot_count UI screenshots"
}

# =============================================================================
# Integration Test Results (Backend)
# =============================================================================

collect_integration_test_results() {
    echo "Collecting integration test results..."

    # TypeScript/JavaScript (Jest/Vitest)
    if [[ -f "test-results/integration.json" ]]; then
        echo "  → Collecting Jest/Vitest integration results..."
        cp test-results/integration.json "$ARTIFACTS_DIR/reports/"

        # Extract metrics
        total_tests=$(jq '.numTotalTests // 0' test-results/integration.json 2>/dev/null || echo "0")
        passed_tests=$(jq '.numPassedTests // 0' test-results/integration.json 2>/dev/null || echo "0")
        failed_tests=$(jq '.numFailedTests // 0' test-results/integration.json 2>/dev/null || echo "0")
        duration_ms=$(jq '.testResults[].duration // 0 | add' test-results/integration.json 2>/dev/null || echo "0")

        echo "    ✓ Collected integration test JSON"
        echo "      Total: $total_tests | Passed: $passed_tests | Failed: $failed_tests | Duration: ${duration_ms}ms"

        # Save metrics summary
        cat > "$ARTIFACTS_DIR/reports/integration-metrics.json" <<EOF
{
  "total": $total_tests,
  "passed": $passed_tests,
  "failed": $failed_tests,
  "duration_ms": $duration_ms,
  "pass_rate": $(echo "scale=2; $passed_tests * 100 / $total_tests" | bc 2>/dev/null || echo "0")
}
EOF
    fi

    # Python (Pytest)
    if [[ -f "test-results/pytest.json" ]]; then
        echo "  → Collecting Pytest integration results..."
        cp test-results/pytest.json "$ARTIFACTS_DIR/reports/"

        # Extract metrics from Pytest JSON
        total_tests=$(jq '.tests | length' test-results/pytest.json 2>/dev/null || echo "0")
        passed_tests=$(jq '[.tests[] | select(.outcome == "passed")] | length' test-results/pytest.json 2>/dev/null || echo "0")
        failed_tests=$(jq '[.tests[] | select(.outcome == "failed")] | length' test-results/pytest.json 2>/dev/null || echo "0")

        echo "    ✓ Collected Pytest JSON"
        echo "      Total: $total_tests | Passed: $passed_tests | Failed: $failed_tests"
    fi

    # HTML Reports
    if [[ -d "test-results/integration-report" ]]; then
        echo "  → Collecting integration HTML report..."
        mkdir -p "$ARTIFACTS_DIR/reports/integration"
        cp -r test-results/integration-report/* "$ARTIFACTS_DIR/reports/integration/" 2>/dev/null || true
        echo "    ✓ Collected integration HTML report"
    fi
}

# =============================================================================
# Coverage Reports
# =============================================================================

collect_coverage_reports() {
    echo "Collecting coverage reports..."

    # TypeScript/JavaScript Coverage (Jest/Vitest)
    if [[ -d "coverage" ]]; then
        echo "  → Collecting JS/TS coverage..."
        mkdir -p "$ARTIFACTS_DIR/reports/coverage"
        cp -r coverage/* "$ARTIFACTS_DIR/reports/coverage/" 2>/dev/null || true

        # Extract summary
        if [[ -f "coverage/coverage-summary.json" ]]; then
            overall_coverage=$(jq -r '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "N/A")
            echo "    ✓ Collected coverage reports (${overall_coverage}% overall)"
        else
            echo "    ✓ Collected coverage reports"
        fi
    fi

    # Python Coverage (pytest-cov)
    if [[ -d "htmlcov" ]]; then
        echo "  → Collecting Python coverage..."
        mkdir -p "$ARTIFACTS_DIR/reports/coverage-python"
        cp -r htmlcov/* "$ARTIFACTS_DIR/reports/coverage-python/" 2>/dev/null || true
        echo "    ✓ Collected Python coverage reports"
    fi

    # Coverage XML (for CI/CD)
    if [[ -f "coverage.xml" ]]; then
        cp coverage.xml "$ARTIFACTS_DIR/reports/"
    fi
}

# =============================================================================
# Architecture Diagrams
# =============================================================================

collect_architecture_diagrams() {
    echo "Collecting architecture diagrams..."

    # Generate architecture diagrams using the utility
    if command -v node &>/dev/null; then
        echo "  → Generating architecture diagrams from git diff..."

        # Get base commit (previous commit or main branch)
        base_commit=$(git rev-parse HEAD~1 2>/dev/null || git rev-parse main 2>/dev/null || echo "HEAD~1")

        # Run diagram generator
        if node utils/generate-architecture-diagram.js \
            --base "$base_commit" \
            --head HEAD \
            --ticket "$JIRA_KEY" 2>/dev/null; then

            # Copy diagrams to artifacts
            if [[ -d ".claude/diagrams" ]]; then
                mkdir -p "$ARTIFACTS_DIR/diagrams"
                cp .claude/diagrams/${JIRA_KEY}-*.mmd "$ARTIFACTS_DIR/diagrams/" 2>/dev/null || true

                diagram_count=$(ls -1 "$ARTIFACTS_DIR/diagrams"/*.mmd 2>/dev/null | wc -l | tr -d ' ')
                echo "    ✓ Generated and collected $diagram_count architecture diagrams"

                # List diagram types
                ls -1 "$ARTIFACTS_DIR/diagrams"/*.mmd 2>/dev/null | while read -r diagram; do
                    diagram_type=$(basename "$diagram" | sed "s/${JIRA_KEY}-//;s/.mmd//")
                    echo "       - $diagram_type diagram"
                done
            else
                echo "    ⚠️  Diagram generation succeeded but no output found"
            fi
        else
            echo "    ⚠️  Architecture diagram generation failed (non-fatal)"
        fi
    else
        echo "    ⚠️  Node.js not available, skipping diagram generation"
    fi

    # Also copy any manually created diagrams
    if [[ -d ".claude/diagrams" ]]; then
        find .claude/diagrams -name "*.mmd" -not -name "${JIRA_KEY}-*" -exec cp {} "$ARTIFACTS_DIR/diagrams/" \; 2>/dev/null || true
    fi
}

# =============================================================================
# Accuracy Report
# =============================================================================

collect_accuracy_report() {
    echo "Collecting accuracy report..."

    # Generate accuracy percentage
    if command -v node &>/dev/null; then
        echo "  → Calculating implementation accuracy..."

        if node utils/calculate-accuracy.js \
            --ticket "$JIRA_KEY" \
            --output "$ARTIFACTS_DIR/reports/accuracy-report.md" 2>/dev/null; then

            accuracy_pct=$(jq -r '.accuracyPercentage' "$ARTIFACTS_DIR/reports/accuracy-report.json" 2>/dev/null || echo "N/A")
            echo "    ✓ Accuracy calculated: ${accuracy_pct}%"

            # Copy JSON report
            if [[ -f ".claude/artifacts/${JIRA_KEY}/accuracy-report.json" ]]; then
                cp ".claude/artifacts/${JIRA_KEY}/accuracy-report.json" "$ARTIFACTS_DIR/reports/" 2>/dev/null || true
            fi
        else
            echo "    ⚠️  Accuracy calculation failed (non-fatal)"
        fi
    else
        echo "    ⚠️  Node.js not available, skipping accuracy calculation"
    fi
}

# =============================================================================
# Generate Artifact Manifest
# =============================================================================

generate_manifest() {
    echo "Generating artifact manifest..."

    # Count artifacts
    video_count=$(ls -1 "$ARTIFACTS_DIR/videos"/*.webm 2>/dev/null | wc -l | tr -d ' ')
    screenshot_count=$(ls -1 "$ARTIFACTS_DIR/screenshots"/*.png 2>/dev/null | wc -l | tr -d ' ')
    trace_count=$(ls -1 "$ARTIFACTS_DIR/traces"/*.zip 2>/dev/null | wc -l | tr -d ' ')
    diagram_count=$(ls -1 "$ARTIFACTS_DIR/diagrams"/*.mmd 2>/dev/null | wc -l | tr -d ' ')

    # Extract coverage if available
    if [[ -f "$ARTIFACTS_DIR/reports/coverage/coverage-summary.json" ]]; then
        overall_coverage=$(jq -r '.total.lines.pct' "$ARTIFACTS_DIR/reports/coverage/coverage-summary.json" 2>/dev/null || echo "N/A")
    elif [[ -f "$ARTIFACTS_DIR/reports/coverage-python/index.html" ]]; then
        overall_coverage=$(grep -oP 'total.*?\K\d+%' "$ARTIFACTS_DIR/reports/coverage-python/index.html" 2>/dev/null | head -1 || echo "N/A")
    else
        overall_coverage="N/A"
    fi

    # Extract E2E metrics if available
    if [[ -f "$ARTIFACTS_DIR/reports/e2e-metrics.json" ]]; then
        e2e_total=$(jq -r '.total' "$ARTIFACTS_DIR/reports/e2e-metrics.json" 2>/dev/null || echo "0")
        e2e_passed=$(jq -r '.passed' "$ARTIFACTS_DIR/reports/e2e-metrics.json" 2>/dev/null || echo "0")
        e2e_failed=$(jq -r '.failed' "$ARTIFACTS_DIR/reports/e2e-metrics.json" 2>/dev/null || echo "0")
        e2e_flaky=$(jq -r '.flaky' "$ARTIFACTS_DIR/reports/e2e-metrics.json" 2>/dev/null || echo "0")
        e2e_pass_rate=$(jq -r '.pass_rate' "$ARTIFACTS_DIR/reports/e2e-metrics.json" 2>/dev/null || echo "0")
    else
        e2e_total="N/A"
        e2e_passed="N/A"
        e2e_failed="N/A"
        e2e_flaky="N/A"
        e2e_pass_rate="N/A"
    fi

    # Extract integration metrics if available
    if [[ -f "$ARTIFACTS_DIR/reports/integration-metrics.json" ]]; then
        int_total=$(jq -r '.total' "$ARTIFACTS_DIR/reports/integration-metrics.json" 2>/dev/null || echo "0")
        int_passed=$(jq -r '.passed' "$ARTIFACTS_DIR/reports/integration-metrics.json" 2>/dev/null || echo "0")
        int_failed=$(jq -r '.failed' "$ARTIFACTS_DIR/reports/integration-metrics.json" 2>/dev/null || echo "0")
        int_pass_rate=$(jq -r '.pass_rate' "$ARTIFACTS_DIR/reports/integration-metrics.json" 2>/dev/null || echo "0")
    else
        int_total="N/A"
        int_passed="N/A"
        int_failed="N/A"
        int_pass_rate="N/A"
    fi

    # Extract accuracy if available
    if [[ -f "$ARTIFACTS_DIR/reports/accuracy-report.json" ]]; then
        accuracy_pct=$(jq -r '.accuracyPercentage' "$ARTIFACTS_DIR/reports/accuracy-report.json" 2>/dev/null || echo "N/A")
    else
        accuracy_pct="N/A"
    fi

    # Create manifest
    cat > "$ARTIFACTS_DIR/MANIFEST.md" <<EOF
# Test Artifacts for ${JIRA_KEY}

Generated: $(date '+%Y-%m-%d %H:%M:%S')

---

## 🎯 Implementation Accuracy

$(if [[ -f "$ARTIFACTS_DIR/reports/accuracy-report.json" ]]; then
    echo "**Accuracy**: ${accuracy_pct}%"
    echo ""
    jq -r '"- **Total Requirements**: \(.totalRequirements)\n- **Fulfilled**: \(.fulfilledRequirements)\n- **Partially Fulfilled**: \(.partiallyFulfilled)\n- **Unfulfilled**: \(.unfulfilled)"' "$ARTIFACTS_DIR/reports/accuracy-report.json" 2>/dev/null
    echo ""
    echo "📄 [View Detailed Report](reports/accuracy-report.md)"
else
    echo "- Accuracy report not available"
fi)

---

## 📐 Architecture Diagrams

$(if [[ $diagram_count -gt 0 ]]; then
    echo "**Generated**: $diagram_count diagrams"
    echo ""
    ls -1 "$ARTIFACTS_DIR/diagrams"/*.mmd 2>/dev/null | while read -r diagram; do
        diagram_name=$(basename "$diagram" .mmd)
        diagram_type=$(echo "$diagram_name" | sed "s/${JIRA_KEY}-//")
        echo "- [\`${diagram_type}\` diagram](diagrams/${diagram_name}.mmd)"
    done
else
    echo "- No architecture diagrams generated"
fi)

---

## 🧪 E2E Tests

$(if [[ "$e2e_total" != "N/A" ]]; then
    echo "**Test Results**: ${e2e_passed}/${e2e_total} passed (${e2e_pass_rate}%)"
    if [[ "$e2e_failed" != "0" ]]; then
        echo "- **Failed**: ${e2e_failed}"
    fi
    if [[ "$e2e_flaky" != "0" ]]; then
        echo "- **Flaky**: ${e2e_flaky} ⚠️"
    fi
    echo ""
else
    echo "**Status**: E2E tests not run or results unavailable"
    echo ""
fi)

- **Videos**: $video_count recordings
- **Screenshots (failures)**: $screenshot_count images
- **Trace files**: $trace_count traces
- **HTML Report**: [View E2E Report](reports/e2e/index.html)

### Video Files

$(ls -1 "$ARTIFACTS_DIR/videos"/*.webm 2>/dev/null | sed 's|.*/|- |' || echo "- No videos")

### Screenshot Files

$(ls -1 "$ARTIFACTS_DIR/screenshots"/*-failed-*.png 2>/dev/null | sed 's|.*/|- |' || echo "- No failure screenshots")

### Trace Files

$(ls -1 "$ARTIFACTS_DIR/traces"/*.zip 2>/dev/null | sed 's|.*/|- |' || echo "- No traces")

---

## UI Screenshots (Before/After)

$(ls -1 "$ARTIFACTS_DIR/screenshots"/ui-*.png 2>/dev/null | sed 's|.*/|- |' || echo "- No UI screenshots captured")

---

## 🔗 Integration Tests

$(if [[ "$int_total" != "N/A" ]]; then
    echo "**Test Results**: ${int_passed}/${int_total} passed (${int_pass_rate}%)"
    if [[ "$int_failed" != "0" ]]; then
        echo "- **Failed**: ${int_failed}"
    fi
    echo ""
else
    echo "**Status**: Integration tests not run or results unavailable"
    echo ""
fi)

- **HTML Report**: [View Integration Results](reports/integration/index.html)
- **JSON Results**: [integration-metrics.json](reports/integration-metrics.json)

---

## Coverage

- **Overall Coverage**: ${overall_coverage}
- **HTML Report**: [View Coverage Report](reports/coverage/index.html)

### Coverage by Module

$(if [[ -f "$ARTIFACTS_DIR/reports/coverage/coverage-summary.json" ]]; then
    jq -r 'to_entries | .[] | select(.key != "total") | "- **\(.key)**: \(.value.lines.pct)%"' \
        "$ARTIFACTS_DIR/reports/coverage/coverage-summary.json" 2>/dev/null || echo "- No module breakdown available"
else
    echo "- No module breakdown available"
fi)

---

## How to View Artifacts

### E2E Report
\`\`\`bash
open $ARTIFACTS_DIR/reports/e2e/index.html
\`\`\`

### Trace Viewer (for debugging)
\`\`\`bash
npx playwright show-trace $ARTIFACTS_DIR/traces/<trace-file>.zip
\`\`\`

### Coverage Report
\`\`\`bash
open $ARTIFACTS_DIR/reports/coverage/index.html
\`\`\`

---

## Artifact Locations

All artifacts saved to: \`$ARTIFACTS_DIR/\`

Directory structure:
\`\`\`
$ARTIFACTS_DIR/
├── videos/           # E2E test recordings
├── screenshots/      # Failure screenshots + UI screenshots
├── traces/           # Playwright trace files
├── reports/
│   ├── e2e/          # E2E HTML report
│   ├── integration/  # Integration test results
│   └── coverage/     # Coverage reports
└── MANIFEST.md       # This file
\`\`\`
EOF

    echo "    ✓ Created artifact manifest"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    if [[ "$TYPE" == "--frontend" ]] || [[ "$TYPE" == "--both" ]]; then
        collect_e2e_artifacts
        collect_ui_screenshots
    fi

    if [[ "$TYPE" == "--backend" ]] || [[ "$TYPE" == "--both" ]]; then
        collect_integration_test_results
    fi

    # Always collect coverage (applies to both)
    collect_coverage_reports

    # Collect architecture diagrams (always)
    collect_architecture_diagrams

    # Collect accuracy report (always)
    collect_accuracy_report

    # Generate manifest
    generate_manifest

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Test Artifact Collection Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Artifacts saved to: $ARTIFACTS_DIR"
    echo "Manifest: $ARTIFACTS_DIR/MANIFEST.md"
    echo ""
    echo "Summary:"
    echo "  - Videos: $video_count"
    echo "  - Screenshots: $screenshot_count"
    echo "  - Traces: $trace_count"
    echo "  - Coverage: $overall_coverage"
    echo ""
}

main
