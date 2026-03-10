#!/bin/bash

###############################################################################
# Run All Integration Tests
#
# Runs all integration tests for the ai-agentic-framework utilities.
#
# Usage:
#   ./tests/run-all-tests.sh
#
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed
###############################################################################

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  AI Agentic Framework - Integration Test Suite            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Project Root: $PROJECT_ROOT"
echo ""

# Track overall results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_TEST_NAMES=()

# Test files
TESTS=(
  "integration/doc-change-detector.test.js"
  "integration/pr-description-generator.test.js"
  "integration/review-loop-orchestrator.test.js"
  "integration/agent-generation.test.js"
)

# Run each test
for test_file in "${TESTS[@]}"; do
  test_path="$SCRIPT_DIR/$test_file"
  test_name=$(basename "$test_file" .test.js)

  echo "════════════════════════════════════════════════════════════"
  echo "Running: $test_name"
  echo "════════════════════════════════════════════════════════════"
  echo ""

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if node "$test_path"; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo ""
    echo "✅ $test_name PASSED"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    FAILED_TEST_NAMES+=("$test_name")
    echo ""
    echo "❌ $test_name FAILED"
  fi

  echo ""
done

# Print final summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Final Test Summary                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Total Test Suites:  $TOTAL_TESTS"
echo "Passed:             $PASSED_TESTS ✅"
echo "Failed:             $FAILED_TESTS ❌"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
  echo "Failed Test Suites:"
  for failed_test in "${FAILED_TEST_NAMES[@]}"; do
    echo "  - $failed_test"
  done
  echo ""
  echo "❌ Some tests failed"
  exit 1
else
  echo "✅ All tests passed!"
  exit 0
fi
