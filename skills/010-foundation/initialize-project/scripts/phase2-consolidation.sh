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

  # Check if we should skip questions or ask them
  if [ "${SKIP_GAP_QUESTIONS:-false}" = "true" ]; then
    echo "ℹ SKIP_GAP_QUESTIONS=true - Continuing without user input"
    echo "  (Synthesis will proceed with available data)"
    echo ""
  else
    # Ask gap questions interactively
    echo "Launching interactive questionnaire..."
    echo ""

    if ! bash "$SKILL_DIR/scripts/helpers/ask-gap-questions.sh" "$CONSOLIDATION_FILE"; then
      echo ""
      echo "❌ Error during gap questionnaire"
      echo ""
      echo "You can:"
      echo "  1. Set SKIP_GAP_QUESTIONS=true to skip questions"
      echo "  2. Manually edit: $CONSOLIDATION_FILE"
      echo "  3. Try again"
      echo ""
      exit 1
    fi

    echo "✓ Gap clarifications complete"
    echo ""
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
