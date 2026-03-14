#!/usr/bin/env bash
# Generate detailed coverage gap report

JIRA_KEY="$1"
REPORT_DIR=".claude/coverage-gaps"
REPORT_FILE="${REPORT_DIR}/${JIRA_KEY}-gaps.md"

mkdir -p "$REPORT_DIR"

cat > "$REPORT_FILE" << EOF
# Coverage Gap Report: $JIRA_KEY

Generated: $(date)

## Summary

Current coverage fell below thresholds after 3 attempts to generate tests.

EOF

# Parse lcov.info for uncovered lines
if [[ -f "coverage/lcov.info" ]]; then
    echo "## Unit Test Coverage Gaps" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Extract uncovered line ranges from lcov.info
    # DA:line,hit_count format - DA:45,0 means line 45 was not hit
    awk -F: '/^SF:/ {file=$2} /^DA:/ && $3==",0" {print file":"$2}' coverage/lcov.info | \
    head -50 | \
    while IFS=: read -r file lineno; do
        if [[ -n "$file" && -n "$lineno" ]]; then
            echo "- \`$file:$lineno\`" >> "$REPORT_FILE"
        fi
    done
fi

echo "" >> "$REPORT_FILE"
echo "## Recommendations" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. Add unit tests for uncovered functions" >> "$REPORT_FILE"
echo "2. Test error handling paths (try-catch blocks)" >> "$REPORT_FILE"
echo "3. Test edge cases and boundary conditions" >> "$REPORT_FILE"
echo "4. Test conditional branches (if/else, switch)" >> "$REPORT_FILE"
echo "5. Mock external dependencies for isolated testing" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. Review the uncovered lines above" >> "$REPORT_FILE"
echo "2. Write targeted tests for specific gaps" >> "$REPORT_FILE"
echo "3. Resume implementation: \`/implement-ticket $JIRA_KEY --resume\`" >> "$REPORT_FILE"

echo "Coverage gap report generated: $REPORT_FILE"
cat "$REPORT_FILE"
