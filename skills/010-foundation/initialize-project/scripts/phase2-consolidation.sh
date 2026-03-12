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
# STEP 3: QUESTION CONSOLIDATION (NEW)
# ============================================================================

# Only run consolidation if we have gaps
if [ "$GAPS_COUNT" -gt 1 ]; then
  echo "Step 3: Consolidating similar questions..."
  echo "  Running AI-powered question consolidation agent..."
  echo ""

  CONSOLIDATION_AGENT="$SKILL_DIR/agents/06-question-consolidator.md"
  CONSOLIDATION_OUTPUT="$TEMP_DIR/question-consolidation.json"
  VALIDATOR="$SKILL_DIR/utils/validators/validate-agent-output.js"
  SCHEMA_DIR="$SKILL_DIR/config/schemas"

  MAX_ATTEMPTS=3
  attempt=1
  SUCCESS=false

  # Extract agent content (skip YAML frontmatter)
  AGENT_CONTENT=$(sed -n '/^---$/,/^---$/!p' "$CONSOLIDATION_AGENT" | tail -n +2)

  while [ $attempt -le $MAX_ATTEMPTS ] && [ "$SUCCESS" = false ]; do
    echo "  Consolidation attempt $attempt of $MAX_ATTEMPTS..."

    # Get current gaps from consolidation file
    GAPS_JSON=$(node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));
      console.log(JSON.stringify(data.gaps || [], null, 2));
    ")

    # Build prompt
    PROMPT="You are the question-consolidator agent.

CRITICAL: Follow ALL instructions in the agent file below.
Output ONLY valid JSON starting with { and ending with }
Do NOT wrap in markdown code blocks or add ANY text before/after the JSON

=== INPUT DATA ===
Current gaps that need consolidation:
$GAPS_JSON

=== AGENT INSTRUCTIONS ===
$AGENT_CONTENT"

    # Add validation feedback if this is a retry
    if [ $attempt -gt 1 ] && [ -f "$TEMP_DIR/consolidation-validation-error.log" ]; then
      VALIDATION_ERROR=$(cat "$TEMP_DIR/consolidation-validation-error.log")
      PROMPT="$PROMPT

CRITICAL: Your previous attempt failed validation with these errors:
$VALIDATION_ERROR

Please fix these issues and provide valid JSON output."
    fi

    # Run agent with timeout
    if timeout --foreground 120s claude --model haiku --dangerously-skip-permissions > "$CONSOLIDATION_OUTPUT" 2> "$TEMP_DIR/consolidation-error.log" <<< "$PROMPT"; then

      # Validate output
      if node "$VALIDATOR" "$CONSOLIDATION_OUTPUT" "question-consolidation" "$SCHEMA_DIR" > "$TEMP_DIR/consolidation-validation.log" 2>&1; then
        echo "  ✓ Consolidation successful and validated"
        SUCCESS=true

        # Integrate consolidated gaps back into consolidation.json
        node -e "
          const fs = require('fs');
          const consolidation = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));
          const consolidatedOutput = JSON.parse(fs.readFileSync('$CONSOLIDATION_OUTPUT', 'utf-8'));

          // Replace gaps with consolidated version
          consolidation.gaps = consolidatedOutput.consolidated_gaps;

          // Add consolidation metadata
          consolidation.question_consolidation = consolidatedOutput.consolidation_metadata;

          // Save
          fs.writeFileSync('$CONSOLIDATION_FILE', JSON.stringify(consolidation, null, 2));
          console.log('  ✓ Consolidated gaps integrated into consolidation.json');
        "

      else
        # Validation failed
        cat "$TEMP_DIR/consolidation-validation.log" > "$TEMP_DIR/consolidation-validation-error.log"
        echo "  ✗ Consolidation output failed validation (attempt $attempt)"
        if [ $attempt -lt $MAX_ATTEMPTS ]; then
          echo "  Retrying with validation feedback..."
        fi
      fi
    else
      echo "  ✗ Consolidation agent execution failed (attempt $attempt)"
      if [ -f "$TEMP_DIR/consolidation-error.log" ]; then
        cat "$TEMP_DIR/consolidation-error.log" | head -20
      fi
    fi

    attempt=$((attempt + 1))
  done

  if [ "$SUCCESS" = false ]; then
    echo ""
    echo "  ⚠ WARNING: Question consolidation failed after $MAX_ATTEMPTS attempts"
    echo "  Proceeding with original unconsolidated gaps"
    echo ""
  else
    # Update gaps count after consolidation
    CONSOLIDATED_GAPS_COUNT=$(node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));
      console.log(data.gaps?.length || 0);
    ")
    echo "  Questions after consolidation: $CONSOLIDATED_GAPS_COUNT (was $GAPS_COUNT)"
    GAPS_COUNT=$CONSOLIDATED_GAPS_COUNT
  fi

  echo ""
elif [ "$GAPS_COUNT" -eq 1 ]; then
  echo "Step 3: Only 1 gap found - skipping consolidation"
  echo ""
else
  echo "Step 3: No gaps found - skipping consolidation"
  echo ""
fi

# ============================================================================
# STEP 4: USER QUESTIONS (if needed)
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

    # Call Node directly
    if ! node "$SKILL_DIR/scripts/helpers/ask-gap-questions.js" "$CONSOLIDATION_FILE"; then
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
# STEP 5: FINALIZE CONSOLIDATION
# ============================================================================

echo "Step 4: Finalizing consolidation..."

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
