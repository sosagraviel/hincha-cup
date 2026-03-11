#!/bin/bash
set -e

# ============================================================================
# PHASE 3: OPUS SYNTHESIS
# ============================================================================
# Invokes Opus synthesizer agent to generate CLAUDE.md + project-context
# Includes retry with feedback for validation failures
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 3: Opus Synthesis"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

# Load consolidation
CONSOLIDATION_FILE="$TEMP_DIR/consolidation.json"
if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file not found: $CONSOLIDATION_FILE"
  exit 1
fi

SYNTHESIS_OUTPUT="$TEMP_DIR/synthesis-raw.md"

# ============================================================================
# STEP 1: INVOKE OPUS SYNTHESIZER
# ============================================================================

echo "Step 1: Invoking Opus synthesizer agent..."
echo ""

# Instructions for Claude Code to launch Opus synthesizer
cat <<'INSTRUCTIONS'
{
  "action": "launch_opus_synthesizer",
  "agent": "agents/05-architect-synthesizer.md",
  "model": "opus",
  "input": {
    "consolidation_file": "consolidation.json",
    "constraints": {
      "claude_md_max_lines": 200,
      "claude_md_target_lines": 120,
      "project_context_min_lines": 250,
      "project_context_max_lines": 400,
      "project_context_target_lines": 300
    },
    "output_format": "markdown_with_section_markers",
    "section_markers": {
      "claude_md": "<!-- SECTION: CLAUDE.MD -->",
      "project_context": "<!-- SECTION: PROJECT-CONTEXT -->"
    }
  },
  "output_file": "synthesis-raw.md",
  "validation": {
    "validator": "utils/validators/validate-synthesis.js",
    "config": "config/validation-rules.json",
    "retry": {
      "max_attempts": 3,
      "strategy": "exponential_backoff",
      "include_errors_in_retry": true
    }
  }
}
INSTRUCTIONS

echo ""
echo "Waiting for Opus synthesis..."
echo "(Claude Code should launch agent and handle retry logic)"
echo ""

# ============================================================================
# STEP 2: VALIDATE SYNTHESIS OUTPUT
# ============================================================================

# Note: Validation is handled by Claude Code using retry-with-feedback
# This script just checks the result

if [ ! -f "$SYNTHESIS_OUTPUT" ]; then
  echo "Error: Synthesis output not found: $SYNTHESIS_OUTPUT"
  exit 1
fi

# Check file size
FILE_SIZE=$(wc -c < "$SYNTHESIS_OUTPUT")
if [ "$FILE_SIZE" -lt 5000 ]; then
  echo "Error: Synthesis output too small ($FILE_SIZE bytes)"
  exit 1
fi

# Validate using validator
echo "Step 2: Validating synthesis output..."

node "$SKILL_DIR/utils/validators/validate-synthesis.js" \
  "$SYNTHESIS_OUTPUT" \
  "$SKILL_DIR/config/validation-rules.json"

VALIDATION_EXIT_CODE=$?

if [ $VALIDATION_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "Error: Synthesis validation failed"
  echo "  Output file: $SYNTHESIS_OUTPUT"
  echo "  Validator: validate-synthesis.js"
  echo ""
  echo "Claude Code should:"
  echo "  1. Apply auto-repair if possible"
  echo "  2. Retry synthesis with validation feedback"
  echo "  3. Max 3 retry attempts"
  exit 1
fi

echo "✓ Synthesis validation passed"
echo ""

# ============================================================================
# STEP 3: FINALIZE
# ============================================================================

echo "Phase 3 complete!"
echo "  Output: $SYNTHESIS_OUTPUT"
echo "  Size:   $FILE_SIZE bytes"
echo ""

exit 0
