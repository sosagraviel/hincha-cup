#!/bin/bash
set -e  # Exit on error
set -o pipefail  # Exit on pipe failure

# ============================================================================
# ORCHESTRATE INITIALIZATION
# ============================================================================
# Main entry point for the deterministic initialization workflow
# Calls all 6 phase scripts sequentially with validation gates between each
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Arguments
PROJECT_PATH="${1:-$(pwd)}"
FRAMEWORK_PATH="${2:-/Users/ignaciobarreto/itIsHere/projects/ai-agentic-framework}"

# Validate arguments
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}Error: Project path does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    exit 1
fi

# Create temp directory for intermediate outputs
TEMP_DIR="$PROJECT_PATH/.claude-temp"
mkdir -p "$TEMP_DIR"

# Log file
LOG_FILE="$TEMP_DIR/initialization.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

echo "========================================================================"
echo "  AI AGENTIC FRAMEWORK - PROJECT INITIALIZATION"
echo "========================================================================"
echo ""
echo "Project Path:   $PROJECT_PATH"
echo "Framework Path: $FRAMEWORK_PATH"
echo "Temp Directory: $TEMP_DIR"
echo "Log File:       $LOG_FILE"
echo ""
echo "Starting deterministic 6-phase workflow..."
echo ""

# Track start time
START_TIME=$(date +%s)

# ============================================================================
# PHASE 1: PARALLEL ANALYSIS (4 AGENTS)
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 1: PARALLEL ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase1-analysis.sh" "$PROJECT_PATH" "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Phase 1 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 1 failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 2: CONSOLIDATION & GAP ANALYSIS
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 2: CONSOLIDATION & GAP ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase2-consolidation.sh" "$PROJECT_PATH" "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Phase 2 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 2 failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 3: OPUS SYNTHESIS
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 3: OPUS SYNTHESIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase3-synthesis.sh" "$PROJECT_PATH" "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Phase 3 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 3 failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 4: FILE WRITING
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 4: FILE WRITING${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase4-filewriting.sh" "$PROJECT_PATH" "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Phase 4 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 4 failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 5: RESOURCE COPYING
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 5: RESOURCE COPYING${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase5-resources.sh" "$PROJECT_PATH" "$FRAMEWORK_PATH"; then
    echo -e "${GREEN}✓ Phase 5 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 5 failed${NC}"
    exit 1
fi

# ============================================================================
# PHASE 6: FINAL VALIDATION
# ============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 6: FINAL VALIDATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if bash "$SCRIPT_DIR/phase6-validation.sh" "$PROJECT_PATH" "$TEMP_DIR"; then
    echo -e "${GREEN}✓ Phase 6 complete${NC}"
    echo ""
else
    echo -e "${RED}✗ Phase 6 failed${NC}"
    exit 1
fi

# ============================================================================
# COMPLETION
# ============================================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "========================================================================"
echo -e "${GREEN}  INITIALIZATION COMPLETE ✓${NC}"
echo "========================================================================"
echo ""
echo "Duration: ${DURATION}s"
echo "Project:  $PROJECT_PATH"
echo ""
echo "Generated files:"
echo "  - .claude/CLAUDE.md"
echo "  - .claude/skills/project-context/SKILL.md"
echo "  - .claude/skills/* (language-specific)"
echo "  - .claude/agents/* (generated agents)"
echo "  - .claude/commands/*"
echo ""
echo "Next steps:"
echo "  1. Load project context: /project-context"
echo "  2. Start a task: /start-task"
echo "  3. Review CLAUDE.md for quick reference"
echo ""

# Clean up temp directory (optional)
if [ "${KEEP_TEMP:-false}" != "true" ]; then
    echo "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
fi

exit 0
