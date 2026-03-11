#!/bin/bash
set -e

# ============================================================================
# PHASE 3: OPUS SYNTHESIS WITH RETRY
# ============================================================================
# Invokes Opus synthesizer with automatic retry on validation failures
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 3: Opus Synthesis with Retry"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

# Load consolidation
CONSOLIDATION_FILE="$TEMP_DIR/consolidation.json"
if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file not found: $CONSOLIDATION_FILE"
  exit 1
fi

CONSOLIDATION_CONTENT=$(cat "$CONSOLIDATION_FILE")
AGENT_FILE="$SKILL_DIR/agents/05-architect-synthesizer.md"
AGENT_CONTENT=$(cat "$AGENT_FILE")
VALIDATOR="$SKILL_DIR/utils/validators/validate-synthesis.js"
VALIDATION_CONFIG="$SKILL_DIR/config/validation-rules.json"

MAX_ATTEMPTS=5
attempt=1
SUCCESS=false

while [ $attempt -le $MAX_ATTEMPTS ]; do
  echo "═══════════════════════════════════════════════════════════"
  echo "Attempt $attempt of $MAX_ATTEMPTS"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  SYNTHESIS_OUTPUT="$TEMP_DIR/synthesis-raw-attempt$attempt.md"
  FEEDBACK=""

  # Add feedback from previous attempt
  if [ $attempt -gt 1 ]; then
    PREV_OUTPUT="$TEMP_DIR/synthesis-raw-attempt$((attempt-1)).md"
    PREV_VALIDATION="$TEMP_DIR/validation-attempt$((attempt-1)).log"

    if [ -f "$PREV_VALIDATION" ]; then
      echo "Including validation feedback from previous attempt..."
      FEEDBACK="

IMPORTANT: Your previous attempt failed validation with these errors:

$(cat "$PREV_VALIDATION")

Please fix these issues in this attempt."
    fi
  fi

  # Create prompt
  PROMPT="You are the architect synthesizer agent.

Analyze the project at: $PROJECT_PATH

Use the consolidated analysis below.

Follow ALL instructions in the agent file.$FEEDBACK

CONSOLIDATED ANALYSIS:
$CONSOLIDATION_CONTENT

=== AGENT INSTRUCTIONS ===
$AGENT_CONTENT"

  echo "Invoking Opus synthesizer..."

  # Run synthesizer with 10 min timeout
  if timeout 600s claude --model opus --dangerously-skip-permissions <<< "$PROMPT" > "$SYNTHESIS_OUTPUT" 2> "$TEMP_DIR/synthesis-error-attempt$attempt.log"; then

    # Validate output
    echo ""
    echo "Validating synthesis output..."

    VALIDATION_LOG="$TEMP_DIR/validation-attempt$attempt.log"

    if node "$VALIDATOR" "$SYNTHESIS_OUTPUT" "$VALIDATION_CONFIG" > "$VALIDATION_LOG" 2>&1; then
      echo "✓ Validation passed!"

      # Copy successful output to final location
      cp "$SYNTHESIS_OUTPUT" "$TEMP_DIR/synthesis-raw.md"
      SUCCESS=true
      break
    else
      echo "✗ Validation failed"
      echo ""
      cat "$VALIDATION_LOG"
      echo ""

      if [ $attempt -lt $MAX_ATTEMPTS ]; then
        echo "Will retry with validation feedback..."
        sleep 2
      fi
    fi
  else
    echo "✗ Synthesizer execution failed"
    cat "$TEMP_DIR/synthesis-error-attempt$attempt.log"

    if [ $attempt -lt $MAX_ATTEMPTS ]; then
      echo "Will retry..."
      sleep 2
    fi
  fi

  attempt=$((attempt + 1))
done

if [ "$SUCCESS" = true ]; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 3 Complete - Synthesis Successful                   ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Output: $TEMP_DIR/synthesis-raw.md"
  echo "  Attempts: $((attempt - 1))"
  echo ""
  exit 0
else
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 3 Failed - All Retry Attempts Exhausted             ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Max attempts: $MAX_ATTEMPTS"
  echo "  Last output: $SYNTHESIS_OUTPUT"
  echo "  Last validation: $TEMP_DIR/validation-attempt$((attempt-1)).log"
  echo ""
  exit 1
fi
