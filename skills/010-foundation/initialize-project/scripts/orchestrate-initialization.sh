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
START_PHASE="${3:-1}"  # Default to phase 1, can override with --start-phase N

# Parse optional flags
shift 2 2>/dev/null || true  # Remove first 2 args
while [[ $# -gt 0 ]]; do
  case $1 in
    --start-phase)
      START_PHASE="$2"
      shift 2
      ;;
    --clean)
      CLEAN_TEMP="true"
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 <project-path> <framework-path> [--start-phase N] [--clean]"
      exit 1
      ;;
  esac
done

# Validate arguments
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}Error: Project path does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    exit 1
fi

# Validate start phase
if ! [[ "$START_PHASE" =~ ^[1-6]$ ]]; then
    echo -e "${RED}Error: Start phase must be between 1 and 6${NC}"
    exit 1
fi

# Create temp directory for intermediate outputs
TEMP_DIR="$PROJECT_PATH/.claude-temp"
mkdir -p "$TEMP_DIR"

# Log file (logging disabled to prevent stdin/signal issues)
LOG_FILE="$TEMP_DIR/initialization.log"

# Track if we're already cleaning up
CLEANUP_IN_PROGRESS=false

# Signal handler for CTRL+C - propagate to process group
cleanup() {
    if [ "$CLEANUP_IN_PROGRESS" = true ]; then
        return
    fi
    CLEANUP_IN_PROGRESS=true

    echo ""
    echo -e "${YELLOW}Initialization interrupted. Exiting...${NC}"

    # Kill entire process group to ensure all children terminate
    kill -TERM -$$ 2>/dev/null

    exit 130
}

# Trap SIGINT (CTRL+C) and SIGTERM
trap cleanup SIGINT SIGTERM

echo "========================================================================"
echo "  AI AGENTIC FRAMEWORK - PROJECT INITIALIZATION"
echo "========================================================================"
echo ""
echo "Project Path:   $PROJECT_PATH"
echo "Framework Path: $FRAMEWORK_PATH"
echo "Temp Directory: $TEMP_DIR"
echo "Log File:       $LOG_FILE"
echo "Start Phase:    $START_PHASE"
echo ""

if [ "$START_PHASE" -gt 1 ]; then
    echo -e "${YELLOW}Starting from Phase $START_PHASE (skipping phases 1-$((START_PHASE-1)))${NC}"
    echo ""
fi

# ============================================================================
# PRE-FLIGHT: ENSURE DEPENDENCIES ARE INSTALLED
# ============================================================================

echo -e "${BLUE}Checking framework dependencies...${NC}"

cd "$FRAMEWORK_PATH"

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: package.json not found in framework directory${NC}"
  exit 1
fi

# Check if node_modules exists and has required packages
NEEDS_INSTALL=false

if [ ! -d "node_modules" ]; then
  NEEDS_INSTALL=true
  echo "  node_modules not found"
elif ! node -e "require('ajv')" 2>/dev/null; then
  NEEDS_INSTALL=true
  echo "  ajv not found"
elif ! node -e "require('ajv-formats')" 2>/dev/null; then
  NEEDS_INSTALL=true
  echo "  ajv-formats not found"
elif ! node -e "require('handlebars')" 2>/dev/null; then
  NEEDS_INSTALL=true
  echo "  handlebars not found"
fi

if [ "$NEEDS_INSTALL" = true ]; then
  echo -e "${YELLOW}Installing framework dependencies...${NC}"
  npm install 2>&1 | grep -E "^(added|up to date)" || echo "  Dependencies installed"
  echo -e "${GREEN}✓ Dependencies installed${NC}"
else
  echo -e "${GREEN}✓ All dependencies present${NC}"
fi

# Return to project directory
cd "$PROJECT_PATH"

# ============================================================================
# PRE-FLIGHT: CHECK .gitignore
# ============================================================================
# Only check .gitignore if starting from Phase 1 (full initialization)
if [ "$START_PHASE" -le 1 ]; then
  bash "$SCRIPT_DIR/helpers/gitignore-manager.sh" "$PROJECT_PATH" "$FRAMEWORK_PATH"
fi

echo ""
echo "Starting deterministic 6-phase workflow..."
echo ""

# Track start time
START_TIME=$(date +%s)

# ============================================================================
# PHASE 1: PARALLEL ANALYSIS (4 AGENTS)
# ============================================================================
if [ "$START_PHASE" -le 1 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 1${NC}"
  echo ""
fi

# ============================================================================
# PHASE 2: CONSOLIDATION & GAP ANALYSIS
# ============================================================================
if [ "$START_PHASE" -le 2 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 2${NC}"
  echo ""
fi

# ============================================================================
# PHASE 3: OPUS SYNTHESIS
# ============================================================================
if [ "$START_PHASE" -le 3 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 3${NC}"
  echo ""
fi

# ============================================================================
# PHASE 4: FILE WRITING
# ============================================================================
if [ "$START_PHASE" -le 4 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 4${NC}"
  echo ""
fi

# ============================================================================
# PHASE 5: RESOURCE COPYING
# ============================================================================
if [ "$START_PHASE" -le 5 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 5${NC}"
  echo ""
fi

# ============================================================================
# PHASE 6: FINAL VALIDATION
# ============================================================================
if [ "$START_PHASE" -le 6 ]; then
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
else
  echo -e "${YELLOW}⊘ Skipping Phase 6${NC}"
  echo ""
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
if [ "$START_PHASE" -gt 1 ]; then
  echo "Phases:   $START_PHASE-6 (started from phase $START_PHASE)"
else
  echo "Phases:   1-6 (complete initialization)"
fi
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

# Keep temp directory by default (allows re-running from later phases)
# Only clean if --clean flag is explicitly passed
if [ "${CLEAN_TEMP:-false}" = "true" ]; then
    echo "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
else
    echo "Temporary files kept in: $TEMP_DIR"
    echo "(Use --clean flag to remove temporary files)"
fi

exit 0
