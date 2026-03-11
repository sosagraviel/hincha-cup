#!/bin/bash
set -e

# ============================================================================
# PHASE 4: FILE WRITING WITH RETRY
# ============================================================================
# Parses synthesis output and writes files with automatic retry on failures
# Up to 5 attempts with validation feedback
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 4: File Writing with Retry"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

SYNTHESIS_INPUT="$TEMP_DIR/synthesis-raw.md"
PARSER="$SKILL_DIR/scripts/helpers/parse-opus-output.js"
VALIDATOR="$SKILL_DIR/utils/validators/validate-synthesis.js"
VALIDATION_CONFIG="$SKILL_DIR/config/validation-rules.json"

if [ ! -f "$SYNTHESIS_INPUT" ]; then
  echo "Error: Synthesis output not found: $SYNTHESIS_INPUT"
  exit 1
fi

MAX_ATTEMPTS=5
attempt=1
SUCCESS=false

while [ $attempt -le $MAX_ATTEMPTS ]; do
  echo "═══════════════════════════════════════════════════════════"
  echo "Attempt $attempt of $MAX_ATTEMPTS"
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  CLAUDE_MD="$TEMP_DIR/CLAUDE-attempt${attempt}.md"
  PROJECT_CONTEXT="$TEMP_DIR/project-context-attempt${attempt}.md"

  # Parse synthesis output
  echo "Parsing synthesis output..."
  PARSE_LOG="$TEMP_DIR/parse-attempt${attempt}.log"

  if node "$PARSER" "$SYNTHESIS_INPUT" "$CLAUDE_MD" "$PROJECT_CONTEXT" > "$PARSE_LOG" 2>&1; then
    echo "✓ Parsing successful"
    echo ""

    # Validate CLAUDE.md
    echo "Validating CLAUDE.md..."
    CLAUDE_VALIDATION_LOG="$TEMP_DIR/claude-validation-attempt${attempt}.log"

    if node "$VALIDATOR" "$CLAUDE_MD" "$VALIDATION_CONFIG" "claude-md-only" > "$CLAUDE_VALIDATION_LOG" 2>&1; then
      CLAUDE_VALID=true
      CLAUDE_LINES=$(wc -l < "$CLAUDE_MD")
      echo "  ✓ CLAUDE.md valid ($CLAUDE_LINES lines)"
    else
      CLAUDE_VALID=false
      CLAUDE_LINES=$(wc -l < "$CLAUDE_MD")
      echo "  ✗ CLAUDE.md validation failed ($CLAUDE_LINES lines)"
      echo ""
      head -10 "$CLAUDE_VALIDATION_LOG"
      echo ""
    fi

    # Validate project-context
    echo "Validating project-context..."
    CONTEXT_VALIDATION_LOG="$TEMP_DIR/context-validation-attempt${attempt}.log"

    if node "$VALIDATOR" "$PROJECT_CONTEXT" "$VALIDATION_CONFIG" "project-context-only" > "$CONTEXT_VALIDATION_LOG" 2>&1; then
      CONTEXT_VALID=true
      CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT")
      echo "  ✓ project-context valid ($CONTEXT_LINES lines)"
    else
      CONTEXT_VALID=false
      CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT")
      echo "  ✗ project-context validation failed ($CONTEXT_LINES lines)"
      echo ""
      head -10 "$CONTEXT_VALIDATION_LOG"
      echo ""
    fi

    # Check if both valid
    if [ "$CLAUDE_VALID" = true ] && [ "$CONTEXT_VALID" = true ]; then
      echo ""
      echo "✓ All validations passed!"

      # Copy to final locations
      cp "$CLAUDE_MD" "$TEMP_DIR/CLAUDE.md"
      cp "$PROJECT_CONTEXT" "$TEMP_DIR/project-context.md"

      SUCCESS=true
      break
    else
      # Build feedback for synthesis retry
      if [ $attempt -lt $MAX_ATTEMPTS ]; then
        FEEDBACK_FILE="$TEMP_DIR/phase4-feedback-attempt${attempt}.txt"

        echo "VALIDATION FAILURES IN PHASE 4 (File Writing):" > "$FEEDBACK_FILE"
        echo "" >> "$FEEDBACK_FILE"

        if [ "$CLAUDE_VALID" != true ]; then
          echo "CLAUDE.md Issues:" >> "$FEEDBACK_FILE"
          cat "$CLAUDE_VALIDATION_LOG" >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        fi

        if [ "$CONTEXT_VALID" != true ]; then
          echo "project-context Issues:" >> "$FEEDBACK_FILE"
          cat "$CONTEXT_VALIDATION_LOG" >> "$FEEDBACK_FILE"
          echo "" >> "$FEEDBACK_FILE"
        fi

        echo "" >> "$FEEDBACK_FILE"
        echo "ACTION REQUIRED:" >> "$FEEDBACK_FILE"
        echo "Re-run Phase 3 (synthesis) with this feedback to generate corrected output." >> "$FEEDBACK_FILE"

        echo "✗ Validation failed, feedback saved to: $FEEDBACK_FILE"
        echo ""
        echo "Note: This requires re-running synthesis (Phase 3)"
        echo "      Phase 4 retry cannot fix synthesis output issues"
        echo ""
      fi
    fi
  else
    # Parsing failed
    echo "✗ Parsing failed"
    echo ""
    cat "$PARSE_LOG"
    echo ""

    if [ $attempt -lt $MAX_ATTEMPTS ]; then
      FEEDBACK_FILE="$TEMP_DIR/phase4-feedback-attempt${attempt}.txt"

      echo "PARSING FAILURE IN PHASE 4 (File Writing):" > "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
      cat "$PARSE_LOG" >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"
      echo "ACTION REQUIRED:" >> "$FEEDBACK_FILE"
      echo "Ensure synthesis output has correct section markers:" >> "$FEEDBACK_FILE"
      echo "  - # CLAUDE.md Content" >> "$FEEDBACK_FILE"
      echo "  - # project-context/SKILL.md Content" >> "$FEEDBACK_FILE"
      echo "" >> "$FEEDBACK_FILE"

      echo "✗ Parsing failed, feedback saved to: $FEEDBACK_FILE"
      echo ""
      echo "Note: This requires re-running synthesis (Phase 3)"
      echo ""
    fi
  fi

  if [ $attempt -lt $MAX_ATTEMPTS ]; then
    echo "Will retry Phase 4 with existing synthesis output..."
    sleep $((attempt * 2))
  fi

  attempt=$((attempt + 1))
done

if [ "$SUCCESS" = true ]; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 4 Complete - Files Written Successfully             ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  CLAUDE.md:       $TEMP_DIR/CLAUDE.md ($CLAUDE_LINES lines)"
  echo "  project-context: $TEMP_DIR/project-context.md ($CONTEXT_LINES lines)"
  echo "  Attempts:        $((attempt - 1))"
  echo ""
  exit 0
else
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║ Phase 4 Failed - All Retry Attempts Exhausted             ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Max attempts: $MAX_ATTEMPTS"
  echo "  Last CLAUDE.md: $CLAUDE_MD"
  echo "  Last project-context: $PROJECT_CONTEXT"
  echo ""
  echo "RECOMMENDATION:"
  echo "  If validation failed, re-run Phase 3 (synthesis) with the"
  echo "  feedback from: $TEMP_DIR/phase4-feedback-attempt*.txt"
  echo ""
  exit 1
fi
