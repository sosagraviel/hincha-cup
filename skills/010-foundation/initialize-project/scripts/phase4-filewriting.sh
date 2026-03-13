#!/bin/bash
set -e

# Phase 4: File Writing - Extract and write CLAUDE.md and project-context/SKILL.md
PROJECT_PATH="$1"
TEMP_DIR="$2"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$PROJECT_PATH" ] || [ -z "$TEMP_DIR" ]; then
  echo "Error: PROJECT_PATH and TEMP_DIR are required"
  exit 1
fi

echo "Phase 4: File Writing"
echo "  Project: $PROJECT_PATH"
echo "  Temp:    $TEMP_DIR"
echo ""

# ============================================================================
# STEP 1: EXTRACT FILES FROM SYNTHESIS
# ============================================================================

SYNTHESIS_FILE="$TEMP_DIR/synthesis-raw.md"

if [ ! -f "$SYNTHESIS_FILE" ]; then
  echo "Error: Synthesis file not found: $SYNTHESIS_FILE"
  exit 1
fi

echo "Step 1: Extracting files from synthesis..."

# Extract using standalone script
node "$SKILL_DIR/scripts/helpers/extract-synthesis.js" "$SYNTHESIS_FILE" "$TEMP_DIR"

if [ $? -ne 0 ]; then
  echo "Error: File extraction failed"
  exit 1
fi

echo ""

# ============================================================================
# STEP 2: WRITE TO PROJECT
# ============================================================================

echo "Step 2: Writing files to project..."

# Create directories
mkdir -p "$PROJECT_PATH/.claude/skills/project-context"

# Copy files
cp "$TEMP_DIR/CLAUDE.md" "$PROJECT_PATH/.claude/CLAUDE.md"
cp "$TEMP_DIR/project-context.md" "$PROJECT_PATH/.claude/skills/project-context/SKILL.md"

echo "✓ Files written to disk"
echo ""

# ============================================================================
# STEP 3: STACK DETECTION
# ============================================================================

echo "Step 3: Detecting stack..."

FRAMEWORK_PATH="$(cd "$SKILL_DIR/../../.." && pwd)"

node "$FRAMEWORK_PATH/utils/stack-detection.js" "$PROJECT_PATH" > "$TEMP_DIR/stack-profile.json"

if [ ! -f "$TEMP_DIR/stack-profile.json" ]; then
  echo "Error: Stack detection failed"
  exit 1
fi

echo "✓ Stack detected"
echo ""

# ============================================================================
# STEP 4: GENERATE FRAMEWORK CONFIGURATION
# ============================================================================

echo "Step 4: Generating framework configuration..."

node "$SKILL_DIR/scripts/helpers/generate-config.js" "$TEMP_DIR" "$PROJECT_PATH" "$FRAMEWORK_PATH"

if [ $? -ne 0 ]; then
  echo "Error: Framework configuration generation failed"
  exit 1
fi

echo "✓ Framework configuration generated"
echo ""

# ============================================================================
# VALIDATION
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PHASE 4 VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check files exist
if [ ! -f "$PROJECT_PATH/.claude/CLAUDE.md" ]; then
  echo "❌ ERROR: CLAUDE.md not created"
  exit 1
fi

if [ ! -f "$PROJECT_PATH/.claude/skills/project-context/SKILL.md" ]; then
  echo "❌ ERROR: project-context/SKILL.md not created"
  exit 1
fi

if [ ! -f "$PROJECT_PATH/.claude/framework-config.json" ]; then
  echo "❌ ERROR: framework-config.json not created"
  exit 1
fi

echo "✓ All files exist"

# Validate lengths
CLAUDE_LINES=$(wc -l < "$PROJECT_PATH/.claude/CLAUDE.md" | tr -d ' ')
CONTEXT_LINES=$(wc -l < "$PROJECT_PATH/.claude/skills/project-context/SKILL.md" | tr -d ' ')

echo "✓ CLAUDE.md: $CLAUDE_LINES lines"
echo "✓ project-context: $CONTEXT_LINES lines"
echo ""

# Check ranges
if [ "$CLAUDE_LINES" -lt 30 ] || [ "$CLAUDE_LINES" -gt 250 ]; then
  echo "⚠ WARNING: CLAUDE.md outside 30-250 line range (actual: $CLAUDE_LINES)"
fi

if [ "$CONTEXT_LINES" -lt 50 ] || [ "$CONTEXT_LINES" -gt 600 ]; then
  echo "⚠ WARNING: project-context outside 50-600 line range (actual: $CONTEXT_LINES)"
fi

echo "✅ Phase 4 validation complete"
echo ""

exit 0
