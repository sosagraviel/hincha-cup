#!/bin/bash
set -e

# Phase 4: File Writing - Pure bash, no Claude CLI
PROJECT_PATH="$1"
TEMP_DIR="$2"
CLAUDE_FILE="$3"
CONTEXT_FILE="$4"

echo "Phase 4: File Writing"
echo ""

# Create directories
mkdir -p "$PROJECT_PATH/.claude/skills/project-context"

# Write files (content passed as temp files from Claude)
cp "$CLAUDE_FILE" "$PROJECT_PATH/.claude/CLAUDE.md"
cp "$CONTEXT_FILE" "$PROJECT_PATH/.claude/skills/project-context/SKILL.md"

echo "✓ Files written to disk"
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

echo "✓ Both files exist"

# Validate lengths
CLAUDE_LINES=$(wc -l < "$PROJECT_PATH/.claude/CLAUDE.md" | tr -d ' ')
CONTEXT_LINES=$(wc -l < "$PROJECT_PATH/.claude/skills/project-context/SKILL.md" | tr -d ' ')

echo "✓ CLAUDE.md: $CLAUDE_LINES lines"
echo "✓ project-context: $CONTEXT_LINES lines"
echo ""

# Check ranges
if [ "$CLAUDE_LINES" -gt 200 ]; then
  echo "⚠ WARNING: CLAUDE.md exceeds 200 lines (should be 100-150)"
fi

if [ "$CONTEXT_LINES" -lt 250 ] || [ "$CONTEXT_LINES" -gt 400 ]; then
  echo "⚠ WARNING: project-context outside 250-400 range (actual: $CONTEXT_LINES)"
fi

echo "✅ Phase 4 validation complete"
echo ""

exit 0
