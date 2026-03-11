#!/bin/bash
set -e

# Phase 4: File Writing - Extract and write CLAUDE.md and project-context/SKILL.md
PROJECT_PATH="$1"
TEMP_DIR="$2"

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

# Extract using node
node -e "
const fs = require('fs');

function extractFiles(synthesisPath, tempDir) {
  const content = fs.readFileSync(synthesisPath, 'utf-8');

  // Find CLAUDE.md section (from "# CLAUDE.md Content" to "---\n# project-context")
  const claudeMatch = content.match(/# CLAUDE\.md Content\s*\n+([\s\S]*?)(?=\n+---\s*\n+# project-context)/);
  if (!claudeMatch) {
    throw new Error('Could not find CLAUDE.md Content section in synthesis');
  }

  // Find project-context section (everything from "# project-context" header to end)
  const contextMatch = content.match(/# project-context\/SKILL\.md Content\s*\n+([\s\S]*$)/);
  if (!contextMatch) {
    throw new Error('Could not find project-context/SKILL.md Content section in synthesis');
  }

  const claudeContent = claudeMatch[1].trim();
  const contextContent = contextMatch[1].trim();

  // Write to temp files
  fs.writeFileSync(\`\${tempDir}/CLAUDE.md\`, claudeContent, 'utf-8');
  fs.writeFileSync(\`\${tempDir}/project-context.md\`, contextContent, 'utf-8');

  console.log('✓ Extracted CLAUDE.md (' + claudeContent.split('\\n').length + ' lines)');
  console.log('✓ Extracted project-context.md (' + contextContent.split('\\n').length + ' lines)');
}

try {
  extractFiles('$SYNTHESIS_FILE', '$TEMP_DIR');
} catch (error) {
  console.error('Error extracting files:', error.message);
  process.exit(1);
}
"

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
