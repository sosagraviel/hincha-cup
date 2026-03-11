#!/bin/bash
# ============================================================================
# STANDALONE INITIALIZE PROJECT SCRIPT
# ============================================================================
# Entry point for the AI Agentic Framework project initialization
# Can run WITHOUT an active Claude CLI session (standalone mode)
# Spawns agents directly using: claude --model X --dangerously-skip-permissions
# ============================================================================

set -e  # Exit on error
set -o pipefail  # Exit on pipe failure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# HELP MESSAGE
# ============================================================================

show_help() {
    cat << EOF
${CYAN}AI Agentic Framework - Project Initialization${NC}

${BLUE}USAGE:${NC}
    $0 [OPTIONS] [project-path]

${BLUE}ARGUMENTS:${NC}
    project-path          Path to the project to initialize
                         Default: current directory (pwd)

${BLUE}OPTIONS:${NC}
    --framework-path PATH Path to ai-agentic-framework directory
                         Default: <project-path>/ai-agentic-framework

    --skip-gap-questions  Skip gap analysis questions (fully automated mode)
                         Default: false (pauses if gaps detected)

    --timeout SECONDS    Maximum execution time in seconds
                         Default: 1800 (30 minutes)

    --keep-temp          Keep temporary files after completion
                         Default: false (cleans up .claude-temp)

    --help, -h           Show this help message

${BLUE}EXAMPLES:${NC}
    # Basic usage (current directory, framework in ./ai-agentic-framework)
    $0

    # Or specify project path explicitly
    $0 /path/to/project

    # Fully automated (skip gap questions)
    $0 --skip-gap-questions

    # Custom framework location
    $0 --framework-path /path/to/framework

    # With custom timeout (60 minutes)
    $0 --timeout 3600

${BLUE}WHAT THIS DOES:${NC}
    1. Phase 1: Parallel analysis (4 agents with retry/feedback)
    2. Phase 2: Consolidation & gap analysis
    3. Phase 3: Opus synthesis (comprehensive project understanding)
    4. Phase 4: File writing (CLAUDE.md, project-context, etc.)
    5. Phase 5: Resource copying (skills, agents, commands)
    6. Phase 6: Final validation

${BLUE}OUTPUT:${NC}
    - .claude/CLAUDE.md              Quick reference guide
    - .claude/skills/project-context/ Comprehensive project knowledge
    - .claude/skills/*               Language-specific skills
    - .claude/agents/*               Generated agents
    - .claude/commands/*             Project commands

${BLUE}REQUIREMENTS:${NC}
    - claude CLI (installed and in PATH)
    - node (v14+)
    - npm
    - bash 4.0+

${BLUE}MORE INFO:${NC}
    See: docs/INITIALIZE_PROJECT.md for comprehensive documentation

EOF
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

PROJECT_PATH=""
FRAMEWORK_PATH=""
SKIP_GAP_QUESTIONS="false"
TIMEOUT=1800
KEEP_TEMP="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --framework-path)
            FRAMEWORK_PATH="$2"
            shift 2
            ;;
        --skip-gap-questions)
            SKIP_GAP_QUESTIONS="true"
            shift
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --keep-temp)
            KEEP_TEMP="true"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            if [ -z "$PROJECT_PATH" ]; then
                PROJECT_PATH="$1"
            else
                echo -e "${RED}Error: Multiple project paths specified${NC}"
                echo "Use --help for usage information"
                exit 1
            fi
            shift
            ;;
    esac
done

# ============================================================================
# VALIDATION
# ============================================================================

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  AI AGENTIC FRAMEWORK - PROJECT INITIALIZATION${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# Default to current directory if not specified
if [ -z "$PROJECT_PATH" ]; then
    PROJECT_PATH=$(pwd)
    echo -e "${BLUE}ℹ No project path specified, using current directory${NC}"
    echo ""
fi

# Resolve to absolute path
PROJECT_PATH=$(cd "$PROJECT_PATH" 2>/dev/null && pwd || echo "$PROJECT_PATH")

# Validate project path exists
if [ ! -d "$PROJECT_PATH" ]; then
    echo -e "${RED}Error: Project path does not exist: $PROJECT_PATH${NC}"
    exit 1
fi

# Auto-detect framework path from script's own location
if [ -z "$FRAMEWORK_PATH" ]; then
    # This script is at: framework-dir/scripts/initialize-project.sh
    # So framework root is one level up
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    FRAMEWORK_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
    echo -e "${BLUE}ℹ Auto-detected framework at: $FRAMEWORK_PATH${NC}"
    echo ""
else
    # Resolve user-provided path to absolute
    if [ -d "$FRAMEWORK_PATH" ]; then
        FRAMEWORK_PATH=$(cd "$FRAMEWORK_PATH" && pwd)
    fi
fi

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    echo ""
    echo "This usually means the script is not running from the framework's scripts/ directory."
    echo ""
    echo "Solutions:"
    echo "  1. Run the script from its location:"
    echo "     ./path/to/framework/scripts/initialize-project.sh"
    echo ""
    echo "  2. Or specify the framework path explicitly:"
    echo "     ./path/to/framework/scripts/initialize-project.sh --framework-path /full/path/to/framework"
    echo ""
    exit 1
fi

# Validate orchestrate script exists
ORCHESTRATE_SCRIPT="$FRAMEWORK_PATH/skills/010-foundation/initialize-project/scripts/orchestrate-initialization.sh"
if [ ! -f "$ORCHESTRATE_SCRIPT" ]; then
    echo -e "${RED}Error: Orchestration script not found${NC}"
    echo "Expected: $ORCHESTRATE_SCRIPT"
    exit 1
fi

# ============================================================================
# PREREQUISITE CHECKS
# ============================================================================

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check claude CLI
if ! command -v claude &> /dev/null; then
    echo -e "${RED}✗ claude CLI not found${NC}"
    echo ""
    echo "The claude CLI is required to run this script."
    echo "Install it from: https://github.com/anthropics/claude-code"
    exit 1
else
    CLAUDE_VERSION=$(claude --version 2>&1 | head -n1 || echo "unknown")
    echo -e "${GREEN}✓ claude CLI found${NC} (${CLAUDE_VERSION})"
fi

# Check node
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ node not found${NC}"
    echo ""
    echo "Node.js is required to run this script."
    echo "Install it from: https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ node found${NC} (${NODE_VERSION})"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    echo ""
    echo "npm is required to run this script."
    echo "It typically comes with Node.js."
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm found${NC} (v${NPM_VERSION})"
fi

# Check timeout command
if ! command -v timeout &> /dev/null; then
    echo -e "${YELLOW}⚠ timeout command not found${NC}"
    echo "  Script will run without timeout protection"
    USE_TIMEOUT="false"
else
    echo -e "${GREEN}✓ timeout command found${NC}"
    USE_TIMEOUT="true"
fi

echo ""

# ============================================================================
# DISPLAY CONFIGURATION
# ============================================================================

echo -e "${BLUE}Configuration:${NC}"
echo "  Project Path:      $PROJECT_PATH"
echo "  Framework Path:    $FRAMEWORK_PATH"
echo "  Skip Gap Questions: $SKIP_GAP_QUESTIONS"
echo "  Timeout:           ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"
echo "  Keep Temp Files:   $KEEP_TEMP"
echo ""

# ============================================================================
# CONFIRMATION (if not in CI/CD)
# ============================================================================

if [ -t 0 ] && [ -z "$CI" ]; then
    echo -e "${YELLOW}This will initialize the AI Agentic Framework in:${NC}"
    echo "  $PROJECT_PATH"
    echo ""
    echo -e "${YELLOW}The following will be created:${NC}"
    echo "  - .claude/CLAUDE.md"
    echo "  - .claude/skills/project-context/"
    echo "  - .claude/skills/* (language-specific)"
    echo "  - .claude/agents/*"
    echo "  - .claude/commands/*"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

# ============================================================================
# RUN ORCHESTRATION
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  STARTING 6-PHASE INITIALIZATION${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Export environment variables for orchestration
export SKIP_GAP_QUESTIONS
export KEEP_TEMP

# Track start time
START_TIME=$(date +%s)

# Run orchestration with or without timeout
if [ "$USE_TIMEOUT" = "true" ]; then
    if timeout ${TIMEOUT}s bash "$ORCHESTRATE_SCRIPT" "$PROJECT_PATH" "$FRAMEWORK_PATH"; then
        EXIT_CODE=0
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo ""
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}  TIMEOUT EXCEEDED${NC}"
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo "Initialization exceeded the timeout of ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"
            echo ""
            echo "Options:"
            echo "  1. Increase timeout with --timeout SECONDS"
            echo "  2. Review partial output in: $PROJECT_PATH/.claude-temp/"
            echo ""
            exit 124
        fi
    fi
else
    if bash "$ORCHESTRATE_SCRIPT" "$PROJECT_PATH" "$FRAMEWORK_PATH"; then
        EXIT_CODE=0
    else
        EXIT_CODE=$?
    fi
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# ============================================================================
# COMPLETION
# ============================================================================

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================================================${NC}"
    echo -e "${GREEN}  INITIALIZATION COMPLETE ✓${NC}"
    echo -e "${GREEN}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Project:  $PROJECT_PATH"
    echo ""
    echo -e "${GREEN}Generated files:${NC}"
    echo "  ✓ .claude/CLAUDE.md"
    echo "  ✓ .claude/skills/project-context/SKILL.md"
    echo "  ✓ .claude/skills/* (language-specific)"
    echo "  ✓ .claude/agents/*"
    echo "  ✓ .claude/commands/*"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. cd $PROJECT_PATH"
    echo "  2. claude  # Start Claude CLI"
    echo "  3. /project-context  # Load project knowledge"
    echo "  4. /start-task  # Begin working on tasks"
    echo ""
    echo "For quick reference, see: .claude/CLAUDE.md"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}========================================================================${NC}"
    echo -e "${RED}  INITIALIZATION FAILED ✗${NC}"
    echo -e "${RED}========================================================================${NC}"
    echo ""
    echo "Duration: ${MINUTES}m ${SECONDS}s"
    echo "Exit code: $EXIT_CODE"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Check logs in: $PROJECT_PATH/.claude-temp/"
    echo "  2. Review phase outputs: $PROJECT_PATH/.claude-temp/phase*"
    echo "  3. Re-run with more verbose output"
    echo ""
    echo "For help, see: $FRAMEWORK_PATH/docs/INITIALIZE_PROJECT.md"
    echo ""
    exit $EXIT_CODE
fi
