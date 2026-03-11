#!/bin/bash
set -e

# ============================================================================
# PHASE 4: FILE WRITING
# ============================================================================
# Parses Opus output and writes CLAUDE.md + project-context with validation
# ============================================================================

PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Validate inputs
if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 4: File Writing"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

SYNTHESIS_OUTPUT="$TEMP_DIR/synthesis-raw.md"
CLAUDE_MD_TEMP="$TEMP_DIR/CLAUDE.md"
PROJECT_CONTEXT_TEMP="$TEMP_DIR/project-context.md"

# ============================================================================
# STEP 1: PARSE OPUS OUTPUT
# ============================================================================

echo "Step 1: Parsing Opus output..."

if [ ! -f "$SYNTHESIS_OUTPUT" ]; then
  echo "Error: Synthesis output not found: $SYNTHESIS_OUTPUT"
  exit 1
fi

node "$SKILL_DIR/scripts/helpers/parse-opus-output.js" \
  "$SYNTHESIS_OUTPUT" \
  "$CLAUDE_MD_TEMP" \
  "$PROJECT_CONTEXT_TEMP"

if [ ! -f "$CLAUDE_MD_TEMP" ] || [ ! -f "$PROJECT_CONTEXT_TEMP" ]; then
  echo "Error: Parsing failed - output files not created"
  exit 1
fi

echo "✓ Parsing complete"
echo ""

# ============================================================================
# STEP 2: VALIDATE CLAUDE.MD WITH SCHEMA
# ============================================================================

echo "Step 2: Validating CLAUDE.md..."

CLAUDE_MD_LINES=$(wc -l < "$CLAUDE_MD_TEMP")
echo "  Lines: $CLAUDE_MD_LINES"

# Use proper validator for schema validation
node "$SKILL_DIR/utils/validators/validate-synthesis.js" \
  "$CLAUDE_MD_TEMP" \
  "$SKILL_DIR/config/validation-rules.json" \
  "claude-md-only" > "$TEMP_DIR/claude-md-validation.log" 2>&1

CLAUDE_MD_VALID=$?

if [ $CLAUDE_MD_VALID -ne 0 ]; then
  echo "✗ CLAUDE.md validation failed"
  echo ""
  cat "$TEMP_DIR/claude-md-validation.log"
  exit 1
fi

echo "✓ CLAUDE.md validation passed"
echo ""

# ============================================================================
# STEP 3: VALIDATE PROJECT-CONTEXT WITH SCHEMA
# ============================================================================

echo "Step 3: Validating project-context..."

PROJECT_CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT_TEMP")
echo "  Lines: $PROJECT_CONTEXT_LINES"

# Use proper validator for schema validation
node "$SKILL_DIR/utils/validators/validate-synthesis.js" \
  "$PROJECT_CONTEXT_TEMP" \
  "$SKILL_DIR/config/validation-rules.json" \
  "project-context-only" > "$TEMP_DIR/project-context-validation.log" 2>&1

PROJECT_CONTEXT_VALID=$?

if [ $PROJECT_CONTEXT_VALID -ne 0 ]; then
  echo "✗ project-context validation failed"
  echo ""
  cat "$TEMP_DIR/project-context-validation.log"
  exit 1
fi

echo "✓ project-context validation passed"
echo ""

# ============================================================================
# STEP 4: WRITE CLAUDE.MD TO PROJECT
# ============================================================================

echo "Step 4: Writing CLAUDE.md to project..."

node "$SKILL_DIR/scripts/helpers/write-claude-md.js" \
  "$CLAUDE_MD_TEMP" \
  "$PROJECT_PATH"

WRITE_EXIT_CODE=$?
if [ $WRITE_EXIT_CODE -ne 0 ]; then
  echo "Error: Failed to write CLAUDE.md"
  exit 1
fi

echo "✓ CLAUDE.md written"
echo ""

# ============================================================================
# STEP 5: WRITE PROJECT-CONTEXT TO PROJECT
# ============================================================================

echo "Step 5: Writing project-context to project..."

node "$SKILL_DIR/scripts/helpers/write-project-context.js" \
  "$PROJECT_CONTEXT_TEMP" \
  "$PROJECT_PATH"

WRITE_EXIT_CODE=$?
if [ $WRITE_EXIT_CODE -ne 0 ]; then
  echo "Error: Failed to write project-context"
  exit 1
fi

echo "✓ project-context written"
echo ""

# ============================================================================
# STEP 6: VERIFY FILES WRITTEN
# ============================================================================

echo "Step 6: Verifying files..."

CLAUDE_MD_FINAL="$PROJECT_PATH/.claude/CLAUDE.md"
PROJECT_CONTEXT_FINAL="$PROJECT_PATH/.claude/skills/project-context/SKILL.md"

if [ ! -f "$CLAUDE_MD_FINAL" ]; then
  echo "Error: CLAUDE.md not found at: $CLAUDE_MD_FINAL"
  exit 1
fi

if [ ! -f "$PROJECT_CONTEXT_FINAL" ]; then
  echo "Error: project-context not found at: $PROJECT_CONTEXT_FINAL"
  exit 1
fi

echo "✓ Files verified"
echo "  CLAUDE.md:       $CLAUDE_MD_FINAL"
echo "  project-context: $PROJECT_CONTEXT_FINAL"
echo ""

echo "Phase 4 complete!"
exit 0
