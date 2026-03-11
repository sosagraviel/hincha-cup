#!/bin/bash
set -e

# ============================================================================
# PHASE 2: CONSOLIDATION & GAP ANALYSIS
# ============================================================================
# Consolidates findings from 4 agents and identifies gaps
# If critical gaps found, asks user clarifying questions
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 2: Consolidation & GAP Analysis"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

# ============================================================================
# STEP 1: MERGE ANALYSES
# ============================================================================

echo "Step 1: Merging 4 agent outputs..."

CONSOLIDATION_FILE="$TEMP_DIR/consolidation.json"

node "$SKILL_DIR/scripts/helpers/merge-analyses.js" \
  "$CONSOLIDATION_FILE" \
  "$TEMP_DIR/phase1-outputs/01-structure-architecture.json" \
  "$TEMP_DIR/phase1-outputs/02-tech-stack-dependencies.json" \
  "$TEMP_DIR/phase1-outputs/03-code-patterns-testing.json" \
  "$TEMP_DIR/phase1-outputs/04-data-flows-integrations.json"

if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation failed"
  exit 1
fi

echo "✓ Consolidation complete"
echo ""

# ============================================================================
# STEP 2: GAP ANALYSIS
# ============================================================================

echo "Step 2: Analyzing gaps..."

# Parse consolidation to check for gaps
GAPS_COUNT=$(node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));
  console.log(data.gaps?.length || 0);
")

CONFLICTS_COUNT=$(node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));
  console.log(data.conflicts?.length || 0);
")

echo "  Gaps identified: $GAPS_COUNT"
echo "  Conflicts detected: $CONFLICTS_COUNT"
echo ""

# ============================================================================
# STEP 3: USER QUESTIONS (if needed)
# ============================================================================

NEEDS_USER_INPUT=0

if [ "$GAPS_COUNT" -gt 5 ]; then
  echo "⚠ Warning: High number of gaps detected ($GAPS_COUNT)"
  NEEDS_USER_INPUT=1
fi

if [ "$CONFLICTS_COUNT" -gt 0 ]; then
  echo "⚠ Warning: Conflicts detected ($CONFLICTS_COUNT)"
  NEEDS_USER_INPUT=1
fi

if [ "$NEEDS_USER_INPUT" -eq 1 ]; then
  echo ""
  echo "⚠ Gaps or conflicts detected in analysis"
  echo "  Gaps: $GAPS_COUNT"
  echo "  Conflicts: $CONFLICTS_COUNT"
  echo ""

  # Save gaps/conflicts summary for review
  GAPS_SUMMARY="$TEMP_DIR/gaps-summary.txt"
  cat > "$GAPS_SUMMARY" <<EOF
GAPS AND CONFLICTS DETECTED IN PHASE 2
========================================

Gaps: $GAPS_COUNT
Conflicts: $CONFLICTS_COUNT

Location: $CONSOLIDATION_FILE

Review the 'gaps' and 'conflicts' arrays in consolidation.json.

To address these gaps:
1. Review $CONSOLIDATION_FILE
2. Add a 'user_clarifications' key with answers
3. Re-run from Phase 3: bash phase3-synthesis.sh "$PROJECT_PATH" "$TEMP_DIR"
EOF

  echo "Gaps summary saved to: $GAPS_SUMMARY"
  echo ""

  # Check if we should pause for user input or continue
  if [ "${SKIP_GAP_QUESTIONS:-false}" = "true" ]; then
    echo "ℹ SKIP_GAP_QUESTIONS=true - Continuing without user input"
    echo "  (Synthesis will proceed with available data)"
    echo ""
  else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ACTION REQUIRED: Manual Review Needed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Gaps or conflicts were detected that may affect quality."
    echo ""
    echo "OPTIONS:"
    echo ""
    echo "1. CONTINUE WITHOUT REVIEW (Automated, Lower Quality)"
    echo "   Set SKIP_GAP_QUESTIONS=true and re-run:"
    echo "   SKIP_GAP_QUESTIONS=true bash orchestrate-initialization.sh \"$PROJECT_PATH\" ..."
    echo ""
    echo "2. PAUSE AND REVIEW (Manual, Higher Quality)"
    echo "   a) Review gaps in: $CONSOLIDATION_FILE"
    echo "   b) Add clarifications to 'user_clarifications' key"
    echo "   c) Resume from Phase 3:"
    echo "      bash phase3-synthesis.sh \"$PROJECT_PATH\" \"$TEMP_DIR\""
    echo ""
    echo "Phase 2 exiting - manual review required"
    echo ""
    exit 1
  fi
else
  echo "✓ No critical gaps requiring user input"
  echo ""
fi

# ============================================================================
# STEP 4: FINALIZE CONSOLIDATION
# ============================================================================

echo "Step 3: Finalizing consolidation..."

# Verify consolidation file is ready
if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file missing"
  exit 1
fi

# Check file size (should be substantial)
FILE_SIZE=$(wc -c < "$CONSOLIDATION_FILE")
if [ "$FILE_SIZE" -lt 1000 ]; then
  echo "Error: Consolidation file too small ($FILE_SIZE bytes)"
  exit 1
fi

echo "✓ Consolidation ready for synthesis"
echo "  File: $CONSOLIDATION_FILE"
echo "  Size: $FILE_SIZE bytes"
echo ""

echo "Phase 2 complete!"
exit 0
