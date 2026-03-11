#!/bin/bash
set -e

# ============================================================================
# PHASE 6: FINAL VALIDATION
# ============================================================================
# Validates all outputs and displays final summary with metrics
# ============================================================================

PROJECT_PATH="$1"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Validate inputs
if [ -z "$PROJECT_PATH" ]; then
  echo "Error: PROJECT_PATH is required"
  exit 1
fi

echo "Phase 6: Final Validation"
echo "  Project: $PROJECT_PATH"
echo ""

# Track validation results
ERRORS=0
WARNINGS=0

# ============================================================================
# STEP 1: VALIDATE CLAUDE.MD
# ============================================================================

echo "Step 1: Validating CLAUDE.md..."

CLAUDE_MD="$PROJECT_PATH/.claude/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  echo -e "${RED}✗ CLAUDE.md not found${NC}"
  ERRORS=$((ERRORS + 1))
else
  CLAUDE_MD_LINES=$(wc -l < "$CLAUDE_MD")
  CLAUDE_MD_SIZE=$(wc -c < "$CLAUDE_MD")

  echo "  File: $CLAUDE_MD"
  echo "  Lines: $CLAUDE_MD_LINES"
  echo "  Size: $CLAUDE_MD_SIZE bytes"

  if [ "$CLAUDE_MD_LINES" -gt 200 ]; then
    echo -e "  ${RED}✗ Exceeds 200 lines${NC}"
    ERRORS=$((ERRORS + 1))
  elif [ "$CLAUDE_MD_LINES" -gt 150 ]; then
    echo -e "  ${YELLOW}⚠ Over 150 lines (target: 100-150)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ Line count OK${NC}"
  fi

  # Check frontmatter
  if ! head -1 "$CLAUDE_MD" | grep -q "^---$"; then
    echo -e "  ${RED}✗ Missing frontmatter${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}✓ Frontmatter present${NC}"
  fi
fi

echo ""

# ============================================================================
# STEP 2: VALIDATE PROJECT-CONTEXT
# ============================================================================

echo "Step 2: Validating project-context..."

PROJECT_CONTEXT="$PROJECT_PATH/.claude/skills/project-context/SKILL.md"

if [ ! -f "$PROJECT_CONTEXT" ]; then
  echo -e "${RED}✗ project-context not found${NC}"
  ERRORS=$((ERRORS + 1))
else
  PROJECT_CONTEXT_LINES=$(wc -l < "$PROJECT_CONTEXT")
  PROJECT_CONTEXT_SIZE=$(wc -c < "$PROJECT_CONTEXT")

  echo "  File: $PROJECT_CONTEXT"
  echo "  Lines: $PROJECT_CONTEXT_LINES"
  echo "  Size: $PROJECT_CONTEXT_SIZE bytes"

  if [ "$PROJECT_CONTEXT_LINES" -lt 250 ]; then
    echo -e "  ${RED}✗ Below 250 lines minimum${NC}"
    ERRORS=$((ERRORS + 1))
  elif [ "$PROJECT_CONTEXT_LINES" -gt 400 ]; then
    echo -e "  ${RED}✗ Exceeds 400 lines maximum${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}✓ Line count OK (250-400)${NC}"
  fi

  # Check frontmatter
  if ! head -1 "$PROJECT_CONTEXT" | grep -q "^---$"; then
    echo -e "  ${RED}✗ Missing frontmatter${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}✓ Frontmatter present${NC}"
  fi
fi

echo ""

# ============================================================================
# STEP 3: VALIDATE SKILLS
# ============================================================================

echo "Step 3: Validating skills..."

SKILLS_DIR="$PROJECT_PATH/.claude/skills"
SKILLS_COUNT=0

if [ -d "$SKILLS_DIR" ]; then
  SKILLS_COUNT=$(find "$SKILLS_DIR" -name "SKILL.md" | wc -l)
  echo "  Skills directory: $SKILLS_DIR"
  echo "  Skills found: $SKILLS_COUNT"

  if [ "$SKILLS_COUNT" -lt 10 ]; then
    echo -e "  ${YELLOW}⚠ Fewer than 10 skills (recommended: 10-20)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ Skills count OK${NC}"
  fi
else
  echo -e "${RED}✗ Skills directory not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 4: VALIDATE AGENTS
# ============================================================================

echo "Step 4: Validating agents..."

AGENTS_DIR="$PROJECT_PATH/.claude/agents"
AGENTS_COUNT=0

if [ -d "$AGENTS_DIR" ]; then
  AGENTS_COUNT=$(find "$AGENTS_DIR" -name "*.md" | wc -l)
  echo "  Agents directory: $AGENTS_DIR"
  echo "  Agents found: $AGENTS_COUNT"

  if [ "$AGENTS_COUNT" -lt 3 ]; then
    echo -e "  ${RED}✗ Fewer than 3 agents (minimum required)${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}✓ Agents count OK${NC}"
  fi

  # List agents
  echo "  Agents:"
  find "$AGENTS_DIR" -name "*.md" -exec basename {} \; | while read agent; do
    echo "    - $agent"
  done
else
  echo -e "${RED}✗ Agents directory not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ============================================================================
# STEP 5: VALIDATE COMMANDS
# ============================================================================

echo "Step 5: Validating commands..."

COMMANDS_DIR="$PROJECT_PATH/.claude/commands"
COMMANDS_COUNT=0

if [ -d "$COMMANDS_DIR" ]; then
  COMMANDS_COUNT=$(find "$COMMANDS_DIR" -name "*.md" 2>/dev/null | wc -l)
  echo "  Commands directory: $COMMANDS_DIR"
  echo "  Commands found: $COMMANDS_COUNT"

  if [ "$COMMANDS_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ No commands found${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ Commands present${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠ Commands directory not found${NC}"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""

# ============================================================================
# STEP 6: DISPLAY SUMMARY
# ============================================================================

echo "========================================================================="
echo "  VALIDATION SUMMARY"
echo "========================================================================="
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✓ All validations passed!${NC}"
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "${YELLOW}⚠ Validation passed with $WARNINGS warning(s)${NC}"
else
  echo -e "${RED}✗ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
fi

echo ""
echo "Outputs:"
echo "  CLAUDE.md:       ${CLAUDE_MD_LINES:-0} lines"
echo "  project-context: ${PROJECT_CONTEXT_LINES:-0} lines"
echo "  Skills:          $SKILLS_COUNT"
echo "  Agents:          $AGENTS_COUNT"
echo "  Commands:        $COMMANDS_COUNT"
echo ""

# ============================================================================
# STEP 7: LOG METRICS
# ============================================================================

# Create metrics log
METRICS_FILE="$PROJECT_PATH/.claude-temp/metrics.json"

cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "project_path": "$PROJECT_PATH",
  "validation": {
    "errors": $ERRORS,
    "warnings": $WARNINGS,
    "success": $([ "$ERRORS" -eq 0 ] && echo "true" || echo "false")
  },
  "outputs": {
    "claude_md_lines": ${CLAUDE_MD_LINES:-0},
    "project_context_lines": ${PROJECT_CONTEXT_LINES:-0},
    "skills_count": $SKILLS_COUNT,
    "agents_count": $AGENTS_COUNT,
    "commands_count": $COMMANDS_COUNT
  }
}
EOF

echo "Metrics saved to: $METRICS_FILE"
echo ""

# ============================================================================
# EXIT
# ============================================================================

if [ "$ERRORS" -gt 0 ]; then
  echo "Phase 6 failed with errors"
  exit 1
fi

echo "Phase 6 complete!"
exit 0
