#!/bin/bash
# ============================================================================
# STANDALONE INITIALIZE PROJECT SCRIPT
# ============================================================================
# Entry point for the AI Agentic Framework project initialization
# Can run WITHOUT an active Claude CLI session (standalone mode)
# Spawns agents directly using: claude --model X --dangerously-skip-permissions
# ============================================================================

set -e
set -o pipefail

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

${BLUE}SETUP:${NC}
    This framework must be cloned at the root of your project:

    cd /path/to/your/project
    git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework

    Then run from the framework directory:
    ./qubika-agentic-framework/scripts/initialize-project.sh

${BLUE}USAGE:${NC}
    $0 [OPTIONS]

${BLUE}OPTIONS:${NC}
    --skip-gap-questions  Skip gap analysis questions (fully automated mode)
                         Default: false (pauses if gaps detected)

    --start-phase N      Start from phase N (1-6) instead of phase 1
                         Default: 1 (run all phases)
                         Example: --start-phase 4 (skip phases 1-3)

    --timeout SECONDS    Maximum execution time in seconds
                         Default: 1800 (30 minutes)

    --clean              Remove temporary files after completion
                         Default: false (keeps .claude-temp/initialize-project for re-running phases)

    --help, -h           Show this help message

${BLUE}ENVIRONMENT VARIABLES:${NC}
    ORCHESTRATION_MODE   Control execution mode
                         Default: typescript (fails if TypeScript has errors)
                         Options:
                           - typescript: Use TypeScript orchestration (recommended)
                           - bash: Use legacy bash orchestration
                         Example: ORCHESTRATION_MODE=bash ./scripts/initialize-project.sh

    MODEL_TIER           Model tier to use for all agents
                         Default: standard
                         Options: fast, standard, advanced, openai, gemini
                         Example: MODEL_TIER=fast ./scripts/initialize-project.sh

    ANTHROPIC_API_KEY    API key for Anthropic (Claude) provider
    OPENAI_API_KEY       API key for OpenAI (GPT) provider
    GOOGLE_API_KEY       API key for Google (Gemini) provider

${BLUE}EXAMPLES:${NC}
    # Basic usage (run from project root) - uses TypeScript by default
    cd /path/to/your/project
    ./qubika-agentic-framework/scripts/initialize-project.sh

    # Use bash orchestration instead of TypeScript
    ORCHESTRATION_MODE=bash ./qubika-agentic-framework/scripts/initialize-project.sh

    # Use fast tier (haiku models for speed/cost)
    MODEL_TIER=fast ./qubika-agentic-framework/scripts/initialize-project.sh

    # Fully automated (skip gap questions)
    ./qubika-agentic-framework/scripts/initialize-project.sh --skip-gap-questions

    # Re-run from phase 4 (skip AI analysis phases 1-3)
    ./qubika-agentic-framework/scripts/initialize-project.sh --start-phase 4

    # With custom timeout (60 minutes)
    ./qubika-agentic-framework/scripts/initialize-project.sh --timeout 3600

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

SKIP_GAP_QUESTIONS="false"
START_PHASE=1
TIMEOUT=1800
CLEAN_TEMP="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-gap-questions)
            SKIP_GAP_QUESTIONS="true"
            shift
            ;;
        --start-phase)
            START_PHASE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --clean)
            CLEAN_TEMP="true"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown argument: $1${NC}"
            echo ""
            echo "This script no longer accepts path arguments."
            echo "The framework must be cloned at your project root:"
            echo ""
            echo "  cd /path/to/your/project"
            echo "  git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework"
            echo "  ./qubika-agentic-framework/scripts/initialize-project.sh"
            echo ""
            echo "Use --help for more information"
            exit 1
            ;;
    esac
done

# Validate start phase
if ! [[ "$START_PHASE" =~ ^[1-6]$ ]]; then
    echo -e "${RED}Error: --start-phase must be between 1 and 6${NC}"
    exit 1
fi

# ============================================================================
# VALIDATION
# ============================================================================

echo -e "${CYAN}========================================================================${NC}"
echo -e "${CYAN}  AI AGENTIC FRAMEWORK - PROJECT INITIALIZATION${NC}"
echo -e "${CYAN}========================================================================${NC}"
echo ""

# Auto-detect framework path from script's own location
# This script is at: framework-dir/scripts/initialize-project.sh
# So framework root is one level up
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validate framework path exists
if [ ! -d "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework path does not exist: $FRAMEWORK_PATH${NC}"
    echo ""
    echo "This script must be run from the framework's scripts/ directory."
    echo "Expected to find framework at: $FRAMEWORK_PATH"
    echo ""
    exit 1
fi

# Detect project path from parent directory of framework
# Framework should be at: project-root/qubika-agentic-framework
PROJECT_PATH="$(cd "$FRAMEWORK_PATH/.." && pwd)"

# Validate project path is not the same as framework (framework should be inside project)
if [ "$PROJECT_PATH" = "$FRAMEWORK_PATH" ]; then
    echo -e "${RED}Error: Framework is not inside a project directory${NC}"
    echo ""
    echo "The framework must be cloned at your project root:"
    echo ""
    echo "  cd /path/to/your/project"
    echo "  git clone https://github.com/thisisqubika/qubika-agentic-framework.git qubika-agentic-framework"
    echo "  ./qubika-agentic-framework/scripts/initialize-project.sh"
    echo ""
    exit 1
fi

echo -e "${BLUE}ℹ Framework location: $FRAMEWORK_PATH${NC}"
echo -e "${BLUE}ℹ Project location:   $PROJECT_PATH${NC}"
echo ""

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
echo "  Project Path:       $PROJECT_PATH"
echo "  Framework Path:     $FRAMEWORK_PATH"
echo "  Start Phase:        $START_PHASE"
echo "  Skip Gap Questions: $SKIP_GAP_QUESTIONS"
echo "  Timeout:            ${TIMEOUT}s ($(($TIMEOUT / 60)) minutes)"
echo "  Clean Temp Files:   $CLEAN_TEMP"
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

# Track start time
START_TIME=$(date +%s)

# Bash implementation header (shown if TypeScript fails or is skipped)
show_bash_header() {
    if [ "$START_PHASE" -gt 1 ]; then
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}  STARTING FROM PHASE $START_PHASE (SKIPPING PHASES 1-$((START_PHASE-1)))${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    else
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}  STARTING 6-PHASE INITIALIZATION${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    fi
}

# ============================================================================
# TYPESCRIPT ORCHESTRATION (DEFAULT)
# ============================================================================

# Environment variable to control execution mode
ORCHESTRATION_MODE="${ORCHESTRATION_MODE:-typescript}"  # Default to TypeScript

if [ "$ORCHESTRATION_MODE" = "typescript" ]; then
    echo -e "${BLUE}🚀 Running TypeScript orchestration...${NC}"
    echo ""

    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Error: Node.js is not installed${NC}"
        echo ""
        echo "Node.js is required for TypeScript orchestration."
        echo "Install it from: https://nodejs.org/"
        echo ""
        echo "To use bash orchestration instead, run:"
        echo "  ORCHESTRATION_MODE=bash $0"
        echo ""
        exit 1
    fi

    # Check if CLI file exists
    ORCHESTRATION_CLI="$FRAMEWORK_PATH/orchestration/src/cli/initialize.ts"
    if [ ! -f "$ORCHESTRATION_CLI" ]; then
        echo -e "${RED}❌ Error: TypeScript CLI not found${NC}"
        echo "  Expected: $ORCHESTRATION_CLI"
        echo ""
        echo "The orchestration module may not be set up correctly."
        echo ""
        echo "To use bash orchestration instead, run:"
        echo "  ORCHESTRATION_MODE=bash $0"
        echo ""
        exit 1
    fi

    # Check if node_modules exists and is valid
    NEED_INSTALL=false

    if [ ! -d "$FRAMEWORK_PATH/orchestration/node_modules" ]; then
        echo -e "${YELLOW}⚠️  Node modules not found${NC}"
        NEED_INSTALL=true
    else
        # Verify tsx binary exists and is valid
        if [ ! -f "$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx" ]; then
            echo -e "${YELLOW}⚠️  tsx binary not found (corrupted node_modules)${NC}"
            NEED_INSTALL=true
        else
            # Test if tsx can execute (detect corruption)
            if ! cd "$FRAMEWORK_PATH/orchestration" || ! npx tsx --version &> /dev/null; then
                echo -e "${YELLOW}⚠️  tsx binary is corrupted${NC}"
                NEED_INSTALL=true
            fi
        fi
    fi

    # Install or reinstall dependencies if needed
    if [ "$NEED_INSTALL" = true ]; then
        echo -e "${YELLOW}Installing/reinstalling dependencies...${NC}"
        echo ""

        # Clean install to fix corruption
        if ! cd "$FRAMEWORK_PATH/orchestration"; then
            echo -e "${RED}❌ Error: Cannot access orchestration directory${NC}"
            exit 1
        fi

        # Remove corrupted node_modules if it exists
        if [ -d "node_modules" ]; then
            echo "  Removing corrupted node_modules..."
            rm -rf node_modules package-lock.json
        fi

        # Install fresh
        echo "  Running npm install..."
        if ! npm install --silent; then
            echo ""
            echo -e "${RED}❌ Error: Failed to install dependencies${NC}"
            echo ""
            echo "Please install manually:"
            echo "  cd $FRAMEWORK_PATH/orchestration"
            echo "  rm -rf node_modules package-lock.json"
            echo "  npm install"
            echo ""
            echo "To use bash orchestration instead, run:"
            echo "  ORCHESTRATION_MODE=bash $0"
            echo ""
            exit 1
        fi

        echo ""
        echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
        echo ""
    fi

    # Build TypeScript to ensure code is up to date
    cd "$FRAMEWORK_PATH/orchestration" || exit 1
    echo "  Building TypeScript..."
    if ! npm run build --silent; then
        echo ""
        echo -e "${RED}❌ Error: Failed to build TypeScript${NC}"
        echo ""
        echo "Please build manually:"
        echo "  cd $FRAMEWORK_PATH/orchestration"
        echo "  npm run build"
        echo ""
        exit 1
    fi
    echo -e "${GREEN}✓ Build completed successfully${NC}"
    echo ""

    echo "  Using TypeScript CLI: $ORCHESTRATION_CLI"
    echo "  Node.js version: $(node --version)"
    echo ""

    # Run TypeScript orchestration
    # Note: cd to orchestration directory so npx can find tsx in node_modules
    # Run tsx in foreground (NOT using exec) so CTRL+C signal handling works correctly
    # When user presses CTRL+C, both bash and tsx receive SIGINT, tsx handles it properly
    cd "$FRAMEWORK_PATH/orchestration" || exit 1

    # Export environment variable for child process
    export MODEL_TIER="${MODEL_TIER:-standard}"
    export PROJECT_PATH
    export FRAMEWORK_PATH

    # Run tsx in foreground - CTRL+C will send SIGINT to tsx which has proper handlers
    # CRITICAL: Use node_modules/.bin/tsx directly, NOT npx (npx adds another process layer)
    TSX_BIN="$FRAMEWORK_PATH/orchestration/node_modules/.bin/tsx"

    if [ ! -f "$TSX_BIN" ]; then
        echo -e "${RED}❌ Error: tsx binary not found at $TSX_BIN${NC}"
        exit 1
    fi

    if [ "$START_PHASE" -gt 1 ]; then
        echo -e "${YELLOW}⚠ Warning: --start-phase is not yet supported in TypeScript mode${NC}"
        echo -e "${YELLOW}  Falling back to bash orchestration...${NC}"
        echo ""
        ORCHESTRATION_MODE="bash"
    else
        trap '' SIGINT
        "$TSX_BIN" "$ORCHESTRATION_CLI" \
          --project-path "$PROJECT_PATH" \
          --framework-path "$FRAMEWORK_PATH" &

        TSX_PID=$!

        # Wait for tsx to complete (even if SIGINT received)
        # wait returns tsx's exit code
        wait $TSX_PID
        TSX_EXIT_CODE=$?

        # Exit with the same code tsx used
        exit $TSX_EXIT_CODE
    fi
fi

# ============================================================================
# BASH ORCHESTRATION (FALLBACK)
# ============================================================================

echo -e "${BLUE}🔧 Running bash orchestration...${NC}"
echo ""
show_bash_header

# Export environment variables for orchestration
export SKIP_GAP_QUESTIONS
export CLEAN_TEMP

# Run orchestration with or without timeout
# Use --foreground flag with timeout to ensure proper signal propagation
if [ "$USE_TIMEOUT" = "true" ]; then
    # --foreground: don't create new process group, allows SIGINT to propagate
    # --signal=TERM: send TERM on timeout (not KILL)
    if timeout --foreground --signal=TERM ${TIMEOUT}s bash "$ORCHESTRATE_SCRIPT" "$PROJECT_PATH" "$FRAMEWORK_PATH" --start-phase "$START_PHASE"; then
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
            echo "  2. Review partial output in: $PROJECT_PATH/.claude-temp/initialize-project/"
            echo ""
            exit 124
        fi
    fi
else
    if bash "$ORCHESTRATE_SCRIPT" "$PROJECT_PATH" "$FRAMEWORK_PATH" --start-phase "$START_PHASE"; then
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
    if [ "$START_PHASE" -gt 1 ]; then
        echo "Phases:   $START_PHASE-6 (started from phase $START_PHASE)"
    else
        echo "Phases:   1-6 (complete initialization)"
    fi
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
    echo "  1. Check logs in: $PROJECT_PATH/.claude-temp/initialize-project/"
    echo "  2. Review phase outputs: $PROJECT_PATH/.claude-temp/initialize-project/phase*"
    echo "  3. Re-run with more verbose output"
    echo ""
    echo "For help, see: $FRAMEWORK_PATH/docs/INITIALIZE_PROJECT.md"
    echo ""
    exit $EXIT_CODE
fi
